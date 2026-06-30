# Handover Note — MetroLink AWDS Org Chart

## Goal
Maintain a sleek, professional **MetroLink AWDS – Management Team Organogram**,
regenerated from an original Lucidchart-style PNG. Output is reproducible HTML
that renders to a high-res **PNG** and a single-page vector **PDF**.

## Repo / branch
- Repo: `henrycorcoran1-boop/phd-tracker`
- Branch: `claude/org-chart-restructure-10uxul` (commit & push here; no PR unless asked)
- All files live in `org-chart/`:
  - `org-chart.html` — editable source (all content + styling)
  - `render.js` — Playwright script; emits `org-chart.png` + `org-chart.pdf`
  - `org-chart.png`, `org-chart.pdf` — generated outputs (deliverables)
  - `logos/` — official SVGs: `metrolink.svg`, `atkinsrealis.svg`, `tetratech.svg`
    (sourced from Wikimedia Commons)

## How to regenerate after editing the HTML
```
cd org-chart
NODE_PATH=/opt/node22/lib/node_modules node render.js
```
- Chromium is pre-installed at `/opt/pw-browsers/chromium`; Playwright is global
  (use `NODE_PATH=/opt/node22/lib/node_modules`). Do NOT run `playwright install`.
- PDF is vector (text + SVG logos stay crisp), single page, tightly cropped.
- After regenerating: commit all of `org-chart/` and push to the branch.

## Current chart contents
**Executive Management:** Project Director — Paul Hennessy

**Senior Management:** Project Manager — Henry Corcoran, over a row of 6 leads:
- Deputy Project Manager — Nicole Marais
- Design Management Lead — Nathan Cope
- PMO Lead — James Coates
- Technical Delivery Lead — Michael Noonan
- Procurement Lead — Marc Stearne
- Commercial Lead — Mark Yallop
  - └ Cost Management Lead — Mark Samuels (reports UNDER Mark Yallop)

**Contract Management** (2×8 grid, 16 boxes):
- M140 — Winthrop Lawhon
- M141 — Matt Atherton
- M142 — Thabisa Dhladhla
- M145 — Daniyal Kitchlew
- M146 — Michal Szreder
- M147 — Marina Marti Lopez
- M130 — Micheal O'Morain
- M135 — Stefano Redivo
- M138 — Finbarr Kenny
- M160 — Stephen Spowart
- M161 — Sylvester Chigwala
- M190 — Mark Finnegan
- M111 — Nathan Cope
- Minor Works Manager — Dervla Duffy
- Env. Baseline Manager — Mark Grogan
- DAA Works Manager — Millie O'Reilly

Footer: AtkinsRéalis + Tetra Tech logos (real SVGs).

## Changes already applied vs. the original PNG
1. Mark Samuels (Cost Management Lead) moved to report UNDER Mark Yallop (Commercial Lead) — previously peers.
2. DAA Works Manager: Mark Grogan → **Millie O'Reilly**.
3. Env. Baseline Manager: Moreno Stellini → **Mark Grogan**.
   - NOTE: Moreno Stellini is no longer on the chart (was the previous Env. Baseline Manager). Flag if he should be re-added elsewhere.
4. Swapped in real MetroLink / AtkinsRéalis / Tetra Tech logos.
5. Removed the "Joint Venture" subtitle from the header.
6. Renamed "PMO & Finance Lead" → "PMO Lead" (James Coates).
7. Equalised all 6 lead-box heights (uniform min-height, vertically centred).
8. Added M140 — Winthrop Lawhon (front of grid → clean 2×8).

## Design notes
- Three swim lanes (Executive / Senior / Contract) with gradient left labels.
- Palette: navy `#0b2e63`, blue `#1f5fd6`, indigo `#5b5be0`, sky `#3b82f6`.
- Body width 1600px; PNG at 2× device scale.
- MetroLink logo renders "METRO" navy + "LINK" orange (authentic brand) on white header.

## Org-chart DECK (multi-slide) — `deck.html` / `org-chart-deck.pdf`
A 9-slide deck built on the same styling, real logos, single multi-page vector PDF.
- Source: `org-chart/deck.html`; render with `node render-deck.js`
  (emits `slide-1.png`…`slide-9.png` for review + `org-chart-deck.pdf`).
- All AWDS-side roles are prefixed **"AWDS"** (per user); only Suzy Hackett,
  the NEC PM and PDP roles are NOT prefixed.
- Slides:
  1. AWDS Management Team — Role Structure (names omitted / blank template)
  2. AWDS Support Team — Interface Management (reports into AWDS PM Lead).
     NOTE: support slide is Interface Management Team ONLY (Procurement & Commercial
     are covered in the management chart, per user).
  3. Typical AWDS Contract Team Structure: AWDS PM Lead → AWDS Design Management
     Lead → AWDS Contract Manager → {Procurement Manager, Cost Estimator, Contract
     Technical Writers, CEMP Manager, Design Team (single box)}.
  4. AWDS Design Team (design discipline leads).
  5. Construction Stage — Management Team: minus Procurement Lead; AWDS PM Lead
     reports into BOTH AWDS Project Director (Paul Hennessy) and Head of Engineering
     & Environment (Suzy Hackett) via a "V" connector.
  6. Construction Stage — Support Team (Interface Mgmt again).
  7. Construction Stage — Design Team (labelled Reachback Team).
  8. Construction Stage — Contract Team (typical structure).
  9. Construction Stage — Reporting Structure: Suzy at top; AWDS PM Lead & NEC PM
     report to Suzy; NEC PM has AWDS Contract Manager + PDP Team; AWDS Contract
     Manager has Design Reachback Team; dashed red arrow = AWDS Contract Manager
     also dotted-line reports to AWDS PM Lead. (Absolute layout + SVG for arrow.)
- Source data for support/design/contract teams came from the client PDF
  `Org_Chart__March_2026__DRAFT.pdf` (rasterise with `pdftoppm -png -r 130`;
  poppler-utils may need `apt-get install poppler-utils`).

## Open / possible follow-ups
- Confirm whether Moreno Stellini needs a home elsewhere.
- Optional: standard A3/A4 landscape page size for printing (currently auto-fit single page).
