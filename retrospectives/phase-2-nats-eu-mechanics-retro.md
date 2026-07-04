# Retrospective — nats-eu (Campaign 2) engine mechanics build

**Scope:** Implemented all eight new mechanics (M1–M8) from `plans/phase-1-nats-eu-campaign-design-plan.md` at the engine layer, plus a Campaign-2 sandbox that turns them all on and an automated proof test. Did NOT build the interactive Mission Control console UIs (deferred — see below).

## What was built
- **7 new singleton managers** (one per `src/<mechanic>/` dir), each following the established opt-in pattern (`getInstance`/`isInitialized`/`destroy`, config read from `ScenarioManager.settings.<block>`):
  - M1 `LinkBudgetManager` — Friis C/N worksheet + margin commit.
  - M2+M5 `CommandingManager` — uplink Doppler comp, TT&C command queue with window/key gating, key rotation, zeroize (M2 and M5 share the command link, so one manager).
  - M3 `ContactScheduleManager` — multi-station pass allocation + same-station overlap conflict detection.
  - M4 `SpaceEventManager` — scheduled maneuver → stale ephemeris → operator loads updated TLE.
  - M6 `SecurityConsoleCore` — SOC-lite audit log (time-scheduled entries + injected anomalies) + access-control accounts.
  - M7 `TransecManager` — fixed/hopping waveform + keyed hop-sync lock.
  - M8 `GnssThreatManager` — spoof window, timing-offset drift, reference-mode defense.
- **15 new `ConditionType`s** + params in `objective-types.ts`, with one-line pass-through evaluators in `objectives-manager.ts`.
- **7 opt-in `SimulationSettings` blocks** (inline structural types, matching the `electronicAttack` convention to avoid an import cycle).
- **`OrbitalSatellite.reloadTle()`** — runtime TLE swap (M4), backward-compatible.
- **`SimulationManager.hasInstance()`** — lets M4 touch the sim only when one is running (test-safe).
- Lifecycle wired in `base-page.ts` (start), `mission-control-page.ts` + `sandbox-page.ts` (destroy).
- `src/campaigns/nats-eu/sandbox.ts` enabling all blocks; registered in both `SCENARIOS` and `natsEuCampaignData.scenarios`.
- `test/campaigns/nats-eu-mechanics.test.ts` — 9 tests, drives each manager from the REAL sandbox settings and asserts the exact predicate each condition evaluator reads.

## What worked
- The EA/geolocation opt-in pattern is a clean template; copying it kept all mechanics backward-compatible (no other campaign instantiates them) and made the wiring mechanical.
- Extracting pure logic (Friis calc as a static, conflict detection, spoof drift) made everything unit-testable without the sim/DOM — the proof test runs in ~6 ms of actual test time.
- Both scored scenarios and sandboxes share `BasePage.initializeObjectivesAndDialogs_`, so a single start block covers both entry paths.

## What didn't / watch-outs
- **Console UI not built.** The mechanics evaluate and are proven, but operator-facing Mission Control tabs (link-budget, commanding, contact-schedule, security consoles) were intentionally NOT added — the shared `tabbed-canvas` render path is used by every campaign and the plan scopes console UI to build phases B–D. In-app today, M4/M8 progress on their own (time-driven); M1/M2/M3/M5/M6/M7 need their UI before a human can drive them. **This is the top follow-up.**
- `SandboxPage.destroy()` was already missing a `GeolocationConsoleCore.destroy()` (pre-existing); I added my 7 but left that gap alone.
- M4's sandbox `newTle` reuses a valid SAR-2 element set (only RAAN/mean-anomaly nudged) to guarantee ootk parses it — not a real post-maneuver propagation.

## What to change next time
- Build a shared, minimal "console panel" helper so adding a gated tab is low-risk, then wire the four console tabs in one pass.
- Consider consolidating the per-mechanic manager dirs if the count keeps growing (7 added here).
