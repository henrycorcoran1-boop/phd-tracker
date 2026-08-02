# Fiblan Consulting — identity

Logo work for a project management / civil engineering consultancy.

- **Rev A** (2 Aug 2026) — six routes pitched for selection.
- **Rev B** (2 Aug 2026) — **route 02, The Benchmark, selected and developed.**
  See [`benchmark/`](benchmark/) for the working artwork.

Every mark is drawn on one 64 × 64 grid with matched stroke weights, so the set
reads as one hand. Pick the idea, not the drawing style.

## Selected route — The Benchmark

The Ordnance Survey cut benchmark: a broad arrow pointing up at a level bar,
chiselled into walls and bridge abutments to fix a known height. It says the
thing a consultancy wants to say — *we're the fixed reference everyone else
measures from.*

**Refined since Rev A.** The pitched version had legs long enough and a bar
narrow enough that it read as a surveyor's tripod first. The barbs are now a
true 45° and the bar is wider than the arrow, so it reads as an arrow pointing
at a datum rather than three legs on the ground. `marks/02-benchmark.svg` carries
the refined drawing, so there is one canonical benchmark across the repo.

### Before this is printed anywhere

The broad arrow is also the **British War Department's property mark** — which is
exactly how it came to be cut into OS benchmarks. In a surveying context it reads
purely as a benchmark, and cut benchmarks are all over Ireland from the historic
survey. For an Irish practice it is still worth a deliberate decision rather than
a discovery. `benchmark/trig-point-alt.svg` reaches the same world without it.

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

Route 01 was the recommendation at Rev A; route 02 was chosen. The other five
are kept as a record of what was considered.

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
benchmark/                 SELECTED ROUTE — use these
  mark.svg                 primary artwork
  mark-reversed.svg        for dark grounds
  mark-mono.svg            single colour
  favicon.svg              heavier cut — use below 24 px
  plate.svg                square containment, for avatars and app icons
  plate-reversed.svg
  icon-192.svg
  icon-512.svg
  lockup-datum.svg         PRIMARY lockup — datum bar sets the level for the name
  lockup-datum-reversed.svg
  lockup-horizontal.svg
  lockup-stacked.svg
  trig-point-alt.svg       alternative, no broad arrow

marks/            the six pitched concepts, light grounds
marks-reversed/   the same, for dark grounds
marks-mono/       the same, single colour
lockups/          route 01 lockups, kept from Rev A
```

## Usage

- **Minimum size** — the mark holds to 16 px, but only just. Use `favicon.svg`
  below 24 px and `mark.svg` above it.
- **Clear space** — keep the height of the arrow clear on all four sides. On the
  plate, measure from the plate edge, not the arrow.
- **Reversal** — never place the graphite mark on a dark ground; use the
  `-reversed` files, where the accent lifts to `#E8834F` to hold contrast.
- **The accent does one job.** Orange marks the datum bar and nothing else. If it
  starts appearing on the arrow too, the idea of the mark is gone.

## Still outstanding

The lockups set the wordmark in a Helvetica / Arial stack as a stand-in. For
final artwork the type should be **Barlow** (a grotesque with transport-signage
roots, apt for infrastructure) or **IBM Plex Sans** if a quieter voice is wanted —
both free to license.

Until then the wordmark's advance width is pinned with `textLength`, so a
renderer without Helvetica cannot overflow the viewBox — at the cost of tracking
that flexes slightly between machines. Once a face is chosen, **convert the
wordmark to outlines** and re-fit the viewBox to the real artwork; the files then
carry no font dependency and render identically everywhere.
