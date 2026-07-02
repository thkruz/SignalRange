# Phase 1 — Campaign 2 (NATS Europe) Orbital Foundations Retro

## What worked

- **Subclass-based opt-in (`OrbitalSatellite extends Satellite`)** delivered real SGP4 physics with zero campaign 1 changes. Because every consumer (program-track, lock checks, link budget, dashboards) reads `sat.az/el`, keeping those fields fresh from `ootk.Satellite.rae()` made all downstream systems work unmodified.
- **The codebase was more Ku/LEO-ready than expected**: BUC/LNB LOs and passbands are fully state-driven (no code changes for Ku), the ACU tab already anticipated a LEO orbit type, `natsEuCampaignData` was pre-registered, and the receiver already renders video feeds with degradation. Most "features" were configuration + one new antenna config.
- **Authoring TLEs by grid search** (RAAN × mean anomaly against the scenario epoch, validated with ootk itself) gave deterministic pass timing: AOS T+2 min / max el 88° / LOS T+14.5, second bird at T+17.5. Unit tests assert the same numbers, so any propagation regression breaks CI.
- **Simulated-clock integration via `OpsLogManager`** (`sim-time.ts` facade) means passes pause with the scenario, follow `scenarioStartDate`, and survive checkpoint restores (the `Math.abs` throttle guard).
- Deep-dive with parallel exploration agents up front made every subsequent edit surgical — no dead-end refactors.

## What didn't

- The station config's existing `antennas: [...]` array turned out to be **ignored** by mission control's `GroundStation` (always factory default). Honoring it would have silently changed campaign 1 physics (9m vs 3m dish), so a new opt-in `antennaConfigKey` field was added instead. The dead field remains a foot-gun worth cleaning up someday.
- RF power levels for the MERIDIAN downlinks (video 22 dBm, beacon 0 dBm) were set by **relative calibration** against TIDEMARK's GEO numbers (~22 dB FSPL advantage, +12 dB antenna gain at Ku), not by driving the live app. Rough link-budget math says C/N ≈ 25-30 dB mid-pass, comfortably above QPSK lock thresholds, but a live run should confirm before the scenario ships.
- `ccsCampaignData` and `geolocationCampaignData` share `id: 'ccs'` (pre-existing bug) — worth a fix when those campaigns activate.
- Scratchpad scripts can't resolve repo node_modules on Windows; had to copy the TLE-authoring script into the repo root to run it.
- **First theme pass missed hardcoded reds.** The scoped `--mc-*` override only re-skins variable consumers; live testing surfaced ~30 hardcoded `#ba160c`/`rgba(186, 22, 12, …)` literals (AUTO-TUNE button, focus rings, modal accents) plus a cascade bug: `index.css` loads *after* `tabler-overrides.css` and re-declared `--color-primary` & friends as `!important` literals, so the legacy-var mapping never actually applied. Fixed by routing every brand red through `--mc-accent-red*` / `--mc-accent-red-rgb` (with the old literals as fallbacks) and adding campaign-independent `--mc-danger*` variables so alarm/fault reds (status badges, alarm bar, quiz-incorrect) stay red in every campaign.

## What to change next time

- Run the app end-to-end (dev server + Playwright) as part of the phase to validate live signal levels and the Pass Schedule tab rendering, not just unit-level physics. An `e2e-scenario-test` for `nats-eu-scenario1` is the natural next artifact.
- Keep the TLE-authoring script as a checked-in dev tool (`scripts/`) instead of a throwaway — every future EU scenario needs pass timing authored against its start epoch.
- Multi-station RAE is still single-observer (az/el stored on the satellite, computed against one `GroundObject`). Before an EU multi-station handover scenario, decide whether to move relative telemetry onto the ground station side.
- Doppler is downlink-only; uplink Doppler compensation could become a future training objective (it's a real LEO ops task).
