---
name: house-style
description: "The house design standard for Arya Estimating / InfraBid and every site in this account. Use for ANY front-end work before writing markup or styles: building or editing pages, HTML/CSS/JS, layout, hero sections, components, color, typography, spacing, shadows, motion, on-page copy, or reviewing an existing design. Encodes the exact design tokens, the tracking/radius/shadow ladders, the copy voice, and the specific anti-patterns that make AI-generated pages look generic and templated. Load this instead of inventing a design direction."
license: MIT
---

# House Style — Arya Estimating / InfraBid

The baseline. Work that does not meet it is not finished, and it is not the
user's job to steer you here — that steering is exactly what this file exists
to eliminate.

This standard was extracted from `style.css` in this repo, which is a
hand-built, framework-free system the user has iterated on across many
releases. It is already distinctive. **Your job is to extend it, not to
redesign it.** When adding anything, find the nearest existing component in
`style.css` and match its construction.

## The gate

Before calling any front-end work done, all ten must be true:

1. Type is Century Gothic → Jost. **Never Inter, never system-ui.**
2. Headings are weight 500. Body is weight 300. Nothing is 700+ except small uppercase labels.
3. Every number a user reads has `font-variant-numeric: tabular-nums`.
4. One hue family only — navy `#133198` / blue `#476DCF`. No second accent colour.
5. No pure black and no neutral grey. Text is blue-tinted ink.
6. Every surface has a `1px solid var(--border)` edge. Structure comes from borders, not shadows.
7. Shadows are navy-tinted with large negative spread. Never `rgba(0,0,0,…)`.
8. Radius follows the ladder (below). Never `rounded-full`, never `0`.
9. Motion uses `cubic-bezier(.2,.8,.2,1)` and is wrapped by `prefers-reduced-motion`.
10. Copy names the actual industry. No hype adjectives, no "Supercharge your workflow".

## Tokens

Use the CSS variables already defined in `:root`. Never hard-code a hex that
duplicates one. The full block is in `references/tokens.css` for starting a
new site.

```
navy    #133198   navy-deep #0E2470   blue #476DCF   blue-soft #6E8FDC
ink     #15234E   text #2C3A5C        text-sub #56648A   muted #8290AE
bg      #FFFFFF   bg-2 #F4F8FD        bg-3 #EDF3FB       surface-2 #F2F7FD
border  #E2EAF6   border-2 #CBD9F0
grad    linear-gradient(120deg,#133198,#476DCF)
up      #17a06a   down #e0445f
```

Gradient is an accent, not a surface. It belongs on primary CTAs, the 3px rule
above a stat, the progress bar, `.gtext` on one phrase of a headline, and
nowhere else. Never a gradient page background, never a gradient card fill.

## Typography

**Stack:** `'Century Gothic','CenturyGothic','Jost','Avant Garde','Trebuchet MS',sans-serif`
— Jost is the Google-hosted fallback that carries the geometric feel when
Century Gothic is absent. This pairing is the single biggest reason the site
does not read as templated. Never substitute it.

**Weights:** body 300 · headings 500 · small uppercase labels 600–700. A
weight-700 headline is the fastest way to make this site look like everyone
else's.

**Tracking is inversely proportional to size.** This is the house signature:

| Role | Size | Tracking | Case |
|---|---|---|---|
| Display / H1 | clamp(38px,5.6vw,72px) | `-.01em` | UPPERCASE |
| Big figures | 34–46px | `-.02em` | — |
| Section H2 | clamp(30px,4.4vw,50px) | `.02em` | UPPERCASE |
| Card title | 14–16px | `.08em` | UPPERCASE |
| Nav link | 12px | `.14em` | UPPERCASE |
| Button | 12px | `.2em` | UPPERCASE |
| Stat label | 11px | `.18em` | UPPERCASE |
| Eyebrow | 11px | `.32em` | UPPERCASE |

Headline `line-height` is `1.08`. Body is `1.6`–`1.7`. Long-form lead copy caps
at ~540px wide.

## Surfaces and depth

**Radius ladder — pick by object size, never at random:**

| 10–11px | 12–14px | 16px | 18px | 20px |
|---|---|---|---|---|
| buttons, inputs | icon tiles, file rows, FAQ, chips | stats, media, marquee cards | content cards, plans | hero panels, sticky analysis |

**Shadows** are navy-tinted and very diffuse, with a large negative spread so
they read as ambient light rather than a drop shadow:

```css
--shadow:    0 26px 60px -28px rgba(19,49,152,.32);
--shadow-sm: 0 12px 30px -16px rgba(19,49,152,.22);
```

A neutral `rgba(0,0,0,.1)` shadow instantly breaks the system. Cards rest at
`--shadow-sm` and lift to `--shadow` on hover.

## Layout and space

Container `1240px`, gutter `28px`, sections `120px 0`. Breakpoints at
**1024 / 860 / 460** — match these, do not introduce new ones.

**Asymmetry is house style.** Hero is `1.05fr .95fr`, valuation is `1.15fr .85fr`,
media band is `.9fr 1.1fr`. A centred, symmetrical hero with the text stacked
above a screenshot is the generic pattern — avoid it. Section heads are
left-aligned at `max-width:680px`, never centred.

## Motion

House easing is `cubic-bezier(.2,.8,.2,1)`. Interaction transitions run
`.3`–`.4s`; cinematic transforms (Ken Burns, image scale) run `.9s`+.
Everything decorative is already wrapped by the `prefers-reduced-motion`
block at the end of `style.css` — **add new animations to that block too.**

Motion is used for continuous signal (marquee, scanline, pulse, growbar), not
for entrance flourishes on every element.

## Copy voice

Model it on the existing hero: *"Arya Estimating converts raw drawing
architecture into precise, defensible financial assessments — continuously
priced against live Irish merchant data. Win more bids, protect your margin,
eliminate the guesswork."*

Concrete domain nouns. Real geography. An em-dash pivot into specifics. A
tricolon to close. Zero hype adjectives, zero "seamless", "effortless",
"powerful", "revolutionary", "game-changing".

Headlines are uppercase, split across two lines, with **one** phrase in
`.gtext` gradient — not the whole headline.

## Anti-patterns

The generic-AI tells, and what to do instead. Most of these are defaults that
arrive silently from Tailwind or from habit:

| Generic tell | House equivalent |
|---|---|
| `Inter`, `system-ui`, `-apple-system` | Century Gothic → Jost |
| `font-weight:700/800` headings | `500` |
| Indigo/violet `#6366F1`, `#8B5CF6` | navy `#133198` |
| Tailwind greys `#6B7280`, `#111827` | `--text-sub`, `--ink` |
| `box-shadow` with black rgba | navy-tinted `--shadow` |
| `rounded-full` pills, `rounded-2xl` everywhere | the radius ladder |
| Emoji as icons | inline SVG, `stroke-width:1.5`–`1.6`, no fill |
| Centred hero, text stacked over a screenshot | asymmetric `1.05fr .95fr` grid |
| Three identical feature cards, generic icons | real capability names from the domain |
| "Supercharge your workflow" | concrete, industry-specific claims |
| Proportional digits in prices and metrics | `font-variant-numeric: tabular-nums` |
| Pulsing-dot eyebrow above every H1 | *removed from page heroes deliberately* — keep eyebrows for section heads and the showcase band |

That last row is a real decision from this repo's history: commit `24d19f8`
stripped `<span class="eyebrow"><span class="dot"></span>…` out of the
`estimate.html` hero. Do not reintroduce it.

## Working method

1. Read the relevant part of `style.css` first. Reuse a class before writing one.
2. New CSS goes in the matching `/* ---------- section ---------- */` block, in
   the same compact multi-property-per-line format the file already uses.
3. No frameworks, no build step, no dependencies. The file header says
   *"bespoke build, light theme. No frameworks."* — that is a constraint.
4. New animation → also add it to the `prefers-reduced-motion` block.
5. Run the gate above before reporting the work done.

For deeper design questions the `ui-ux-pro-max` skill in this repo has
searchable style/palette/UX data. Treat it as raw material: this file wins on
every conflict.
