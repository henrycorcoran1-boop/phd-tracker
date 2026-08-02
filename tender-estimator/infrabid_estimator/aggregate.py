"""Correlated Monte Carlo roll-up of line-level uncertainty.

Adding up per-line P10s and P90s is the classic estimating error: it either
assumes the lines are perfectly correlated (they are not) or independent (they
are not either), and the resulting band is wrong by a wide margin on a bill
with hundreds of items.

This module simulates instead. Each line is a lognormal around its predicted
median, driven by three shocks — a market-wide one, a work-package one and an
item-specific one — plus a separate take-off/quantity shock. The band on the
total then falls out of the simulation with the right amount of diversification.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

DEFAULT_SIMULATIONS = 20000
_CHUNK = 2000  # maximum simulations per block
_ELEMENT_BUDGET = 4_000_000  # simulations x lines held in memory at once


@dataclass
class AggregationResult:
    totals: np.ndarray
    percentiles: dict[str, float]
    category_percentiles: dict[str, dict[str, float]] = field(default_factory=dict)

    @property
    def p10(self) -> float:
        return self.percentiles["p10"]

    @property
    def p50(self) -> float:
        return self.percentiles["p50"]

    @property
    def p90(self) -> float:
        return self.percentiles["p90"]


def simulate_total(
    quantities: np.ndarray,
    log_medians: np.ndarray,
    log_sigmas: np.ndarray,
    groups: np.ndarray | None = None,
    *,
    rho_global: float = 0.45,
    rho_group: float = 0.30,
    quantity_cv: float = 0.10,
    quantity_common_share: float = 0.6,
    n_simulations: int = DEFAULT_SIMULATIONS,
    seed: int = 12345,
) -> AggregationResult:
    """Simulate the total cost of a priced bill.

    Parameters
    ----------
    quantities, log_medians, log_sigmas
        Per-line quantity, median of ``log(rate)`` and its standard deviation.
    groups
        Work-package label per line; lines sharing one move together more.
    rho_global
        Correlation between *any* two lines — one market, one supply chain.
    rho_group
        Additional correlation between lines in the same work package.
        ``rho_global + rho_group`` must stay below 1.
    quantity_cv
        Coefficient of variation on the quantities themselves. ~0.05 for a
        measured take-off off issued-for-construction drawings, 0.25-0.40 when
        quantities are inferred from an outline scope.
    quantity_common_share
        Share of quantity error that is systematic (scope-wide) rather than
        per-line.
    """
    quantities = np.asarray(quantities, dtype=float)
    log_medians = np.asarray(log_medians, dtype=float)
    log_sigmas = np.asarray(log_sigmas, dtype=float)
    n_lines = quantities.size
    if n_lines == 0:
        zeros = np.zeros(1)
        return AggregationResult(zeros, {"p10": 0.0, "p50": 0.0, "p90": 0.0})

    rho_global = float(np.clip(rho_global, 0.0, 0.95))
    rho_group = float(np.clip(rho_group, 0.0, 0.95 - rho_global))
    weight_global = np.sqrt(rho_global)
    weight_group = np.sqrt(rho_group)
    weight_item = np.sqrt(max(1.0 - rho_global - rho_group, 0.0))

    group_index, n_groups, group_labels = _index_groups(groups, n_lines)
    indicator = np.zeros((n_lines, n_groups))
    indicator[np.arange(n_lines), group_index] = 1.0

    sigma_q = np.sqrt(np.log1p(max(quantity_cv, 0.0) ** 2))
    common_q = np.sqrt(np.clip(quantity_common_share, 0.0, 1.0))
    idio_q = np.sqrt(max(1.0 - common_q**2, 0.0))

    rng = np.random.default_rng(seed)
    totals = np.empty(n_simulations, dtype=float)
    category_totals = np.empty((n_simulations, n_groups), dtype=float)

    # Keep each block near a fixed element budget so a 3,000-line bill does not
    # allocate an order of magnitude more memory than a 30-line one.
    chunk = int(np.clip(_ELEMENT_BUDGET // max(n_lines, 1), 100, _CHUNK))

    done = 0
    while done < n_simulations:
        size = min(chunk, n_simulations - done)
        z_market = rng.standard_normal((size, 1))
        z_group = rng.standard_normal((size, n_groups))[:, group_index]
        z_item = rng.standard_normal((size, n_lines))
        shock = weight_global * z_market + weight_group * z_group + weight_item * z_item
        rates = np.exp(log_medians + log_sigmas * shock)

        if sigma_q > 0:
            zq_common = rng.standard_normal((size, 1))
            zq_item = rng.standard_normal((size, n_lines))
            # Median-preserving: the -sigma^2/2 term keeps the *mean* quantity
            # unbiased while the median stays close to the take-off figure.
            quantity_shock = np.exp(
                sigma_q * (common_q * zq_common + idio_q * zq_item) - 0.5 * sigma_q**2
            )
        else:
            quantity_shock = 1.0

        amounts = quantities * rates * quantity_shock
        totals[done : done + size] = amounts.sum(axis=1)
        category_totals[done : done + size, :] = amounts @ indicator
        done += size

    percentiles = _percentiles(totals)
    by_category = {
        label: _percentiles(category_totals[:, i]) for i, label in enumerate(group_labels)
    }
    return AggregationResult(totals, percentiles, by_category)


def _index_groups(groups, n_lines: int) -> tuple[np.ndarray, int, list[str]]:
    if groups is None:
        return np.zeros(n_lines, dtype=int), 1, ["all"]
    labels = [str(g) for g in np.asarray(groups, dtype=object)]
    unique = sorted(set(labels))
    mapping = {label: i for i, label in enumerate(unique)}
    return np.array([mapping[label] for label in labels], dtype=int), len(unique), unique


def _percentiles(values: np.ndarray) -> dict[str, float]:
    p10, p50, p90 = np.percentile(values, [10, 50, 90])
    return {
        "p10": float(p10),
        "p50": float(p50),
        "p90": float(p90),
        "mean": float(values.mean()),
    }


def band_from_quantiles(p10: float, p50: float, p90: float) -> tuple[float, float]:
    """Express a band as signed percentages either side of the median."""
    if p50 <= 0:
        return (0.0, 0.0)
    return ((p10 / p50 - 1.0) * 100.0, (p90 / p50 - 1.0) * 100.0)
