"""Regional and time indexation.

Historic rates are only comparable once you strip out *where* and *when* they
were priced. The model therefore learns a de-indexed "base" rate, and location
and tender-date escalation are re-applied deterministically at prediction time.
Keeping these effects out of the learner means they stay auditable — a QS can
see exactly why a 2023 Galway rate became a 2026 Dublin one.
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field

#: Location factors relative to the Leinster (ex-Dublin) baseline of 1.00.
#: Indicative starting values — recalibrate against your own won/lost bids.
DEFAULT_REGION_FACTORS: dict[str, float] = {
    "dublin": 1.09,
    "leinster": 1.00,
    "munster": 0.96,
    "cork": 1.00,
    "connacht": 0.94,
    "ulster": 0.95,
    "midlands": 0.95,
    "west": 0.94,
    "northern ireland": 0.92,
    "uk": 1.02,
    "unknown": 1.00,
}

#: Annual tender price escalation used when no index series is supplied.
DEFAULT_ANNUAL_ESCALATION = 0.035


@dataclass
class TenderPriceIndex:
    """A tender price index with monthly resolution and log-linear gap filling.

    Supply your own ``series`` (``{"YYYY-MM": index_value}``) from the SCSI /
    BCIS / CSO wholesale series you subscribe to. Anything outside the supplied
    range extrapolates at ``annual_escalation``.
    """

    series: dict[str, float] = field(default_factory=dict)
    annual_escalation: float = DEFAULT_ANNUAL_ESCALATION
    base_date: _dt.date = field(default_factory=lambda: _dt.date(2024, 1, 1))

    def __post_init__(self) -> None:
        self._points: list[tuple[float, float]] = sorted(
            (_month_ordinal(_parse_month(k)), float(v))
            for k, v in self.series.items()
        )

    def value(self, when: _dt.date) -> float:
        """Index value at ``when`` (base date == 100)."""
        target = _month_ordinal(when)
        if not self._points:
            years = (target - _month_ordinal(self.base_date)) / 12.0
            return 100.0 * (1.0 + self.annual_escalation) ** years

        if target <= self._points[0][0]:
            first_x, first_y = self._points[0]
            years = (target - first_x) / 12.0
            return first_y * (1.0 + self.annual_escalation) ** years
        if target >= self._points[-1][0]:
            last_x, last_y = self._points[-1]
            years = (target - last_x) / 12.0
            return last_y * (1.0 + self.annual_escalation) ** years

        for (x0, y0), (x1, y1) in zip(self._points, self._points[1:]):
            if x0 <= target <= x1:
                if x1 == x0:
                    return y1
                weight = (target - x0) / (x1 - x0)
                return y0 + weight * (y1 - y0)
        return self._points[-1][1]

    def factor(self, from_date: _dt.date, to_date: _dt.date) -> float:
        """Multiplier to move money from ``from_date`` prices to ``to_date``."""
        start = self.value(from_date)
        if start <= 0:
            return 1.0
        return self.value(to_date) / start

    def to_base(self, when: _dt.date) -> float:
        """Multiplier that deflates a rate priced at ``when`` to the base date."""
        return self.factor(when, self.base_date)

    def from_base(self, when: _dt.date) -> float:
        """Multiplier that inflates a base-date rate to ``when``."""
        return self.factor(self.base_date, when)


@dataclass
class RegionIndex:
    """Location cost factors, normalised so the baseline region is 1.00."""

    factors: dict[str, float] = field(
        default_factory=lambda: dict(DEFAULT_REGION_FACTORS)
    )
    default: float = 1.00

    def factor(self, region: str | None) -> float:
        if not region:
            return self.default
        return self.factors.get(str(region).strip().lower(), self.default)


@dataclass
class IndexationPolicy:
    """Bundles the two indices and exposes the de-index / re-index pair."""

    prices: TenderPriceIndex = field(default_factory=TenderPriceIndex)
    regions: RegionIndex = field(default_factory=RegionIndex)

    def deflate(self, rate: float, region: str | None, when: _dt.date) -> float:
        """Historic quoted rate -> base-date, baseline-region rate."""
        divisor = self.regions.factor(region)
        return rate / max(divisor, 1e-6) * self.prices.to_base(when)

    def inflate(self, base_rate: float, region: str | None, when: _dt.date) -> float:
        """Base-date, baseline-region rate -> rate for this bid."""
        return base_rate * self.regions.factor(region) * self.prices.from_base(when)


def _parse_month(text: str) -> _dt.date:
    raw = str(text).strip()
    for fmt in ("%Y-%m", "%Y-%m-%d", "%m/%Y", "%Y/%m"):
        try:
            return _dt.datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised index period: {text!r} (expected YYYY-MM)")


def _month_ordinal(date: _dt.date) -> float:
    return date.year * 12 + (date.month - 1) + (date.day - 1) / 31.0
