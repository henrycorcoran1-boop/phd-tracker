#!/usr/bin/env python3
"""Builds timeline-of-change.html from the event data below.

Standard library only. Run:  python3 build.py
Every date, reference and count in the output comes from the data in this
file, which was transcribed from "AWDS - Timeline of Change Doc - 15.09.2026".
Edit the data, re-run, and the diagram, KPI figures and appendices update
together.
"""
from __future__ import annotations

import base64
import html
import os
from dataclasses import dataclass, field

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "timeline-of-change.html")
LOGO = os.path.join(HERE, "metrolink-mlogo.png")
FONT = os.path.join(HERE, "fonts", "libre-franklin-variable.woff2")   # OFL licence; weights 100-900

REPORT_DATE = "15 September 2026"
SOURCE = "AWDS Timeline of Change record, 15 September 2026"

# ---------------------------------------------------------------- palette
# Validated with the dataviz palette checker (light surface): the three mark
# colours pass lightness, chroma, CVD separation and 3:1 contrast.
NAVY = "#022656"      # MetroLink navy: ink, headings, header band
ORANGE = "#F15623"    # MetroLink orange: change instructed
BLUE = "#0077A8"      # delivered by AtkinsRealis (a darker step of MetroLink cyan)
RED = "#AF272F"       # descoped / removed from scope
INK = "#1D252D"
MUTED = "#5B6570"
BORDER = "#D6DCE5"
TINT = "#F3F6FA"

KIND = {
    "change": ("Change instructed", ORANGE),
    "delivery": ("Delivered by AtkinsRéalis", BLUE),
    "descope": ("Descoped", RED),
}

# ---------------------------------------------------------------- months
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
START = (2023, 12)
END = (2026, 9)


def midx(ym: str) -> int:
    y, m = (int(p) for p in ym.split("-"))
    return (y - START[0]) * 12 + (m - START[1])


def label_ym(ym: str) -> str:
    y, m = (int(p) for p in ym.split("-"))
    return f"{MONTHS[m - 1]} {y}"


N_MONTHS = midx(f"{END[0]}-{END[1]:02d}") + 1  # Dec 2023 .. Sep 2026 = 34


def months_between(a: str, b: str) -> int:
    return midx(b) - midx(a)


# ---------------------------------------------------------------- data
@dataclass
class Event:
    ym: str
    kind: str
    label: str                     # short text on the diagram
    ref: str                       # CN number or instruction reference
    package: str                   # package / area for the register
    event: str                     # what changed (register)
    response: str                  # AtkinsRealis response / status (register)


@dataclass
class Lane:
    name: str
    status: str                    # position at report date (second line of lane label)
    events: list[Event] = field(default_factory=list)


LANES: list[Lane] = [
    Lane("Procurement and contract strategy", "Conditions of contract now an AR deliverable", [
        Event("2023-12", "change", "CoC engagement begins (CP-led)", "None",
              "Conditions of contract",
              "Engagement on the conditions of contract for the packages began, led by the Client Partner (CP).",
              "AR contributed to CP-led drafting."),
        Event("2024-10", "delivery", "ITN · PQQ · ITT requirements issued", "None",
              "Procurement",
              "Henry Corcoran developed the ITN, PQQ and associated ITT requirements and issued them to the CP. "
              "The ERO was delayed and the documents were held.",
              "Following the ERO the contracting strategy changed, the package count almost tripled and LOD "
              "requirements added materially to the work carried by the team."),
        Event("2026-05", "change", "CoC transferred to AR", "Instruction",
              "Conditions of contract",
              "The CP Commercial Lead left the project with the conditions of contract incomplete for every package.",
              "AR instructed to take over completion of the conditions of contract for all packages ahead of ITT."),
    ]),
    Lane("Governance and review requirements", "Oral hearing commitments being incorporated", [
        Event("2025-01", "change", "20 PMO appendices instructed", "Instruction",
              "PMO Project Controls appendices",
              "Instruction to include 20 Project Controls appendices, to be produced by the PMO team, in the scope "
              "documents prior to ITT.",
              "5 of the 20 appendices were issued to AR in April 2026; AR reviews and incorporates each on receipt."),
        Event("2025-02", "change", "Arch. de-risking · LOD Assurance", "Instruction",
              "Programme-wide",
              "Archaeological de-risking instructed. LOD Assurance and its associated work first introduced to AR.",
              "Both absorbed into the design and documentation workload."),
        Event("2026-03", "change", "Station Working Groups", "None",
              "Station Working Groups",
              "Station Working Groups established. Change requirements issued by the M400 team as a result.",
              "AWDS designs updated to reflect revised station box layouts."),
        Event("2026-04", "change", "5 of 20 PMO appendices received", "None",
              "PMO Project Controls appendices",
              "5 of the 20 PMO appendices instructed in January 2025 were issued to AR.",
              "Reviewed and incorporated into the scope documents."),
        Event("2026-07", "change", "Oral hearing commitments list", "None",
              "Oral hearing commitments",
              "Final list of oral hearing commitments issued to AR.",
              "Documentation and ITT packs updated to carry the commitments."),
    ]),
    Lane("M110 · M140 · M150 main civils", "M111 awaiting ITT award", [
        Event("2024-02", "change", "M120 Heritage folded in", "Instruction",
              "M110",
              "M120 Heritage instructed to be included within the M110 contract.",
              "M110 scope extended."),
        Event("2025-05", "change", "CN-059 M110 split North / South", "CN-059",
              "M110",
              "Instruction to split M110 into two contracts, North and South.",
              "Package documentation restructured."),
        Event("2025-06", "change", "CN-061 M140 / M150 re-split", "CN-061",
              "M140, M150",
              "Instruction to alter the geographical split of the M140 and M150 contracts.",
              "Package boundaries and documentation revised."),
        Event("2025-09", "change", "CN-068 six packages · M111 issued", "CN-068",
              "M110, M140, M150",
              "New contracting strategy: M110, M140 and M150 combined and split again into six geographically "
              "aligned packages (M140, M141, M142, M145, M146, M147). M111, a new package forming a key component "
              "of the TBM portal, issued to AR for design and procurement in the same month.",
              "Six packages re-documented. M111 designed and procured by AR; awaiting ITT award."),
        Event("2026-08", "delivery", "M140 · M145 · M147 issued for C01", "None",
              "M140, M145, M147",
              "Three of the six packages issued for C01 acceptance.",
              "Issued eleven months after CN-068."),
    ]),
    Lane("M120 Heritage → M190", "M190 C01 pack issued July 2026", [
        Event("2024-02", "descope", "Folded into M110", "Instruction",
              "M120 Heritage",
              "Heritage instructed to be included within the M110 contract; no longer a standalone package.",
              "Scope carried within M110."),
        Event("2025-09", "change", "Reinstated as M190 (NEC TSC)", "Instruction",
              "M190 Heritage",
              "Heritage reintroduced as its own contract, M190, and changed from GCC to an NEC Term Service Contract.",
              "New package documentation prepared under the NEC form."),
        Event("2026-07", "delivery", "M190 for C01", "None",
              "M190 Heritage",
              "M190 C01 pack issued for acceptance.",
              "Ten months from reinstatement to issue."),
    ]),
    Lane("M130 Archaeology → M130 · M135 · M138",
         "M130 awaiting award; M135 and M138 issued for C01", [
        Event("2025-06", "change", "Split into M130 · M135 · M138", "Instruction",
              "M130 Archaeology",
              "M130 split into three contracts: M130, M135 and M138.",
              "M130 now awaiting contract award. M135 and M138 issued for C01 approval (month not recorded)."),
    ]),
    Lane("M160 Environmental Monitoring", "Updated NEC scope issued for C01; RO monitors installed", [
        Event("2025-12", "delivery", "Issued for C01", "None",
              "M160",
              "Issued for C01 acceptance following peer review and comment close-out.",
              "First issue under the original contract form."),
        Event("2026-01", "change", "→ PWC-CF5 / CF11; re-priced, reissued", "Notification",
              "M160",
              "Contract form changed to PWC-CF5 and PWC-CF11.",
              "New pricing documents prepared for both forms, scope pack updated and reissued within the month."),
        Event("2026-03", "change", "→ NEC; scope rewritten", "Notification",
              "M160",
              "Contract form changed again, to NEC. Scope documents required to reflect the new approach.",
              "Scope documents rewritten for NEC."),
        Event("2026-04", "change", "RO baseline monitors instructed", "Instruction",
              "Railway Order baseline monitoring",
              "The M160 contractor would not be appointed in time for MetroLink to meet its Railway Order obligations "
              "on baseline monitoring. AR instructed to procure, manage and install the monitors required.",
              "Monitors procured, installed and managed by AR; installation completed September 2026."),
        Event("2026-07", "delivery", "Updated scope for C01", "None",
              "M160",
              "Updated NEC scope issued for C01 approval.",
              "Third contract form in seven months, issued."),
        Event("2026-09", "delivery", "RO monitors installed", "None",
              "Railway Order baseline monitoring",
              "Baseline monitors installed, satisfying the Railway Order requirement.",
              "Five months from instruction to installation."),
    ]),
    Lane("M161 Structural Baseline Monitoring", "Issued for C01 July 2026", [
        Event("2025-09", "change", "M161 instructed", "Instruction",
              "M161",
              "M161 Structural Baseline Monitoring works instructed.",
              "Package opened; Volume 2B (Specification) to be developed by the CP."),
        Event("2026-02", "change", "Vol 2B received from CP", "None",
              "M161",
              "Volume 2B (Specification), developed by the CP, issued to AR.",
              "AR developed the remaining scope documents, including cost and pricing documents, on receipt."),
        Event("2026-07", "delivery", "IDC closed · issued for C01", "None",
              "M161",
              "IDC held, all comments incorporated, issued for C01 approval.",
              "Five months from receipt of Volume 2B to issue."),
    ]),
    Lane("O’Connell Street", "Issued for C01 August 2026", [
        Event("2023-12", "descope", "Descoped", "Instruction",
              "O’Connell Street", "Descoped.", "Removed from AR workload."),
        Event("2025-09", "change", "Reinstructed", "Instruction",
              "O’Connell Street", "Reinstructed.", "Design and documentation restarted."),
        Event("2026-08", "delivery", "Issued for C01", "None",
              "O’Connell Street", "Issued for C01 approval.", "Eleven months from reinstruction to issue."),
    ]),
    Lane("M170 Sewer Relining → M143 · M144", "Reintroduced August 2026", [
        Event("2024-02", "descope", "Descoped", "Instruction",
              "M170 Sewer Relining", "Descoped.", "Removed from AR workload."),
        Event("2026-08", "change", "Reintroduced as M143 · M144", "GC393/4",
              "M143, M144",
              "Sewer relining reintroduced as two packages, M143 and M144, in GC393/4.",
              "Two new packages opened."),
    ]),
    Lane("New instructions: Nevinstown · M20 · DAA", "Nevinstown complete; M20 lots and DAA design in progress", [
        Event("2025-06", "change", "CN-063 Nevinstown House", "CN-063",
              "Nevinstown House demolition",
              "Requirement for design, ITT pack and site supervision services for Nevinstown House.",
              "Works designed, procured, supervised and completed by December 2025."),
        Event("2025-12", "delivery", "Nevinstown works complete", "None",
              "Nevinstown House demolition",
              "Demolition works completed.",
              "Six months from instruction to completion."),
        Event("2026-03", "change", "CN-086 M20 kick-off (7 lots)", "CN-086",
              "M20 Minor Works",
              "M20 Minor Works kick-off meeting. Seven lots now being developed, scoped and designed where required by AR.",
              "Seven contracts in development."),
        Event("2026-06", "change", "CN-093 DAA detailed design", "CN-093",
              "Dublin Airport advance works",
              "Instruction to undertake the detailed design for Dublin Airport advance works.",
              "Detailed design in progress."),
    ]),
]

# Items in the source without a recorded month. Appendix C.
UNDATED = [
    ("CN-031", "Draft CEMPs",
     "Instruction to develop draft Construction Environmental Management Plans for the contract packages where required.",
     "More than 100 draft CEMP documents in development."),
    ("None", "Market engagement (2023)",
     "MetroLink was not set up for market engagement requirements in 2023.",
     "Henry Corcoran led market engagement in lieu of the CP: preparing meetings, taking notes and reporting the "
     "engagement summary to the Client."),
    ("None", "Market engagement (2025)",
     "Market engagement interviews and the first MetroLink roadshow in Dublin.",
     "The AR team led a significant share of the interviews at short notice and assisted the roadshow deployment."),
    ("None", "Stage Gate 5A",
     "The CP was intended to lead Stage Gate 5A.",
     "AR produced the Detailed Design Report, the baseline estimates and the conditions of contract strategy."),
    ("None", "Master construction programme",
     "AR was scoped under the CoE to prepare one construction programme; the master construction programme was to "
     "be managed and developed by the CP.",
     "The master construction programme is now an AR deliverable."),
    ("None", "Interface leadership",
     "Key interfaces including BusConnects and DAA required leads.",
     "Several AR team members requested to lead these interfaces."),
    ("None", "Contract strategy and framework approach",
     "Contract strategies changed and methodology moved to a framework approach.",
     "Documentation and procurement approach revised accordingly."),
    ("None", "Document templates and numbering",
     "Several changes to document templates and to document numbering.",
     "Re-templating and renumbering of issued and in-progress documents."),
    ("None", "Schedule Optimisation",
     "Schedule Optimisation introduced.",
     "Incorporated into programme and package planning."),
    ("None", "Station box layouts",
     "Station box layouts changed, affecting AWDS designs.",
     "AWDS designs updated for each change."),
    ("None", "MetroLink policy documents",
     "Policy documents still being updated and issued.",
     "Scope documents kept aligned as policies are released."),
    ("None", "Public consultation",
     "Two additional rounds of public consultation.",
     "Design and scope changes carried through the packages."),
    ("None", "Functional review comments",
     "A high proportion of functional review comments were assessed as not applicable to the documents reviewed; "
     "each still required a written response. Comment responses were frequently returned late, and positions taken by "
     "a team or department sometimes changed between rounds.",
     "Every comment answered and closed; additional review rounds absorbed."),
    ("None", "Client ProjectWise (CDE)",
     "The Scope of Services anticipated the project CDE would be available by the end of 2022 at the latest. It is "
     "not yet fully functional.",
     "Information transfer between AR and the CP has been slower than planned throughout; interim exchange routes used."),
]

# Package evolution: original seven and the current list.
ORIGINAL = [
    ("M110", "Split North/South (CN-059, May 2025); recombined with M140 and M150 and re-split into six packages (CN-068, Sep 2025)"),
    ("M120", "Heritage folded into M110 (Feb 2024); reinstated as M190 under NEC TSC (Sep 2025)"),
    ("M130", "Archaeology split into M130, M135 and M138 (Jun 2025)"),
    ("M140", "Geographical split altered (CN-061, Jun 2025); recombined and re-split under CN-068 (Sep 2025)"),
    ("M150", "Geographical split altered (CN-061, Jun 2025); recombined and re-split under CN-068 (Sep 2025)"),
    ("M160", "Environmental Monitoring; contract form changed twice (Jan and Mar 2026); M161 added (Sep 2025)"),
    ("M170", "Sewer Relining descoped (Feb 2024); reintroduced as M143 and M144 (Aug 2026)"),
]

CURRENT_GROUPS = [
    ("From M110, M140 and M150 (CN-068 six)", ["M140", "M141", "M142", "M145", "M146", "M147"]),
    ("TBM portal (outside the CN-068 six)", ["M111"]),
    ("From M130 Archaeology", ["M130", "M135", "M138"]),
    ("Environmental and structural monitoring", ["M160", "M161"]),
    ("Heritage (formerly M120)", ["M190"]),
    ("Sewer relining (formerly M170)", ["M143", "M144"]),
    ("M20 Minor Works", ["M20 lot 1", "M20 lot 2", "M20 lot 3", "M20 lot 4", "M20 lot 5", "M20 lot 6", "M20 lot 7"]),
    ("Instructed works and services", ["Nevinstown House demolition", "DAA design works", "Environmental baseline monitoring"]),
]
CURRENT_COUNT = sum(len(g[1]) for g in CURRENT_GROUPS)
PCT_INCREASE = round((CURRENT_COUNT - 7) / 7 * 100)

# Durations from instruction to issue or completion (month-level dates from the source).
DURATIONS = [
    ("M160: NEC change to updated scope for C01", "2026-03", "2026-07"),
    ("RO baseline monitors: instruction to installation", "2026-04", "2026-09"),
    ("M161: Volume 2B received to C01 issue", "2026-02", "2026-07"),
    ("Nevinstown House: instruction to works complete", "2025-06", "2025-12"),
    ("M190 Heritage: reinstatement to C01 issue", "2025-09", "2026-07"),
    ("O’Connell Street: reinstruction to C01 issue", "2025-09", "2026-08"),
    ("M140 · M145 · M147: CN-068 to C01 issue", "2025-09", "2026-08"),
]

CHANGE_NOTICES = ["CN-031", "CN-059", "CN-061", "CN-063", "CN-068", "CN-086", "CN-093"]
C01_PACKS = ["M140", "M145", "M147", "M190", "M135", "M138", "M160", "M161", "O’Connell Street"]
ABSORBED = [
    ("Conditions of contract for all packages", "May 2026"),
    ("Master construction programme", "undated"),
    ("Market engagement: 2023 lead; 2025 interviews and roadshow", "2023, 2025"),
    ("Stage Gate 5A: Detailed Design Report, baseline estimates, conditions of contract strategy", "undated"),
    ("Railway Order baseline monitoring: procure, install, manage", "April 2026"),
    ("Interface leadership: BusConnects, DAA", "undated"),
]
RETURNED = ["O’Connell Street", "Heritage (M120 to M190)", "Sewer relining (M170 to M143 and M144)"]

# ---------------------------------------------------------------- helpers
def esc(s: str) -> str:
    return html.escape(s, quote=True)


def text_w(s: str, size: float) -> float:
    return len(s) * size * 0.6


# ---------------------------------------------------------------- timeline svg
def timeline_svg() -> str:
    W = 1120
    GUT = 214          # lane label gutter
    PR = 14            # right pad
    plot_w = W - GUT - PR
    mw = plot_w / N_MONTHS
    top = 44           # year + month axis height
    LH = 52            # lane height
    H = top + LH * len(LANES) + 30
    fs = 9

    def x_of(ym: str) -> float:
        return GUT + (midx(ym) + 0.5) * mw

    out = [f'<svg class="timeline" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
           f'aria-labelledby="tl-title tl-desc" font-family="\'Libre Franklin\',\'Franklin Gothic Medium\',\'Helvetica Neue\',Arial,sans-serif">',
           '<title id="tl-title">AWDS timeline of change, December 2023 to September 2026</title>',
           '<desc id="tl-desc">Ten lanes, one per package family or programme area, with dated markers for changes instructed, '
           'items delivered by AtkinsRéalis and items descoped. The same events are listed in Appendix A.</desc>']

    # lane backgrounds
    for i, lane in enumerate(LANES):
        y = top + i * LH
        if i % 2 == 0:
            out.append(f'<rect x="0" y="{y}" width="{W}" height="{LH}" fill="{TINT}"/>')

    # year bands and month ticks
    y0, m0 = START
    cur_year = None
    year_start_x = GUT
    for i in range(N_MONTHS):
        y = y0 + (m0 - 1 + i) // 12
        m = (m0 - 1 + i) % 12
        x = GUT + i * mw
        if y != cur_year:
            if cur_year is not None:
                out.append(f'<text x="{(year_start_x + x) / 2:.1f}" y="15" text-anchor="middle" font-size="11" '
                           f'font-weight="600" fill="{NAVY}">{cur_year}</text>')
                out.append(f'<line x1="{x:.1f}" y1="4" x2="{x:.1f}" y2="{H - 30}" stroke="{BORDER}" stroke-width="1"/>')
            cur_year, year_start_x = y, x
        out.append(f'<text x="{x + mw / 2:.1f}" y="33" text-anchor="middle" font-size="8.5" fill="{MUTED}">{MONTHS[m][0]}</text>')
    out.append(f'<text x="{(year_start_x + GUT + plot_w) / 2:.1f}" y="15" text-anchor="middle" font-size="11" '
               f'font-weight="600" fill="{NAVY}">{cur_year}</text>')
    out.append(f'<line x1="{GUT}" y1="{top - 1}" x2="{W - PR}" y2="{top - 1}" stroke="{BORDER}" stroke-width="1"/>')

    # report-date line
    xr = GUT + N_MONTHS * mw - 2
    out.append(f'<line x1="{xr:.1f}" y1="{top - 1}" x2="{xr:.1f}" y2="{H - 30}" stroke="{NAVY}" stroke-width="1"/>')
    out.append(f'<text x="{xr - 4:.1f}" y="{H - 18}" text-anchor="end" font-size="8.5" fill="{NAVY}">Report date {REPORT_DATE}</text>')

    # lanes
    for i, lane in enumerate(LANES):
        cy = top + i * LH + LH / 2
        out.append(f'<text x="12" y="{cy - 2:.1f}" font-size="10.5" font-weight="600" fill="{NAVY}">{esc(lane.name)}</text>')
        out.append(f'<text x="12" y="{cy + 10:.1f}" font-size="8.5" fill="{MUTED}">{esc(lane.status)}</text>')
        out.append(f'<line x1="{GUT}" y1="{cy:.1f}" x2="{W - PR}" y2="{cy:.1f}" stroke="{BORDER}" stroke-width="1"/>')

        # label slots: (dy for text baseline, leader end dy)
        slots = [(-10, -6), (17, 8), (-21, -16), (28, 23)]
        placed: dict[int, list[tuple[float, float]]] = {k: [] for k in range(len(slots))}
        evs = sorted(lane.events, key=lambda e: midx(e.ym))
        for e in evs:
            x = x_of(e.ym)
            w = text_w(e.label, fs)
            left = min(max(x - w / 2, GUT + 2), W - PR - w - 2)
            right = left + w
            chosen = None
            for k in range(len(slots)):
                if all(right < a - 6 or left > b + 6 for a, b in placed[k]):
                    chosen = k
                    break
            if chosen is None:
                chosen = len(slots) - 1
            placed[chosen].append((left, right))
            dy, lead = slots[chosen]
            name, col = KIND[e.kind]
            tip = f"{label_ym(e.ym)} · {e.ref}: {e.event}"
            out.append(f'<g class="ev"><title>{esc(tip)}</title>')
            if chosen >= 2:
                out.append(f'<line x1="{x:.1f}" y1="{cy + (-7 if dy < 0 else 7):.1f}" x2="{x:.1f}" '
                           f'y2="{cy + lead:.1f}" stroke="{col}" stroke-width="1"/>')
            if e.kind == "change":
                out.append(f'<circle cx="{x:.1f}" cy="{cy:.1f}" r="5.5" fill="{col}" stroke="#fff" stroke-width="2"/>')
            elif e.kind == "delivery":
                out.append(f'<rect x="{x - 5:.1f}" y="{cy - 5:.1f}" width="10" height="10" fill="{col}" stroke="#fff" '
                           f'stroke-width="2" transform="rotate(45 {x:.1f} {cy:.1f})"/>')
            else:
                out.append(f'<circle cx="{x:.1f}" cy="{cy:.1f}" r="5" fill="#fff" stroke="{col}" stroke-width="2.2"/>')
            out.append(f'<text x="{left + w / 2:.1f}" y="{cy + dy:.1f}" text-anchor="middle" font-size="{fs}" '
                       f'fill="{INK}">{esc(e.label)}</text>')
            out.append('</g>')

    out.append('</svg>')
    return "\n".join(out)


def legend_html() -> str:
    items = []
    for k, (name, col) in KIND.items():
        if k == "change":
            mark = f'<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="{col}"/></svg>'
        elif k == "delivery":
            mark = (f'<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" fill="{col}" '
                    f'transform="rotate(45 7 7)"/></svg>')
        else:
            mark = f'<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="#fff" stroke="{col}" stroke-width="2.2"/></svg>'
        items.append(f'<span class="lg">{mark}{esc(name)}</span>')
    return '<div class="legend">' + "".join(items) + '</div>'


# ---------------------------------------------------------------- durations chart
def durations_svg() -> str:
    rows = sorted(DURATIONS, key=lambda d: months_between(d[1], d[2]))
    W, LAB, RP = 1056, 330, 175
    RH = 26
    H = RH * len(rows) + 26
    maxm = max(months_between(a, b) for _, a, b in rows)
    scale = (W - LAB - RP) / 12
    out = [f'<svg class="durations" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="du-title" '
           f'font-family="\'Libre Franklin\',\'Franklin Gothic Medium\',\'Helvetica Neue\',Arial,sans-serif">',
           '<title id="du-title">Elapsed months from instruction to issue or completion</title>']
    for t in range(0, 13, 2):
        x = LAB + t * scale
        out.append(f'<line x1="{x:.1f}" y1="0" x2="{x:.1f}" y2="{H - 22}" stroke="{BORDER}" stroke-width="1"/>')
        out.append(f'<text x="{x:.1f}" y="{H - 6}" text-anchor="middle" font-size="9" fill="{MUTED}">{t}</text>')
    out.append(f'<text x="{W - 2}" y="{H - 6}" text-anchor="end" font-size="9" fill="{MUTED}">months</text>')
    for i, (name, a, b) in enumerate(rows):
        m = months_between(a, b)
        y = i * RH + 4
        bw = m * scale
        out.append(f'<text x="{LAB - 10}" y="{y + 15}" text-anchor="end" font-size="10" fill="{INK}">{esc(name)}</text>')
        out.append(f'<path d="M{LAB},{y} h{bw - 4:.1f} a4,4 0 0 1 4,4 v14 a4,4 0 0 1 -4,4 h-{bw - 4:.1f} z" fill="{BLUE}">'
                   f'<title>{esc(name)}: {label_ym(a)} to {label_ym(b)}, {m} months</title></path>')
        out.append(f'<text x="{LAB + bw + 8:.1f}" y="{y + 15}" font-size="10" fill="{INK}">{m}</text>')
        out.append(f'<text x="{LAB + bw + 22:.1f}" y="{y + 15}" font-size="9" fill="{MUTED}">{label_ym(a)} to {label_ym(b)}</text>')
    out.append('</svg>')
    return "\n".join(out)


# ---------------------------------------------------------------- tables
def register_rows() -> str:
    evs = []
    for lane in LANES:
        for e in lane.events:
            evs.append((midx(e.ym), lane.name, e))
    evs.sort(key=lambda t: (t[0], t[1]))
    rows = []
    for _, lane, e in evs:
        name, col = KIND[e.kind]
        rows.append(
            f'<tr><td class="num">{esc(label_ym(e.ym))}</td><td>{esc(e.ref)}</td><td>{esc(e.package)}</td>'
            f'<td><span class="dot" style="background:{col}"></span>{esc(name)}</td>'
            f'<td>{esc(e.event)}</td><td>{esc(e.response)}</td></tr>')
    return "\n".join(rows)


def undated_rows() -> str:
    return "\n".join(f'<tr><td>{esc(r)}</td><td>{esc(a)}</td><td>{esc(c)}</td><td>{esc(d)}</td></tr>'
                     for r, a, c, d in UNDATED)


def original_rows() -> str:
    return "\n".join(f'<tr><td class="num"><strong>{esc(p)}</strong></td><td>{esc(f)}</td></tr>' for p, f in ORIGINAL)


def current_rows() -> str:
    rows = []
    for grp, pk in CURRENT_GROUPS:
        rows.append(f'<tr><td>{esc(grp)}</td><td>{esc(", ".join(pk))}</td><td class="num">{len(pk)}</td></tr>')
    rows.append(f'<tr class="total"><td>Total</td><td></td><td class="num">{CURRENT_COUNT}</td></tr>')
    return "\n".join(rows)


GLOSSARY = [
    ("AR", "AtkinsRéalis"),
    ("AWDS", "Advance Works Design Services"),
    ("C01", "Document acceptance code; “issued for C01” means issued for client acceptance"),
    ("CDE", "Common Data Environment (ProjectWise)"),
    ("CEMP", "Construction Environmental Management Plan"),
    ("CN", "Change Notice"),
    ("CoC", "Conditions of Contract"),
    ("CoE", "Conditions of Engagement (Irish public sector consultancy agreement)"),
    ("CP", "Client Partner"),
    ("DAA", "Dublin Airport Authority"),
    ("ERO", "Enforceable Railway Order"),
    ("GCC", "Irish public sector contract form under which M190 was first to be procured"),
    ("IDC", "Interdisciplinary design check"),
    ("ITN / PQQ / ITT", "Tender-stage documents: invitation to negotiate, pre-qualification questionnaire, invitation to tender"),
    ("LOD", "Level of Design"),
    ("NEC TSC", "NEC Term Service Contract"),
    ("PMO", "Project Management Office"),
    ("PWC-CF5 / CF11", "Public Works Contract forms CF5 and CF11 (Irish Capital Works Management Framework)"),
    ("RO", "Railway Order"),
    ("TBM", "Tunnel boring machine"),
    ("M400", "MetroLink M400 team, source of Station Working Group change requirements"),
]


def glossary_rows(part: int) -> str:
    half = (len(GLOSSARY) + 1) // 2
    items = GLOSSARY[:half] if part == 0 else GLOSSARY[half:]
    return "\n".join(f'<tr><td><strong>{esc(k)}</strong></td><td>{esc(v)}</td></tr>' for k, v in items)


# ---------------------------------------------------------------- page
def build() -> str:
    with open(LOGO, "rb") as f:
        logo = "data:image/png;base64," + base64.b64encode(f.read()).decode()
    with open(FONT, "rb") as f:
        font = "data:font/woff2;base64," + base64.b64encode(f.read()).decode()

    n_events = sum(len(l.events) for l in LANES)
    n_changes = sum(1 for l in LANES for e in l.events if e.kind == "change")
    n_deliv = sum(1 for l in LANES for e in l.events if e.kind == "delivery")
    n_cn_dated = sum(1 for l in LANES for e in l.events if e.ref.startswith("CN-"))
    n_other_instr = n_changes - n_cn_dated

    css = f"""
@font-face{{font-family:'Libre Franklin';font-style:normal;font-weight:100 900;font-display:swap;src:url({font}) format('woff2')}}
:root{{--navy:{NAVY};--orange:{ORANGE};--blue:{BLUE};--red:{RED};--ink:{INK};--muted:{MUTED};--border:{BORDER};--tint:{TINT};--surface:#fff}}
*{{box-sizing:border-box}}
html{{color-scheme:light}}
body{{margin:0;background:#E9EDF3;color:var(--ink);font-family:'Libre Franklin','Franklin Gothic Medium','Helvetica Neue',Arial,sans-serif;font-weight:400;font-size:12.5px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.page{{background:var(--surface);width:1120px;max-width:100%;margin:20px auto;padding:34px 32px 26px;border:1px solid var(--border);position:relative;min-height:760px;display:flex;flex-direction:column}}
.page>.body{{flex:1}}
.band{{display:flex;align-items:center;gap:16px;border-bottom:3px solid var(--navy);padding-bottom:14px;margin-bottom:18px}}
.band img{{width:58px;height:58px;flex:none}}
.band .t{{flex:1}}
.band .kicker{{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 2px}}
.band h1{{font-size:22px;font-weight:600;color:var(--navy);margin:0;line-height:1.15}}
.band .meta{{text-align:right;font-size:11px;color:var(--muted);line-height:1.5}}
.band .meta strong{{color:var(--navy);font-weight:600}}
h2{{font-size:15px;font-weight:600;color:var(--navy);margin:0 0 8px;letter-spacing:.01em}}
h3{{font-size:12.5px;font-weight:600;color:var(--navy);margin:14px 0 6px}}
p{{margin:0 0 8px}}
.lede{{font-size:13.5px;max-width:880px}}
.foot{{margin-top:18px;padding-top:8px;border-top:1px solid var(--border);font-size:9.5px;color:var(--muted);display:flex;justify-content:space-between}}
.kpis{{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:14px 0 6px}}
.tile{{border:1px solid var(--border);border-top:3px solid var(--navy);padding:10px 12px 9px;background:var(--surface)}}
.tile .l{{font-size:10.5px;color:var(--muted);margin:0 0 4px;line-height:1.3}}
.tile .v{{font-size:30px;font-weight:600;color:var(--navy);line-height:1;margin:0;font-variant-numeric:proportional-nums}}
.tile .v small{{font-size:14px;font-weight:500;color:var(--muted)}}
.tile .s{{font-size:10px;color:var(--muted);margin:5px 0 0;line-height:1.3}}
.two{{display:grid;grid-template-columns:1fr 1fr;gap:22px}}
.front{{display:grid;grid-template-columns:250px 1fr 1.2fr;gap:22px;margin-top:14px;align-items:start}}
.hero{{background:var(--navy);color:#fff;padding:22px 20px 18px;border-top:4px solid var(--orange)}}
.hero .hl{{font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px;opacity:.85}}
.hero .hv{{font-size:58px;font-weight:600;line-height:1;margin:0 0 14px;color:var(--orange);font-variant-numeric:proportional-nums;letter-spacing:-.02em}}
.hero .hs{{font-size:13px;margin:0 0 4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.18)}}
.three{{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:18px}}
ul{{margin:4px 0 8px 18px;padding:0}}
li{{margin:0 0 4px}}
.legend{{display:flex;gap:18px;font-size:11px;color:var(--ink);margin:6px 0 4px}}
.lg{{display:inline-flex;align-items:center;gap:6px}}
.note{{font-size:10.5px;color:var(--muted)}}
svg.timeline{{width:100%;height:auto;display:block}}
svg.durations{{width:100%;height:auto;display:block}}
table{{width:100%;border-collapse:collapse;font-size:10.5px}}
th{{text-align:left;font-weight:600;color:var(--navy);border-bottom:2px solid var(--navy);padding:5px 7px;vertical-align:bottom;background:var(--surface)}}
td{{border-bottom:1px solid var(--border);padding:5px 7px;vertical-align:top}}
tr:nth-child(even) td{{background:var(--tint)}}
tr.total td{{font-weight:600;color:var(--navy);border-bottom:2px solid var(--navy)}}
td.num{{font-variant-numeric:tabular-nums;white-space:nowrap}}
.dot{{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}}
.card{{border:1px solid var(--border);border-left:4px solid var(--orange);padding:12px 14px;background:var(--tint)}}
.card h3{{margin-top:0}}
table.kpi td:first-child{{font-weight:600;color:var(--navy);white-space:nowrap}}
.evid li{{margin-bottom:5px}}
@media print{{
  @page{{size:A4 landscape;margin:10mm 11mm 9mm}}
  body{{background:#fff;font-size:11.5px}}
  .page{{width:auto;max-width:none;margin:0;padding:0;border:0;min-height:0;break-after:page;page-break-after:always;display:block}}
  .page:last-child{{break-after:auto;page-break-after:auto}}
  .band{{padding-bottom:9px;margin-bottom:12px;border-bottom-width:2px}}
  .band img{{width:42px;height:42px}}
  .band h1{{font-size:18px}}
  .band .kicker{{font-size:10px}}
  .band .meta{{font-size:10px}}
  svg.timeline{{max-height:585px}}
  tr,td,th{{break-inside:avoid;page-break-inside:avoid}}
  thead{{display:table-header-group}}
  .tile .v{{font-size:26px}}
  .tile{{padding:8px 10px 7px}}
  .kpis{{margin:10px 0 4px}}
  .lede{{font-size:12.5px}}
  h2{{font-size:14px;margin-bottom:6px}}
  h3{{margin-top:10px}}
  .foot{{margin-top:12px}}
}}
@media screen and (max-width:820px){{.kpis{{grid-template-columns:repeat(3,1fr)}}.two,.three{{grid-template-columns:1fr}}.band .meta{{display:none}}}}
"""

    def band(kicker: str, title: str) -> str:
        return (f'<header class="band"><img src="{logo}" alt="MetroLink"><div class="t">'
                f'<h1>{esc(title)}</h1></div></header>')

    def foot(section: str) -> str:
        return ""

    absorbed_html = "".join(f'<li>{esc(a)} <span class="note">({esc(d)})</span></li>' for a, d in ABSORBED)
    returned_html = "".join(f'<li>{esc(r)}</li>' for r in RETURNED)

    doc = f"""<!doctype html>
<html lang="en-IE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AWDS Timeline of Change and Team KPI Summary</title>
<style>{css}</style>
</head>
<body>

<!-- ============================================================ front page -->
<section class="page">
{band("Advance Works Design Services · MetroLink · December 2023 to September 2026", "AWDS Timeline of Change and Team KPI Summary")}
<div class="body">
<p class="lede">The AWDS commission began with seven contract packages. Through instructed change between December 2023 and September 2026 the list has grown to {CURRENT_COUNT}: the main civils packages were restructured three times, Heritage and sewer relining were removed and then reinstated, and new works were instructed at Nevinstown House, Dublin Airport and under the M20 minor works. This note records those changes, what the AtkinsRéalis team delivered through them, and the team’s KPIs, led by Adaptability and Delivery.</p>
<div class="front">
<div class="hero">
<p class="hl">Increase in contract packages</p>
<p class="hv">+{PCT_INCREASE}%</p>
<p class="hs">7 original packages</p>
<p class="hs">{CURRENT_COUNT} current packages</p>
<p class="hs">{CURRENT_COUNT / 7:.1f} times the original count</p>
</div>
<div>
<h3 style="margin-top:0">Original contract packages (7)</h3>
<table><thead><tr><th style="width:16%">Package</th><th>What happened to it</th></tr></thead><tbody>{original_rows()}</tbody></table>
</div>
<div>
<h3 style="margin-top:0">Current contract packages ({CURRENT_COUNT})</h3>
<table><thead><tr><th style="width:38%">Group</th><th>Packages</th><th style="width:9%">No.</th></tr></thead><tbody>{current_rows()}</tbody></table>
<p class="note" style="margin-top:6px">M20 Minor Works is counted as its seven lots. M143 and M144 (sewer relining, reintroduced August 2026) are included. M111 sits outside the six packages created under CN-068.</p>
</div>
</div>
</div>
</section>

<!-- ============================================================ timeline -->
<section class="page">
{band("Advance Works Design Services · MetroLink · December 2023 to September 2026", "AWDS Timeline of Change: instructed change and AtkinsRéalis delivery, by package")}
<div class="body">
{legend_html()}
{timeline_svg()}
<p class="note" style="margin-top:8px">{n_events} dated events: {n_changes} changes instructed, {n_deliv} items delivered, {n_events - n_changes - n_deliv} descoped. Dates are at month level, as recorded in the {SOURCE}. Items without a recorded month (CN-031 draft CEMPs, M135 and M138 C01 issue, market engagement, Stage Gate 5A) are listed in Appendix B.</p>
</div>
</section>

<!-- ============================================================ page 3 -->
<section class="page">
{band("Team KPI summary", "Adaptability and Delivery")}
<div class="body">
<div class="two">
<div class="card">
<h3>Headline KPI: Adaptability and Delivery</h3>
<p><strong>Definition.</strong> The team’s capacity to absorb instructed change without loss of output. Measured by instructions actioned against scope packs issued for acceptance and works completed in the same period.</p>
<p><strong>Evidence to {REPORT_DATE}.</strong></p>
<ul class="evid">
<li>{len(CHANGE_NOTICES)} formal change notices and a further {n_other_instr} dated instructions and notifications actioned (Appendix A).</li>
<li>Package count from 7 to {CURRENT_COUNT}; three restructurings of the main civils packages between May and September 2025.</li>
<li>{len(C01_PACKS)} scope packs issued for C01 acceptance; 2 physical works packages completed.</li>
<li>M160 issued for C01 under each of three contract forms in seven months.</li>
<li>Descoped items returned and delivered: {", ".join(RETURNED)}.</li>
</ul>
</div>
<div class="two">
<div>
<h3 style="margin-top:0">Scope absorbed beyond the Conditions of Engagement</h3>
<ul>{absorbed_html}</ul>
</div>
<div>
<h3 style="margin-top:0">Output in development at report date</h3>
<ul>
<li>M111 (TBM portal) designed and procured; awaiting ITT award.</li>
<li>M130 awaiting contract award.</li>
<li>M20 Minor Works: 7 lots being scoped and designed (CN-086).</li>
<li>Dublin Airport advance works detailed design (CN-093).</li>
<li>More than 100 draft CEMPs (CN-031).</li>
</ul>
</div>
</div>
</div>

<h3 style="margin-top:16px">Responsiveness: instruction to issue or completion</h3>
{durations_svg()}
<p class="note">Elapsed months between the month-level dates recorded in the source. Bars are ordered shortest to longest.</p>
</div>
{foot("KPI summary")}
</section>

<!-- ============================================================ page 4 -->
<section class="page">
{band("Team KPI summary", "KPI framework for the AWDS team")}
<div class="body">
<p class="lede">Five measures, led by Adaptability and Delivery. Each is defined so that it can be reported from the change register and the document issue record without additional data collection. Evidence to date is drawn from Appendices A and B; the proposed measure is the definition for quarterly reporting going forward.</p>
<table class="kpi" style="margin-top:10px">
<thead><tr><th style="width:17%">KPI</th><th style="width:25%">What it measures</th><th style="width:33%">Evidence to {REPORT_DATE}</th><th>Proposed reporting measure</th></tr></thead>
<tbody>
<tr><td>1. Adaptability and Delivery</td><td>Instructed change absorbed without loss of output.</td><td>{len(CHANGE_NOTICES)} change notices actioned; {len(C01_PACKS)} packs issued for C01; 2 works delivered; package count 7 to {CURRENT_COUNT}.</td><td>Per quarter: instructions received, instructions closed, packs issued for C01, packs accepted.</td></tr>
<tr><td>2. Responsiveness</td><td>Elapsed time from instruction to issue or completion.</td><td>4 to 11 months across the seven measured items (chart above).</td><td>Months from instruction to C01 issue, per package; months from instruction to completion, per works item.</td></tr>
<tr><td>3. Scope absorption</td><td>Responsibilities taken on beyond the CoE scope.</td><td>{len(ABSORBED)} responsibilities transferred from the CP (listed above).</td><td>Register of absorbed responsibilities: item, instructing party, date, resource effect.</td></tr>
<tr><td>4. Quality at issue</td><td>Reviews closed before a pack is issued for acceptance.</td><td>M160 issued after peer review close-out (Dec 2025). M161 IDC held and all comments incorporated before issue (Jul 2026).</td><td>Share of packs issued with IDC and peer review comments closed; review rounds per pack.</td></tr>
<tr><td>5. Interface leadership</td><td>Interfaces and engagements led by the team on the client’s behalf.</td><td>BusConnects and DAA interfaces led by AR staff; market engagement led in 2023; 2025 interviews and first MetroLink roadshow supported.</td><td>Interfaces led; engagements delivered; actions closed.</td></tr>
</tbody>
</table>
<h3>Reading the headline measure</h3>
<p>Adaptability and Delivery is reported as a pair: the count of instructions closed in the period, and the count of packs issued for acceptance or works completed in the same period. Read together they show whether output was sustained while the package structure changed. The register in Appendix A is the audit trail for both counts.</p>
</div>
{foot("KPI framework")}
</section>

<!-- ============================================================ appendix A -->
<section class="page">
{band("Appendix A", "Appendix A: Change register: dated events, December 2023 to September 2026")}
<div class="body">
<table>
<thead><tr><th style="width:7%">Date</th><th style="width:8%">Reference</th><th style="width:14%">Package / area</th><th style="width:12%">Type</th><th style="width:31%">Event</th><th>AtkinsRéalis response and status</th></tr></thead>
<tbody>{register_rows()}</tbody>
</table>
<p class="note" style="margin-top:8px">Dates are given to the month, as recorded in the source. Volume 2B for M161 was developed by the CP and issued to AtkinsRéalis in February 2026; the expected date stated in the source is not reproduced here pending confirmation.</p>
</div>
{foot("Appendix A")}
</section>

<!-- ============================================================ appendix B -->
<section class="page">
{band("Appendix B", "Appendix B: Further items requiring the team to adapt approach and resources")}
<div class="body">
<table>
<thead><tr><th style="width:7%">Reference</th><th style="width:16%">Item</th><th style="width:40%">Change</th><th>AtkinsRéalis response</th></tr></thead>
<tbody>{undated_rows()}</tbody>
</table>
<p class="note" style="margin-top:8px">These items have no month recorded in the source and are therefore not plotted on the timeline.</p>
</div>
{foot("Appendix B")}
</section>

<!-- ============================================================ appendix C -->
<section class="page">
{band("Appendix C", "Appendix C: Glossary and source")}
<div class="body">
<div class="two">
<div>
<table><thead><tr><th style="width:24%">Term</th><th>Meaning</th></tr></thead><tbody>{glossary_rows(0)}</tbody></table>
</div>
<div>
<table><thead><tr><th style="width:24%">Term</th><th>Meaning</th></tr></thead><tbody>{glossary_rows(1)}</tbody></table>
</div>
</div>
<div class="two" style="margin-top:14px">
<div>
<h3 style="margin-top:0">Source and method</h3>
<p>All content is drawn from the {SOURCE}. Events with a recorded month are plotted on the timeline and listed in Appendix A; events without one are listed in Appendix B. Counts are derived from those lists: the package count from the front page, change notices and C01 issues from Appendix A, and elapsed durations from the difference between month-level dates.</p>
</div>
<div>
<h3 style="margin-top:0">Marker key</h3>
{legend_html()}
<p class="note">Colours follow the MetroLink palette. The three marker colours were checked for colour-vision separation and contrast; marker shape carries the same distinction for greyscale printing.</p>
</div>
</div>
</div>
{foot("Appendix C")}
</section>

</body>
</html>
"""
    return doc


if __name__ == "__main__":
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(build())
    print(f"wrote {OUT}  (current packages: {CURRENT_COUNT})")
