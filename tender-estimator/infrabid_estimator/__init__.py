"""InfraBid tender estimator.

A machine-learning pipeline that reads tender and pricing documents (bills of
quantities, schedules of rates, priced returns) and produces a banded
order-of-magnitude cost estimate.

Quick start::

    from infrabid_estimator import TenderEstimator, load_document, render
    from infrabid_estimator.synthetic import generate_history

    estimator = TenderEstimator().fit(generate_history())      # or your own history
    document = load_document("tender_boq.xlsx", region="Dublin")
    print(render(estimator.estimate(document)))

Train on your own priced bills as soon as you can: the synthetic history exists
to make the package runnable, not to price your work.
"""

from .aggregate import simulate_total
from .evaluation import backtest
from .indexation import IndexationPolicy, RegionIndex, TenderPriceIndex
from .ingest import load_document, parse_table, parse_text
from .pipeline import TenderEstimator, estimate_document
from .report import render, to_json, write_priced_bill
from .schema import (
    EstimateResult,
    LineEstimate,
    LineItem,
    MarkupPolicy,
    TenderDocument,
    documents_to_history,
)
from .taxonomy import WORK_PACKAGES, rule_category

__version__ = "0.1.0"

__all__ = [
    "EstimateResult",
    "IndexationPolicy",
    "LineEstimate",
    "LineItem",
    "MarkupPolicy",
    "RegionIndex",
    "TenderDocument",
    "TenderEstimator",
    "TenderPriceIndex",
    "WORK_PACKAGES",
    "backtest",
    "documents_to_history",
    "estimate_document",
    "load_document",
    "parse_table",
    "parse_text",
    "render",
    "rule_category",
    "simulate_total",
    "to_json",
    "write_priced_bill",
]
