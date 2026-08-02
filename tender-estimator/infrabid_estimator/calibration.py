"""Fitting the uncertainty, not guessing it.

Two parameters decide whether the band on an estimate means anything, and
neither can be read off the training fit:

``sigma_scale``
    Quantile models fitted in-sample are over-confident — they have seen the
    project their test items came from. Out-of-fold residuals reveal the real
    spread, and one scalar stretches the predicted bands until the P10-P90
    interval genuinely contains ~80% of outcomes.

``rho_global`` / ``rho_category``
    How much line-level errors move together. Assume independence and the
    total's band collapses to nothing on a 500-line bill; assume perfect
    correlation and it stays uselessly wide. The right value is whatever
    reproduces the spread actually observed on held-out project totals.

Both are calibrated on project-wise splits, so neither is fitted on data the
model has already seen.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

_Z80 = 1.2816  # two-sided 80% interval in standard deviations
#: rho_category is held at this fraction of rho_global so one scalar is fitted.
_CATEGORY_RATIO = 0.67
_MAX_TOTAL_RHO = 0.95


@dataclass
class Calibration:
    """The fitted uncertainty parameters, plus the evidence for them."""

    sigma_scale: float
    rho_global: float
    rho_category: float
    line_coverage_raw: float
    line_coverage_calibrated: float
    project_log_sigma: float
    n_folds: int
    n_projects: int
    n_items: int

    def summary(self) -> str:
        return (
            f"Calibrated on {self.n_projects} held-out projects "
            f"({self.n_items:,} items, {self.n_folds} folds): "
            f"band stretch x{self.sigma_scale:.2f} "
            f"(line coverage {self.line_coverage_raw:.0%} -> "
            f"{self.line_coverage_calibrated:.0%}), "
            f"correlation rho_global={self.rho_global:.2f}, "
            f"rho_category={self.rho_category:.2f}."
        )


def calibrate(
    rate_model_template,
    category_model_template,
    frame: pd.DataFrame,
    log_rate: np.ndarray,
    *,
    n_splits: int = 3,
    target_coverage: float = 0.80,
    min_projects: int = 6,
) -> Calibration | None:
    """Fit ``sigma_scale`` and the correlation parameters out of fold.

    Returns ``None`` when the history is too small for the split to mean
    anything, in which case the caller should keep its defaults.
    """
    project_ids = frame["project_id"].astype(str).to_numpy()
    unique_projects = np.unique(project_ids)
    if len(unique_projects) < max(min_projects, n_splits):
        return None

    folds = int(np.clip(n_splits, 2, len(unique_projects)))
    splitter = GroupKFold(n_splits=folds)

    residuals: list[np.ndarray] = []
    sigmas: list[np.ndarray] = []
    project_records: list[dict] = []

    for train_index, test_index in splitter.split(frame, groups=project_ids):
        train, test = frame.iloc[train_index], frame.iloc[test_index]
        y_train, y_test = log_rate[train_index], log_rate[test_index]

        rate_model = rate_model_template.clone_unfitted()
        category_model = category_model_template.clone_unfitted()
        category_model.fit(train, train["category"])
        try:
            rate_model.fit(train, y_train)
        except ValueError:  # fold too small to fit
            continue

        scored = test.copy()
        predicted_category, _ = category_model.predict(scored)
        scored["category"] = predicted_category
        prediction = rate_model.predict(scored)

        centre = prediction["log_rate_p50"].to_numpy()
        sigma = prediction["log_sigma"].to_numpy()
        residual = y_test - centre
        residuals.append(residual)
        sigmas.append(sigma)

        quantity = scored["quantity"].to_numpy(dtype=float)
        for project in scored["project_id"].astype(str).unique():
            mask = scored["project_id"].astype(str).to_numpy() == project
            predicted_amounts = quantity[mask] * np.exp(centre[mask])
            actual_total = float((quantity[mask] * np.exp(y_test[mask])).sum())
            predicted_total = float(predicted_amounts.sum())
            if predicted_total <= 0 or actual_total <= 0:
                continue
            project_records.append(
                {
                    "log_error": float(np.log(actual_total / predicted_total)),
                    "weights": predicted_amounts / predicted_total,
                    "sigmas": sigma[mask],
                    "groups": scored.loc[mask, "category"].to_numpy(),
                }
            )

    if not residuals:
        return None

    residual = np.concatenate(residuals)
    sigma = np.concatenate(sigmas)
    finite = np.isfinite(residual) & np.isfinite(sigma) & (sigma > 0)
    residual, sigma = residual[finite], sigma[finite]
    if residual.size < 30:
        return None

    coverage_raw = float(np.mean(np.abs(residual) <= _Z80 * sigma))
    ratio = np.abs(residual) / sigma
    sigma_scale = float(
        np.clip(np.quantile(ratio, target_coverage) / _Z80, 0.5, 4.0)
    )
    coverage_calibrated = float(np.mean(np.abs(residual) <= _Z80 * sigma * sigma_scale))

    rho_global, project_sigma = _fit_correlation(
        project_records, sigma_scale, target_coverage
    )

    return Calibration(
        sigma_scale=sigma_scale,
        rho_global=rho_global,
        rho_category=min(_CATEGORY_RATIO * rho_global, _MAX_TOTAL_RHO - rho_global),
        line_coverage_raw=coverage_raw,
        line_coverage_calibrated=coverage_calibrated,
        project_log_sigma=project_sigma,
        n_folds=folds,
        n_projects=len(unique_projects),
        n_items=int(residual.size),
    )


def _fit_correlation(
    project_records: list[dict], sigma_scale: float, target_coverage: float
) -> tuple[float, float]:
    """Solve for the correlation that makes project-total bands cover correctly.

    For a weighted sum of lognormals the log-scale variance of the total is,
    to first order::

        var = rho_g * (sum_i w_i s_i)^2
            + rho_c * sum_g (sum_{i in g} w_i s_i)^2
            + (1 - rho_g - rho_c) * sum_i w_i^2 s_i^2

    which is monotone in ``rho_g`` once ``rho_c`` is tied to it. The objective
    is the *hit rate* — the share of held-out project totals landing inside
    their own P10-P90 — rather than a point estimate of spread, because a
    handful of badly-missed projects otherwise drags a mean-matched fit into
    systematic under-coverage.
    """
    if len(project_records) < 4:
        return 0.45, 0.0

    errors = np.array([record["log_error"] for record in project_records])
    empirical = float(np.quantile(np.abs(errors), target_coverage) / _Z80)

    terms = []
    for record in project_records:
        weights = np.asarray(record["weights"], dtype=float)
        sigmas = np.asarray(record["sigmas"], dtype=float) * sigma_scale
        contribution = weights * sigmas
        a = float(contribution.sum() ** 2)
        groups = pd.Series(record["groups"])
        b = float(sum(contribution[(groups == g).to_numpy()].sum() ** 2 for g in groups.unique()))
        c = float((contribution**2).sum())
        terms.append((a, b, c))

    def project_sigmas(rho_global: float) -> np.ndarray:
        rho_category = min(_CATEGORY_RATIO * rho_global, _MAX_TOTAL_RHO - rho_global)
        idiosyncratic = max(1.0 - rho_global - rho_category, 0.0)
        return np.array(
            [
                np.sqrt(max(rho_global * a + rho_category * b + idiosyncratic * c, 1e-12))
                for a, b, c in terms
            ]
        )

    def coverage(rho_global: float) -> float:
        return float(np.mean(np.abs(errors) <= _Z80 * project_sigmas(rho_global)))

    low, high = 0.0, _MAX_TOTAL_RHO / (1.0 + _CATEGORY_RATIO)
    if coverage(low) >= target_coverage:
        return 0.0, empirical
    if coverage(high) <= target_coverage:
        return float(high), empirical
    # Coverage is monotone non-decreasing in rho: widen until the hit rate is met.
    for _ in range(40):
        middle = 0.5 * (low + high)
        if coverage(middle) < target_coverage:
            low = middle
        else:
            high = middle
    return float(high), empirical
