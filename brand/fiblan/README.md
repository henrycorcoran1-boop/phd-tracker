# Fiblan Consulting — identity concepts

Six logo routes for a project management / civil engineering consultancy.
First issue, 2 Aug 2026 — concepts for selection, not a finished identity.

Every mark is drawn on one 64 × 64 grid with matched stroke weights, so the set
reads as one hand. Pick the idea, not the drawing style.

## The routes

| # | Name | Idea | Watch out for |
|---|------|------|---------------|
| 01 | **Cantilever F** | A structural F — stem as column, arms cantilevering off it, orange haunch bracing the lower arm | — |
| 02 | **The Benchmark** | The Ordnance Survey cut benchmark: broad arrow under a level bar. "We're the fixed reference." | Reads as a surveyor's tripod at a glance |
| 03 | **Programme F** | The F as programme bars — two attached (in progress), one detached (scheduled), diamond milestone | Diamond is lost below ~24 px |
| 04 | **Grade Line** | A longitudinal section stepping up through levels to a fixed point | No initial, so the name does the recognition work |
| 05 | **Control Point** | The setting-out target: ring, crosshair ticks, centre point | Targets are well-used — least ownable |
| 06 | **Plate Monogram** | 01's F on a bolted gusset plate | A containment for 01, not a rival to it |

A bridge span was drawn and set aside — the most-used image in the sector, and
the version that stayed legible at small size was indistinguishable from a table.
Route 04 reaches the same idea without the cliché.

## Recommendation

**Route 01 as the mark, Route 06 as its container.** They share the same F, so
adopting both gives a system rather than two logos: 01 for letterhead, drawings
and site boards; 06 for anything square — favicon, LinkedIn, app icon. 01 is the
only route that is simultaneously a real letterform, a real structural idea, and
legible at favicon size.

If the identity should say *project management* before *civil engineering*, take
03 instead — the same monogram carrying a programme.

## Palette

| Colour | Hex | Role |
|--------|-----|------|
| Graphite Blue | `#12303D` | Primary — the mark |
| Signal Orange | `#D2622F` | Accent — one element only |
| Site Slate | `#5C7180` | Secondary text |
| Drafting Paper | `#F4F6F7` | Ground, and the reversal colour |
| Signal Orange (reversed) | `#E8834F` | Accent on dark ground only |

Deliberately clear of the royal blue (`#133198`) used on the Arya Estimating /
InfraBid site, so the two brands can sit side by side. The orange is a
setting-out and hi-vis colour rather than a brand flourish — it earns its place
by marking exactly one element.

## Files

```
marks/            primary artwork, for light grounds
marks-reversed/   for dark grounds — mark in Drafting Paper, accent lifted to #E8834F
marks-mono/       single colour, for embroidery, engraving, fax-grade reproduction
lockups/          mark + wordmark, route 01 (horizontal and stacked)
```

## Usage

- **Minimum size** — 01, 04, 05 and 06 hold to 14 px. 03 needs 24 px before the
  milestone diamond is worth keeping; below that, drop it. On 06, drop the bolt
  holes below 24 px.
- **Clear space** — keep the height of the F's stem clear on all four sides. On
  the plate, measure from the plate edge, not the letter.
- **Reversal** — never place the navy mark on a dark ground; use `marks-reversed/`.

## Before this goes live

The lockups set the wordmark in a Helvetica / Arial stack as a stand-in. For
final artwork the type should be **Barlow** (a grotesque with transport-signage
roots, apt for infrastructure) or **IBM Plex Sans** if a quieter voice is wanted —
both free to license. Once chosen, the wordmark must be **converted to outlines**
so the SVGs carry no font dependency and render identically everywhere.
