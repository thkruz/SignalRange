# Phase 1 — Campaign 2 (NATS Europe) Orbital Foundations Plan

## Goal

Enable Campaign 2 ("NATS Europe", Charlie transfers to Europe) with:

1. **Realistic satellites** — SGP4-propagated from TLEs via `ootk`, producing real ECI position and ground-station-relative range/az/el.
2. **LEO satellite tracking** — antenna program-track of a fast-moving pass, AOS/LOS behavior.
3. **Multi-contact mission planning** — pass prediction (AOS, LOS, max elevation, duration) surfaced in a Mission Control tab.
4. **Video feed decoding** — LEO downlink carries a video payload rendered by the receiver when locked.
5. **Ku-band operations** — Ku ground station (LNB/BUC LOs, passbands, beacon, antenna config).
6. **Cosmetic re-theme** — NATS Europe feels like a different station/company without disorienting the user.

**Hard constraint:** 100% backwards compatibility with Campaign 1 (nats). All new physics are opt-in via a new satellite subclass and optional config fields; defaults preserve current behavior.

## Current-state findings (deep dive summary)

- `ootk@5.1.1` is already a dependency (currently used for branded types only). Its `Satellite` class provides `rae(observer, date)`, `eci(date)`, `rng()`, `applyDoppler()`; `GroundObject` models the station.
- `src/equipment/satellite/satellite.ts` — sim `Satellite` stores **static az/el** (GEO) or a parametric figure-8 (`orbitType: 'geosynchronous'`). `predictedAz/El` = truth + ephemeris error (step-track gameplay). Position updates throttled to 1 Hz inside `update()` on `Events.UPDATE`.
- **Every consumer reads `sat.az` / `sat.el` / `sat.predictedAz/El`** (antenna program-track, lock checks, link budget off-axis, traffic manager, dashboards). So a subclass that keeps those fields fresh from SGP4 gets full downstream compatibility for free.
- Slant range is **not** modeled: `antenna-core.ts` uses `GEO_SATELLITE_DISTANCE_KM = 38000` for FSPL. Doppler is not modeled anywhere.
- Simulated clock exists in `OpsLogManager` (`currentTimestampMs`, seeded from `scenarioStartDate`/`scenarioStartWallTime`, advances by dt, pausable) but nothing feeds it into satellite position yet.
- Campaign registry supports multiple campaigns; **`natsEuCampaignData` stub already exists** (id `nats-eu`, locked "Under Development") and is registered in `router.ts`. Scenarios must also be added to the flat `SCENARIOS` array in `scenario-manager.ts`.
- Ku-band already exists in the data model: `FrequencyBand.ku` in `constants.ts`, several `KU_BAND_*` antenna configs. Gaps: LNB/BUC LO + passband defaults are C-band-hardcoded; `GroundStation.createEquipment_()` ignores the configured antenna key (always factory default).
- Video feed rendering already exists: `BaseSignal.feed` URL → receiver `<video>` monitor with degradation effects. "Video feed decoding" = a LEO downlink signal with `feed` set + existing lock/C/N gates.
- Theme funnels through `--mc-*` custom properties in `tabler-overrides.css`, with a legacy-var compatibility mapping. No per-campaign class exists yet, but campaign id is derivable from the route.

## Design decisions

### D1 — `OrbitalSatellite extends Satellite` (opt-in subclass, not a flag on the base class)

New file `src/equipment/satellite/orbital-satellite.ts`:

- Constructor takes the same args plus `OrbitalConfig`: `{ tle1, tle2, observer: { lat, lon, alt }, dopplerEnabled?: boolean }`.
- Wraps an `ootk.Satellite` + `ootk.GroundObject` internally.
- On each throttled position update: `rae(observer, simNow)` → sets `this.az`, `this.el` (base fields all consumers already read) and new fields `rangeKm`, `rangeRateKmS`, `eciPosition`, `lla`, `isAboveHorizon`.
- Time source: `OpsLogManager` simulated clock so pause/scenario epoch work; falls back to `Date.now()` if unavailable (e.g., unit tests).
- Below horizon: az/el still update (drives "next pass" UX), but transmitted signals are suppressed (`getTransmittedSignals()` returns `[]` when `el < 0`).
- Doppler (flag-gated, default on for orbital sats): downlink signal frequencies shifted using ootk's doppler factor at emission time. Magnitude is real (~±250 kHz at Ku LEO) and well inside modem bandwidths, so lock behavior is unaffected but the spectrum analyzer shows drift.
- Ephemeris error fields keep working (predictedAz/El add error to propagated truth) so step-track gameplay carries over to LEO.

Campaign 1 never instantiates `OrbitalSatellite` → zero behavior change.

### D2 — Range plumbed into link budget via optional field

- Add `rangeKm?: number` to base `Satellite` (undefined by default).
- `antenna-core.ts` FSPL call becomes `sat.rangeKm ?? GEO_SATELLITE_DISTANCE_KM`. GEO sats keep the exact same constant → bit-identical Campaign 1 link budgets.

### D3 — LEO tracking reuses program-track

Program-track already re-points every frame to `predictedAz/El` with shortest-path azimuth. LEO needs only:

- An antenna config with adequate slew rate (`maxRate_deg_s: 3.0`, `azContinuous`, full el range) — Ku LEO config added/selected for the EU station.
- Antenna config key pass-through: new **optional** `GroundStationConfig` handling so the EU station's Ku config is honored. Campaign 1 configs keep resolving to the current default (no physics change).

### D4 — Pass planning as a service + Mission Control tab

- `src/services/pass-planner-service.ts`: samples `rae()` over a configurable horizon (e.g., 6–12 h at 30 s steps, bisection-refined AOS/LOS), returns `SatellitePass[] { satellite, aos, los, maxEl, maxElTime, durationS }`. Pure ootk + simulated clock; no dependency on equipment.
- New Mission Control tab "PASS SCHEDULE" listing upcoming contacts per orbital satellite (AOS/LOS in scenario time, max el, countdown). Registered only when the scenario contains orbital satellites → invisible to Campaign 1.

### D5 — Ku-band via configuration, not code forks

- `buc-module-core.ts`: output passband derived from state/config (defaults stay C-band 5.925–6.425 GHz).
- `lnb-module-core.ts`: LO from state (already supported) — EU station sets a Ku high-side/low-side LO so the downlink lands in the 950–2150 MHz IF; verify sideband handling and make passband config-driven with C-band defaults.
- EU ground station state sets Ku beacon frequency, spectrum analyzer defaults, BUC/LNB LOs.

### D6 — Video feed decoding = existing pipeline + LEO payload

- LEO downlink signal carries `feed: '/videos/blue-1.mp4'` (existing asset), QPSK, wide bandwidth. Receiver already renders it when locked with sufficient C/N; degradation effects already exist.
- Objectives use existing condition types (`receiver-signal-locked`, `rx-channel-status`, `rx-frame-sync-locked`) — no evaluator changes needed for the sandbox.

### D7 — NATS Europe theme: per-campaign body class + scoped `--mc-*` overrides

- Router/base-page adds `campaign-<id>` class to `<body>` on navigation.
- `tabler-overrides.css` gains a `.campaign-nats-eu` block overriding `--mc-accent-*` (red → North Sea blue/teal) and a couple of surface tints. Backward-compat var mapping cascades it everywhere. Layout, components, and typography unchanged → familiar but distinct.
- EU station name/wordmark comes from campaign/station data (already data-driven for cards; station name in ground-station config).

### D8 — Campaign 2 shell + validation sandbox

- `src/campaigns/nats-eu/`: `ground-stations.ts` (Ku LEO station in Europe with real lat/lon), `satellites.ts` (SGP4 LEO bird(s) with authored TLEs whose epoch aligns with `scenarioStartDate` so a pass occurs shortly after start), `sandbox.ts` (or scenario1) with objectives validating: acquire LEO via program-track, lock Ku downlink during the pass, decode video feed, check the pass schedule.
- Populate `natsEuCampaignData.scenarios`, unlock the campaign, add scenarios to the flat `SCENARIOS` array.
- TLE/epoch authored via a scratch ootk script so the first pass begins ~2–5 min after scenario start.

## Backwards-compatibility guarantees

| Change | C1 impact |
| --- | --- |
| `OrbitalSatellite` subclass | Never instantiated by C1 |
| `rangeKm?` on `Satellite` | `undefined` → same 38,000 km constant |
| BUC/LNB passband config | Defaults identical to current hardcoded values |
| Antenna config pass-through | Only honored via new optional field; C1 resolves to today's default |
| Pass Schedule tab | Registered only when orbital sats present |
| Body campaign class + scoped CSS | `.campaign-nats-eu` rules can't match C1 routes |
| Campaign/scenario registration | New unique ids (`nats-eu-*`); progress keyed per scenario id |

Verification: `npm run type-check`, full `vitest` suite (existing tests must stay green), plus new unit tests for `OrbitalSatellite` and the pass planner.

## Step order

1. `OrbitalSatellite` + simulated-time hookup + unit tests.
2. Range/FSPL plumbing in antenna-core.
3. Ku config unlock (BUC/LNB/antenna key pass-through).
4. Pass planner service + Pass Schedule tab.
5. NATS Europe campaign shell: station, satellites (authored TLE), sandbox scenario with objectives incl. video feed decode.
6. Theme: body class + `.campaign-nats-eu` CSS + card metadata.
7. Full regression run (type-check, unit tests), fix fallout, retro.

## Out of scope (later phases)

- Full EU scenario arc (scenarios 2+), new EU characters/voice audio, real Gantt in TimelineDeck, multi-station simultaneous RAE observers, auto-handover between EU stations, Doppler-compensating modems.
