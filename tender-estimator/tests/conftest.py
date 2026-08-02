import pytest

from infrabid_estimator.pipeline import TenderEstimator
from infrabid_estimator.synthetic import generate_history, generate_tender


@pytest.fixture(scope="session")
def history():
    return generate_history(n_projects=12, seed=3)


@pytest.fixture(scope="session")
def estimator(history):
    """One fitted estimator shared across the suite — fitting is the slow bit."""
    return TenderEstimator(n_simulations=2000, calibrate_uncertainty=False).fit(history)


@pytest.fixture(scope="session")
def calibrated_estimator(history):
    return TenderEstimator(n_simulations=2000, calibration_folds=2).fit(history)


@pytest.fixture()
def tender_frame():
    return generate_tender(seed=4242, n_items=25, region="Dublin")
