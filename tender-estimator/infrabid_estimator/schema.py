"""Core data structures: line items, tender documents and estimate results."""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field, asdict
from typing import Any, Iterable

import pandas as pd

from .normalise import compose_description, normalise_unit, normalise_text

#: Columns of the canonical training frame. Historic priced bills must be
#: flattened into this shape before :meth:`TenderEstimator.fit` sees them.
HISTORY_COLUMNS = (
    "project_id",
    "project_type",
    "region",
    "date",
    "section",
    "ref",
    "description",
    "unit",
    "quantity",
    "rate",
    "category",
)


@dataclass
class LineItem:
    """A single measured item from a bill of quantities."""

    description: str
    unit: str = "item"
    quantity: float = 1.0
    ref: str = ""
    section: str = ""
    rate: float | None = None  # quoted/priced unit rate, when the doc is priced
    amount: float | None = None  # quoted line total
    category: str | None = None  # known work package, if the bill declares one
    source_row: int | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.unit = normalise_unit(self.unit)
        self.description = str(self.description or "").strip()
        if self.quantity is None or self.quantity != self.quantity:
            self.quantity = 1.0
        self.quantity = float(self.quantity)
        if self.unit == "item" and self.quantity <= 0:
            self.quantity = 1.0
        if self.rate is None and self.amount is not None and self.quantity:
            self.rate = self.amount / self.quantity
        if self.amount is None and self.rate is not None:
            self.amount = self.rate * self.quantity

    @property
    def full_description(self) -> str:
        """Section context prepended to the item text (see
        :func:`~.normalise.compose_description`)."""
        return compose_description(self.section, self.description)

    @property
    def normalised_description(self) -> str:
        return normalise_text(self.full_description)


@dataclass
class TenderDocument:
    """A tender/pricing document: metadata plus its measured items."""

    items: list[LineItem]
    project_id: str = "untitled"
    project_name: str = ""
    project_type: str = "unknown"
    region: str = "Leinster"
    date: _dt.date = field(default_factory=_dt.date.today)
    currency: str = "EUR"
    source_path: str = ""
    notes: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.date = _coerce_date(self.date)
        if not self.project_name:
            self.project_name = self.project_id

    def __len__(self) -> int:
        return len(self.items)

    @property
    def is_priced(self) -> bool:
        """True when at least half the items already carry a rate."""
        if not self.items:
            return False
        priced = sum(1 for i in self.items if i.rate is not None)
        return priced >= max(1, len(self.items) // 2)

    @property
    def quoted_total(self) -> float:
        return float(sum(i.amount or 0.0 for i in self.items))

    def to_frame(self) -> pd.DataFrame:
        """Flatten to the canonical frame the feature builder consumes."""
        rows = []
        for item in self.items:
            rows.append(
                {
                    "project_id": self.project_id,
                    "project_type": self.project_type,
                    "region": self.region,
                    "date": self.date,
                    "section": item.section,
                    "ref": item.ref,
                    "description": item.full_description,
                    "unit": item.unit,
                    "quantity": item.quantity,
                    "rate": item.rate,
                    "category": item.category,
                }
            )
        frame = pd.DataFrame(rows, columns=list(HISTORY_COLUMNS))
        if frame.empty:  # keep dtypes stable for downstream transformers
            frame = frame.astype({"quantity": "float64", "rate": "float64"})
        return frame

    @classmethod
    def from_frame(
        cls, frame: pd.DataFrame, **metadata: Any
    ) -> "TenderDocument":
        items = [
            LineItem(
                description=str(row.get("description", "")),
                unit=row.get("unit", "item"),
                quantity=row.get("quantity", 1.0),
                ref=str(row.get("ref", "") or ""),
                section=str(row.get("section", "") or ""),
                rate=_none_if_nan(row.get("rate")),
                category=row.get("category") or None,
                source_row=int(idx) if isinstance(idx, (int, float)) else None,
            )
            for idx, row in frame.iterrows()
        ]
        first = frame.iloc[0].to_dict() if len(frame) else {}
        meta = {
            "project_id": str(first.get("project_id", "untitled")),
            "project_type": str(first.get("project_type", "unknown")),
            "region": str(first.get("region", "Leinster")),
            "date": first.get("date", _dt.date.today()),
        }
        meta.update({k: v for k, v in metadata.items() if v is not None})
        return cls(items=items, **meta)


@dataclass
class LineEstimate:
    """Model output for one line: a rate band and the resulting amount band."""

    item: LineItem
    category: str
    category_confidence: float
    rate_p10: float
    rate_p50: float
    rate_p90: float
    amount_p50: float
    log_sigma: float
    similarity: float  # nearest-neighbour similarity to the training corpus
    method: str  # "model" | "lookup" | "quoted"
    flags: list[str] = field(default_factory=list)

    @property
    def amount_p10(self) -> float:
        return self.rate_p10 * self.item.quantity

    @property
    def amount_p90(self) -> float:
        return self.rate_p90 * self.item.quantity

    def as_dict(self) -> dict[str, Any]:
        return {
            "ref": self.item.ref,
            "section": self.item.section,
            "description": self.item.description,
            "category": self.category,
            "unit": self.item.unit,
            "quantity": self.item.quantity,
            "rate_p10": round(self.rate_p10, 2),
            "rate_p50": round(self.rate_p50, 2),
            "rate_p90": round(self.rate_p90, 2),
            "amount_p50": round(self.amount_p50, 2),
            "amount_p10": round(self.amount_p10, 2),
            "amount_p90": round(self.amount_p90, 2),
            "quoted_rate": self.item.rate,
            "similarity": round(self.similarity, 3),
            "category_confidence": round(self.category_confidence, 3),
            "method": self.method,
            "flags": ",".join(self.flags),
        }


@dataclass
class EstimateResult:
    """A costed tender: line bands, roll-ups, markups and an accuracy class."""

    document: TenderDocument
    lines: list[LineEstimate]
    measured_p10: float
    measured_p50: float
    measured_p90: float
    markups: dict[str, float]
    total_p10: float
    total_p50: float
    total_p90: float
    estimate_class: str
    class_rationale: str
    category_breakdown: pd.DataFrame
    warnings: list[str] = field(default_factory=list)
    parametric_check: dict[str, float] | None = None
    diagnostics: dict[str, Any] = field(default_factory=dict)

    @property
    def band_pct(self) -> tuple[float, float]:
        """Low/high band as signed percentages of the P50."""
        if self.total_p50 <= 0:
            return (0.0, 0.0)
        return (
            (self.total_p10 / self.total_p50 - 1.0) * 100.0,
            (self.total_p90 / self.total_p50 - 1.0) * 100.0,
        )

    def lines_frame(self) -> pd.DataFrame:
        return pd.DataFrame([line.as_dict() for line in self.lines])

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_id": self.document.project_id,
            "project_name": self.document.project_name,
            "project_type": self.document.project_type,
            "region": self.document.region,
            "date": self.document.date.isoformat(),
            "currency": self.document.currency,
            "n_items": len(self.lines),
            "measured": {
                "p10": round(self.measured_p10, 2),
                "p50": round(self.measured_p50, 2),
                "p90": round(self.measured_p90, 2),
            },
            "markups": {k: round(v, 2) for k, v in self.markups.items()},
            "total": {
                "p10": round(self.total_p10, 2),
                "p50": round(self.total_p50, 2),
                "p90": round(self.total_p90, 2),
            },
            "band_pct": [round(b, 1) for b in self.band_pct],
            "estimate_class": self.estimate_class,
            "class_rationale": self.class_rationale,
            "categories": self.category_breakdown.to_dict(orient="records"),
            "parametric_check": self.parametric_check,
            "warnings": list(self.warnings),
            "diagnostics": self.diagnostics,
            "lines": [line.as_dict() for line in self.lines],
        }


@dataclass
class MarkupPolicy:
    """Commercial adders applied on top of the measured works.

    Defaults are deliberately mid-range for Irish civils/utilities subcontract
    work. Override them per client — they move the answer more than the model
    does.
    """

    preliminaries_pct: float = 12.0
    overheads_pct: float = 6.0
    profit_pct: float = 7.5
    risk_pct: float = 5.0
    #: Coefficient of variation on quantities themselves. Rises sharply when
    #: estimating from a scope description rather than a measured take-off.
    quantity_cv: float = 0.10
    #: Correlation between line-level cost errors — rates move together,
    #: because it is one market and one supply chain. Left as ``None`` these
    #: are fitted from your own history during training; set them to override.
    rho_global: float | None = None
    rho_category: float | None = None

    def as_dict(self) -> dict[str, float]:
        return asdict(self)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _none_if_nan(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if number != number else number


def _coerce_date(value: Any) -> _dt.date:
    if isinstance(value, _dt.datetime):
        return value.date()
    if isinstance(value, _dt.date):
        return value
    if value is None:
        return _dt.date.today()
    text = str(value).strip()
    if not text or text.lower() in {"nan", "nat", "none"}:
        return _dt.date.today()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%Y-%m", "%m/%Y", "%d-%m-%Y", "%Y"):
        try:
            return _dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    if parsed is not None and parsed == parsed:
        return parsed.date()
    return _dt.date.today()


def documents_to_history(documents: Iterable[TenderDocument]) -> pd.DataFrame:
    """Concatenate priced documents into one training frame."""
    frames = [doc.to_frame() for doc in documents]
    if not frames:
        return pd.DataFrame(columns=list(HISTORY_COLUMNS))
    return pd.concat(frames, ignore_index=True)
