"""Readers for real-world tender documents: XLSX, CSV, PDF and plain text.

Bills of quantities are not tidy data. They carry banner rows, multi-row
headers, section headings, page carry-forwards, blank spacer rows and merged
cells, and the same information sits in different columns on every job. The
parser here works the way a person does: find the header row by what it says,
map the columns by meaning, then classify each following row as a measured
item, a heading or noise.
"""

from __future__ import annotations

import datetime as _dt
import re
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from .normalise import (
    _UNIT_ALIASES,
    looks_like_section_heading,
    normalise_unit,
    parse_number,
)
from .schema import LineItem, TenderDocument

# Header keywords, most specific first, mapped onto canonical roles.
_HEADER_PATTERNS: dict[str, tuple[str, ...]] = {
    "ref": ("item no", "item ref", "ref no", "bill ref", "code", "item", "ref", "no."),
    "description": (
        "description of works", "item description", "description", "particulars",
        "work item", "narrative", "details", "desc",
    ),
    "unit": ("unit of measure", "unit", "uom", "u/m", "units", "measure"),
    "quantity": ("quantity", "qty", "quant", "q'ty", "no off", "measured"),
    "rate": ("unit rate", "rate", "unit price", "price", "€ rate", "rate €"),
    "amount": (
        "amount", "total", "value", "extension", "extended", "line total",
        "sub total", "cost",
    ),
}

_SKIP_ROW = re.compile(
    r"\b(carried (?:to|forward)|brought forward|c/?fwd|b/?fwd|page total|"
    r"collection|to summary|sub-?total|total to)\b",
    re.I,
)

_UNIT_ALTERNATION = "|".join(
    sorted((re.escape(u) for u in _UNIT_ALIASES), key=len, reverse=True)
)
# Deliberately excludes spaces: in a text-extracted bill the gap between
# columns is whitespace, so a space-tolerant number swallows the next column.
_NUMBER = r"[-(]?\d[\d.,]*\)?"
_TEXT_LINE = re.compile(
    rf"^\s*(?P<ref>[A-Za-z]?[\d][\w./\-]*)?\s*"
    rf"(?P<description>.+?)\s+"
    rf"(?P<unit>{_UNIT_ALTERNATION})\s+"
    rf"(?P<quantity>{_NUMBER})"
    rf"(?:\s+(?P<rate>{_NUMBER}))?"
    rf"(?:\s+(?P<amount>{_NUMBER}))?\s*$",
    re.I,
)


# --------------------------------------------------------------------------
# Public entry points
# --------------------------------------------------------------------------

def load_document(
    path: str | Path,
    *,
    project_id: str | None = None,
    project_name: str | None = None,
    project_type: str = "unknown",
    region: str = "Leinster",
    date: Any = None,
    currency: str = "EUR",
    sheet: str | int | None = None,
) -> TenderDocument:
    """Load any supported tender document into a :class:`TenderDocument`."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(path)

    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xlsm", ".xls", ".xltx"}:
        items = _load_excel(path, sheet=sheet)
    elif suffix in {".csv", ".tsv", ".txt"} and suffix != ".txt":
        items = _load_csv(path)
    elif suffix == ".pdf":
        items = _load_pdf(path)
    elif suffix == ".txt":
        items = parse_text(path.read_text(encoding="utf-8", errors="ignore"))
    else:
        raise ValueError(
            f"Unsupported tender document type: {suffix or path.name}. "
            "Supported: .xlsx/.xlsm/.xls, .csv/.tsv, .pdf, .txt"
        )

    if not items:
        raise ValueError(
            f"No measured items could be read from {path.name}. "
            "Check the file has a header row naming a description and a quantity column."
        )

    return TenderDocument(
        items=items,
        project_id=project_id or path.stem,
        project_name=project_name or path.stem,
        project_type=project_type,
        region=region,
        date=date or _dt.date.today(),
        currency=currency,
        source_path=str(path),
    )


def parse_table(raw: pd.DataFrame, *, sheet_name: str = "") -> list[LineItem]:
    """Extract measured items from one raw (header-less) sheet."""
    if raw.empty:
        return []
    raw = raw.reset_index(drop=True)
    header_row, mapping = _detect_header(raw)
    if mapping is None:
        mapping = _positional_mapping(raw)
        header_row = -1
        if mapping is None:
            return []

    items: list[LineItem] = []
    section = sheet_name.strip()
    for position in range(header_row + 1, len(raw)):
        row = raw.iloc[position]
        item = _row_to_item(row, mapping, section, position)
        if item is None:
            heading = _row_heading(row, mapping)
            if heading:
                section = f"{sheet_name} - {heading}".strip(" -") if sheet_name else heading
            continue
        items.append(item)
    return items


def parse_text(text: str) -> list[LineItem]:
    """Extract items from PDF-extracted or plain text, line by line."""
    items: list[LineItem] = []
    section = ""
    for position, line in enumerate(text.splitlines()):
        stripped = line.strip()
        if not stripped or _SKIP_ROW.search(stripped):
            continue
        match = _TEXT_LINE.match(stripped)
        if not match:
            if looks_like_section_heading(stripped, False, False):
                section = stripped.rstrip(":")
            continue
        groups = match.groupdict()
        quantity = parse_number(groups.get("quantity"))
        description = (groups.get("description") or "").strip(" .:-")
        if quantity is None or len(description) < 4:
            continue
        items.append(
            LineItem(
                description=description,
                unit=normalise_unit(groups.get("unit")),
                quantity=quantity,
                ref=(groups.get("ref") or "").strip(),
                section=section,
                rate=parse_number(groups.get("rate")),
                amount=parse_number(groups.get("amount")),
                source_row=position,
            )
        )
    return items


# --------------------------------------------------------------------------
# Format-specific loaders
# --------------------------------------------------------------------------

def _load_excel(path: Path, sheet: str | int | None = None) -> list[LineItem]:
    sheets = pd.read_excel(path, sheet_name=sheet, header=None, dtype=object)
    if isinstance(sheets, pd.DataFrame):
        sheets = {str(sheet or path.stem): sheets}
    items: list[LineItem] = []
    for name, frame in sheets.items():
        if _is_noise_sheet(str(name)):
            continue
        items.extend(parse_table(frame, sheet_name=str(name)))
    return items


def _load_csv(path: Path) -> list[LineItem]:
    separator = "\t" if path.suffix.lower() == ".tsv" else None
    frame = pd.read_csv(
        path, header=None, dtype=object, sep=separator, engine="python",
        skip_blank_lines=False, on_bad_lines="skip",
    )
    return parse_table(frame)


def _load_pdf(path: Path) -> list[LineItem]:
    try:
        import pdfplumber  # noqa: PLC0415 - optional dependency
    except Exception as exc:  # pragma: no cover - depends on local install
        raise RuntimeError(
            "Reading PDF bills needs pdfplumber: pip install pdfplumber. "
            f"(import failed: {exc}). Export the bill to XLSX/CSV as a workaround."
        ) from exc

    items: list[LineItem] = []
    with pdfplumber.open(str(path)) as pdf:
        for page_number, page in enumerate(pdf.pages):
            for table in page.extract_tables() or []:
                frame = pd.DataFrame(table)
                items.extend(parse_table(frame, sheet_name=f"page {page_number + 1}"))
            if not items:
                items.extend(parse_text(page.extract_text() or ""))
    return items


def _is_noise_sheet(name: str) -> bool:
    return bool(
        re.search(r"\b(summary|instructions?|notes?|cover|index|contents)\b", name, re.I)
    )


# --------------------------------------------------------------------------
# Header / row interpretation
# --------------------------------------------------------------------------

def _detect_header(raw: pd.DataFrame) -> tuple[int, dict[str, int] | None]:
    """Find the header row and map canonical roles onto column positions."""
    best_row, best_mapping, best_score = -1, None, 0
    for position in range(min(len(raw), 40)):
        cells = [_cell_text(v) for v in raw.iloc[position].tolist()]
        mapping, score = _map_header_cells(cells)
        # A usable header must name at least a description and one measure.
        if score > best_score and "description" in mapping and (
            "quantity" in mapping or "rate" in mapping or "amount" in mapping
        ):
            best_row, best_mapping, best_score = position, mapping, score
    return best_row, best_mapping


def _map_header_cells(cells: Iterable[str]) -> tuple[dict[str, int], int]:
    mapping: dict[str, int] = {}
    score = 0
    for index, cell in enumerate(cells):
        text = cell.strip().lower()
        if not text or len(text) > 40:
            continue
        for role, keywords in _HEADER_PATTERNS.items():
            if role in mapping:
                continue
            for keyword in keywords:
                if text == keyword or text.startswith(keyword) or keyword in text.split():
                    mapping[role] = index
                    score += 2 if text == keyword else 1
                    break
            else:
                continue
            break
    return mapping, score


def _positional_mapping(raw: pd.DataFrame) -> dict[str, int] | None:
    """Fallback for headerless extracts: infer roles from column content."""
    if raw.shape[1] < 2:
        return None
    text_lengths, numeric_counts, unit_counts = [], [], []
    for column in range(raw.shape[1]):
        values = [_cell_text(v) for v in raw.iloc[:, column].tolist()]
        text_lengths.append(sum(len(v) for v in values) / max(len(values), 1))
        numeric_counts.append(sum(1 for v in values if parse_number(v) is not None))
        unit_counts.append(
            sum(1 for v in values if v and v.strip().lower() in _UNIT_ALIASES)
        )

    description = int(max(range(len(text_lengths)), key=lambda i: text_lengths[i]))
    if text_lengths[description] < 8:
        return None
    mapping = {"description": description}

    if max(unit_counts) >= max(3, 0.2 * len(raw)):
        mapping["unit"] = int(max(range(len(unit_counts)), key=lambda i: unit_counts[i]))

    numeric_columns = [
        i for i, count in enumerate(numeric_counts)
        if count >= max(2, 0.2 * len(raw)) and i != description and i != mapping.get("unit")
    ]
    if not numeric_columns:
        return None
    for role, column in zip(("quantity", "rate", "amount"), numeric_columns):
        mapping[role] = column
    return mapping


def _row_to_item(
    row: pd.Series, mapping: dict[str, int], section: str, position: int
) -> LineItem | None:
    description = _cell_text(_get(row, mapping.get("description")))
    if not description or len(description.strip()) < 3:
        return None
    if _SKIP_ROW.search(description):
        return None

    quantity = parse_number(_get(row, mapping.get("quantity")))
    rate = parse_number(_get(row, mapping.get("rate")))
    amount = parse_number(_get(row, mapping.get("amount")))
    unit_raw = _cell_text(_get(row, mapping.get("unit")))
    unit = normalise_unit(unit_raw) if unit_raw else None

    has_measure = quantity is not None or rate is not None or amount is not None
    if not has_measure:
        return None
    if looks_like_section_heading(description, quantity is not None, rate is not None):
        return None

    # Lump-sum lines legitimately have no quantity.
    if quantity is None:
        if unit in (None, "item") and (rate is not None or amount is not None):
            quantity, unit = 1.0, "item"
        else:
            return None
    if quantity <= 0 and (rate is None and amount is None):
        return None

    return LineItem(
        description=description.strip(),
        unit=unit or ("item" if quantity == 1.0 else "nr"),
        quantity=quantity,
        ref=_cell_text(_get(row, mapping.get("ref"))).strip(),
        section=section,
        rate=rate,
        amount=amount,
        source_row=position,
        raw={"row": position},
    )


def _row_heading(row: pd.Series, mapping: dict[str, int]) -> str:
    """Return a section heading if this row looks like one."""
    description = _cell_text(_get(row, mapping.get("description"))).strip()
    if not description:
        # Headings are often typed in the first populated cell, not the
        # description column.
        for value in row.tolist():
            text = _cell_text(value).strip()
            if text:
                description = text
                break
    if not description or len(description) > 120 or _SKIP_ROW.search(description):
        return ""
    if parse_number(description) is not None:
        return ""
    if looks_like_section_heading(description, False, False):
        return description.rstrip(" :")
    return ""


def _get(row: pd.Series, index: int | None) -> Any:
    if index is None or index >= len(row):
        return None
    return row.iloc[index]


def _cell_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value != value:
        return ""
    return str(value).replace("\n", " ").strip()
