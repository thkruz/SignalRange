# Campaign 5 (Signal Hunter) — Lessons Learned

Engineering notes from building the two-satellite TDOA/FDOA interference
geolocation feature. Focused on the non-obvious, reusable gotchas — the phase
retrospective (`retrospectives/phase-1-campaign5-signal-hunter-retro.md`) has
the process-level story.

## Geometry is the hard part, not the code

The solver, the map, and the console were straightforward. The genuinely hard
problem was **satellite geometry**, and it was invisible to unit tests.

- **Emitter latitude is weakly observable with a near-equatorial GEO pair.**
  Two closely-spaced GEO birds nearly due south of the station produce TDOA and
  FDOA gradients that both point mostly east–west, so longitude is well
  constrained but latitude is nearly free. Time-clustered captures (all in one
  duty cycle) can't fix it, and the solve lands ~100 km off in latitude even
  though every unit test passes (the tests spread captures over 15 min, which
  hid it).
- **The fix: give the birds north–south velocity.** Inclinations of 3.0°/4.5°
  rotate the FDOA gradient off the TDOA gradient, making latitude observable
  from a single duty cycle. 0.7°/1.2° was too flat.
- **But don't over-incline.** At 5°/6° latitude became excellent, yet the N/S
  mirror-ambiguity separation collapsed (mirror cost dropped from ~120 to ~1.6),
  so the solver could snap to the wrong solution. There's a real sweet spot.
- **Validate geometry with a cost-surface probe before authoring the scenario.**
  A throwaway script that (a) grid-searches the residual cost surface for
  secondary minima (mirror separation) and (b) measures the cost rise 100 km
  north vs east of the truth from *clustered* captures told us exactly which
  inclination/separation to use. Do this as part of TLE authoring, like
  `author-tle*.mjs` already validates pass timing. Consider keeping such a probe
  as a checked-in dev tool for future geolocation scenarios.

**Takeaway:** for anything geometry-dependent, drive the real app and probe the
observability *before* trusting green unit tests. Unit tests that use
favorable inputs (well-separated captures) mask degenerate real-world usage.

## Two live bugs unit tests could never catch

Both surfaced only by driving the app end to end.

1. **Tab DOM listeners wired before `this.dom_` existed.** `BaseElement.init_()`
   calls the `addEventListeners_()` hook *before* the subclass assigns
   `this.dom_ = qs(...)`, so `cache_()` found nothing and the CAPTURE button
   silently did nothing. Fix: wire DOM listeners in a method called *after*
   `dom_` is set (this is what `PassScheduleTab` already does; follow that
   pattern for any new tab). Keep `addEventListeners_()` a no-op.
2. **Latitude geometry (above)** — a "100 km off" fix that no test flagged.

## Line-of-position rendering: trace contours, don't sample points

First implementation sampled zero-crossing *points* over the fixed area-of-
interest and connected them by pixel proximity. Two failure modes:
- lines only spanned the AOI (short), and
- zooming in pushed adjacent points past the proximity threshold → the line
  broke into dots, then vanished.

**Fix:** represent an LOP by its *constraint function* `residual(lat, lon)`
(zero on the line) instead of pre-sampled points, and have the map run marching
squares over the **current viewport** at draw time. The line then spans the
whole visible map and stays solid at any zoom, because it's re-sampled in screen
space at whatever resolution the zoom needs. Coalesce pan/zoom redraws with
`requestAnimationFrame` so the re-tracing stays smooth.

Corollary: passing a *closure* (residual) across the module boundary
(console → map) is cleaner and more flexible than passing baked data (points).

## Decouple the display viewport from the solver's search region

The map originally used the solver's area-of-interest as its viewport — which is
exactly the answer region, so it opened zoomed onto the emitter. Keep the
**viewport** (center + degrees-per-pixel, pan/zoom state) entirely separate from
the **AOI** (solver search bounds). The map should open on a neutral full-world
view and let the operator navigate in. "No auto-zoom to the answer" is both a
UX and a gameplay-integrity requirement here.

Equirectangular detail: use a 2:1 backing canvas so the full globe fits at max
zoom-out with no letterboxing, and a *large* backing resolution (e.g. 1000×500)
with CSS `width:100%` so a full-width map stays crisp while scaling responsively.
Pointer math must convert client coords → backing-pixel coords via
`getBoundingClientRect()` (accounts for CSS scaling).

## Sim-clock and singleton subtleties

- **Captures advance on the simulated clock, not wall time.** Integration
  windows use `getSimulatedNowMs()`, so if the scenario is paused (dialog/quiz
  modal open) the progress bar sits at 0% and captures never complete — which
  reads as "nothing happens." Any time-based equipment behavior inherits this;
  worth surfacing in the UI if it's confusing.
- **Auto-capture as a clean toggle.** The first version made "enable auto" a
  no-op once a measurement target was already met, which looked like a broken
  button. Prefer an unambiguous toggle: ON always starts capturing immediately;
  OFF stops; a high runaway guard (not a low target) prevents unattended
  spinning. A control that silently refuses is worse than one that always does
  something visible.
- **The console is an opt-in singleton** started in `base-page` only when
  `settings.geolocation` is present, and torn down in `mission-control-page`.
  The tab and base-page both call `getInstance()` — same instance, one
  `Events.UPDATE` handler. Remember to `destroy()` on page teardown or the
  handler leaks across scenarios.

## Small correctness notes

- **The map traces LOPs at sea level (alt 0), but the emitter truth has an
  altitude.** So the residual at the truth's lat/lon isn't exactly zero (a
  ~0.8 km altitude → ~2.7e-6 s TDOA offset → sub-km horizontal shift).
  Negligible for gameplay, but it bit a unit test that asserted the residual was
  `< 1e-9` at the truth. Assert "small relative to off-line values," not "zero."
- **Zero measurement sigma divides by zero** in the weighted cost/Jacobian →
  NaN cost surface → garbage fix. Scenario configs always pass positive sigma,
  but floor it defensively in the solver so a degenerate config can't crash the
  fix.

## Backwards-compatibility patterns that paid off (again)

Every mechanic is opt-in, so Campaigns 1–4 are byte-for-byte unchanged and the
full unit suite stayed green with zero edits to existing tests:
- optional field on an existing config (`emitter?` on interference events),
- an optional `settings.geolocation` block gating a new subsystem,
- conditional Mission Control tab registration (same gate as Pass Schedule),
- additive `ConditionType` string literals (existing evaluator cases untouched),
- a scoped `body.campaign-*` CSS class for the theme.

This is the same playbook Campaign 2 used; it keeps landing a large feature with
a small compatibility surface. Also: fixed the pre-existing duplicate `ccs`
campaign id and added a registry test asserting all ids are unique, to kill that
bug class.
