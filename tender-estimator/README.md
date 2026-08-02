# InfraBid Tender Estimator

A machine-learning pipeline that reads tender documents — bills of quantities,
schedules of rates, pricing documents, priced subcontractor returns — and
produces a **banded order-of-magnitude cost estimate** with a work-package
breakdown, an accuracy class, and a list of the lines a QS should look at
before the bid goes in.

Built for the Irish utility and civil engineering market (ducting, cabling,
chambers, watermains, drainage, reinstatement), but nothing in the modelling is
specific to it — retrain on your own priced bills and it follows your work.

---

## Why a band and not a number

An order-of-magnitude estimate that reports a single figure is telling you
something it does not know. This package predicts a **distribution** for every
line and rolls those up honestly:

* every rate is predicted as three quantiles (P10 / P50 / P90), not a point;
* line errors are **correlated** — one market, one supply chain — so the total
  is simulated rather than summed, which avoids both classic mistakes
  (adding up P90s, or assuming independence and reporting a band far too tight);
* the band's width is **calibrated on held-out projects from your own history**,
  so "P10–P90" means what it says: roughly 80% of outcomes land inside it;
* the result carries an AACE-style accuracy class (Class 5 order-of-magnitude
  through Class 2 control) derived from band width, how much of the value the
  model has actually seen before, and how firm the quantities are.

---

## Install

```bash
cd tender-estimator
pip install -r requirements.txt      # or: pip install -e ".[dev,pdf]"
```

Python 3.10+. PDF reading is optional (`pdfplumber`); XLSX and CSV work out of
the box.

```
infrabid_estimator/
  ingest.py       read xlsx / csv / pdf / txt bills into line items
  normalise.py    units, trade shorthand, numbers, mined dimensions
  taxonomy.py     work packages + the keyword rules that bootstrap them
  features.py     text vectorising, SVD, quantity and dimension features
  models.py       category classifier, quantile rate model, parametric check
  calibration.py  fits the band width and correlation out of fold
  aggregate.py    correlated Monte Carlo roll-up
  indexation.py   region factors and tender price escalation
  pipeline.py     TenderEstimator: fit / estimate / audit / save / load
  evaluation.py   project-wise backtesting
  report.py       text, markdown and JSON output
  cli.py          command line interface
examples/         a generated history and a deliberately messy bill of quantities
tests/            88 tests
```

## 60-second demo

```bash
python -m infrabid_estimator demo
```

This generates a synthetic priced history, trains the estimator, reads an
unpriced bill and prints a full estimate. Artefacts land in `demo_output/`
(`history.csv`, `model.joblib`, `priced_bill.csv`, `estimate.json`).

```
Order-of-magnitude estimate — Demo MV cable installation
Project type: MV Cable Installation | Region: Dublin | Bid date: 02 Aug 2026 | Items: 34

Headline
  €2.66m   [P10 €2.02m - P90 €3.75m  -24% / +41%]

Accuracy class: AACE Class 5 (order of magnitude)
Basis: Modelled band -24% / +41% about the P50; value-weighted similarity to
priced history 0.91; 0% of value from fallback rates; quantity uncertainty 12%.
```

Followed by the commercial build-up, a work-package breakdown with its own
bands, the largest items, the lines flagged for review, a top-down parametric
cross-check and any warnings.

## Use it on your own tenders

```bash
# 1. Train on your priced history (CSV or XLSX)
python -m infrabid_estimator train --history history.csv --out model.joblib

# 2. Cost an incoming bill of quantities
python -m infrabid_estimator estimate \
    --model model.joblib --document tender_boq.xlsx \
    --region Dublin --project-type "MV Cable Installation" \
    --date 2026-09-01 --quantity-cv 0.12 \
    --format markdown --out estimate.md --csv priced_bill.xlsx

# 3. Check how accurate it is on your data
python -m infrabid_estimator evaluate --history history.csv --folds 5

# 4. Review a subcontractor's returned pricing document
python -m infrabid_estimator audit --model model.joblib --document returned_prices.xlsx
```

### History format

One row per historic priced line item. Required: `description`, `unit`,
`quantity`, `rate` (the unit rate as tendered, excluding VAT). Strongly
recommended: `project_id`, `region`, `date`, `project_type`. Optional:
`section`, `category` (your own cost coding — supply it and the built-in
taxonomy steps aside), `ref`.

```csv
project_id,project_type,region,date,section,description,unit,quantity,rate
P001,MV Cable Installation,Dublin,2025-03-11,Ducting,S&L 4no. 110mm HDPE duct incl. bedding,m,980,42.00
P001,MV Cable Installation,Dublin,2025-03-11,Excavation,Excavate trench 600mm wide x 1.0m deep,m,1250,26.50
```

`project_id` matters more than it looks: every split in this package is taken
by project, never by line, because items inside one bill are priced by the same
team on the same day and a random line split leaks the answer.

### Documents it can read

`.xlsx` / `.xlsm`, `.csv` / `.tsv`, `.pdf` (with `pdfplumber`), `.txt`. The
parser handles the usual mess — banner rows, headers that are not on row 1,
section headings, blank spacers, "carried to summary" lines, `€` and mixed
thousand separators, and lump-sum items with no quantity. Column roles are
matched by meaning, so `Qty`, `Quantity` and `Q'ty` all work; if there is no
usable header at all it falls back to inferring roles from column content.

## Python API

```python
from infrabid_estimator import TenderEstimator, load_document, render
from infrabid_estimator.schema import MarkupPolicy
import pandas as pd

estimator = TenderEstimator().fit(pd.read_csv("history.csv"))
estimator.save("model.joblib")

document = load_document(
    "tender_boq.xlsx", region="Dublin",
    project_type="Fibre Duct Network", date="2026-09-01",
)

result = estimator.estimate(
    document,
    markups=MarkupPolicy(preliminaries_pct=12, overheads_pct=6, profit_pct=7.5, risk_pct=5),
    quantity_cv=0.12,          # 0.05 measured take-off … 0.35 outline scope
)

print(render(result, style="markdown"))
print(result.total_p50, result.band_pct, result.estimate_class)
result.lines_frame().to_csv("priced_bill.csv", index=False)
```

Auditing a returned pricing document:

```python
audit = estimator.audit(load_document("returned_prices.xlsx", region="Dublin"))
print(audit["summary"])          # quoted total vs model expectation, exposure
print(audit["lines"].head(20))   # ranked by € impact, with a z-score per line
```

## How it works

```
document ─▶ ingest ─▶ normalise ─▶ classify ─▶ rate model ─▶ simulate ─▶ markups ─▶ estimate
            (xlsx/     units,       work        quantile      correlated  prelims,   band +
             csv/pdf)  shorthand,   package     GBM on        Monte       OH&P,      class +
                       dimensions               log(rate)     Carlo       risk       flags
```

1. **Ingest** (`ingest.py`) — find the header by meaning, map columns to roles,
   separate measured items from headings and carry-forwards.
2. **Normalise** (`normalise.py`) — canonical units, expanded trade shorthand
   (`S&L` → `supply and lay`), and mined dimensions (diameter, depth, concrete
   grade, cable CSA) which are strong rate predictors.
3. **Classify** (`models.CategoryModel`) — TF-IDF + logistic regression onto a
   work package. Bootstrapped from keyword rules (`taxonomy.py`) when your
   history has no cost coding, then generalised by the classifier.
4. **Rate model** (`models.RateModel`) — quantile gradient boosting on
   `log(base unit rate)`. Log space because tender pricing error is
   multiplicative and rates span four orders of magnitude. Features: word and
   character TF-IDF compressed by SVD, unit, quantity, mined dimensions,
   project type. Region and date are *not* features — they are applied
   deterministically (`indexation.py`) so a 2023 Galway rate becomes a 2026
   Dublin one in a way a QS can audit line by line.
5. **Novelty and extrapolation checks** — cosine similarity to the nearest
   priced item in the training corpus; items with no close match fall back to a
   hierarchical category median, get a wider band, and are flagged for manual
   pricing. Quantity is fed to the model *relative to what is normal for that
   item type*, not absolutely — otherwise the model quietly learns "large
   quantity means cheap unit rate", which is true across item types and false
   within one, and prices a 200-off order of lighting columns like bulk
   surfacing. Quantities outside the historic range for their item type are
   flagged and widened.
6. **Calibration** (`calibration.py`) — out-of-fold residuals fix the band
   stretch (`sigma_scale`) and the correlation parameters, both fitted on
   held-out projects.
7. **Aggregate** (`aggregate.py`) — Monte Carlo over correlated lognormals
   (market shock + work-package shock + item shock, plus separate take-off
   uncertainty).
8. **Markups** (`pipeline.py`) — preliminaries topped up rather than
   double-charged when the bill already measures them, then overheads, profit
   and risk.
9. **Report** (`report.py`) — text / markdown / JSON, plus a fully priced bill.

## Accuracy, measured honestly

`evaluate` runs project-wise cross-validation and reports both point accuracy
and calibration:

```
python -m infrabid_estimator evaluate --history history.csv --folds 5
```

Measured on the bundled synthetic history (45 projects, 2,234 items, 5
project-wise folds):

| | line-item rates | project totals |
|---|---|---|
| median absolute error | 17.4% | 8.6% |
| within ±25% (items) / ±20% (projects) | 67.3% | 86.7% |
| within ±50% (items) / ±30% (projects) | 91.5% | 97.8% |
| P10–P90 coverage | 83.1% | 77.8% |
| median log bias | +0.005 | +0.059 |

Line rates are essentially unbiased; project totals run ~6% high, because the
median of a sum of correlated lognormals sits above the sum of the individual
medians. That is arithmetically correct rather than a modelling error, and it
errs on the safe side for a tender — but if you want the central figure to sit
lower, price off the sum of line P50s in `priced_bill.csv` rather than the
simulated total.

**These numbers measure the machinery, not your market.** Synthetic data has a
known generating process and is kinder than reality: descriptions vary in
realistic ways but the underlying rates really are a smooth function of item
type, size, region and date, which is exactly what the model assumes. Real
bills contain scope that is priced strategically, commercially or wrongly. Run
`evaluate` on your own history before quoting any accuracy figure to a client.

Coverage is the number to watch. A model that is 7% off on the median but whose
"80% band" only contains 50% of outcomes is lying to you about its confidence;
that is exactly the failure the calibration step exists to prevent.

## Tuning it to your business

| What | Where | Notes |
|---|---|---|
| Region factors | `indexation.DEFAULT_REGION_FACTORS` | Recalibrate against your won/lost bids |
| Tender price index | `TenderPriceIndex(series=...)` or `--price-index` | Feed your SCSI/BCIS/CSO series; otherwise 3.5%/yr |
| Prelims, OH&P, risk | `MarkupPolicy` or `--prelims/--overheads/--profit/--risk` | These move the answer more than the model does |
| Quantity uncertainty | `quantity_cv` | 0.05 measured take-off, 0.15 drawings-only, 0.35 outline scope |
| Work packages | `taxonomy.WORK_PACKAGES` | Or supply your own `category` column |
| Correlation | `MarkupPolicy(rho_global=…, rho_category=…)` | Left as `None`, both are fitted from your history |

## Limitations — read before relying on it

* **It is only as good as the history.** A few hundred items will produce
  numbers, but the bands will be wide and the fallback path will do most of the
  work. A few thousand items across 20+ projects is where it starts to earn its
  keep.
* **It prices what it has seen.** Genuinely novel scope is flagged, not
  guessed well. Price flagged lines by hand.
* **It does not read drawings.** Quantities come from the document you give it;
  `quantity_cv` is how you tell it how much to trust them.
* **It does not read contract conditions.** Onerous terms, liquidated damages,
  programme risk and abnormal ground conditions are not in the model — that is
  what the risk provision and the QS review are for.
* **Commercial judgement stays with you.** This is decision support for a
  tender team, not an auto-submit button.

## Tests

```bash
python -m pytest tests -q
```

Covers unit/number/dimension parsing, messy real-world bill ingestion, the
Monte Carlo aggregation properties (diversification, correlation, quantity
noise), the full fit → estimate → audit → save/load path, and a backtest that
must beat "price everything at the global median" by a wide margin.
