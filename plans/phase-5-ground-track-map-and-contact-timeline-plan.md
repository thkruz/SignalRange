# Phase 5 — Ground Track Map & Contact Timeline

Two operator-situational-awareness features that every campaign from 2 onward wants and
none currently has: **where the birds are right now**, and **when the contacts are**.

Both are partial builds, not greenfield:

- [`GeoMap`](../src/components/geo-map/geo-map.ts) already renders a pan/zoom equirectangular
  canvas map with typed markers — built for Campaign 5's geolocation console, never reused.
- [`TimelineDeck`](../src/pages/mission-control/timeline-deck.ts) already renders a collapsible
  bottom deck with an axis, playhead and three Gantt lanes — entirely **hardcoded placeholder
  data**, and currently mounted for every campaign including Campaign 1.
- [`PassPlannerService`](../src/services/pass-planner-service.ts) already computes AOS/LOS/maxEl.

## Reference implementations

| Source | What we take |
|---|---|
| `keeptrack-companion/src/track/map-math.ts` | `subsolarPoint`, `nightPolygon`, `splitAtAntimeridian`, `interpolateGroundPoint`, `normLon` — pure, unit-tested, DOM-free |
| `keeptrack-companion/src/track/map.ts` | Two-layer render strategy (static base ~1/min, cheap overlay per tick); past-solid / future-dotted track styling |
| `keeptrack-space/src/plugins/timeline-sensor/sensor-timeline.ts` | Canvas Gantt layout, hover tooltip via a `drawEvents_` hit map, pass-quality color coding |
| `keeptrack-space/src/app/analysis/sat-math.ts` | `calculateIsInSun` umbra/penumbra treatment for the lighting lane |

## Decisions (locked with the owner 2026-07-24)

1. **Map placement — both.** One `GroundTrackTab` component. Registered in the satellite
   asset tab set (auto-centers + highlights the selected bird) *and* as a second tab on the
   mission-overview screen (all assets, nothing highlighted).
2. **Map layers v1 — ground track (past solid / future dotted), day/night terminator, and
   ground-station visibility circles.** Live subpoint markers are implicit.
3. **Timeline gating — `settings.contactTimeline` opt-in.** Campaign 1 declares nothing and
   therefore **loses the placeholder deck entirely**. This is an intentional visible change
   to a shipped campaign.
4. **Timeline lanes — contacts + lighting.** One contact lane per satellite (AOS→LOS blocks,
   colored by max elevation), plus an eclipse/sunlight lane. No scenario-event lane in v1.

## Build steps

### 1. `src/services/ground-track-math.ts` (pure, unit-tested)

Port from companion `map-math.ts`, plus two additions this repo needs:

- `visibilityCircle(station, satAltKm, minElevation)` — the ground circle inside which a
  satellite at that altitude clears `minElevation`. Central angle
  `λ = acos(Re/(Re+h) · cos(el)) − el`; sample as a lon/lat ring, reusing `splitAtAntimeridian`
  so it draws correctly when it straddles ±180°.
- `isSunlit(eciPositionKm, date)` — cylindrical-shadow test against `Sun.position(date)` from
  ootk (present in this repo's ootk build; `SunStatus`/`SatMath` are **not** exported here, so
  port the test rather than importing it).

`groundTrack(sat, startMs, endMs, stepS)` propagates via `sat.ootkSatellite.lla(date)` — the
same path `OrbitalSatellite` uses, so map and physics can never disagree.

### 2. Extend `GeoMap`

Additive optional fields on `GeoMapLayers` so the geolocation console is untouched:

```ts
tracks?: GeoTrack[];        // { points, nowMs, color, isHighlighted }
footprints?: GeoFootprint[];// { lat, lon, radiusDeg, label }
terminator?: { date: Date };
```

Draw order: basemap → **terminator** → graticule → footprints → tracks → LOPs → fix → markers.
Terminator uses the night basemap (`earthmap-night4k.jpg`, copied from the companion repo
into `public/images/`) clipped to `nightPolygon`, falling back to a flat dark fill if the image
has not loaded — matching the existing basemap fallback discipline.

### 3. `GroundTrackTab`

`src/pages/mission-control/tabs/ground-track-tab.ts` + `.css`, following `EaAssessmentTab`
conventions (BaseElement, `domCache_`, bound throttled `Events.UPDATE` handler,
`activate`/`deactivate`/`dispose`). Constructor takes an optional focus satellite.

Registration in [`tabbed-canvas.ts`](../src/pages/mission-control/tabbed-canvas.ts):
- satellite tab set gains `{ id: 'ground-track', label: 'Ground Track' }` after Dashboard;
- mission overview renders a two-tab bar (`Overview` | `World Map`) instead of clearing it.

Gated on `hasOrbitalSats` — a GEO-only scenario has nothing to track.

### 4. `settings.contactTimeline` + deck gating

New optional block in [`scenario-manager.ts`](../src/scenario-manager.ts):

```ts
contactTimeline?: {
  horizonHours?: number;     // default 6
  minElevation?: Degrees;    // default 5
  showLighting?: boolean;    // default true
  startCollapsed?: boolean;  // default false
};
```

`mission-control-page.ts` only constructs `TimelineDeck` when the block is present.

### 5. Rewrite `TimelineDeck`

Keep the shell (header, zoom buttons, collapse, axis, playhead) — replace
`generateGanttPlaceholder_` with real rendering:

- **Contact lanes** — one per orbital satellite, blocks from `PassPlannerService.getPasses`,
  colored by max elevation (poor / average / good), hover tooltip with AOS/LOS/maxEl.
- **Lighting lane** — sunlit/eclipse spans sampled with `isSunlit` at the same step.
- Zoom buttons (2H/6H/24H) become real horizon selectors; the playhead tracks scenario time.
- Recompute on a throttle (passes are expensive), not every `Events.UPDATE`.

### 6. Wire into `nats-eu`

Add `contactTimeline` to the sandbox and scenario 1 settings. Confirm no other campaign
declares it (Campaign 1 deck disappears, as decided).

### 7. Verification

- `npm run type-check`, `npx vitest run` — full suite green.
- New unit tests: ground-track math (terminator latitude sign, antimeridian split, footprint
  radius against a hand-computed value, eclipse for a known sunlit/shadow case).
- New DOM tests: tab gating (present with orbital sats, absent without), deck gating
  (present with the settings block, absent without).
- **Live app check is mandatory** — per the campaign-3 post-mortem, every map/instrument bug
  in this repo so far was invisible to unit tests. Verify the track passes over the station
  at the AOS the timeline claims, and that the two agree with the Pass Schedule tab.

## Risks

1. **Three sources of "when is the pass"** now exist (Pass Schedule tab, Contact Plan tab,
   timeline deck). They must all read `PassPlannerService` with the same options or they will
   visibly disagree. Single options object per scenario, from the settings block.
2. **Cost of propagation.** A 24 h horizon × N satellites × 30 s steps is a lot of SGP4 per
   recompute. Throttle hard, cache by (horizon, satellite set, quantized start time).
3. **Removing Campaign 1's deck** changes a shipped campaign's layout; the CSS grid that
   reserves the deck's row must collapse cleanly when it is absent.
4. **Terminator vs. scenario clock.** Everything must use scenario sim time, not
   `Date.now()`, or the map will disagree with the sim after `advanceSimClock`.
