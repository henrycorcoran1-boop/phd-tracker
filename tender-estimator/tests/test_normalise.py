import pytest

from infrabid_estimator.normalise import (
    compose_description,
    extract_dimensions,
    looks_like_section_heading,
    normalise_text,
    normalise_unit,
    parse_number,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("m²", "m2"), ("Sq.M", "m2"), ("m3", "m3"), ("CU.M", "m3"),
        ("No.", "nr"), ("nr", "nr"), ("each", "nr"), ("LM", "m"),
        ("Lin.m", "m"), ("tonnes", "t"), ("Item", "item"), ("Sum", "item"),
        ("Wk", "week"), ("hrs", "hr"), ("", "item"), (None, "item"),
        ("bananas", "item"),  # unknown units fall back to a lump sum
    ],
)
def test_normalise_unit(raw, expected):
    assert normalise_unit(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1,234.56", 1234.56),
        ("€1,234.56", 1234.56),
        ("1.234,56", 1234.56),  # continental separators
        ("1 234.56", 1234.56),
        ("12,50", 12.50),
        ("(450.00)", -450.0),
        ("-", None), ("n/a", None), ("", None), (None, None),
        (42, 42.0), (3.5, 3.5),
    ],
)
def test_parse_number(raw, expected):
    result = parse_number(raw)
    if expected is None:
        assert result is None
    else:
        assert result == pytest.approx(expected)


def test_normalise_text_expands_trade_shorthand():
    text = normalise_text("S&L 110mm dia. duct incl. bedding")
    assert "supply and lay" in text
    assert "including" in text
    assert "diameter" in text
    assert "110mm" in text  # sizes survive normalisation


def test_normalise_text_is_case_and_punctuation_insensitive():
    assert normalise_text("EXCAVATE TRENCH, 600mm WIDE.") == normalise_text(
        "excavate trench 600mm wide"
    )


def test_extract_dimensions_mines_sizes():
    dims = extract_dimensions(
        normalise_text("Supply and lay 225mm diameter uPVC sewer 1.5m deep in C30/37 surround")
    )
    assert dims["dim_diameter_mm"] == 225
    assert dims["dim_depth_m"] == pytest.approx(1.5)
    assert dims["dim_concrete_grade"] == 30


def test_extract_dimensions_separates_cable_csa_from_diameter():
    dims = extract_dimensions(normalise_text("Pull in 185mm2 3 core XLPE MV cable"))
    assert dims["dim_csa_mm2"] == 185
    assert dims["dim_diameter_mm"] == 0


def test_extract_dimensions_handles_depth_ranges():
    dims = extract_dimensions(
        normalise_text("Precast manhole 1050mm dia. 1.5-2.0m deep")
    )
    assert dims["dim_depth_m"] == pytest.approx(1.75)


def test_compose_description_prefixes_section_once():
    assert compose_description("DRAINAGE", "150mm dia. pipe") == "DRAINAGE. 150mm dia. pipe"
    # Already mentioned in the item text: no duplication.
    assert compose_description("Drainage", "Drainage pipe 150mm") == "Drainage pipe 150mm"
    assert compose_description(None, "Kerbing") == "Kerbing"


def test_section_heading_detection():
    assert looks_like_section_heading("EXCAVATION AND EARTHWORKS", False, False)
    assert looks_like_section_heading("Sub-total", False, False)
    assert not looks_like_section_heading("Excavate trench 600mm wide", True, True)
