import pandas as pd
import pytest

from infrabid_estimator.ingest import load_document, parse_table, parse_text

MESSY_BILL = [
    ["ARYA CONTRACTING LTD", None, None, None, None],
    ["BILL OF QUANTITIES - PRICING DOCUMENT", None, None, None, None],
    [None, None, None, None, None],
    ["Item No.", "Description of Works", "Unit", "Quantity", "Rate"],
    [None, "SECTION 1 - EXCAVATION", None, None, None],
    ["1.01", "Excavate trench 600mm wide x 1.0m deep", "lin m", "1,250", "26.50"],
    ["1.02", "Disposal of surplus material off site", "m3", "430.5", "€34.00"],
    [None, None, None, None, None],
    [None, "SECTION 2 - DUCTING", None, None, None],
    ["2.01", "S&L 4no. 110mm HDPE duct incl. bedding", "LM", "980", "42.00"],
    ["2.02", "Site set up and welfare", "Item", None, "3,200.00"],
    [None, "Carried to Summary", None, None, "1,000.00"],
]


@pytest.fixture()
def messy_frame():
    return pd.DataFrame(MESSY_BILL)


def test_parse_table_finds_header_and_items(messy_frame):
    items = parse_table(messy_frame)
    assert len(items) == 4
    first = items[0]
    assert first.ref == "1.01"
    assert first.unit == "m"
    assert first.quantity == pytest.approx(1250.0)
    assert first.rate == pytest.approx(26.50)
    assert first.amount == pytest.approx(1250.0 * 26.50)


def test_parse_table_tracks_section_headings(messy_frame):
    items = parse_table(messy_frame)
    assert items[0].section.startswith("SECTION 1")
    assert items[2].section.startswith("SECTION 2")
    assert "SECTION 2" in items[2].full_description


def test_parse_table_skips_carry_forward_rows(messy_frame):
    descriptions = [item.description for item in parse_table(messy_frame)]
    assert not any("Carried to Summary" in d for d in descriptions)


def test_parse_table_defaults_lump_sums_to_quantity_one(messy_frame):
    lump_sum = [i for i in parse_table(messy_frame) if "Site set up" in i.description][0]
    assert lump_sum.unit == "item"
    assert lump_sum.quantity == 1.0
    assert lump_sum.rate == pytest.approx(3200.0)


def test_parse_table_without_header_uses_content_heuristics():
    frame = pd.DataFrame(
        [
            ["Excavate trench 600mm wide in soft ground", "m", 120, 26.5],
            ["Supply and lay 110mm duct including bedding", "m", 340, 14.0],
            ["Precast concrete chamber type JB6", "nr", 4, 1450.0],
            ["Permanent reinstatement of carriageway", "m2", 210, 68.0],
            ["Topsoil and seed to verges", "m2", 400, 8.5],
        ]
    )
    items = parse_table(frame)
    assert len(items) == 5
    assert items[2].unit == "nr"
    assert items[2].quantity == 4


def test_parse_text_reads_pdf_style_lines():
    text = """
    BILL NO 1 - DRAINAGE
    1.01  Supply and lay 225mm dia. uPVC sewer pipe   m    340.00   62.50
    1.02  Precast concrete manhole 1050mm dia.        nr     6.00  2,200.00
    Carried forward                                                 12,345.00
    """
    items = parse_text(text)
    assert len(items) == 2
    assert items[0].unit == "m"
    assert items[1].quantity == 6
    assert items[1].rate == pytest.approx(2200.0)


def test_load_document_roundtrip_csv(tmp_path, messy_frame):
    path = tmp_path / "bill.csv"
    messy_frame.to_csv(path, index=False, header=False)
    document = load_document(
        path, project_id="P1", region="Dublin", project_type="Fibre Duct Network"
    )
    assert len(document) == 4
    assert document.region == "Dublin"
    assert document.is_priced
    assert document.quoted_total > 0


def test_load_document_roundtrip_xlsx(tmp_path, messy_frame):
    path = tmp_path / "bill.xlsx"
    messy_frame.to_excel(path, index=False, header=False, sheet_name="Bill No 1")
    document = load_document(path)
    assert len(document) == 4
    assert all("Bill No 1" in item.section for item in document.items)


def test_load_document_rejects_unknown_format(tmp_path):
    path = tmp_path / "bill.docx"
    path.write_text("not a bill")
    with pytest.raises(ValueError, match="Unsupported"):
        load_document(path)


def test_load_document_reports_empty_bills(tmp_path):
    path = tmp_path / "empty.csv"
    path.write_text("a,b\n1,2\n")
    with pytest.raises(ValueError, match="No measured items"):
        load_document(path)
