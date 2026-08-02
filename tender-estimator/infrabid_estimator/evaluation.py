"""Backtesting: how accurate is this thing, actually?

Splits are taken by *project*, never by line item. Items inside one bill are
priced by the same team on the same day with the same rate build-up, so a
random line-level split leaks the answer and produces flattering nonsense —
the model looks brilliant and then misses by 30% on the next live tender.

Two things get measured, and both matter:

* point accuracy — how close the P50 lands, on lines and on project totals;
* calibration — whether the P10-P90 band contains the truth about 80% of the
  time. An estimate whose band you cannot trust is worse than no band at all.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from .schema import MarkupPolicy, TenderDocument
from .pipeline import TenderEstimator

#: Markups and quantity noise are switched off during backtesting so the
#: measurement is of the model, not of the commercial policy on top of it.
_NEUTRAL_MARKUPS = MarkupPolicy(
    preliminaries_pct=0.0,
    overheads_pct=0.0,
    profit_pct=0.0,
    risk_pct=0.0,
    quantity_cv=0.0,
)


@dataclass
class BacktestResult:
    lines: pd.DataFrame
    projects: pd.DataFrame
    line_metrics: dict[str, float]
    project_metrics: dict[str, float]
    by_category: pd.DataFrame
    n_folds: int

    def report(self) -> str:
        lm, pm = self.line_metrics, self.project_metrics
        return "\n".join(
            [
                f"Backtest over {self.n_folds} project-wise folds "
                f"({len(self.lines):,} items, {len(self.projects)} projects)",
                "",
                "Line-item unit rates",
                f"  median abs. error   {lm['mdape']:.1f}%",
                f"  mean abs. error     {lm['mape']:.1f}%",
                f"  within +/-25%       {lm['within_25']:.1f}% of items",
                f"  within +/-50%       {lm['within_50']:.1f}% of items",
                f"  P10-P90 coverage    {lm['coverage_80']:.1f}%  (target 80%)",
                f"  median log bias     {lm['median_log_bias']:+.3f}",
                "",
                "Project totals (the number that goes on the tender)",
                f"  median abs. error   {pm['mdape']:.1f}%",
                f"  mean abs. error     {pm['mape']:.1f}%",
                f"  within +/-10%       {pm['within_10']:.1f}% of projects",
                f"  within +/-20%       {pm['within_20']:.1f}% of projects",
                f"  within +/-30%       {pm['within_30']:.1f}% of projects",
                f"  P10-P90 coverage    {pm['coverage_80']:.1f}%  (target 80%)",
                f"  median log bias     {pm['median_log_bias']:+.3f}",
            ]
        )


def backtest(
    history: pd.DataFrame,
    *,
    n_splits: int = 5,
    n_simulations: int = 4000,
    estimator_kwargs: dict[str, Any] | None = None,
    verbose: bool = False,
) -> BacktestResult:
    """Project-wise cross-validation of both rate and total accuracy."""
    frame = history.copy()
    if "project_id" not in frame.columns:
        raise ValueError("Backtesting needs a project_id column to split on")
    frame = frame[frame["rate"].notna() & (frame["rate"] > 0)].reset_index(drop=True)

    groups = frame["project_id"].to_numpy()
    n_projects = len(np.unique(groups))
    folds = int(np.clip(n_splits, 2, n_projects))
    if n_projects < 3:
        raise ValueError(
            f"Need at least 3 distinct projects to backtest, found {n_projects}"
        )

    splitter = GroupKFold(n_splits=folds)
    line_rows: list[pd.DataFrame] = []
    project_rows: list[dict] = []

    for fold, (train_index, test_index) in enumerate(
        splitter.split(frame, groups=groups), start=1
    ):
        train = frame.iloc[train_index]
        test = frame.iloc[test_index]
        estimator = TenderEstimator(n_simulations=n_simulations, **(estimator_kwargs or {}))
        estimator.fit(train)
        if verbose:
            print(f"[fold {fold}/{folds}] trained on {len(train):,} items")

        for project_id, group in test.groupby("project_id", sort=False):
            unpriced = group.drop(columns=["rate"], errors="ignore").copy()
            # The work-package label is inferred at prediction time, exactly as
            # it would be on a live tender.
            unpriced = unpriced.drop(columns=["category"], errors="ignore")
            document = TenderDocument.from_frame(
                unpriced.reset_index(drop=True), project_id=str(project_id)
            )
            result = estimator.estimate(
                document, markups=_NEUTRAL_MARKUPS, n_simulations=n_simulations
            )

            actual_rate = group["rate"].to_numpy(dtype=float)
            predicted = np.array([line.rate_p50 for line in result.lines], dtype=float)
            low = np.array([line.rate_p10 for line in result.lines], dtype=float)
            high = np.array([line.rate_p90 for line in result.lines], dtype=float)
            quantity = group["quantity"].to_numpy(dtype=float)

            line_rows.append(
                pd.DataFrame(
                    {
                        "fold": fold,
                        "project_id": project_id,
                        "category": [line.category for line in result.lines],
                        "unit": group["unit"].to_numpy(),
                        "quantity": quantity,
                        "actual_rate": actual_rate,
                        "predicted_rate": predicted,
                        "p10": low,
                        "p90": high,
                        "similarity": [line.similarity for line in result.lines],
                        "method": [line.method for line in result.lines],
                    }
                )
            )

            actual_total = float((actual_rate * quantity).sum())
            project_rows.append(
                {
                    "fold": fold,
                    "project_id": project_id,
                    "project_type": group["project_type"].iat[0]
                    if "project_type" in group
                    else "unknown",
                    "n_items": len(group),
                    "actual_total": actual_total,
                    "predicted_total": result.measured_p50,
                    "p10": result.measured_p10,
                    "p90": result.measured_p90,
                    "estimate_class": result.estimate_class,
                }
            )

    lines = pd.concat(line_rows, ignore_index=True)
    projects = pd.DataFrame(project_rows)

    lines["ape"] = _ape(lines["actual_rate"], lines["predicted_rate"])
    lines["log_error"] = np.log(lines["predicted_rate"] / lines["actual_rate"])
    lines["in_band"] = (lines["actual_rate"] >= lines["p10"]) & (
        lines["actual_rate"] <= lines["p90"]
    )
    projects["ape"] = _ape(projects["actual_total"], projects["predicted_total"])
    projects["log_error"] = np.log(projects["predicted_total"] / projects["actual_total"])
    projects["in_band"] = (projects["actual_total"] >= projects["p10"]) & (
        projects["actual_total"] <= projects["p90"]
    )

    line_metrics = {
        "mdape": float(lines["ape"].median()),
        "mape": float(lines["ape"].mean()),
        "within_15": float((lines["ape"] <= 15).mean() * 100),
        "within_25": float((lines["ape"] <= 25).mean() * 100),
        "within_50": float((lines["ape"] <= 50).mean() * 100),
        "coverage_80": float(lines["in_band"].mean() * 100),
        "median_log_bias": float(lines["log_error"].median()),
        "n": int(len(lines)),
    }
    project_metrics = {
        "mdape": float(projects["ape"].median()),
        "mape": float(projects["ape"].mean()),
        "within_10": float((projects["ape"] <= 10).mean() * 100),
        "within_20": float((projects["ape"] <= 20).mean() * 100),
        "within_30": float((projects["ape"] <= 30).mean() * 100),
        "coverage_80": float(projects["in_band"].mean() * 100),
        "median_log_bias": float(projects["log_error"].median()),
        "n": int(len(projects)),
    }

    by_category = (
        lines.groupby("category")
        .agg(
            items=("ape", "size"),
            mdape=("ape", "median"),
            coverage_80=("in_band", lambda s: float(s.mean() * 100)),
            median_log_bias=("log_error", "median"),
        )
        .sort_values("items", ascending=False)
        .round(2)
        .reset_index()
    )

    return BacktestResult(
        lines=lines,
        projects=projects,
        line_metrics=line_metrics,
        project_metrics=project_metrics,
        by_category=by_category,
        n_folds=folds,
    )


def _ape(actual: pd.Series, predicted: pd.Series) -> pd.Series:
    actual = actual.astype(float)
    predicted = predicted.astype(float)
    return (predicted - actual).abs() / actual.clip(lower=1e-9) * 100.0
