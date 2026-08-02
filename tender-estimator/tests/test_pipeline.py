import datetime as dt

import numpy as np
import pandas as pd
import pytest

from infrabid_estimator import TenderDocument, TenderEstimator, render
from infrabid_estimator.indexation import IndexationPolicy, TenderPriceIndex
from infrabid_estimator.report import to_json
from infrabid_estimator.schema import LineItem, MarkupPolicy
from infrabid_estimator.synthetic import generate_tender


def _document(frame, **kwargs):
    return TenderDocument.from_frame(frame, **kwargs)


def test_fit_reports_what_it_learned(estimator):
    report = estimator.training_report_
    assert report.n_items > 100
    assert report.n_projects == 12
    assert "priced items" in report.summary()


def test_fit_rejects_history_without_required_columns():
    with pytest.raises(ValueError, match="missing required columns"):
        TenderEstimator().fit(pd.DataFrame({"description": ["x"], "unit": ["m"]}))


def test_fit_rejects_a_history_that_is_too_small():
    frame = pd.DataFrame(
        {
            "description": ["excavate trench"] * 4,
            "unit": ["m"] * 4,
            "quantity": [10.0] * 4,
            "rate": [25.0] * 4,
        }
    )
    with pytest.raises(ValueError, match="usable priced items"):
        TenderEstimator().fit(frame)


def test_estimate_produces_an_ordered_band(estimator, tender_frame):
    result = estimator.estimate(_document(tender_frame, project_id="T1"))
    assert result.total_p10 < result.total_p50 < result.total_p90
    assert result.measured_p50 > 0
    assert len(result.lines) == len(tender_frame)
    for line in result.lines:
        assert line.rate_p10 < line.rate_p50 < line.rate_p90
        assert line.rate_p50 > 0


def test_estimate_applies_markups_on_top_of_measured_works(estimator, tender_frame):
    document = _document(tender_frame, project_id="T2")
    bare = estimator.estimate(
        document,
        markups=MarkupPolicy(0.0, 0.0, 0.0, 0.0, quantity_cv=0.0),
    )
    marked_up = estimator.estimate(
        document,
        markups=MarkupPolicy(10.0, 5.0, 7.0, 4.0, quantity_cv=0.0),
    )
    assert marked_up.total_p50 > bare.total_p50
    assert bare.total_p50 == pytest.approx(bare.measured_p50, rel=1e-6)
    assert marked_up.markups["overheads"] > 0
    assert marked_up.markups["total"] == pytest.approx(marked_up.total_p50, rel=1e-6)


def test_preliminaries_are_topped_up_not_double_counted(estimator):
    items = [
        LineItem("Site set up, welfare unit and secure compound", "week", 10),
        LineItem("Provision of traffic management incl. stop/go", "week", 10),
        LineItem("Excavate trench 600mm wide x 1.0m deep", "m", 500),
    ]
    document = TenderDocument(items=items, project_id="T3", region="Leinster")
    result = estimator.estimate(document, markups=MarkupPolicy(quantity_cv=0.0))
    assert result.markups["preliminaries_already_measured"] > 0
    # The bill already prices prelims, so the top-up must not be the full 12%.
    full_rate = 0.12 * result.measured_p50
    assert result.markups["preliminaries_topup"] < full_rate


def test_region_and_date_shift_the_estimate(estimator, tender_frame):
    dublin = estimator.estimate(
        _document(tender_frame, project_id="T4", region="Dublin", date=dt.date(2026, 1, 1))
    )
    connacht = estimator.estimate(
        _document(tender_frame, project_id="T5", region="Connacht", date=dt.date(2026, 1, 1))
    )
    assert dublin.total_p50 > connacht.total_p50

    later = estimator.estimate(
        _document(tender_frame, project_id="T6", region="Dublin", date=dt.date(2028, 1, 1))
    )
    assert later.total_p50 > dublin.total_p50  # two years of tender inflation


def test_honour_quoted_rates_keeps_supplied_prices(estimator, tender_frame):
    frame = tender_frame.copy()
    frame["rate"] = np.nan
    frame.loc[0, "rate"] = 999.99
    document = _document(frame, project_id="T7")
    result = estimator.estimate(document, honour_quoted_rates=True)
    assert result.lines[0].method == "quoted"
    assert result.lines[0].rate_p50 == pytest.approx(999.99, rel=1e-6)
    assert result.lines[1].method in {"model", "lookup"}


def test_unseen_items_are_flagged_and_widened(estimator):
    items = [
        LineItem("Excavate trench 600mm wide x 1.0m deep in soft ground", "m", 100),
        LineItem("Bespoke helium recovery cryostat commissioning protocol", "nr", 1),
    ]
    document = TenderDocument(items=items, project_id="T8")
    result = estimator.estimate(document)
    familiar, novel = result.lines
    assert novel.similarity < familiar.similarity
    assert "unseen-item" in novel.flags
    assert any("no close match" in w for w in result.warnings)


def test_dominant_line_raises_a_warning(estimator):
    items = [
        LineItem("Supply and install 400kVA ground mounted transformer", "nr", 20),
        LineItem("Topsoil and seed to verges", "m2", 5),
        LineItem("Supply and erect post and rail fencing to boundary", "m", 4),
        LineItem("Reinstate road markings to match existing", "m", 3),
        LineItem("Site clearance including removal of vegetation", "m2", 6),
        LineItem("Supply and install draw rope to existing duct", "m", 5),
    ]
    result = estimator.estimate(TenderDocument(items=items, project_id="T9"))
    assert any("Single line carries" in w for w in result.warnings)


def test_concentration_is_not_flagged_on_a_two_line_bill(estimator):
    items = [
        LineItem("Supply and install 400kVA ground mounted transformer", "nr", 20),
        LineItem("Topsoil and seed to verges", "m2", 5),
    ]
    result = estimator.estimate(TenderDocument(items=items, project_id="T9b"))
    assert not any("Single line carries" in w for w in result.warnings)


def test_quantity_far_outside_the_history_is_flagged_and_widened(estimator):
    ordinary = LineItem("Supply and erect 8m public lighting column with LED lantern", "nr", 10)
    extreme = LineItem("Supply and erect 8m public lighting column with LED lantern", "nr", 4000)
    result = estimator.estimate(
        TenderDocument(items=[ordinary, extreme], project_id="T9c")
    )
    normal_line, extrapolated = result.lines
    assert "quantity-out-of-range" in extrapolated.flags
    assert "quantity-out-of-range" not in normal_line.flags
    assert extrapolated.log_sigma > normal_line.log_sigma
    # The rate must not collapse just because the order is large: a huge
    # quantity is a discount, not a different item.
    assert extrapolated.rate_p50 > 0.5 * normal_line.rate_p50


def test_estimate_class_degrades_with_quantity_uncertainty(estimator, tender_frame):
    document = _document(tender_frame, project_id="T10")
    measured = estimator.estimate(document, quantity_cv=0.02)
    outline = estimator.estimate(document, quantity_cv=0.40)
    measured_class = int(measured.estimate_class.split()[2])
    outline_class = int(outline.estimate_class.split()[2])
    assert outline_class >= measured_class
    assert outline.band_pct[1] > measured.band_pct[1]


def test_category_breakdown_shares_sum_to_about_100(estimator, tender_frame):
    result = estimator.estimate(_document(tender_frame, project_id="T11"))
    assert result.category_breakdown["share_pct"].sum() == pytest.approx(100.0, abs=1.5)


def test_empty_document_is_rejected(estimator):
    with pytest.raises(ValueError, match="no measured items"):
        estimator.estimate(TenderDocument(items=[], project_id="T12"))


def test_estimating_before_fitting_is_rejected():
    with pytest.raises(RuntimeError, match="fit must be called"):
        TenderEstimator().estimate(
            TenderDocument(items=[LineItem("excavate", "m", 1)], project_id="x")
        )


def test_audit_flags_an_inflated_rate(estimator, tender_frame):
    priced = generate_tender(seed=4242, n_items=25, region="Dublin", priced=True)
    priced.loc[0, "rate"] = priced.loc[0, "rate"] * 12
    audit = estimator.audit(_document(priced, project_id="T13"))
    top = audit["lines"].iloc[0]
    assert audit["summary"]["n_flagged"] >= 1
    assert top["verdict"] == "high"
    assert top["z_score"] > 1.9


def test_audit_requires_quoted_rates(estimator, tender_frame):
    with pytest.raises(ValueError, match="no quoted rates"):
        estimator.audit(_document(tender_frame, project_id="T14"))


def test_save_and_load_roundtrip(estimator, tender_frame, tmp_path):
    path = estimator.save(tmp_path / "model.joblib")
    reloaded = TenderEstimator.load(path)
    document = _document(tender_frame, project_id="T15")
    original = estimator.estimate(document).total_p50
    restored = reloaded.estimate(document).total_p50
    assert restored == pytest.approx(original, rel=1e-9)


def test_load_rejects_a_foreign_pickle(tmp_path):
    import joblib

    path = tmp_path / "not_a_model.joblib"
    joblib.dump({"hello": "world"}, path)
    with pytest.raises(TypeError, match="does not contain"):
        TenderEstimator.load(path)


def test_custom_price_index_is_honoured(history, tender_frame):
    policy = IndexationPolicy()
    policy.prices = TenderPriceIndex(annual_escalation=0.20)
    hot = TenderEstimator(
        indexation=policy, n_simulations=1000, calibrate_uncertainty=False
    ).fit(history)
    document = _document(tender_frame, project_id="T16", date=dt.date(2030, 1, 1))
    assert hot.estimate(document).total_p50 > 0


def test_reports_render_in_every_format(estimator, tender_frame):
    result = estimator.estimate(_document(tender_frame, project_id="T17"))
    text = render(result, style="text")
    markdown = render(result, style="markdown")
    payload = to_json(result)
    assert "Order-of-magnitude estimate" in text
    assert markdown.startswith("# ")
    assert '"estimate_class"' in payload


def test_calibration_fits_uncertainty_from_history(calibrated_estimator):
    calibration = calibrated_estimator.calibration_
    assert calibration is not None
    assert 0.5 <= calibration.sigma_scale <= 4.0
    assert 0.0 <= calibration.rho_global <= 0.95
    assert calibration.line_coverage_calibrated >= calibration.line_coverage_raw - 0.02
