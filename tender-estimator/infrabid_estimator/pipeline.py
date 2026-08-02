"""The end-to-end estimator: history in, costed tender with a band out."""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .aggregate import DEFAULT_SIMULATIONS, simulate_total
from .calibration import Calibration, calibrate
from .indexation import IndexationPolicy
from .models import CategoryModel, ParametricTotalModel, RateModel
from .normalise import compose_description
from .schema import (
    EstimateResult,
    LineEstimate,
    MarkupPolicy,
    TenderDocument,
)
from .taxonomy import PRELIMINARY_PACKAGES, fill_categories

_Z90 = 1.2816  # standard normal quantile for the 10th/90th percentile


@dataclass
class TrainingReport:
    """What the model actually learned from, surfaced for the record."""

    n_items: int
    n_projects: int
    n_categories: int
    date_range: tuple[str, str]
    regions: list[str]
    median_rate: float
    parametric_fitted: bool
    dropped_items: int
    calibration: Calibration | None = None

    def summary(self) -> str:
        start, end = self.date_range
        lines = [
            f"{self.n_items:,} priced items across {self.n_projects} projects "
            f"({start} to {end}), {self.n_categories} work packages, "
            f"regions: {', '.join(self.regions)}.",
            f"Parametric cross-check: {'fitted' if self.parametric_fitted else 'not fitted'}.",
        ]
        lines.append(
            self.calibration.summary()
            if self.calibration
            else "Uncertainty not calibrated (needs 6+ distinct projects) — "
            "bands fall back to package defaults."
        )
        return "\n".join(lines)


class TenderEstimator:
    """Fit on priced history, then cost unpriced bills or audit priced ones."""

    def __init__(
        self,
        indexation: IndexationPolicy | None = None,
        markups: MarkupPolicy | None = None,
        *,
        svd_components: int = 120,
        novelty_threshold: float = 0.28,
        n_simulations: int = DEFAULT_SIMULATIONS,
        calibrate_uncertainty: bool = True,
        calibration_folds: int = 3,
        random_state: int = 0,
    ) -> None:
        self.indexation = indexation or IndexationPolicy()
        self.markups = markups or MarkupPolicy()
        self.n_simulations = n_simulations
        self.calibrate_uncertainty = calibrate_uncertainty
        self.calibration_folds = calibration_folds
        self.calibration_: Calibration | None = None
        self.random_state = random_state
        self.category_model = CategoryModel(random_state=random_state)
        self.rate_model = RateModel(
            svd_components=svd_components,
            novelty_threshold=novelty_threshold,
            random_state=random_state,
        )
        self.parametric_model = ParametricTotalModel(random_state=random_state)
        self.training_report_: TrainingReport | None = None

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------
    def fit(self, history: pd.DataFrame) -> "TenderEstimator":
        """Fit on a flat frame of historic *priced* line items.

        Required columns: ``description``, ``unit``, ``quantity``, ``rate``.
        Strongly recommended: ``project_id``, ``region``, ``date``,
        ``project_type``. Optional: ``category`` (your own cost coding).
        """
        frame = self._prepare_history(history)
        before = len(history)

        labels = pd.Series(
            fill_categories(frame["description"], frame.get("category")),
            index=frame.index,
            dtype=object,
        )
        frame["category"] = labels

        base_rate = np.array(
            [
                self.indexation.deflate(rate, region, date)
                for rate, region, date in zip(frame["rate"], frame["region"], frame["date"])
            ],
            dtype=float,
        )
        frame = frame.loc[base_rate > 0].reset_index(drop=True)
        base_rate = base_rate[base_rate > 0]
        target = np.log(base_rate)

        # Trim the extreme tails: a handful of fat-fingered rates in a historic
        # bill will otherwise drag the quantile models around.
        low, high = np.percentile(target, [0.2, 99.8])
        keep = (target >= low) & (target <= high)
        frame, target, base_rate = frame.loc[keep].reset_index(drop=True), target[keep], base_rate[keep]

        self.category_model.fit(frame, frame["category"])
        self.rate_model.fit(frame, target)

        # Stretch the bands and fit the correlation structure out of fold, so
        # the uncertainty reported reflects this history rather than a guess.
        if self.calibrate_uncertainty:
            self.calibration_ = calibrate(
                self.rate_model,
                self.category_model,
                frame,
                target,
                n_splits=self.calibration_folds,
            )
            if self.calibration_ is not None:
                self.rate_model.sigma_scale_ = self.calibration_.sigma_scale

        project_totals = (
            pd.Series(base_rate * frame["quantity"].to_numpy(dtype=float))
            .groupby(frame["project_id"].to_numpy())
            .sum()
        )
        self.parametric_model.fit(frame, project_totals)

        dates = pd.to_datetime(frame["date"], errors="coerce")
        self.training_report_ = TrainingReport(
            n_items=len(frame),
            n_projects=int(frame["project_id"].nunique()),
            n_categories=int(frame["category"].nunique()),
            date_range=(
                str(dates.min().date()) if dates.notna().any() else "?",
                str(dates.max().date()) if dates.notna().any() else "?",
            ),
            regions=sorted(frame["region"].astype(str).unique().tolist()),
            median_rate=float(np.median(base_rate)),
            parametric_fitted=self.parametric_model.fitted_,
            dropped_items=int(before - len(frame)),
            calibration=self.calibration_,
        )
        return self

    @property
    def is_fitted(self) -> bool:
        return self.training_report_ is not None

    # ------------------------------------------------------------------
    # Estimating
    # ------------------------------------------------------------------
    def estimate(
        self,
        document: TenderDocument,
        *,
        markups: MarkupPolicy | None = None,
        quantity_cv: float | None = None,
        honour_quoted_rates: bool = False,
        n_simulations: int | None = None,
    ) -> EstimateResult:
        """Cost a tender document and return a banded estimate.

        ``honour_quoted_rates`` keeps rates the document already carries and
        only models the gaps — the right mode when a subcontractor has returned
        part of a bill and you need the balance.
        """
        self._require_fitted()
        if not document.items:
            raise ValueError("Document contains no measured items")

        policy = markups or self.markups
        if quantity_cv is not None:
            policy = replace(policy, quantity_cv=quantity_cv)
        simulations = n_simulations or self.n_simulations

        frame, categories, confidences = self._classify(document)
        predictions = self.rate_model.predict(frame)

        index_factor = self.indexation.regions.factor(
            document.region
        ) * self.indexation.prices.from_base(document.date)
        log_index = float(np.log(max(index_factor, 1e-9)))

        # Copies, not views: quoted rates are written back into these below.
        log_median = predictions["log_rate_p50"].to_numpy(copy=True) + log_index
        log_sigma = predictions["log_sigma"].to_numpy(copy=True)
        similarity = predictions["similarity"].to_numpy(copy=True)
        method = predictions["method"].to_numpy(copy=True).astype(object)
        extremity = predictions["quantity_extremity"].to_numpy(copy=True)

        if honour_quoted_rates:
            for position, item in enumerate(document.items):
                if item.rate and item.rate > 0:
                    log_median[position] = float(np.log(item.rate))
                    log_sigma[position] = 0.06
                    method[position] = "quoted"

        quantities = np.array([item.quantity for item in document.items], dtype=float)
        lines = self._build_lines(
            document, categories, confidences, log_median, log_sigma, similarity,
            method, extremity,
        )

        rho_global, rho_category = self._resolve_correlation(policy)
        aggregation = simulate_total(
            quantities,
            log_median,
            log_sigma,
            groups=np.array(categories, dtype=object),
            rho_global=rho_global,
            rho_group=rho_category,
            quantity_cv=policy.quantity_cv,
            n_simulations=simulations,
            seed=self.random_state + 12345,
        )

        measured_p50 = aggregation.p50
        breakdown = self._category_breakdown(lines, aggregation, measured_p50)
        markup_amounts, multiplier = self._apply_markups(lines, measured_p50, policy)

        parametric = self._parametric_check(frame, index_factor, measured_p50)
        estimate_class, rationale, diagnostics = self._classify_estimate(
            lines, aggregation, policy, measured_p50
        )
        warnings = self._warnings(lines, measured_p50, parametric, diagnostics)

        return EstimateResult(
            document=document,
            lines=lines,
            measured_p10=aggregation.p10,
            measured_p50=measured_p50,
            measured_p90=aggregation.p90,
            markups=markup_amounts,
            total_p10=aggregation.p10 * multiplier,
            total_p50=measured_p50 * multiplier,
            total_p90=aggregation.p90 * multiplier,
            estimate_class=estimate_class,
            class_rationale=rationale,
            category_breakdown=breakdown,
            warnings=warnings,
            parametric_check=parametric,
            diagnostics=diagnostics,
        )

    # ------------------------------------------------------------------
    # Auditing a document that is already priced
    # ------------------------------------------------------------------
    def audit(self, document: TenderDocument, *, z_threshold: float = 1.9) -> dict[str, Any]:
        """Compare a returned pricing document against the model's own view.

        Every quoted rate is scored in log space against the predicted band.
        The output ranks lines by euro impact, which is what actually matters
        when deciding where to push back on a subcontractor's return.
        """
        self._require_fitted()
        priced = [item for item in document.items if item.rate and item.rate > 0]
        if not priced:
            raise ValueError("Document has no quoted rates to audit")

        result = self.estimate(document)
        rows = []
        for line in result.lines:
            quoted = line.item.rate
            if not quoted or quoted <= 0:
                continue
            z = (np.log(quoted) - np.log(max(line.rate_p50, 1e-9))) / max(line.log_sigma, 1e-6)
            impact = (quoted - line.rate_p50) * line.item.quantity
            rows.append(
                {
                    "ref": line.item.ref,
                    "description": line.item.description[:90],
                    "category": line.category,
                    "unit": line.item.unit,
                    "quantity": line.item.quantity,
                    "quoted_rate": round(quoted, 2),
                    "expected_rate": round(line.rate_p50, 2),
                    "expected_p10": round(line.rate_p10, 2),
                    "expected_p90": round(line.rate_p90, 2),
                    "z_score": round(float(z), 2),
                    "impact_eur": round(float(impact), 2),
                    "verdict": (
                        "high" if z > z_threshold else "low" if z < -z_threshold else "in band"
                    ),
                    "similarity": round(line.similarity, 3),
                }
            )

        table = pd.DataFrame(rows)
        table = table.reindex(
            table["impact_eur"].abs().sort_values(ascending=False).index
        ).reset_index(drop=True)
        flagged = table[table["verdict"] != "in band"]
        quoted_total = float(sum((i.rate or 0.0) * i.quantity for i in document.items))
        return {
            "summary": {
                "quoted_total": round(quoted_total, 2),
                "expected_p50": round(result.measured_p50, 2),
                "expected_p10": round(result.measured_p10, 2),
                "expected_p90": round(result.measured_p90, 2),
                "variance_pct": round(
                    (quoted_total / result.measured_p50 - 1.0) * 100.0, 1
                )
                if result.measured_p50 > 0
                else 0.0,
                "n_priced_items": len(priced),
                "n_flagged": int(len(flagged)),
                "flagged_value_eur": round(float(flagged["impact_eur"].abs().sum()), 2)
                if len(flagged)
                else 0.0,
                "overpriced_exposure_eur": round(
                    float(flagged.loc[flagged["verdict"] == "high", "impact_eur"].sum()), 2
                )
                if len(flagged)
                else 0.0,
            },
            "lines": table,
            "estimate": result,
        }

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def save(self, path: str | Path) -> Path:
        import joblib  # local import keeps module import light

        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)
        return path

    @classmethod
    def load(cls, path: str | Path) -> "TenderEstimator":
        import joblib

        model = joblib.load(Path(path))
        if not isinstance(model, cls):
            raise TypeError(f"{path} does not contain a TenderEstimator")
        return model

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _require_fitted(self) -> None:
        if not self.is_fitted:
            raise RuntimeError("TenderEstimator.fit must be called before estimating")

    def _resolve_correlation(self, policy: MarkupPolicy) -> tuple[float, float]:
        """Explicit policy wins; otherwise use the calibrated values."""
        calibrated_global = self.calibration_.rho_global if self.calibration_ else 0.45
        calibrated_category = self.calibration_.rho_category if self.calibration_ else 0.30
        rho_global = policy.rho_global if policy.rho_global is not None else calibrated_global
        rho_category = (
            policy.rho_category if policy.rho_category is not None else calibrated_category
        )
        return float(rho_global), float(rho_category)

    def _prepare_history(self, history: pd.DataFrame) -> pd.DataFrame:
        frame = history.copy()
        missing = {"description", "unit", "quantity", "rate"} - set(frame.columns)
        if missing:
            raise ValueError(f"History is missing required columns: {sorted(missing)}")

        frame["description"] = frame["description"].fillna("").astype(str)
        if "section" in frame.columns:
            # Compose exactly as TenderDocument does at prediction time,
            # otherwise the model is trained on one text and scored on another.
            frame["description"] = [
                compose_description(section, description)
                for section, description in zip(frame["section"], frame["description"])
            ]
        frame["quantity"] = pd.to_numeric(frame["quantity"], errors="coerce")
        frame["rate"] = pd.to_numeric(frame["rate"], errors="coerce")
        if "project_id" not in frame:
            frame["project_id"] = "history"
        if "project_type" not in frame:
            frame["project_type"] = "unknown"
        if "region" not in frame:
            frame["region"] = "unknown"
        if "date" not in frame:
            frame["date"] = _dt.date.today()
        frame["date"] = pd.to_datetime(frame["date"], errors="coerce").fillna(
            pd.Timestamp(_dt.date.today())
        )
        frame["date"] = frame["date"].dt.date

        frame = frame[
            frame["rate"].notna()
            & (frame["rate"] > 0)
            & frame["quantity"].notna()
            & (frame["quantity"] > 0)
            & (frame["description"].str.len() >= 3)
        ]
        if len(frame) < 8:
            raise ValueError(
                f"Only {len(frame)} usable priced items in the history — "
                "at least 8 are needed (realistically, a few thousand)."
            )
        return frame.reset_index(drop=True)

    def _classify(self, document: TenderDocument):
        frame = document.to_frame()
        predicted, confidence = self.category_model.predict(frame)
        categories, confidences = [], []
        for position, item in enumerate(document.items):
            if item.category:
                categories.append(str(item.category))
                confidences.append(1.0)
            else:
                categories.append(str(predicted[position]))
                confidences.append(float(confidence[position]))
        frame["category"] = categories
        return frame, categories, confidences

    def _build_lines(
        self,
        document: TenderDocument,
        categories: list[str],
        confidences: list[float],
        log_median: np.ndarray,
        log_sigma: np.ndarray,
        similarity: np.ndarray,
        method: np.ndarray,
        extremity: np.ndarray,
    ) -> list[LineEstimate]:
        lines: list[LineEstimate] = []
        for position, item in enumerate(document.items):
            rate_p50 = float(np.exp(log_median[position]))
            sigma = float(log_sigma[position])
            line = LineEstimate(
                item=item,
                category=categories[position],
                category_confidence=confidences[position],
                rate_p10=float(np.exp(log_median[position] - _Z90 * sigma)),
                rate_p50=rate_p50,
                rate_p90=float(np.exp(log_median[position] + _Z90 * sigma)),
                amount_p50=rate_p50 * item.quantity,
                log_sigma=sigma,
                similarity=float(similarity[position]),
                method=str(method[position]),
            )
            if line.similarity < self.rate_model.novelty_threshold:
                line.flags.append("unseen-item")
            if confidences[position] < 0.35 and not item.category:
                line.flags.append("uncertain-category")
            if categories[position] == "Unclassified":
                line.flags.append("unclassified")
            if sigma > 0.55:
                line.flags.append("wide-band")
            if item.quantity <= 0:
                line.flags.append("zero-quantity")
            if extremity[position] > 0.5:
                line.flags.append("quantity-out-of-range")
            lines.append(line)

        # Concentration is only meaningful once there are enough lines for a
        # 15% share to be unusual.
        total = sum(line.amount_p50 for line in lines) or 1.0
        if len(lines) >= 5:
            for line in lines:
                if line.amount_p50 / total > 0.15:
                    line.flags.append("dominant-line")
        return lines

    def _category_breakdown(self, lines, aggregation, measured_p50: float) -> pd.DataFrame:
        rows: dict[str, dict[str, float]] = {}
        for line in lines:
            row = rows.setdefault(
                line.category, {"items": 0, "amount_p50": 0.0}
            )
            row["items"] += 1
            row["amount_p50"] += line.amount_p50

        records = []
        for category, row in rows.items():
            simulated = aggregation.category_percentiles.get(category, {})
            records.append(
                {
                    "category": category,
                    "items": int(row["items"]),
                    "amount_p10": round(simulated.get("p10", row["amount_p50"]), 2),
                    "amount_p50": round(simulated.get("p50", row["amount_p50"]), 2),
                    "amount_p90": round(simulated.get("p90", row["amount_p50"]), 2),
                }
            )
        breakdown = pd.DataFrame(records)
        if breakdown.empty:
            return breakdown
        # Shares are taken against the sum of the simulated package medians so
        # they add to 100 — the total's own median sits slightly above that sum
        # (a sum of lognormals is right-skewed), which would leave a gap.
        denominator = breakdown["amount_p50"].sum() or 1.0
        breakdown["share_pct"] = (100.0 * breakdown["amount_p50"] / denominator).round(1)
        return breakdown.sort_values("amount_p50", ascending=False).reset_index(drop=True)

    def _apply_markups(
        self, lines, measured_p50: float, policy: MarkupPolicy
    ) -> tuple[dict[str, float], float]:
        """Return the markup amounts and the multiplier they imply on the band.

        Preliminaries are only topped up to the policy level — bills that
        already measure site set-up and traffic management do not get charged
        for them twice.
        """
        priced_prelims = sum(
            line.amount_p50 for line in lines if line.category in PRELIMINARY_PACKAGES
        )
        measured_works = max(measured_p50 - priced_prelims, 0.0)
        prelims_target = policy.preliminaries_pct / 100.0 * measured_works
        prelims_allowance = max(prelims_target - priced_prelims, 0.0)

        works = measured_p50 + prelims_allowance
        overheads = works * policy.overheads_pct / 100.0
        profit = (works + overheads) * policy.profit_pct / 100.0
        risk = (works + overheads + profit) * policy.risk_pct / 100.0
        total = works + overheads + profit + risk

        amounts = {
            "measured_works": measured_p50,
            "preliminaries_topup": prelims_allowance,
            "preliminaries_already_measured": priced_prelims,
            "overheads": overheads,
            "profit": profit,
            "risk_provision": risk,
            "total": total,
        }
        multiplier = total / measured_p50 if measured_p50 > 0 else 1.0
        return amounts, multiplier

    def _parametric_check(
        self, frame: pd.DataFrame, index_factor: float, measured_p50: float
    ) -> dict[str, float] | None:
        parametric = self.parametric_model.predict(frame)
        if parametric is None:
            return None
        scaled = {key: value * index_factor for key, value in parametric.items()}
        scaled["bottom_up_p50"] = measured_p50
        scaled["divergence_pct"] = (
            (measured_p50 / scaled["p50"] - 1.0) * 100.0 if scaled["p50"] > 0 else 0.0
        )
        return {key: round(float(value), 2) for key, value in scaled.items()}

    def _classify_estimate(
        self, lines, aggregation, policy: MarkupPolicy, measured_p50: float
    ) -> tuple[str, str, dict[str, Any]]:
        """Assign an AACE-style class from band width and scope maturity."""
        weights = np.array([max(line.amount_p50, 0.0) for line in lines], dtype=float)
        total_weight = weights.sum() or 1.0
        similarity = np.array([line.similarity for line in lines], dtype=float)
        weighted_similarity = float((similarity * weights).sum() / total_weight)
        lookup_share = float(
            sum(w for w, line in zip(weights, lines) if line.method == "lookup") / total_weight
        )
        quoted_share = float(
            sum(w for w, line in zip(weights, lines) if line.method == "quoted") / total_weight
        )

        high_band = (aggregation.p90 / measured_p50 - 1.0) * 100.0 if measured_p50 else 100.0
        low_band = (aggregation.p10 / measured_p50 - 1.0) * 100.0 if measured_p50 else -100.0

        if high_band <= 8:
            band_class = 2
        elif high_band <= 14:
            band_class = 3
        elif high_band <= 25:
            band_class = 4
        else:
            band_class = 5

        if policy.quantity_cv >= 0.25:
            maturity_class = 5
        elif policy.quantity_cv >= 0.15:
            maturity_class = 4
        elif policy.quantity_cv >= 0.08:
            maturity_class = 3
        else:
            maturity_class = 2

        definition = 0.6 * min(weighted_similarity / 0.75, 1.0) + 0.4 * (
            1.0 - lookup_share
        )
        if definition < 0.45:
            definition_class = 5
        elif definition < 0.65:
            definition_class = 4
        else:
            definition_class = 3 if definition < 0.8 else 2

        final = max(band_class, maturity_class, definition_class)
        label = f"AACE Class {final}"
        if final == 5:
            label += " (order of magnitude)"
        elif final == 4:
            label += " (study / feasibility)"
        elif final == 3:
            label += " (budget authorisation)"
        else:
            label += " (control)"

        rationale = (
            f"Modelled band {low_band:+.0f}% / {high_band:+.0f}% about the P50; "
            f"value-weighted similarity to priced history {weighted_similarity:.2f}; "
            f"{lookup_share:.0%} of value from fallback rates; "
            f"quantity uncertainty {policy.quantity_cv:.0%}."
        )
        diagnostics = {
            "weighted_similarity": round(weighted_similarity, 3),
            "lookup_value_share": round(lookup_share, 3),
            "quoted_value_share": round(quoted_share, 3),
            "band_class": band_class,
            "maturity_class": maturity_class,
            "definition_class": definition_class,
            "definition_score": round(definition, 3),
            "n_flagged_lines": sum(1 for line in lines if line.flags),
        }
        return label, rationale, diagnostics

    def _warnings(
        self,
        lines,
        measured_p50: float,
        parametric: dict[str, float] | None,
        diagnostics: dict[str, Any],
    ) -> list[str]:
        warnings: list[str] = []
        unseen = [line for line in lines if "unseen-item" in line.flags]
        if unseen:
            share = sum(line.amount_p50 for line in unseen) / (measured_p50 or 1.0)
            warnings.append(
                f"{len(unseen)} item(s) ({share:.0%} of measured value) have no close "
                "match in the priced history — price these by hand before submission."
            )
        unclassified = [line for line in lines if "unclassified" in line.flags]
        if unclassified:
            warnings.append(
                f"{len(unclassified)} item(s) could not be assigned to a work package."
            )
        dominant = [line for line in lines if "dominant-line" in line.flags]
        for line in dominant:
            warnings.append(
                f"Single line carries {line.amount_p50 / (measured_p50 or 1):.0%} of the "
                f"measured value: {line.item.description[:70]!r}."
            )
        if parametric and abs(parametric.get("divergence_pct", 0.0)) > 35:
            warnings.append(
                f"Bottom-up total is {parametric['divergence_pct']:+.0f}% away from the "
                "top-down parametric model — check the take-off for missing or "
                "double-counted scope."
            )
        if diagnostics["lookup_value_share"] > 0.25:
            warnings.append(
                f"{diagnostics['lookup_value_share']:.0%} of value priced from fallback "
                "category medians rather than the item-level model."
            )
        zero_quantity = [line for line in lines if "zero-quantity" in line.flags]
        if zero_quantity:
            warnings.append(
                f"{len(zero_quantity)} item(s) have a zero or missing quantity."
            )
        extrapolated = [line for line in lines if "quantity-out-of-range" in line.flags]
        if extrapolated:
            share = sum(line.amount_p50 for line in extrapolated) / (measured_p50 or 1.0)
            warnings.append(
                f"{len(extrapolated)} item(s) ({share:.0%} of measured value) carry "
                "quantities outside anything in the priced history for that item type — "
                "the rate is extrapolated and the band widened accordingly."
            )
        return warnings


def estimate_document(
    model_path: str | Path, document: TenderDocument, **kwargs: Any
) -> EstimateResult:
    """Convenience: load a saved estimator and cost one document."""
    return TenderEstimator.load(model_path).estimate(document, **kwargs)
