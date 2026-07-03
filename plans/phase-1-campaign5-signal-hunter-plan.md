# Phase 1 — Campaign 5 (Signal Hunter) Geolocation Foundations Plan

## Goal

Enable Campaign 5 ("Signal Hunter", README Q4: *"Someone is jamming allied satellites. Find them using geolocation and advanced RF techniques."*) with:

1. **Terrestrial jammer model** — interference events gain an optional ground-truth emitter position (lat/lon), turning the existing transponder-injected jammer into a locatable target.
2. **Two-satellite TDOA/FDOA geolocation** — the real-world "adjacent satellite" technique: the jammer's uplink enters the victim satellite via the main beam and a neighboring satellite via sidelobes; cross-correlating the two downlinks yields a time-difference line of position (isochrone) and a frequency-difference line of position (isodop) whose intersection localizes the emitter.
3. **Geolocation console** — a new Mission Control tab/equipment module where the operator selects the satellite pair, tunes to the interferer, captures correlation measurements (only while the duty-cycled jammer is actually up), and computes a fix with a shrinking error ellipse.
4. **Geographic map display** — a new canvas component (lat/lon map, not the az/el polar plot) plotting stations, satellite subpoints, LOPs, and the fix ellipse.
5. **New objective conditions** — `geolocation-measurements-collected` and `geolocation-fix-accuracy` so scenarios can grade the hunt.
6. **Military theme** — black-ops near-black surfaces with a coyote-brown accent, applied via the existing per-campaign body-class mechanism; visually distinct from Campaign 1 (red) and Campaign 2 (blue).
7. **One sandbox scenario** exercising the full loop: detect → characterize → geolocate → report.

**Hard constraint:** 100% backwards compatibility with Campaigns 1 and 2. All new mechanics are opt-in via optional config fields, conditional tab registration, and additive condition types — the proven Campaign 2 pattern. No behavior change for any existing scenario.

## Current-state findings (deep dive summary)

### Exists today (reuse)

- **Jammer engine:** `src/interference/interference-manager.ts` — `InterferenceEventConfig` (`:23`, id/satelliteNoradId/frequency/bandwidth/power/polarization/startTime/duration/periodSeconds/onSeconds) drives a duty-cycled `RfSignal` pushed onto `satellite.externalSignal` each tick (`update_`, `:82-122`). Injection at the transponder = uplink jamming relayed to all stations — exactly the Campaign 5 threat model. Config surface: `SimulationSettings.interferenceEvents?` (`src/scenario-manager.ts:89`).
- **Scenario template:** `src/campaigns/nats/scenario21.ts` (Hostile RF) already does detect → characterize duty cycle → discriminate → notch-mitigate, with NICE K0926. Its "Halifax sees it too" cross-station confirmation is *dialog only* — Campaign 5 makes that mechanic real.
- **Satellite physics:** `OrbitalSatellite` (`src/equipment/satellite/orbital-satellite.ts:66`) provides SGP4 ECI/RAE/Doppler via ootk against the simulated clock (`sim-time.ts` facade). ootk's `Satellite.eci(date)` gives the satellite positions/velocities TDOA/FDOA math needs.
- **Station coordinates:** `GroundStationLocation { latitude, longitude, elevation }` (`src/assets/ground-station/ground-station-state.ts:11`).
- **Spectrum analyzer** renders overlapping carriers + noise-blob jammer (max-combine in `spectrum-data-processor.ts:229`), with waterfall, markers, max-hold — sufficient for the detect/characterize objectives unchanged.
- **Campaign stub already registered:** `geolocationCampaignData` (`src/campaigns/nats/campaign-data.ts:127`, "22nd Electronic Warfare Squadron — Geolocation of Interference Sources", `isDisabled: true`) is registered in `router.ts:43-47`. **Known bug:** it shares `id: 'ccs'` with `ccsCampaignData` (`:110`) — must be fixed before activation (router routes are `/campaigns/:campaignId`).
- **Theming:** router applies `campaign-<id>` body class (`router.ts:126-136`); `body.campaign-nats-eu` block in `tabler-overrides.css:120-161` is the copy template. Accent slots are the `--mc-accent-red*` names (values change per campaign, names stay); `--mc-danger*` (`:93-97`) must never be overridden. The `index.css` `!important` legacy vars already route through `--mc-*` (`index.css:15-48`), so a new scoped block cascades correctly.
- **Gating patterns (Campaign 2 precedent):** opt-in subclass (`OrbitalSatellite`), optional config field (`antennaConfigKey`, `ground-station-state.ts:54`), `?? default` fallbacks (`rangeKm ?? 38000`), conditional tab registration (Pass Schedule tab only when orbital sats present), scenario `settings` flags.

### Not found (must build)

- **No geolocation anything:** grep for TDOA/FDOA/geolocate/triangulate/DF returns only narrative text. No emitter lat/lon on any signal or config, no estimation math, no measurement model.
- **No geographic map** — only the az/el polar plot (`src/components/polar-plot/`).
- **No geolocation console** equipment module or Mission Control tab.
- **No condition types** for measurements collected or fix accuracy (though `custom` with `params.evaluator()` exists as a prototyping escape hatch, `objectives-manager.ts:1823`).

## Design decisions

### D1 — Campaign identity: unique id `signal-hunter`, fix the `ccs` collision

- `geolocationCampaignData` gets `id: 'signal-hunter'` (README title "Signal Hunter"; URL `/campaigns/signal-hunter`; body class `campaign-signal-hunter`). `ccsCampaignData` keeps `ccs` for Campaign 4.
- Flip `isDisabled` off, populate `scenarios: [signalHunterSandboxData]`, set `campaignType`/difficulty/duration metadata. Keep it visibly "Phase 1 / Sandbox available" via subtitle text rather than a lock, so it's testable in UAT. Scenario also added to the flat `SCENARIOS` array (`scenario-manager.ts:191`).
- Unit test asserting all registered campaign ids are unique (kills this bug class permanently).

### D2 — Terrestrial emitter ground truth: optional `emitter` on `InterferenceEventConfig`

```typescript
export interface EmitterGroundTruth {
  latitude: Degrees;
  longitude: Degrees;
  elevationM?: number;      // default 0 (sea level)
}

// InterferenceEventConfig gains:
emitter?: EmitterGroundTruth;   // opt-in: absent ⇒ behavior identical to today
```

- `InterferenceManager` behavior is unchanged when `emitter` is absent (Campaign 1 scenario 21 untouched). When present, the manager exposes the active event + truth via a small query API (`getActiveEventsWithEmitters()`), consumed only by the new geolocation service. Truth is never rendered to the player; it only drives measurement synthesis and grading.
- Optionally tag the injected `RfSignal` with a new optional `emitterId?: string` on `BaseSignal` (`src/types.ts`) so the console can correlate what the analyzer sees with an event. No new `SignalOrigin` value (avoids auditing every switch over the enum); origin stays `SATELLITE_RX`.

### D3 — `GeolocationService`: forward model + measurement synthesis + solver (pure, unit-testable)

New `src/services/geolocation-service.ts`, no DOM, no EventBus — same architecture as `pass-planner-service.ts`:

- **Forward model.** For a candidate ground point `p`, primary satellite S1, adjacent satellite S2, and the downlink reference station G (positions/velocities from ootk ECI at sim time):
  - `TDOA(p) = [ |p−S1| + |S1−G| − |p−S2| − |S2−G| ] / c`
  - `FDOA(p)` from the range-rate differentials along the same two paths (dot products of relative velocity with unit line-of-sight vectors, scaled by carrier frequency).
- **Measurement synthesis.** When the operator captures (D4) during a jammer-on window, evaluate the forward model at the *truth* position and add zero-mean Gaussian noise (`tdoaSigmaS`, `fdoaSigmaHz` — per-scenario difficulty knobs). Timestamped with sim time so inclined-GEO drift makes successive FDOA LOPs rotate — collecting over time genuinely improves the fix.
- **Solver.** Coarse lat/lon grid search over the scenario's area of interest minimizing weighted residuals, refined by Gauss–Newton; outputs best-fit lat/lon, residual RMS, and a 95% error-ellipse approximation (semi-major/minor km + orientation) from the local Jacobian. Also emits sampled LOP polylines (isochrone/isodop per measurement) for map rendering.
- **Satellite positions:** `OrbitalSatellite` gains a public accessor exposing its internal ootk satellite's ECI state at a given date (additive method, no behavior change). Campaign 5 satellites are authored as `OrbitalSatellite` GEO birds (see D7), so no fallback path is needed for legacy static-az/el `Satellite`s — the console simply requires orbital satellites (documented constraint).
- Unit tests: forward-model symmetry (TDOA=0 on the perpendicular bisector geometry), solver recovers a known truth within tolerance at given noise, ellipse shrinks with measurement count, degenerate-geometry guard (satellites co-located → solver reports low confidence instead of NaN).

### D4 — Geolocation console: new equipment module + conditional Mission Control tab

New `src/equipment/geolocation-console/` following Core/UI separation (`geolocation-console-core.ts`, `geolocation-console-ui-standard.ts`, factory, index), owned by `GroundStation` **only when the scenario opts in**:

```typescript
// SimulationSettings gains:
geolocation?: {
  primaryNoradId: number;
  adjacentNoradIds: number[];        // selectable neighbors
  tdoaSigmaS: number;                // measurement noise (difficulty)
  fdoaSigmaHz: number;
  areaOfInterest: { latMin, latMax, lonMin, lonMax };  // solver + map extent
  captureWindowS?: number;           // default 10 (sim-seconds per capture)
};
```

- Tab registered in Mission Control only when `settings.geolocation` is present (same pattern as the Pass Schedule tab) → invisible to Campaigns 1/2.
- **Console workflow (the gameplay loop):**
  1. Select adjacent satellite from the configured list; tune center frequency + bandwidth to the interferer using the `equip-adjust-control` staged-values pattern (must match the active interference event within tolerance, or captures fail with "NO CORRELATION").
  2. Press **CAPTURE** — integrates over `captureWindowS` of sim time; succeeds only if the duty-cycled jammer is ON for ≥70% of the window (weaves scenario-21-style duty-cycle characterization into geolocation: you must *time* your captures).
  3. Each successful capture appends a measurement row (sim time, TDOA µs, FDOA Hz, quality); **COMPUTE FIX** runs the solver and draws LOPs + ellipse on the map.
- Adapter follows house rules: `domCache_`, bound handlers stored for `dispose()`, `Events.UPDATE` throttled to 1 Hz, `document.activeElement` guard on inputs, direct clicks bypass throttle.

### D5 — Geographic map: new `src/components/geo-map/` canvas component

- Equirectangular canvas scoped to `areaOfInterest`, lat/lon graticule, lightweight embedded coastline polylines (simplified Natural Earth subset checked in as a small TS/JSON asset — no map library, no network).
- Layers: ground station marker, satellite subpoints, per-measurement LOP polylines (isochrone vs isodop styled differently), fix marker + error ellipse, and — after the fix objective completes — the truth marker for debrief.
- Renders on `Events.DRAW` (canvas only, per EventBus rules); consumed by the console UI but reusable (future campaigns: DF bearings, multi-station fixes).

### D6 — New objective condition types (additive)

In `src/objectives/objective-types.ts` + `case`s in `objectives-manager.ts` (`switch` at `:1218`):

- `geolocation-measurements-collected` — params `{ minCount: number; interferenceEventId?: string }`.
- `geolocation-fix-accuracy` — params `{ maxErrorKm: number; interferenceEventId?: string }`; compares latest computed fix against the event's `emitter` truth (great-circle distance).
- Everything else the sandbox needs already exists: `signal-detected`, `speca-*`, `status-check` quizzes, `tab-active`, `notch-filter-configured`, `mission-brief-opened`.
- Both types are new string literals — zero impact on existing scenarios. (During development they can be spiked via the `custom` evaluator, but they ship first-class since the whole campaign will use them.)

### D7 — Campaign shell: station, satellites, sandbox scenario

New `src/campaigns/signal-hunter/`:

- **`ground-stations.ts`** — one military C-band station (reuses Campaign 1 equipment factory defaults → no new equipment configs needed for Phase 1). Fictional 22nd EWS site with real coordinates (e.g., Colorado plains); station name/wordmark from config as usual.
- **`satellites.ts`** — two `OrbitalSatellite` GEO birds authored via the checked-in TLE grid-search script approach from Campaign 2 (per that retro, keep the authoring script in `scripts/`): victim **SENTRY-7** and adjacent **SENTRY-9**, ~2° apart in longitude, small inclination (~0.5–1°) so FDOA geometry evolves over a session. Nominal C-band traffic + beacons so the RF chain looks alive.
- **`sandbox.ts`** — `signal-hunter-sandbox`, `missionType: 'Sandbox'` (excluded from progress %, per `campaign-manager.ts:102`), `number: 0`. One `interferenceEvents` entry on SENTRY-7 with `emitter` truth inside the area of interest, ~60s-on/45s-off duty cycle. Objectives:
  1. Detect the interferer on the spectrum analyzer (`signal-detected`).
  2. Characterize it — duty cycle + bandwidth quiz (`status-check`).
  3. Open the Geolocation tab (`tab-active`).
  4. Collect ≥3 correlation measurements (`geolocation-measurements-collected`, minCount 3).
  5. Compute a fix within 25 km of truth (`geolocation-fix-accuracy`).
  6. Report findings quiz (`status-check`) — closes the narrative loop.
  - Minimal text-only `dialogClips` (audio recorded later; `audioUrl` optional-safe as in nats-eu scenario 1). `missionBriefUrl` deferred until a `signal-range-docs` campaign-5 page exists.

### D8 — Theme: black-ops surfaces + coyote-brown accent

New `body.campaign-signal-hunter` block in `tabler-overrides.css`, copying the `campaign-nats-eu` template exactly (same variable set):

```css
body.campaign-signal-hunter {
  /* Primary accent: coyote brown */
  --tblr-primary: #8f6f46 !important;
  --tblr-primary-rgb: 143, 111, 70 !important;
  --tblr-primary-text-emphasis: #d2a86a !important;
  --tblr-primary-bg-subtle: rgba(143, 111, 70, 0.15) !important;
  --tblr-primary-border-subtle: rgba(143, 111, 70, 0.3) !important;
  --tblr-link-color: #b08d5a !important;
  --tblr-link-hover-color: #d2a86a !important;

  /* Accent slots keep their names; values become coyote brown */
  --mc-accent-red: #8f6f46;
  --mc-accent-red-bright: #d2a86a;
  --mc-accent-red-light: #a5834f;
  --mc-accent-red-dark: #5f4a2e;
  --mc-accent-red-rgb: 143, 111, 70;
  --mc-accent-red-bright-rgb: 210, 168, 106;
  --mc-accent-text-dark: #b08d5a;

  /* Black-ops surfaces: near-black, low-contrast borders */
  --mc-surface-0: #121314;
  --mc-surface-1: #1a1b1d;
  --mc-surface-2: #242628;
  --mc-surface-3: #303235;
  --mc-surface-4: #3d4043;
  --mc-border: #242628;

  --tblr-body-bg: #121314 !important;
  --tblr-secondary-bg: #1a1b1d !important;
  --tblr-tertiary-bg: #242628 !important;
  --tblr-border-color: #242628 !important;
}
```

- **Do not touch `--mc-danger*`** — alarms/faults stay red (semantic, campaign-independent).
- Per the Campaign 2 retro, live-verify with a themed walkthrough and grep for stray literals (`#ba160c`, `186, 22, 12`, `#ff2827`, `255, 40, 39`) — the routing fix already landed, so remaining risk is only in code added since.
- Campaign card copy/art updated for the 22nd EWS identity (placeholder art may reuse an existing card until R2 assets exist).

## Backwards-compatibility guarantees

| Change | C1/C2 impact |
| --- | --- |
| `emitter?` on `InterferenceEventConfig` | Optional; scenario 21 has no emitter → identical behavior |
| `emitterId?` on `BaseSignal` | Optional, unread by existing consumers |
| `GeolocationService` | New file; only invoked by the console |
| `settings.geolocation?` | Absent in all existing scenarios → console/tab never created |
| Geolocation tab | Conditional registration (Pass Schedule pattern) |
| `geo-map` component | New file, only used by the console |
| New condition types | Additive string literals; existing evaluator cases untouched |
| `OrbitalSatellite` ECI accessor | Additive public method |
| Campaign id fix (`ccs` → `signal-hunter`) | The stub was `isDisabled` and unreachable; C4 keeps `ccs` |
| `body.campaign-signal-hunter` CSS | Scoped class can't match other campaigns' routes |

Verification: `npm run type-check`, full `vitest` suite stays green, new unit tests (geolocation math, campaign-id uniqueness, console core), new Playwright full-completion spec for the sandbox (`e2e/specs/` POM pattern; run with workers=1 locally, 127.0.0.1 baseURL).

## Step order

1. Campaign id fix + uniqueness test + campaign shell activation (`signal-hunter`, metadata, empty sandbox stub registered).
2. `EmitterGroundTruth` on `InterferenceEventConfig` + `InterferenceManager` query API + `emitterId` tagging.
3. `GeolocationService` (forward model, measurement synthesis, solver, ellipse) + `OrbitalSatellite` ECI accessor + unit tests — the risk core, done early.
4. `geo-map` canvas component.
5. Geolocation console module (core + UI adapter + conditional tab wiring).
6. New condition types + evaluator cases.
7. Station + authored GEO TLEs (SENTRY-7/9, checked-in authoring script) + sandbox scenario with objectives/dialog.
8. Theme block + card metadata; themed live walkthrough.
9. Regression (type-check, vitest), E2E full-completion spec for the sandbox, live end-to-end validation of signal levels and capture timing (per C2 retro: drive the real app, don't trust unit math alone), retro.

## Out of scope (later phases)

- Full scenario arc (scenarios 1+), characters/voice audio, mission brief MDX in `signal-range-docs`, R2 card art.
- Local-vs-uplink discrimination as real per-station observables (today: dialog in scenario 21).
- Reference-emitter calibration gameplay (real-world technique for removing ephemeris/clock bias — natural difficulty tier for a later scenario).
- Multi-station interactive operation / DF bearings / three-satellite fixes.
- X-band or protected-SATCOM equipment configs (Campaign 4 territory).
- Moving/pop-up jammers, multiple simultaneous emitters.
