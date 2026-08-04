# Phase 11 — Astro shell anatomy for Campaigns 4 and 5

## Goal

Phase 10 changed C4/C5's *skin*; the shell *anatomy* (boxed tabs, card-look sidebar,
scrolling alarm ticker) still reads as Campaign 1. This phase re-anatomizes the three
surfaces the eye hits first — top bar, tab row, left rail — into Astro UXDS patterns,
all scoped to `body.chrome-astro` (+ two variant-gated template switches), so C1–C3
are untouched. User approved options A+B+C; the flush-tile workspace (D) was
deliberately deferred.

Phase 9's lesson stands: navigation does not MOVE (asset tree stays left, tabs stay
top). Only its anatomy changes.

## A. Global Status Bar treatment (top bar)

- **Two-line identity**: a micro "domain" line (campaign title, e.g. `9TH ELECTRONIC
  WARFARE SQUADRON`) above the wordmark; FA icon hidden; DOY clock beneath.
  Template change in global-command-bar.ts, gated `chromeVariant_ === 'astro'` (same
  pattern as the clock format).
- **Monitoring chips**: the severity count badges become always-visible monitoring
  chips — `CRIT n / CAUT n / INFO n` — labels via CSS `::before`, FA icons hidden,
  outline style, mono counts, Astro status colors (critical red stays in the
  `--mc-danger`/critical family; caution `#fce83a`; info standby `#2dccff`).
  TS change: in astro, render all three chips even at count 0 (with a `zero` class
  so CSS mutes them); other variants keep the render-only-nonzero behavior.
- **Ticker demoted**: the full-width severity tint on the alarm strip goes
  transparent (state lives in the chips); messages drop to 9px muted mono, colors
  neutralized.
- **Timers as Astro clock blocks**: transparent, no box, hairline left rules,
  label-over-mono-digits. Semantic state colors stay on the digits; the background
  pulse animation is dropped (nothing to pulse on transparent).

## B. Underline tabs

Boxed tabs → Astro underline tabs: transparent strip on the canvas base, uppercase
condensed-size labels, icons hidden, 3px transparent bottom border that fills with
the campaign highlight on active, hairline under the whole strip. Pure CSS.

## C. Asset rail re-anatomy (stays left)

- Rail drops to the page base surface (canvas and rail merge into one dark field;
  panels float on it), header/group labels become GRM-style micro table-headers on
  `--mc-surface-1` with hairline rules.
- Rows: no per-item borders, 3px transparent left edge; selected = `--mc-surface-4`
  (the Astro *selected* slot in both C4/C5 ramps) + highlight left edge; hover =
  `--mc-surface-2`.
- `.item-status` dots become status *symbols* (color+shape, the Astro colorblind
  rule): operational = circle (status-normal), degraded = diamond via clip-path
  (status-caution), offline = square (status-critical). Glow shadows removed.

## Invariants / risks

- All rules under `body.chrome-astro`; TS switches keyed off `chromeVariant_`.
- DOM order and locators unchanged (E2E + qs() safety); chip markup only gains a
  class and renders more chips in astro.
- chrome-identity E2E still asserts: bar bg not transparent (bar keeps surface-1),
  Roboto chrome, TASK label, DOY clock, 1px card border — all preserved.
- `.timer-display` state backgrounds are overridden by the astro block
  (specificity 0,2,1 beats 0,2,0); state still reads via digit colors, which come
  from higher-specificity rules and survive.
