# Project

Static marketing and product site for **Arya Estimating / InfraBid** —
construction tender estimating and quantity surveying, Republic of Ireland.
Plain HTML, CSS and JS. **No frameworks, no build step, no dependencies.**
Published to GitHub Pages from `main`.

- `style.css` — the whole design system, hand-built, organised in
  `/* ---------- section ---------- */` blocks
- `index.html` + per-page files (`estimate`, `pricing`, `valuation`,
  `suppliers`, `process`, `faq`, `contact`, `value-engineering`)
- `app.js` — interactions · `sw.js` + `manifest.json` — PWA

## Design work: read the house-style skill first

Any change to markup, styles, layout, or on-page copy must meet the house
standard in `.claude/skills/house-style/SKILL.md`. Load it before writing
code — do not invent a design direction, and do not reach for framework
defaults.

The non-negotiables, so they are never in question:

- Type is **Century Gothic → Jost**. Never Inter, never system-ui.
- Headings **weight 500**, body **weight 300**. Not 700.
- One hue family: navy `#133198` / blue `#476DCF`. No second accent.
- No pure black, no neutral grey — text is blue-tinted ink.
- Every surface gets a `1px solid var(--border)` edge.
- Shadows are **navy-tinted** with large negative spread, never black.
- Every number a user reads gets `font-variant-numeric: tabular-nums`.
- Motion uses `cubic-bezier(.2,.8,.2,1)` and is added to the
  `prefers-reduced-motion` block.
- Copy names the actual industry. No hype adjectives.

Reuse an existing class before writing a new one. Match the surrounding
compact CSS formatting.

## Deploying

Commits to `main` publish straight to Pages, so `main` is live. Check a change
renders before pushing there.
