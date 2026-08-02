import numpy as np
import pandas as pd
import pytest

from infrabid_estimator.evaluation import backtest
from infrabid_estimator.taxonomy import rule_category


def test_backtest_reports_accuracy_and_calibration(history):
    result = backtest(
        history,
        n_splits=3,
        n_simulations=1500,
        estimator_kwargs={"calibrate_uncertainty": False},
    )
    assert result.n_folds == 3
    # Every held-out item is scored exactly once.
    assert len(result.lines) == len(history)
    assert len(result.projects) == history["project_id"].nunique()
    for metric in ("mdape", "coverage_80", "within_25"):
        assert metric in result.line_metrics
    assert 0 <= result.line_metrics["coverage_80"] <= 100
    assert result.line_metrics["mdape"] > 0
    assert "median abs. error" in result.report()


def test_backtest_beats_a_flat_global_median(history):
    """The model has to earn its keep against 'price everything at the median'."""
    result = backtest(
        history,
        n_splits=3,
        n_simulations=1000,
        estimator_kwargs={"calibrate_uncertainty": False},
    )
    naive_rate = history["rate"].median()
    naive_ape = (
        (naive_rate - result.lines["actual_rate"]).abs()
        / result.lines["actual_rate"]
    ).median() * 100
    assert result.line_metrics["mdape"] < naive_ape / 2


def test_backtest_needs_several_projects():
    frame = pd.DataFrame(
        {
            "project_id": ["a"] * 10 + ["b"] * 10,
            "description": ["excavate trench 600mm wide"] * 20,
            "unit": ["m"] * 20,
            "quantity": np.linspace(10, 200, 20),
            "rate": np.linspace(20, 30, 20),
        }
    )
    with pytest.raises(ValueError, match="at least 3 distinct projects"):
        backtest(frame)


def test_backtest_requires_project_ids(history):
    with pytest.raises(ValueError, match="project_id"):
        backtest(history.drop(columns=["project_id"]))


@pytest.mark.parametrize(
    "description,expected",
    [
        ("Supply and lay 110mm HDPE duct", "Ducting & Cable Protection"),
        ("Construct type JB6 jointing chamber", "Chambers & Jointing Bays"),
        ("Provision of traffic management stop/go", "Traffic Management"),
        ("Permanent reinstatement of carriageway", "Road Reinstatement & Surfacing"),
        ("Pressure testing and disinfection of watermain", "Testing & Commissioning"),
        ("Excavate trench in soft ground", "Excavation & Earthworks"),
        ("Xyzzy plugh frobnicate", "Unclassified"),
    ],
)
def test_rule_categories(description, expected):
    assert rule_category(description) == expected
