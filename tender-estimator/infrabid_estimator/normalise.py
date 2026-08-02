"""Text, number and unit normalisation for tender documents.

Bills of quantities arrive as human-typed spreadsheets and PDFs, so before any
model sees them the descriptions, units and numbers have to be pulled onto a
common footing. Everything in this module is deterministic and dependency-free.
"""

from __future__ import annotations

import re
from typing import Any

# --------------------------------------------------------------------------
# Units
# --------------------------------------------------------------------------

#: Canonical units used throughout the package.
CANONICAL_UNITS = (
    "m",  # linear metre
    "m2",  # square metre
    "m3",  # cubic metre
    "nr",  # number / each
    "t",  # tonne
    "kg",
    "item",  # lump sum
    "week",
    "day",
    "hr",
    "l",  # litre
    "pct",  # percentage (provisional sums, OH&P lines)
)

_UNIT_ALIASES = {
    # linear
    "m": "m", "lm": "m", "l.m": "m", "lin m": "m", "linm": "m", "mtr": "m",
    "metre": "m", "metres": "m", "meter": "m", "meters": "m", "ln.m": "m",
    "m run": "m", "lin.m": "m", "rm": "m", "run m": "m",
    # area
    "m2": "m2", "m²": "m2", "sqm": "m2", "sq m": "m2", "sq.m": "m2",
    "sq.metre": "m2", "square metre": "m2", "square metres": "m2", "m^2": "m2",
    "m 2": "m2",
    # volume
    "m3": "m3", "m³": "m3", "cum": "m3", "cu m": "m3", "cu.m": "m3",
    "cubic metre": "m3", "cubic metres": "m3", "m^3": "m3", "m 3": "m3",
    # count
    "nr": "nr", "no": "nr", "no.": "nr", "nos": "nr", "nos.": "nr", "n°": "nr",
    "each": "nr", "ea": "nr", "unit": "nr", "units": "nr", "number": "nr",
    "pcs": "nr", "off": "nr",
    # mass
    "t": "t", "te": "t", "ton": "t", "tons": "t", "tonne": "t", "tonnes": "t",
    "kg": "kg", "kgs": "kg", "kilogram": "kg", "kilograms": "kg",
    # lump sum
    "item": "item", "sum": "item", "ls": "item", "l.s": "item", "lot": "item",
    "lump sum": "item", "prov sum": "item", "provisional sum": "item",
    "psum": "item", "job": "item", "visit": "item",
    # time
    "week": "week", "weeks": "week", "wk": "week", "wks": "week",
    "day": "day", "days": "day", "dy": "day",
    "hr": "hr", "hrs": "hr", "hour": "hr", "hours": "hr", "h": "hr",
    "month": "week", "months": "week",  # converted separately if needed
    # misc
    "l": "l", "litre": "l", "litres": "l", "ltr": "l",
    "%": "pct", "pct": "pct", "percent": "pct",
}


def normalise_unit(raw: Any) -> str:
    """Map a free-text unit onto one of :data:`CANONICAL_UNITS`.

    Unrecognised units fall back to ``item`` (a lump sum), which is the safe
    default: it never multiplies an unknown quantity into a large number.
    """
    if raw is None:
        return "item"
    text = str(raw).strip().lower()
    if not text or text in {"-", "--", "n/a", "na", "nan"}:
        return "item"
    text = text.replace(" ", " ")
    text = re.sub(r"[()\[\]]", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .;:,")
    if text in _UNIT_ALIASES:
        return _UNIT_ALIASES[text]
    compact = text.replace(" ", "").replace(".", "")
    if compact in _UNIT_ALIASES:
        return _UNIT_ALIASES[compact]
    # Trailing unit inside a longer string, e.g. "rate per m2"
    for alias in sorted(_UNIT_ALIASES, key=len, reverse=True):
        if re.search(rf"(?:^|[\s/]){re.escape(alias)}$", text):
            return _UNIT_ALIASES[alias]
    return "item"


# --------------------------------------------------------------------------
# Numbers
# --------------------------------------------------------------------------

_CURRENCY = re.compile(r"[€£$]|eur|gbp|usd", re.I)
_NUMERIC_JUNK = re.compile(r"[^\d,.\-()]")


def parse_number(raw: Any) -> float | None:
    """Parse a spreadsheet/PDF cell into a float, or ``None`` if it is not one.

    Handles currency symbols, thousands separators in either convention,
    bracketed negatives and the various dashes used for "no entry".
    """
    if raw is None:
        return None
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        value = float(raw)
        return None if value != value else value  # drop NaN
    text = str(raw).strip()
    if not text:
        return None
    if text.lower() in {"nan", "none", "n/a", "na", "-", "--", "—", "–", "nil"}:
        return None
    text = _CURRENCY.sub("", text)
    text = text.replace(" ", "").replace(" ", "")
    negative = text.startswith("(") and text.endswith(")")
    text = _NUMERIC_JUNK.sub("", text).strip("()")
    if not text or text in {"-", ".", ","}:
        return None

    has_comma, has_dot = "," in text, "." in text
    if has_comma and has_dot:
        # Whichever separator comes last is the decimal point.
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif has_comma:
        head, _, tail = text.rpartition(",")
        # "1,234" / "1,234,567" are thousands; "1,5" and "12,50" are decimals.
        if len(tail) == 3 and head.replace(",", "").replace("-", "").isdigit():
            text = text.replace(",", "")
        else:
            text = text.replace(",", ".")
    try:
        value = float(text)
    except ValueError:
        return None
    if value != value:
        return None
    return -value if negative and value > 0 else value


# --------------------------------------------------------------------------
# Description text
# --------------------------------------------------------------------------

# Trade shorthand that shows up constantly in Irish/UK bills. Expanding it
# before vectorising means "s&l 110mm duct" and "supply and lay 110mm duct"
# land in the same region of feature space.
_ABBREVIATIONS = {
    r"\bs\s*&\s*l\b": "supply and lay",
    r"\bs\s*/\s*l\b": "supply and lay",
    r"\bs\s*&\s*f\b": "supply and fix",
    r"\bd\s*&\s*l\b": "dig and lay",
    r"\bexc\.?\b": "excavate",
    r"\bexcav\.?\b": "excavate",
    r"\bincl\.?\b": "including",
    r"\binc\.?\b": "including",
    r"\bc\s*/\s*w\b": "complete with",
    r"\bc\s*/\s*c\b": "centres",
    r"\bdia\.?\b": "diameter",
    r"\bø\b": "diameter",
    r"\bdiam\.?\b": "diameter",
    r"\bn\.?o\.?\b(?![a-z])": "number",
    r"\bmh\b": "manhole",
    r"\bjb\b": "jointing bay",
    r"\bcw\b": "carriageway",
    r"\bfw\b": "footway",
    r"\bppl\b": "public lighting",
    r"\bhdd\b": "horizontal directional drill",
    r"\bt\.?m\.?\b(?![a-z])": "traffic management",
    r"\bhv\b": "high voltage",
    r"\bmv\b": "medium voltage",
    r"\blv\b": "low voltage",
    r"\bppc\b": "polyester powder coated",
    r"\bgl\b": "ground level",
    r"\bcl\b": "cover level",
    r"\bdwg\.?\b": "drawing",
    r"\bspec\.?\b": "specification",
    r"\bea\.?\b(?![a-z])": "each",
    r"\bincluding\s+all\b": "including",
    r"\bprov\.?\s*sum\b": "provisional sum",
    r"\bincl\b": "including",
    r"\bapprox\.?\b": "approximately",
    r"\bmax\.?\b": "maximum",
    r"\bmin\.?\b": "minimum",
    r"\bne\b": "not exceeding",
    r"\bn\.e\.?\b": "not exceeding",
}

_ABBREV_COMPILED = [(re.compile(p, re.I), r) for p, r in _ABBREVIATIONS.items()]


def normalise_text(raw: Any) -> str:
    """Lower-case, expand trade shorthand and tidy punctuation for vectorising.

    Digits are preserved: sizes ("110mm", "C30/37", "1.5m deep") carry most of
    the price signal in a bill of quantities.
    """
    if raw is None:
        return ""
    text = str(raw).replace(" ", " ").replace("\n", " ").lower()
    text = text.replace("²", "2").replace("³", "3")
    for pattern, replacement in _ABBREV_COMPILED:
        text = pattern.sub(replacement, text)
    text = re.sub(r"(\d)\s*(mm|cm|m|km|kg|t|kn|kv|kva|mpa)\b", r"\1\2", text)
    text = re.sub(r"[^\w%/&.\- ]+", " ", text)
    text = re.sub(r"(?<!\d)[.\-](?!\d)", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def compose_description(section: Any, description: Any) -> str:
    """Prepend the section heading to an item description.

    Bills lean on the heading for meaning — "150mm dia." under DRAINAGE is a
    different item to the same words under DUCTING. Training and prediction
    must compose the text the same way or the model scores items it has never
    seen in that form, so both paths call this one function.
    """
    text = str(description or "").strip()
    heading = str(section or "").strip()
    if not heading or heading.lower() in {"nan", "none"}:
        return text
    if heading.lower() in text.lower():
        return text
    return f"{heading}. {text}"


_SECTION_HINTS = re.compile(
    r"\b(section|bill|part|series|chapter|element|works? package|summary|"
    r"collection|sub-?total|total|carried (?:to|forward)|brought forward|"
    r"page total)\b",
    re.I,
)


def looks_like_section_heading(description: str, has_quantity: bool, has_rate: bool) -> bool:
    """True when a row is a heading/subtotal rather than a measured item."""
    text = (description or "").strip()
    if not text:
        return False
    if has_quantity and has_rate:
        return False
    if _SECTION_HINTS.search(text) and not has_quantity:
        return True
    if not has_quantity and not has_rate:
        # Short, title-cased or upper-case text with no measurement.
        words = text.split()
        if len(words) <= 12 and (text.isupper() or text.rstrip().endswith(":")):
            return True
        if len(words) <= 8:
            return True
    return False


# --------------------------------------------------------------------------
# Dimensional features mined out of the description
# --------------------------------------------------------------------------

_RE_DIAMETER = re.compile(r"(\d{2,4})\s*mm", re.I)
_RE_DEPTH = re.compile(
    r"(?:depth|deep|dig|invert)\D{0,18}?(\d+(?:\.\d+)?)\s*m\b", re.I)
# Bills write depth both ways round: "depth 1.5m" and "1.5m deep".
_RE_DEPTH_TRAILING = re.compile(r"(\d+(?:\.\d+)?)\s*m\b\W{0,4}(?:deep|depth)", re.I)
_RE_DEPTH_RANGE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:m)?\s*(?:-|to|/)\s*(\d+(?:\.\d+)?)\s*m\b\s*(?:deep|depth)", re.I)
_RE_THICKNESS = re.compile(r"(\d{2,3})\s*mm\s*(?:thick|deep|layer|course|overlay)", re.I)
_RE_GRADE = re.compile(r"\bc\s?(\d{2})\s*/\s*(\d{2})\b", re.I)
_RE_CSA = re.compile(r"(\d{2,4})\s*mm\s*2\b", re.I)
_RE_COUNT = re.compile(r"(\d{1,2})\s*(?:number|way|core|c)\b", re.I)
_RE_VOLTAGE = re.compile(r"(\d{1,3})\s*kv\b", re.I)


def extract_dimensions(description: str) -> dict[str, float]:
    """Mine numeric size features out of a (normalised) item description.

    These are the strongest structured predictors of a unit rate after the item
    type itself — a 450mm sewer costs several times a 100mm one.
    """
    text = description or ""
    out: dict[str, float] = {
        "dim_diameter_mm": 0.0,
        "dim_depth_m": 0.0,
        "dim_thickness_mm": 0.0,
        "dim_concrete_grade": 0.0,
        "dim_csa_mm2": 0.0,
        "dim_count": 0.0,
        "dim_voltage_kv": 0.0,
        "dim_n_numbers": 0.0,
    }

    csa = _RE_CSA.search(text)
    if csa:
        out["dim_csa_mm2"] = float(csa.group(1))

    diameters = [float(m) for m in _RE_DIAMETER.findall(text)]
    # Anything mined as a cable CSA or a layer thickness is not a diameter.
    thickness = _RE_THICKNESS.search(text)
    if thickness:
        out["dim_thickness_mm"] = float(thickness.group(1))
    excluded = {out["dim_csa_mm2"], out["dim_thickness_mm"]}
    diameters = [d for d in diameters if d not in excluded]
    if diameters:
        out["dim_diameter_mm"] = max(diameters)

    depth_range = _RE_DEPTH_RANGE.search(text)
    if depth_range:
        lo, hi = float(depth_range.group(1)), float(depth_range.group(2))
        out["dim_depth_m"] = (lo + hi) / 2.0
    else:
        depth = _RE_DEPTH.search(text) or _RE_DEPTH_TRAILING.search(text)
        if depth:
            out["dim_depth_m"] = float(depth.group(1))

    grade = _RE_GRADE.search(text)
    if grade:
        out["dim_concrete_grade"] = float(grade.group(1))

    count = _RE_COUNT.search(text)
    if count:
        out["dim_count"] = float(count.group(1))

    voltage = _RE_VOLTAGE.search(text)
    if voltage:
        out["dim_voltage_kv"] = float(voltage.group(1))

    out["dim_n_numbers"] = float(len(re.findall(r"\d+", text)))
    return out


DIMENSION_COLUMNS = tuple(extract_dimensions("").keys())
