"""Human-readable renderings of an estimate.

The number is only half the deliverable. A tender estimate has to show a
reviewer where the money is, how confident the model is, and which lines it
wants a human to look at before the bid goes in.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from .schema import EstimateResult

_SYMBOLS = {"EUR": "€", "GBP": "£", "USD": "$"}


def money(value: float, currency: str = "EUR") -> str:
    symbol = _SYMBOLS.get(currency, "")
    if abs(value) >= 1_000_000:
        return f"{symbol}{value/1_000_000:,.2f}m"
    return f"{symbol}{value:,.0f}"


def render(result: EstimateResult, style: str = "text", top_n: int = 12) -> str:
    """Render an estimate as ``text`` or ``markdown``."""
    markdown = style == "markdown"
    currency = result.document.currency
    low_pct, high_pct = result.band_pct
    out: list[str] = []

    def heading(text: str, level: int = 2) -> None:
        out.append(f"{'#' * level} {text}" if markdown else f"\n{text}\n{'=' * len(text)}")

    title = f"Order-of-magnitude estimate — {result.document.project_name}"
    out.append(f"# {title}" if markdown else f"{title}\n{'=' * len(title)}")
    out.append("")
    out.append(
        f"Project type: {result.document.project_type} | Region: {result.document.region} "
        f"| Bid date: {result.document.date:%d %b %Y} | Items: {len(result.lines)}"
    )
    out.append("")

    heading("Headline")
    out.append(
        f"**{money(result.total_p50, currency)}** "
        f"(P10 {money(result.total_p10, currency)} — P90 {money(result.total_p90, currency)}, "
        f"{low_pct:+.0f}% / {high_pct:+.0f}%)"
        if markdown
        else (
            f"  {money(result.total_p50, currency)}   "
            f"[P10 {money(result.total_p10, currency)} - P90 {money(result.total_p90, currency)}"
            f"  {low_pct:+.0f}% / {high_pct:+.0f}%]"
        )
    )
    out.append("")
    out.append(f"Accuracy class: {result.estimate_class}")
    out.append(f"Basis: {result.class_rationale}")
    out.append("")

    heading("Build-up")
    # "preliminaries already measured" sits inside the measured works and is
    # reported separately as a note, so the column still adds up.
    order = (
        ("measured_works", "Measured works (P50)"),
        ("preliminaries_topup", "Preliminaries top-up"),
        ("overheads", "Overheads"),
        ("profit", "Profit"),
        ("risk_provision", "Risk provision"),
        ("total", "Tender total (P50)"),
    )
    build_up = pd.DataFrame(
        [
            {"element": label, "amount": money(result.markups[key], currency)}
            for key, label in order
            if key in result.markups
        ]
    )
    out.append(_table(build_up, markdown))
    already = result.markups.get("preliminaries_already_measured", 0.0)
    if already > 0:
        out.append("")
        out.append(
            f"Of the measured works, {money(already, currency)} is preliminaries and "
            "traffic management already priced in the bill — the top-up above only "
            "makes up the shortfall against policy."
        )
    out.append("")

    heading("Work packages")
    breakdown = result.category_breakdown.copy()
    if not breakdown.empty:
        display = pd.DataFrame(
            {
                "work package": breakdown["category"],
                "items": breakdown["items"],
                "P50": breakdown["amount_p50"].map(lambda v: money(v, currency)),
                "P10-P90": [
                    f"{money(lo, currency)} - {money(hi, currency)}"
                    for lo, hi in zip(breakdown["amount_p10"], breakdown["amount_p90"])
                ],
                "share": breakdown["share_pct"].map(lambda v: f"{v:.1f}%"),
            }
        )
        out.append(_table(display, markdown))
    out.append("")

    heading(f"Largest {top_n} items")
    largest = sorted(result.lines, key=lambda line: line.amount_p50, reverse=True)[:top_n]
    table = pd.DataFrame(
        [
            {
                "description": _truncate(line.item.description, 58),
                "qty": f"{line.item.quantity:,.1f} {line.item.unit}",
                "rate P50": money(line.rate_p50, currency),
                "amount P50": money(line.amount_p50, currency),
                "conf.": f"{line.similarity:.2f}",
            }
            for line in largest
        ]
    )
    out.append(_table(table, markdown))
    out.append("")

    flagged = [line for line in result.lines if line.flags]
    if flagged:
        heading("Lines to review before submission")
        flag_table = pd.DataFrame(
            [
                {
                    "description": _truncate(line.item.description, 58),
                    "amount P50": money(line.amount_p50, currency),
                    "why": ", ".join(line.flags),
                }
                for line in sorted(flagged, key=lambda l: l.amount_p50, reverse=True)[:15]
            ]
        )
        out.append(_table(flag_table, markdown))
        out.append("")

    if result.parametric_check:
        heading("Top-down cross-check")
        check = result.parametric_check
        out.append(
            f"Parametric model on project drivers: {money(check['p50'], currency)} "
            f"({money(check['p10'], currency)} - {money(check['p90'], currency)}). "
            f"Bottom-up build-up differs by {check['divergence_pct']:+.0f}%."
        )
        out.append("")

    if result.warnings:
        heading("Warnings")
        for warning in result.warnings:
            out.append(f"- {warning}")
        out.append("")

    out.append(
        "Estimate produced by a statistical model trained on historic priced bills. "
        "It is a decision-support tool, not a substitute for a QS review of the "
        "flagged lines, the contract conditions and the risk register."
    )
    return "\n".join(out)


def to_json(result: EstimateResult, indent: int = 2) -> str:
    return json.dumps(result.to_dict(), indent=indent, default=str)


def write_priced_bill(result: EstimateResult, path: str | Path) -> Path:
    """Write the fully priced bill (every line, every band) to CSV or XLSX."""
    path = Path(path)
    frame = result.lines_frame()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() in {".xlsx", ".xlsm"}:
        with pd.ExcelWriter(path) as writer:
            frame.to_excel(writer, sheet_name="priced bill", index=False)
            result.category_breakdown.to_excel(writer, sheet_name="work packages", index=False)
    else:
        frame.to_csv(path, index=False)
    return path


def _table(frame: pd.DataFrame, markdown: bool) -> str:
    if frame.empty:
        return "(none)"
    if not markdown:
        return frame.to_string(index=False)
    # Hand-rolled pipe table so the package does not depend on tabulate.
    columns = [str(c) for c in frame.columns]
    rows = [[str(value) for value in row] for row in frame.itertuples(index=False)]
    header = "| " + " | ".join(columns) + " |"
    divider = "| " + " | ".join("---" for _ in columns) + " |"
    body = ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join([header, divider, *body])


def _truncate(text: str, width: int) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= width else text[: width - 1] + "…"
