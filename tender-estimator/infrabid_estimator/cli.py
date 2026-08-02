"""Command line interface.

    python -m infrabid_estimator demo
    python -m infrabid_estimator train    --history history.csv --out model.joblib
    python -m infrabid_estimator estimate --model model.joblib --document boq.xlsx
    python -m infrabid_estimator audit    --model model.joblib --document priced.xlsx
    python -m infrabid_estimator evaluate --history history.csv
"""

from __future__ import annotations

import argparse
import datetime as _dt
import sys
from pathlib import Path

import pandas as pd

from .evaluation import backtest
from .indexation import IndexationPolicy, TenderPriceIndex
from .ingest import load_document
from .pipeline import TenderEstimator
from .report import money, render, to_json, write_priced_bill
from .schema import MarkupPolicy, TenderDocument
from .synthetic import generate_history, generate_tender


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "command", None):
        parser.print_help()
        return 1
    return int(args.handler(args) or 0)


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------

def _cmd_train(args: argparse.Namespace) -> int:
    history = _read_table(Path(args.history))
    estimator = TenderEstimator(
        indexation=_indexation(args),
        markups=_markups(args),
        n_simulations=args.simulations,
    )
    estimator.fit(history)
    path = estimator.save(args.out)
    print(estimator.training_report_.summary())
    print(f"Model written to {path}")
    return 0


def _cmd_estimate(args: argparse.Namespace) -> int:
    estimator = TenderEstimator.load(args.model)
    document = load_document(
        args.document,
        project_id=args.project_id,
        project_name=args.project_name,
        project_type=args.project_type,
        region=args.region,
        date=args.date,
        currency=args.currency,
        sheet=args.sheet,
    )
    result = estimator.estimate(
        document,
        markups=_markups(args),
        quantity_cv=args.quantity_cv,
        honour_quoted_rates=args.honour_quoted_rates,
    )
    _emit(result, args)
    return 0


def _cmd_audit(args: argparse.Namespace) -> int:
    estimator = TenderEstimator.load(args.model)
    document = load_document(
        args.document,
        project_id=args.project_id,
        project_type=args.project_type,
        region=args.region,
        date=args.date,
        currency=args.currency,
        sheet=args.sheet,
    )
    audit = estimator.audit(document)
    summary = audit["summary"]
    print(f"Audit of {document.project_name}")
    print(f"  quoted total        {money(summary['quoted_total'], document.currency)}")
    print(
        f"  model expectation   {money(summary['expected_p50'], document.currency)} "
        f"({money(summary['expected_p10'], document.currency)} - "
        f"{money(summary['expected_p90'], document.currency)})"
    )
    print(f"  variance            {summary['variance_pct']:+.1f}%")
    print(
        f"  flagged lines       {summary['n_flagged']} of {summary['n_priced_items']} "
        f"({money(summary['flagged_value_eur'], document.currency)} at stake, "
        f"{money(summary['overpriced_exposure_eur'], document.currency)} above band)"
    )
    print()
    columns = [
        "ref", "description", "unit", "quantity", "quoted_rate",
        "expected_rate", "z_score", "impact_eur", "verdict",
    ]
    print(audit["lines"].head(args.top).loc[:, columns].to_string(index=False))
    if args.csv:
        audit["lines"].to_csv(args.csv, index=False)
        print(f"\nFull audit written to {args.csv}")
    return 0


def _cmd_evaluate(args: argparse.Namespace) -> int:
    history = _read_table(Path(args.history))
    result = backtest(
        history,
        n_splits=args.folds,
        n_simulations=args.simulations,
        verbose=args.verbose,
    )
    print(result.report())
    print("\nBy work package")
    print(result.by_category.to_string(index=False))
    if args.out:
        result.lines.to_csv(args.out, index=False)
        print(f"\nPer-item predictions written to {args.out}")
    return 0


def _cmd_demo(args: argparse.Namespace) -> int:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("1/4  Generating a synthetic priced history …")
    history = generate_history(n_projects=args.projects, seed=args.seed)
    history_path = out_dir / "history.csv"
    history.to_csv(history_path, index=False)
    print(
        f"     {len(history):,} priced items across {history['project_id'].nunique()} projects "
        f"-> {history_path}"
    )

    print("2/4  Training the estimator …")
    estimator = TenderEstimator(n_simulations=args.simulations)
    estimator.fit(history)
    model_path = out_dir / "model.joblib"
    estimator.save(model_path)
    print(f"     {estimator.training_report_.summary()}")

    print("3/4  Building an unpriced tender to cost …")
    tender = generate_tender(
        seed=args.seed + 500,
        project_type="MV Cable Installation",
        region="Dublin",
        n_items=args.items,
    )
    boq_path = out_dir / "tender_boq.csv"
    tender.to_csv(boq_path, index=False)
    document = load_document(
        boq_path,
        project_id="DEMO-MV-01",
        project_name="Demo MV cable installation",
        project_type="MV Cable Installation",
        region="Dublin",
        date=_dt.date.today(),
    )
    print(f"     {len(document)} items read from {boq_path}")

    print("4/4  Estimating …\n")
    result = estimator.estimate(document, quantity_cv=args.quantity_cv)
    print(render(result, style=args.format))
    write_priced_bill(result, out_dir / "priced_bill.csv")
    (out_dir / "estimate.json").write_text(to_json(result), encoding="utf-8")
    print(f"\nArtefacts written to {out_dir}/")

    if args.backtest:
        print("\nRunning a project-wise backtest (this takes a minute) …")
        print(backtest(history, n_splits=args.folds, n_simulations=2000).report())
    return 0


def _cmd_example(args: argparse.Namespace) -> int:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    history = generate_history(n_projects=args.projects, seed=args.seed)
    history.to_csv(out_dir / "example_history.csv", index=False)
    tender = generate_tender(seed=args.seed + 500, n_items=args.items)
    tender.to_csv(out_dir / "example_boq.csv", index=False)
    try:
        _write_messy_workbook(tender, out_dir / "example_boq.xlsx")
    except Exception as exc:  # pragma: no cover - openpyxl optional
        print(f"(skipped XLSX example: {exc})", file=sys.stderr)
    print(f"Example files written to {out_dir}/")
    return 0


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _emit(result, args: argparse.Namespace) -> None:
    if args.format == "json":
        text = to_json(result)
    else:
        text = render(result, style=args.format)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"Estimate written to {args.out}")
        print(
            f"{money(result.total_p50, result.document.currency)} "
            f"({result.estimate_class})"
        )
    else:
        print(text)
    if args.csv:
        write_priced_bill(result, args.csv)
        print(f"\nPriced bill written to {args.csv}")


def _read_table(path: Path) -> pd.DataFrame:
    if path.suffix.lower() in {".xlsx", ".xlsm", ".xls"}:
        return pd.read_excel(path)
    return pd.read_csv(path)


def _indexation(args: argparse.Namespace) -> IndexationPolicy:
    policy = IndexationPolicy()
    if getattr(args, "escalation", None) is not None:
        policy.prices = TenderPriceIndex(annual_escalation=args.escalation)
    if getattr(args, "price_index", None):
        series = pd.read_csv(args.price_index)
        columns = {c.lower(): c for c in series.columns}
        period = columns.get("period") or columns.get("month") or series.columns[0]
        value = columns.get("index") or columns.get("value") or series.columns[1]
        policy.prices = TenderPriceIndex(
            series=dict(zip(series[period].astype(str), series[value].astype(float))),
            annual_escalation=getattr(args, "escalation", None) or 0.035,
        )
    return policy


def _markups(args: argparse.Namespace) -> MarkupPolicy:
    defaults = MarkupPolicy()
    return MarkupPolicy(
        preliminaries_pct=_pick(args, "prelims", defaults.preliminaries_pct),
        overheads_pct=_pick(args, "overheads", defaults.overheads_pct),
        profit_pct=_pick(args, "profit", defaults.profit_pct),
        risk_pct=_pick(args, "risk", defaults.risk_pct),
        quantity_cv=_pick(args, "quantity_cv", defaults.quantity_cv),
    )


def _pick(args: argparse.Namespace, name: str, default: float) -> float:
    value = getattr(args, name, None)
    return default if value is None else float(value)


def _write_messy_workbook(tender: pd.DataFrame, path: Path) -> None:
    """Write an XLSX that looks like a bill a client would actually send."""
    rows: list[list[object]] = [
        ["ARYA CONTRACTING LTD", None, None, None, None],
        ["BILL OF QUANTITIES - PRICING DOCUMENT", None, None, None, None],
        ["Tenderers are to price every item in the Rate column", None, None, None, None],
        [None, None, None, None, None],
        ["Item No.", "Description of Works", "Unit", "Quantity", "Rate"],
    ]
    current_section = None
    for row in tender.itertuples(index=False):
        if row.section != current_section:
            current_section = row.section
            rows.append([None, str(current_section).upper(), None, None, None])
        rows.append([row.ref, row.description, row.unit, row.quantity, None])
    rows.append([None, "Carried to Summary", None, None, None])
    pd.DataFrame(rows).to_excel(path, index=False, header=False, sheet_name="Bill No 1")


# --------------------------------------------------------------------------
# Parser
# --------------------------------------------------------------------------

def _add_markup_arguments(parser: argparse.ArgumentParser) -> None:
    group = parser.add_argument_group("commercial policy")
    group.add_argument("--prelims", type=float, help="preliminaries %% of measured works")
    group.add_argument("--overheads", type=float, help="head office overheads %%")
    group.add_argument("--profit", type=float, help="profit %%")
    group.add_argument("--risk", type=float, help="risk provision %%")
    group.add_argument(
        "--quantity-cv",
        type=float,
        help="uncertainty on the quantities themselves (0.05 measured take-off, "
        "0.30 outline scope)",
    )


def _add_document_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--document", required=True, help="XLSX/CSV/PDF/TXT bill of quantities")
    parser.add_argument("--sheet", default=None, help="worksheet name (XLSX only)")
    parser.add_argument("--project-id", default=None)
    parser.add_argument("--project-name", default=None)
    parser.add_argument("--project-type", default="unknown")
    parser.add_argument("--region", default="Leinster")
    parser.add_argument("--date", default=None, help="bid date, YYYY-MM-DD (default: today)")
    parser.add_argument("--currency", default="EUR")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="infrabid_estimator",
        description="Machine-learning order-of-magnitude estimating for tender documents",
    )
    subparsers = parser.add_subparsers(dest="command")

    train = subparsers.add_parser("train", help="fit an estimator on priced history")
    train.add_argument("--history", required=True, help="CSV/XLSX of historic priced items")
    train.add_argument("--out", default="model.joblib")
    train.add_argument("--escalation", type=float, default=None, help="annual tender price escalation, e.g. 0.035")
    train.add_argument("--price-index", default=None, help="CSV of period,index for tender price indexation")
    train.add_argument("--simulations", type=int, default=20000)
    _add_markup_arguments(train)
    train.set_defaults(handler=_cmd_train)

    estimate = subparsers.add_parser("estimate", help="cost an unpriced tender document")
    estimate.add_argument("--model", required=True)
    _add_document_arguments(estimate)
    _add_markup_arguments(estimate)
    estimate.add_argument("--format", choices=("text", "markdown", "json"), default="text")
    estimate.add_argument("--out", default=None, help="write the report to a file")
    estimate.add_argument("--csv", default=None, help="write the priced bill to CSV/XLSX")
    estimate.add_argument(
        "--honour-quoted-rates",
        action="store_true",
        help="keep rates already in the document and only model the gaps",
    )
    estimate.set_defaults(handler=_cmd_estimate)

    audit = subparsers.add_parser("audit", help="review a priced/returned pricing document")
    audit.add_argument("--model", required=True)
    _add_document_arguments(audit)
    audit.add_argument("--top", type=int, default=20, help="rows to print, by euro impact")
    audit.add_argument("--csv", default=None)
    audit.set_defaults(handler=_cmd_audit)

    evaluate = subparsers.add_parser("evaluate", help="project-wise backtest of accuracy")
    evaluate.add_argument("--history", required=True)
    evaluate.add_argument("--folds", type=int, default=5)
    evaluate.add_argument("--simulations", type=int, default=4000)
    evaluate.add_argument("--out", default=None, help="write per-item predictions to CSV")
    evaluate.add_argument("--verbose", action="store_true")
    evaluate.set_defaults(handler=_cmd_evaluate)

    demo = subparsers.add_parser("demo", help="end-to-end run on synthetic data")
    demo.add_argument("--out-dir", default="demo_output")
    demo.add_argument("--projects", type=int, default=45)
    demo.add_argument("--items", type=int, default=34)
    demo.add_argument("--seed", type=int, default=7)
    demo.add_argument("--simulations", type=int, default=20000)
    demo.add_argument("--quantity-cv", type=float, default=0.12)
    demo.add_argument("--format", choices=("text", "markdown"), default="text")
    demo.add_argument("--backtest", action="store_true", help="also run a backtest")
    demo.add_argument("--folds", type=int, default=5)
    demo.set_defaults(handler=_cmd_demo)

    example = subparsers.add_parser("make-example", help="write example input files")
    example.add_argument("--out-dir", default="examples")
    example.add_argument("--projects", type=int, default=45)
    example.add_argument("--items", type=int, default=34)
    example.add_argument("--seed", type=int, default=7)
    example.set_defaults(handler=_cmd_example)

    return parser


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
