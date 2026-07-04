# Phase 1 — Campaign 4 (9th EWS / Counter Communications Systems) Plan

## Goal

Activate **Campaign 4** — the pre-registered but disabled `ccsCampaignData` ("9th Electronic
Warfare Squadron", id `ccs`, `campaignType: 'Electronic Warfare'`) — as a **military
counter-communications** campaign with a distinct coyote-brown / "black ops" theme, and add the
mechanics needed for offensive SATCOM denial operations:

1. **X-band electronic-attack (EA) station** — a transportable X-band site (7.25–7.75 GHz down,
   7.9–8.4 GHz up), the real 9th EWS Counter Communications System (CCS) mission band.
2. **SATCOM denial (offensive uplink jamming)** — the operator points a jam antenna at a target
   satellite, transmits a jamming waveform into the target transponder, and drives a victim
   downlink's carrier-to-interference ratio below usable levels. Effect is *measured* via a
   look-through monitor receiver (J/S assessment).
3. **Multi-antenna coordination** — two antennas working together: one jamming the target, one
   monitoring the victim downlink for battle-damage assessment (look-through).
4. **Redundant hardware management** — primary/backup transmit chains (A/B); the primary chain
   suffers a scheduled hardware fault mid-mission and the operator must fail over to the backup to
   maintain the denial effect.
5. **Own-force deconfliction safety** — an instant-fail interlock (in the spirit of the existing RF
   safety invariants) if the jam waveform overlaps a protected friendly frequency.
6. **Cosmetic re-theme** — `.campaign-ccs` coyote-brown/black-ops palette, clearly distinct from
   Campaign 1 (red) and Campaign 2 (blue).

**Framing decision.** The campaign name (Counter Communications Systems / 9th EWS) and the "SATCOM
denial" brief make this an **offensive** campaign: the operator *is* the jammer denying an adversary
satellite's use, not a friendly station defending against jamming. Defensive skills (notch
filtering, link protection) appear only as the deconfliction interlock. This is the authentic 9th
EWS CCS mission.

**Hard constraint:** 100% backwards compatibility with Campaigns 1 (`nats`) and 2 (`nats-eu`). Every
new mechanic is opt-in via optional `SimulationSettings` blocks, optional config fields, additive
condition types, and CSS scoped to `body.campaign-ccs`. Defaults preserve all current behavior.

## Current-state findings (deep-dive summary)

### Already exists and is directly reusable

- **Campaign stub**: `ccsCampaignData` (id `ccs`, title "9th Electronic Warfare Squadron",
  `campaignType: 'Electronic Warfare'`, `difficulty: 'advanced'`) is defined in
  [campaign-data.ts](../src/campaigns/nats/campaign-data.ts) and already `registerCampaign`'d in
  [router.ts](../src/router.ts) `init()`. It is `isDisabled: true, disabledText: 'Access Denied'`
  with an empty `scenarios[]`. Activation = populate scenarios, flip the disable flag.
- **Uplink jammer**: `InterferenceManager` + `SimulationSettings.interferenceEvents` inject a
  duty-cycled `RfSignal` into `satellite.externalSignal`; the transponder relays it to all
  listeners. Reference use: `src/campaigns/nats/scenario21.ts:180`. This models a *scripted* jammer;
  Campaign 4 needs a *player-driven* one, but the physics path (transponder relays interferer → C/I
  on co-frequency downlink) is identical.
- **C/I and C/N models**: antenna RX C/I in `antenna-core.ts` (`updateRxSignals_`, spectral-overlap
  blocking/degradation) and receiver C/N in `receiver.ts` (`getSignalsInBandwidth`,
  `calculateInterferencePower_`, per-modulation required-C/N thresholds). A player carrier on the
  target uplink band therefore degrades a co-frequency downlink automatically — no new physics
  required to *cause* denial, only to *measure and gate* it.
- **X-band**: fully defined in `constants.ts` (`FrequencyBand.x`: down 7250–7750, up 7900–8400 MHz,
  `isRestricted: true` — the only restricted band, a natural access-control hook). Antenna configs
  `X_BAND_3M_ANTESTAR_RS` and `X_BAND_5M` already exist in `antenna-configs.ts` /
  `antenna-config-keys.ts`.
- **Transmit chain**: Transmitter modem → BUC → HPA → OMT(TX) → Antenna(TX) → Satellite is fully
  modeled with power budget, saturation, IMD. `InterferenceManager`-style relay works for the
  player's uplink too.
- **Fault injection**: `FaultInjector` (scriptable, priority-stacked, GS-scoped) + `fault-active` /
  `fault-cleared` conditions exist. `FaultInjector` targets today are payload/crypto/FEC only.
- **Notch filter**: `notch-filter-module-core.ts` + `notch-filter-configured` condition exist.
- **Per-module power toggles** and `setTransponderActive()` allow disabling/enabling equipment.
- **Multi-antenna plumbing**: `GroundStation` holds `antennas: AntennaCore[]`, `createEquipment_()`
  iterates `config.antennas`, and `wireEquipment_()` already contains 2-antenna routing logic
  (RF/tx/rx `index < 2 ? 0 : 1`; spectrum analyzers split first-two/next-two).
- **Optional-settings idiom**: `interferenceEvents`, `weatherEvents`, `trafficOwnership`,
  `workingDocument` show the established backward-compatible pattern — new optional arrays/objects on
  `SimulationSettings`, read by a service that no-ops when absent.
- **Tab registration idiom**: the Pass Schedule tab (Campaign 2) registers only when the scenario
  contains orbital satellites — the model for a Campaign-4-only "EA Assessment" tab.
- **Per-campaign theme idiom**: router sets `body.campaign-<id>` from the route; `.campaign-nats-eu`
  in `tabler-overrides.css` reassigns `--mc-accent-*` / surface `--mc-*` values (and the matching
  `--tblr-*` with `!important`), leaving `--mc-danger*` red. `index.css` maps legacy `--color-*`
  through `--mc-*`, so scoped overrides cascade everywhere.

### Gaps that must be built (all feature-gated)

- **Player-driven denial assessment**: no J/S computation, no "is the victim link denied?" gate, no
  EA assessment surface. (The *cause* exists via C/I; the *measurement + objective gate* do not.)
- **Redundant / A-B / failover hardware**: no primary/backup, standby, health/MTBF, or failover
  concept anywhere. `FaultInjector` cannot target RF-chain hardware (antenna/BUC/HPA) yet.
- **Multi-antenna coordination**: plumbing present but unused — every shipped station declares one
  antenna, and `satellite-config-factory.ts` hardcodes `antennaIndex = 0`. No per-antenna
  target assignment, no UI antenna selector, and condition types assume antenna 0.
- **X-band RF-front-end preset**: BUC/HPA/LNB defaults are C-band; no X-band preset (configurable
  via `createRfFrontEnd` overrides — no engine change).
- **Own-force deconfliction interlock**: no "don't jam protected friendly frequencies" check.
- **Dual-transmission interlock**: per project memory an insta-fail exists at the scenario/handover
  layer, but the transmitter path has no aggregate single-emitter check. Confirm during
  implementation; the deconfliction interlock (D6) is the CCS-relevant safety, not this.

## Design decisions

### D1 — Fix the `ccs` id collision, then activate the campaign

Both `ccsCampaignData` and `geolocationCampaignData` currently share `id: 'ccs'` (pre-existing bug).
Rename the geolocation campaign's id to `ccs-geo` (it stays disabled — a future Campaign 5). Keep
Campaign 4 as `id: 'ccs'` so the route is `/campaigns/ccs`, the body class is `.campaign-ccs`, and
progress keys are stable. Set `ccsCampaignData.isDisabled = false`, populate `scenarios`, and give it
its own `imageUrl` (currently every campaign reuses the NATS card art).

### D2 — CCS EA station config (multi-antenna, X-band) — `src/campaigns/ccs/`

New directory mirroring `nats-eu/`:

- `ground-stations.ts` — `ccsFieldSite` (`GroundStationConfig`), a transportable X-band EA site with
  **two antennas** baked into `config.antennas`:
  - **JAM antenna** — `X_BAND_5M` (5 m, TX 7.9–8.4 GHz, high slew), primary electronic-attack aperture.
  - **MONITOR antenna** — `X_BAND_3M_ANTESTAR_RS` (3 m, RX 7.25–7.75 GHz), look-through/BDA aperture.
  - Two `rfFrontEnds` (X-band presets) and per-antenna `antennasState[]`, wired by the existing
    2-antenna logic in `GroundStation.wireEquipment_()`.
- `satellites.ts` — a **TARGET adversary satellite** (X-band transponder carrying a scripted
  "victim" downlink the operator must deny) plus, optionally, a nearby **PROTECTED friendly
  satellite** on an adjacent frequency (for the deconfliction interlock). GEO is fine (no LEO
  tracking needed); reuse the base `Satellite` class — Campaign 4 needs no `OrbitalSatellite`.
- **Bake full per-antenna config into the station** (as `nats-eu` bakes its Ku chain) rather than
  touching `satellite-config-factory.ts`'s hardcoded `antennaIndex = 0`. Lowest-risk path to
  multi-antenna, and factory stays untouched → zero risk to Campaigns 1/2.
- **X-band RF front end** via `createRfFrontEnd(base, overrides)` deep-merge: set BUC LO / passband
  and LNB LO for the X-band plan (BUC/filter passband is already state-driven per the Campaign 2
  retro). No engine change; it is a config object.

### D3 — Multi-antenna coordination: optional `antennaIndex` on conditions + ACU selector

- Add optional `antennaIndex?: number` to the relevant `ConditionParams` (`antenna-locked`,
  `antenna-tracking-mode-set`, `antenna-position`, `signal-detected`/beacon checks). Evaluator reads
  `antennas[params.antennaIndex ?? 0]` → **default 0 preserves every existing scenario**.
- ACU tab: render an antenna selector **only when `station.antennas.length > 1`** (gated exactly like
  the Pass Schedule tab). Single-antenna stations (Campaigns 1/2) see no change.
- Coordination objective: assign the JAM antenna to the target satellite and the MONITOR antenna to
  the victim downlink, both locked simultaneously.

### D4 — SATCOM denial: player uplink jam + J/S assessment service + EA tab

- **Cause (reuses existing physics):** operator configures a TX modem (wideband/barrage or CW),
  routes it BUC → HPA → JAM antenna, points at the target satellite on the target transponder's
  uplink band. The transponder relays the jammer (existing `processSignals` path), raising
  interference power on the co-frequency victim downlink → its C/I/C-N drops (existing
  `antenna-core` / `receiver` models).
- **Measure (new):** `src/services/jamming-assessment-service.ts` — a pure service (mirrors
  `pass-planner-service.ts`) that, when `settings.electronicAttack` is present, computes the **J/S
  ratio** at the target transponder input (player jammer power vs. victim carrier power, both after
  path/antenna gain) and the victim downlink C/N as seen by the MONITOR receiver. No dependency on
  equipment internals beyond reading the current signal set.
- **Surface (new, gated):** an "EA ASSESSMENT" Mission Control tab showing J/S, victim C/N, and a
  DENIED/DEGRADED/NOMINAL status. Registered only when the scenario has an `electronicAttack` block →
  invisible to Campaigns 1/2.
- **Gate (new, additive conditions):**
  - `jamming-uplink-active` — a TX modem is transmitting a jam waveform within the target uplink band
    at/above a minimum EIRP (composed on top of existing `tx-modem-transmitting` + frequency-window
    check).
  - `jamming-effective` — J/S ≥ `minJtoS` **or** victim C/N ≤ `maxVictimCN`, observation-gated on the
    EA Assessment tab (reuse `requiresObservation` / `observationTab`).
  - Also add optional `maxCNRatio` to the existing `receiver-snr-threshold` (additive, optional) so a
    monitor receiver can assert "victim link C/N has been pushed below X" without a bespoke condition.

### D5 — Redundant hardware management: A/B chains + scheduled hardware fault + failover

- **Config (opt-in):** the CCS station declares primary (chain A) and backup (chain B) transmit
  chains — two `rfFrontEnds` each with BUC+HPA, or a `redundancyConfig` naming the A/B module ids.
- **Fault (new, symmetric with `interferenceEvents`):** add optional
  `SimulationSettings.hardwareFaultEvents?: HardwareFaultEvent[]` — time-scheduled events that flip a
  targeted RF-chain module to `isFaulted` / unpowered (e.g. "chain A HPA thermal trip at T+6 min").
  Implemented by extending `FaultInjector` with RF-chain targets (`FaultTarget` += `'hpa' | 'buc' |
  'transmit-chain'`) or a small `HardwareFaultManager` in the `InterferenceManager` mold. Absent
  block → no-op → Campaigns 1/2 unaffected.
- **Failover (new, additive conditions):**
  - `active-transmit-chain` — param `chain: 'A' | 'B'`; asserts which chain is carrying the live
    transmit signal (backup powered + transmitting AND primary down).
  - Reuse `fault-active` / `fault-cleared` for the injected primary-chain fault, and
    `equipment-powered` / `equipment-not-powered` for the manual power steps.
- **Objective flow:** primary chain faults mid-jam → EA Assessment shows the denial lapse → operator
  detects the alarm, powers up chain B, re-establishes the jam within a `timeLimitSeconds` (with a
  `timePenalty` for a long denial gap).

### D6 — Own-force deconfliction interlock (safety, instant-fail)

- Add optional `SimulationSettings.protectedFrequencies?: ProtectedBand[]` (friendly bands that must
  never be jammed).
- When `electronicAttack` is active and the player's jam waveform overlaps a protected band, trigger
  an instant-fail in the same style as the existing HPA/dual-transmission safety invariants (a
  scenario-fail event + ops-log entry). Feature-gated: only armed when `electronicAttack` is present,
  so it cannot fire in Campaigns 1/2.
- Teaches the real EW discipline: deny the adversary without fratricide against friendly SATCOM.

### D7 — X-band access authorization (narrative gate, reuses `status-check`)

X-band is `isRestricted: true`. Open the scenario with a `status-check` quiz objective confirming
frequency-use authorization / rules of engagement before transmit is enabled (pure UI/quiz — no
engine change). Adds mission flavor and reinforces the restricted-band concept.

### D8 — `.campaign-ccs` coyote-brown / black-ops theme

Add one scoped block to `tabler-overrides.css` after the `.campaign-nats-eu` block, mirroring its
structure exactly:

- **Accent group → coyote brown** (`--mc-accent-red`, `-bright`, `-light`, `-dark`, the `-rgb`
  triplets, `--mc-accent-text-dark`): coyote brown / field tan family (e.g. base `#7a6034`–`#a0824f`
  range; tune live). Drives buttons, tabs, sliders, active states, focus glows, `.text-primary`.
- **Matching `--tblr-*`** (`--tblr-primary`, `-rgb`, `-text-emphasis`, `-bg-subtle`,
  `-border-subtle`, `--tblr-link-color`, `--tblr-link-hover-color`) with `!important` (to beat the
  base `!important`).
- **Surfaces → black-ops dark, warm-neutral tint** (`--mc-surface-0..4`, `--mc-border`, and the
  `--tblr-body-bg`/`-secondary-bg`/`-tertiary-bg`/`-border-color` with `!important`): near-black with
  a faint warm/olive cast to read as ruggedized field gear rather than the cool grey of Campaign 1.
- **Do NOT override** `--mc-danger*` — alarms/faults stay red in every campaign (matches the
  established convention; important because denial-lapse and hardware-fault alarms must read as red).
- Watch the known non-re-skinning literals surfaced in the Campaign 2 retro (success `#22c55e`,
  warning `#eab308`, power-meter LEDs, and `--color-text-*` literals in `index.css`) — acceptable as
  status colors; only widen scope if the military look demands it.
- Give the campaign its own card art (`imageUrl`) so the selection screen reads distinct.

### D9 — Validation sandbox scenario (the one scenario this phase ships)

`src/campaigns/ccs/scenario1.ts` (a Sandbox-type validation mission, `missionType: 'Sandbox'` so it
is excluded from progress %) exercising **every** new mechanic end-to-end. See the spec below.

## New condition types (all additive — absent params default to today's behavior)

| Condition type | Purpose | Backward-compat |
| --- | --- | --- |
| `jamming-uplink-active` | Player TX modem transmitting a jam waveform in the target uplink band ≥ min EIRP | New type; unused by C1/C2 |
| `jamming-effective` | J/S ≥ `minJtoS` or victim C/N ≤ `maxVictimCN` (observation-gated) | New type; unused by C1/C2 |
| `active-transmit-chain` | Asserts chain A/B is the live emitter (failover) | New type; unused by C1/C2 |
| `antennaIndex?` param | Target a specific antenna in existing antenna conditions | Optional; `?? 0` = today |
| `maxCNRatio?` param on `receiver-snr-threshold` | Assert a link's C/N was pushed *below* a value | Optional; only `minCNRatio` used today |

No existing condition type is modified in a breaking way; only optional params are added.

## Sandbox scenario spec — "Blackout" (`ccs-scenario1`, Sandbox)

Single field EA mission validating the full Campaign 4 feature set. GEO target; no LEO tracking.

- **Setup**: `ccsFieldSite` (2 antennas, A/B transmit chains, X-band), target adversary satellite
  with a scripted victim downlink transponder, one protected friendly satellite on an adjacent band,
  a `hardwareFaultEvents` entry (chain-A HPA trip ~T+6 min), `electronicAttack` + `protectedFrequencies`
  blocks set.
- **Objectives (chained via `prerequisiteObjectiveIds`, `AND` logic):**
  1. **Confirm frequency authorization** (`status-check`) — ROE / restricted-band quiz. *(D7)*
  2. **Coordinate apertures** — assign JAM antenna (`antennaIndex: 0`) to the target and MONITOR
     antenna (`antennaIndex: 1`) to the victim downlink; both locked. Uses `antenna-locked` +
     `antenna-tracking-mode-set` with `antennaIndex`. *(D3, X-band via D2)*
  3. **Establish the denial effect** — configure the jam waveform on the target uplink band, bring up
     chain A (BUC→HPA), transmit, and drive the victim link down: `jamming-uplink-active` +
     `jamming-effective` (observation-gated on EA Assessment tab). *(D4)*
  4. **Deconfliction check (hidden safety)** — a `hidden` guard: overlapping the protected band =
     instant fail. Passing the mission without tripping it demonstrates the interlock. *(D6)*
  5. **Fail over to the backup chain** — chain-A HPA faults (~T+6 min); detect the alarm
     (`fault-active`), power up chain B, and restore the effect: `active-transmit-chain` (chain `B`) +
     `jamming-effective` again, under a `timeLimitSeconds` with a `timePenalty`. *(D5)*
  6. **Cease fire** (optional) — stop transmit cleanly (HPA down before BUC, per existing RF safety),
     confirm the victim link recovers (BDA on the monitor).
- **Dialog**: minimal, `Character.SYSTEM` for the quiz (matches qualified-operator convention);
  objective descriptions carry the instruction.

## Backwards-compatibility guarantees

| Change | C1/C2 impact |
| --- | --- |
| Rename `geolocationCampaignData` id → `ccs-geo` | Fixes a live duplicate-id bug; campaign stays disabled |
| Activate `ccsCampaignData` (unique id `ccs`) | New route/body-class/progress keys; nothing shared |
| `src/campaigns/ccs/*` station + satellites | Only referenced by Campaign 4 scenarios |
| X-band RF front end via `createRfFrontEnd` overrides | Config object; C-band defaults untouched |
| Two antennas baked into `ccsFieldSite` | Uses existing `wireEquipment_` 2-antenna path; C1/C2 stay single-antenna |
| `antennaIndex?` on conditions | `?? 0` → identical evaluation for all existing scenarios |
| `maxCNRatio?` on `receiver-snr-threshold` | Optional; existing scenarios use only `minCNRatio` |
| `electronicAttack`, `protectedFrequencies`, `hardwareFaultEvents` settings | Optional; services no-op when absent |
| `jamming-*`, `active-transmit-chain` condition types | Additive; never referenced by C1/C2 |
| EA Assessment tab | Registered only when `electronicAttack` present |
| `FaultInjector` RF-chain targets | Additive to the target enum; existing templates unchanged |
| Deconfliction instant-fail | Armed only when `electronicAttack` present |
| `.campaign-ccs` CSS + card art | Scoped selector can't match C1/C2 routes |

Verification: `npm run type-check`, full `vitest` suite green, new unit tests for the jamming
assessment service and the failover/deconfliction condition evaluators, and (per the Campaign 2
retro's lesson) a live dev-server + Playwright run of `ccs-scenario1` to confirm real J/S / C/N
levels and the EA Assessment + antenna-selector rendering — not just unit-level physics.

## Step order

1. **Campaign shell + id fix + theme**: rename `ccs-geo`, activate `ccsCampaignData`, add
   `.campaign-ccs` theme block and card art. (Visible, low-risk, unblocks manual UI testing.)
2. **X-band multi-antenna station**: `src/campaigns/ccs/ground-stations.ts` + `satellites.ts` (X-band
   RF presets, 2 antennas). Add `antennaIndex?` to conditions + ACU antenna selector.
3. **Denial mechanic**: `jamming-assessment-service.ts` + EA Assessment tab + `jamming-uplink-active`
   / `jamming-effective` conditions + `maxCNRatio` param. Unit tests for J/S math.
4. **Redundancy**: `hardwareFaultEvents` + `FaultInjector` RF-chain targets + `active-transmit-chain`
   condition. Unit tests for failover evaluation.
5. **Deconfliction interlock**: `protectedFrequencies` + instant-fail guard. Unit tests.
6. **Sandbox scenario** `ccs-scenario1`: wire all objectives; register in both `campaign-data.ts`
   `scenarios[]` and the flat `SCENARIOS` array in `scenario-manager.ts`.
7. **Regression + live run**: `npm run type-check`, full `vitest`, dev-server + Playwright
   walkthrough; fix fallout; write the retro.

## Out of scope (later phases)

- Full 9th EWS scenario arc (scenarios 2+), voiced characters, mission-brief MDX docs.
- Geolocation / direction-finding campaign (the `ccs-geo` / 22nd EWS stub) — its own future campaign.
- Diversity combining or N>2 antenna arbitration; automatic (non-manual) failover.
- Realistic per-technique jam waveforms (swept/pulsed/deceptive) beyond barrage vs CW.
- LEO/mobile target tracking for EA (reuse Campaign 2's `OrbitalSatellite` if a moving target is
  wanted later).
- Terrestrial/single-station-only jammers (current interference model relays through the transponder).
