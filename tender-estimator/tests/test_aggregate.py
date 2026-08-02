import numpy as np
import pytest

from infrabid_estimator.aggregate import band_from_quantiles, simulate_total


def _lines(n, sigma=0.3, quantity=10.0, rate=100.0):
    return (
        np.full(n, quantity),
        np.full(n, np.log(rate)),
        np.full(n, sigma),
    )


def test_median_of_total_is_close_to_sum_of_line_medians():
    quantities, medians, sigmas = _lines(20, sigma=0.2)
    result = simulate_total(quantities, medians, sigmas, quantity_cv=0.0, n_simulations=8000)
    naive = float((quantities * np.exp(medians)).sum())
    # Sums of lognormals sit slightly above the sum of medians; a few percent,
    # not a few tens of percent.
    assert naive <= result.p50 <= naive * 1.06


def test_correlation_widens_the_band():
    quantities, medians, sigmas = _lines(60)
    independent = simulate_total(
        quantities, medians, sigmas, rho_global=0.0, rho_group=0.0,
        quantity_cv=0.0, n_simulations=8000,
    )
    correlated = simulate_total(
        quantities, medians, sigmas, rho_global=0.6, rho_group=0.0,
        quantity_cv=0.0, n_simulations=8000,
    )
    independent_width = (independent.p90 - independent.p10) / independent.p50
    correlated_width = (correlated.p90 - correlated.p10) / correlated.p50
    assert correlated_width > independent_width * 2


def test_diversification_shrinks_the_band_as_items_are_added():
    widths = []
    for n in (5, 50, 500):
        quantities, medians, sigmas = _lines(n, quantity=1000.0 / n)
        result = simulate_total(
            quantities, medians, sigmas, rho_global=0.0, rho_group=0.0,
            quantity_cv=0.0, n_simulations=6000,
        )
        widths.append((result.p90 - result.p10) / result.p50)
    assert widths[0] > widths[1] > widths[2]


def test_quantity_uncertainty_adds_spread():
    quantities, medians, sigmas = _lines(30, sigma=0.1)
    tight = simulate_total(quantities, medians, sigmas, quantity_cv=0.0, n_simulations=6000)
    loose = simulate_total(quantities, medians, sigmas, quantity_cv=0.35, n_simulations=6000)
    assert (loose.p90 - loose.p10) > (tight.p90 - tight.p10)


def test_groups_produce_per_category_percentiles():
    quantities, medians, sigmas = _lines(6)
    groups = np.array(["civils", "civils", "civils", "cabling", "cabling", "cabling"])
    result = simulate_total(quantities, medians, sigmas, groups=groups, n_simulations=4000)
    assert set(result.category_percentiles) == {"civils", "cabling"}
    total_of_medians = sum(v["p50"] for v in result.category_percentiles.values())
    assert total_of_medians == pytest.approx(result.p50, rel=0.05)


def test_empty_bill_is_handled():
    result = simulate_total(np.array([]), np.array([]), np.array([]))
    assert result.p50 == 0.0


def test_correlation_inputs_are_clipped_to_a_valid_range():
    quantities, medians, sigmas = _lines(10)
    # rho_global + rho_group > 1 must not produce a negative idiosyncratic weight.
    result = simulate_total(
        quantities, medians, sigmas, rho_global=0.9, rho_group=0.9, n_simulations=2000
    )
    assert np.isfinite(result.p50) and result.p50 > 0


def test_band_from_quantiles():
    low, high = band_from_quantiles(80.0, 100.0, 130.0)
    assert low == pytest.approx(-20.0)
    assert high == pytest.approx(30.0)
