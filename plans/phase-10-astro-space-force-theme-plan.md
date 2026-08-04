# Phase 10 — Astro "Space Force" theme for Campaigns 4 and 5

## Goal

Replace the army-green/coyote-brown look of C4 (`ccs`) and C5 (`signal-hunter`) with the
look of Space Systems Command's reference apps (ttc-command-react / grm-dashboard-react on
netlify), which are built on the **Astro UXDS** design system (astrouxds.com, Rocket
Communications). C1–C3 must be pixel-identical afterwards.

Deliberately NOT copied from Astro: its spacing scale. The reference apps are far more
padded than this product wants; we take Astro's color, status semantics and organization
at our existing density.

## What Astro is, concretely (extracted from the reference apps' CSS bundles)

- Dark blue-slate palette: page `#101923`, header/bar `#172635`, surface `#1b2d3e`,
  hover `#1c3851`, selected `#1c3f5e`; interactive blue `#4dacff` (hover `#92cbff`,
  dark `#005a8f`).
- Six-level status system (pattern: astrouxds.com/patterns/status-system/):
  normal `#56f000`, caution `#fce83a`, serious `#ffb302`, critical `#ff3838`,
  standby `#2dccff`, off `#a4abb6`. Color always paired with shape; worst-status-wins
  rollups; status colors reserved for status.
- Classification banner ladder — hex-identical to our `--mc-classification-*` tokens
  already (no change needed).
- Roboto, monospace clocks/data, 3px radius, 1px hairline borders, panel headers as
  darker plates on lighter surfaces.

## Changes

1. **New chrome variant `astro`** (`ChromeVariant` in campaign-types.ts), worn by C4 and
   C5 instead of `tactical`. The `chrome-tactical` CSS block stays in the stylesheet as an
   available variant (documented, unused). Content differences in global-command-bar.ts:
   - clock: new `formatAstroClock()` — `2027 074 22:05:15` (year, day-of-year, UTC time),
     the Astro Global Status Bar convention; ticks every second.
   - timer labels stay TASK/MSN (both campaigns are EW squadrons; the labels are about the
     crew, not the console vendor).
2. **`body.chrome-astro` block** in tabler-overrides.css: 3px radii, hairline borders,
   Roboto chrome, card headers as darker plates (card body `--mc-surface-2`, header
   `--mc-surface-1` — Astro's exact `#1b2d3e`/`#172635` pairing), input wells one step
   darker, satellites-above-stations asset ordering and the classification strip carried
   over from tactical. No mirrored command bar (Astro puts identity left).
3. **Retheme `body.campaign-ccs`** — Astro electric blue: accent `#005a8f`/`#4dacff`,
   surfaces = the Astro ramp verbatim, equipment ramp re-derived with a blue-slate bias.
4. **Retheme `body.campaign-signal-hunter`** — platinum/steel on a darker slate: accent
   `#56708a`/`#a8c4dc`, surfaces a step darker and desaturated vs C4. Two squadrons, two
   accents (kept from the previous design); silver + blue is also the USSF heraldry pair.
5. **Status tokens** `--mc-status-{normal,caution,serious,critical,standby,off}` (+ rgb
   triplets for the tinted ones), declared **only** in the two campaign blocks. The
   dangling legacy names (`--mc-status-warning`, `--mc-status-info`) are left alone —
   they are referenced with fallbacks in shared CSS and declaring them would repaint
   shared components.
6. **EA console semantics** (ea-assessment-tab.css, C4-only file): STANDBY → Astro
   standby cyan, DEGRADED → serious amber (it was the brand accent, which under Astro
   rules is a category error), DENIED stays `--mc-danger*` red.
7. **geo-map.ts tokenization**: footprint, LOP and marker colors read from new
   `--mc-geo-*` vars with the current literals as fallbacks. GeoMap is shared with C2's
   ground-track tab, so fallbacks preserve C1–C3 exactly; C4/C5 blocks supply Astro
   values (coverage `#4dacff`, access serious-amber, truth marker critical red).
8. **security-console-tab.css** (shared with C2): `#22c55e`/`#eab308` badge literals →
   `var(--mc-status-normal, #22c55e)` etc. C2 resolves the fallback, unchanged.
9. **geolocation-tab.css** (C5-only): success message → status-normal green instead of
   brand accent.
10. **router.test.ts**: variant assertions use mocked campaign objects; update the mocks
    and expectations from `tactical` to `astro` where they model C4/C5.
11. **Per-campaign classification strips** (added mid-phase at user direction): C4 wears
    the Top Secret *style* reading `G14 CLASSIFIED // TRAINING USE ONLY`, C5 the Secret
    *style* reading `SPECIAL PROGRAM // TRAINING USE ONLY` — ladder colors untouched,
    wording deliberately fictional so the banner cannot be mistaken for a real marking.
    Implemented exactly as the tactical block's comment documented: override
    `--mc-classification-bg/-fg` in the campaign block and restate `content`.

## Invariants

- `--mc-danger*`, `--mc-classification-*`: untouched, campaign-invariant.
- Every new/changed CSS rule is scoped `body.campaign-ccs`, `body.campaign-signal-hunter`
  or `body.chrome-astro`; shared-file edits are token-with-fallback only.
- No DOM reorders; `chrome-astro` is CSS + the two content switches in the command bar.

## Risks

- C4's blue vs C2's maritime blue (`#0f62ac`) are near neighbors. Accepted: different
  chrome variant, different surfaces (blue-slate vs cool grey), brighter highlight.
- Card body/header surface swap under `chrome-astro` could reduce contrast for elements
  that assumed card = surface-1. Mitigated with input-well override; verified visually.
- Status colors appear only in C4/C5; C1–C3 keep their existing greens/yellows.
