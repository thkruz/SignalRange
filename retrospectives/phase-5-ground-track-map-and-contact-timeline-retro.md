# Retrospective — Phase 5 (Ground Track Map & Contact Timeline)

**Scope:** [plans/phase-5-ground-track-map-and-contact-timeline-plan.md](../plans/phase-5-ground-track-map-and-contact-timeline-plan.md).
Two operator situational-awareness features: a 2D world map of live satellite
positions (new tab, beside the satellites) and a real access/contact timeline
deck along the bottom of Mission Control, enabled per scenario.

## What was built

- **`src/services/ground-track-math.ts`** — pure, DOM-free geodesy ported from
  the KeepTrack Companion app's `map-math.ts` (`subsolarPoint`, `nightPolygon`,
  `splitAtAntimeridian`, `interpolateGroundPoint`, `normLon`) plus two new
  routines this repo needed: `visibilityRadiusDeg`/`visibilityCircle` (station
  access circles) and `isSunlit`/`lightingSpans` (cylindrical-shadow eclipse,
  the umbra-only simplification of KeepTrack's `SatMath.calculateIsInSun`, since
  ootk here exports neither `SatMath` nor `SunStatus`). 22 unit tests.
- **`GeoMap` generalized** — was a Campaign-5-only geolocation instrument; now
  carries optional `tracks` / `footprints` / `terminator` layers plus a
  `centerOn()`. The geolocation console is untouched (all new fields optional).
  Night side clips the new `earthmap-night4k.jpg` to the terminator polygon,
  falling back to a flat darkening, matching the existing basemap discipline.
- **`GroundTrackTab`** — one component, two placements as decided: the
  satellite asset tab set (focused bird highlighted + auto-centered) and a new
  mission-overview `World Map` tab. Gated on the scenario actually having SGP4
  satellites. Track geometry re-propagates every 30 s of sim time; the live
  sub-point interpolates between samples so the marker still moves smoothly.
- **`TimelineDeck` rewritten** — the shell (header, horizon buttons, collapse,
  axis, playhead) survived; the hardcoded placeholder Gantt was replaced with
  one lane per orbital satellite: `PassPlannerService` contact blocks colored by
  max elevation with AOS/LOS tooltips, over a lighting background.
- **`settings.contactTimeline`** opt-in; `MissionControlPage` only constructs
  the deck when present, and now disposes it (it subscribes to `Events.UPDATE`).
  Wired into the nats-eu sandbox (6 h) and scenario 1 (2 h).

## Two bugs only the live app could find

Both were invisible to 4,600 green unit tests — the campaign-3 post-mortem's
lesson holding for the third phase running.

1. **The terminator fill was wrong, and inverted-looking.** I added longitude
   "unwrapping" while tracing the night polygon, reasoning that a curve running
   -180 → 180 shouldn't snap back across the map. But `nightPolygon` closes
   itself with a deliberate 180 → -180 step through the dark pole, and the
   unwrap smoothed exactly that step away — so the polygon closed with a
   diagonal slash across the map and shaded the *daylit* Americas. Removing the
   unwrap fixed it. Worth recording *why* the screenshot looked so strange: the
   scenario date (2027-03-15) is five days before the equinox, where `dec` is
   −2.08° and the lat(lon) terminator parameterization is near-degenerate,
   jumping between ±88° between adjacent samples. That jumping is physically
   correct — at equinox the terminator really does run pole to pole — so the
   temptation to "fix" the curve would have been the wrong move entirely.
2. **Three surfaces disagreed about when the passes are.** The plan called this
   out as risk #1 and it happened anyway: the deck honored the scenario's 5°
   mask while `PassScheduleTab` called `getContactSchedule` with no options at
   all, i.e. the service default of 0°. The tab was listing a **2.3° "pass"** the
   station cannot work, and every window it drew was ~2.4 min wider than the
   deck's for the same pass. Fixed with one shared resolver,
   `scenarioMinElevation(settings)` + `DEFAULT_CONTACT_MIN_ELEVATION`, called by
   both. Post-fix the two agree to the second (14:03:10Z → 14:10:18Z, 28.0°).

## What worked

- **Reading the repo before designing.** Both features were ~60% built already
  (`GeoMap` from Campaign 5, the `TimelineDeck` shell, `PassPlannerService`).
  Treating this as "generalize and wire" instead of "build a map and a timeline"
  removed most of the work — and the companion repo supplied the three
  math pieces `GeoMap` lacked, already unit-tested upstream.
- **Asking the four decisions up front** (placement, layers, gating, lanes)
  rather than guessing. The "both placements" answer in particular changed the
  component's shape — a focus parameter instead of two components.
- **Driving the real browser as part of the phase, not after it.** A DOM-level
  probe alone would have passed: the deck rendered blocks, the map canvas
  painted 51 distinct colors, zero console errors. Only *looking at the
  screenshot* caught the terminator, and only *cross-checking two surfaces*
  caught the mask mismatch.
- **The opt-in gating idiom again.** New settings block + gated construction +
  additive optional layer fields; 145 test files stayed green with only the two
  intentional test updates below.

## What didn't

- **Two existing tests asserted the old behavior** and had to be rewritten, not
  patched: `timeline-deck.test.ts` asserted the placeholder Gantt's contents
  (`GS VISIBILITY`, `ECLIPSE`, hardcoded axis labels), and
  `mission-control-page.test.ts` asserted the deck is always constructed. Both
  now assert the real thing — the deck test drives real SGP4 → passes → DOM.
- **My first `isSunlit` test was wrong, not the code.** I assumed the ±x axis
  aligned with the sun; it doesn't at an arbitrary epoch. Rebuilt the vectors
  from the actual `Sun.position` direction. A reminder that a failing new test
  is as likely to be a bad assertion as a bad implementation.
- **A too-strong assertion** on the mask test (`masked.length < atHorizon.length`)
  failed because that TLE has no sub-5° grazers in a 12 h window. The narrowing
  of shared windows is the real invariant; the count is incidental.
- **Lighting became a lane background, not its own lane.** The decision was
  "contacts + lighting"; with more than one satellite a single lighting lane is
  ambiguous about which bird it describes, so each row carries its own shading.
  Flagged for the owner in case a separate lane was wanted.

## What to change next time

- **Any new surface that predicts passes must call `scenarioMinElevation()`.**
  There are now three consumers; the fourth will re-introduce the disagreement
  if it hand-rolls options. Consider making `PassPlannerOptions.minElevation`
  required to force the decision at every call site.
- **When porting math, port the assumptions too.** The unwrap bug came from
  applying a reasonable-sounding transform to a polygon whose closure depended
  on the untransformed values. The companion's `map.ts` doesn't unwrap — that
  was the tell, and I added the step anyway.
- **Screenshot every new visual feature before declaring it done.** The DOM
  probe's "51 distinct colors" was a real check that passed on a broken render.
- Still outstanding from Phase A and untouched here: the
  `waitForObjectiveCompleted` false-pass in the shared E2E utils, and the
  `isOptional` semantics decision.

## Verification

- `npm run type-check` — clean.
- `npx vitest run` — 145 files, **4622 passed / 10 skipped** (was 144 / 4597).
- Live browser (nats-eu sandbox): deck renders 2 satellite lanes with real
  contact blocks + lighting and a tracking playhead; Ground Track tab renders
  tracks, access circle, and a correct terminator; mission overview shows
  `Overview | World Map`; terminator toggle changes the render; zero console
  errors.
- Deck ↔ Pass Schedule tab windows verified identical after the shared-mask fix.
- **Not done:** no Playwright spec was committed for either feature, and neither
  is exercised by an E2E scenario test yet.
