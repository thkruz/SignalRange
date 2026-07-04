# NATS-EU Campaign Design Plan — "Campaign 2: European Operations"

**Status:** Draft for review
**Scope:** High-level design for the full 24-scenario `nats-eu` campaign: narrative, per-scenario mechanics, new engine mechanics required, NICE/NIST outcome mapping, and build sequencing.
**Follow-on:** Each build phase (A–D, §9) gets its own `plans/phase-<n>-nats-eu-*.md` when work starts. Once approved, promote a copy of this document to `docs/nats-eu/nats-eu-campaign-plan.md` as the canonical campaign plan (mirroring `docs/nats/nats-campaign-plan.md`).

---

## 1. Locked design decisions

Confirmed with the project owner (2026-07-03):

| Decision | Choice |
|---|---|
| Campaign size | **24 scenarios, 3×8 mirror of NATS** (8 learn / 8 qualified / 8 crisis) |
| Cyber layer | **SOC-lite hybrid** — RF/COMSEC remains the core cyber surface; add ONE lightweight Security console (audit log + access control). No IP/packet network simulation. |
| New cyber mechanics (all greenlit) | GNSS spoofing/timing attack · TRANSEC anti-jam waveforms · Command-link auth & key ops · Audit-log/anomaly console |
| New space mechanics (all greenlit) | LEO uplink ops (Doppler + TT&C) · Multi-station pass scheduling · Link-budget/EIRP planning console · Space-domain events (maneuvers/stale TLEs) |
| Narrative POV | Player is the **NATS Campaign 1 graduate** who transfers to Galway. Charlie Brooks is **site lead**: he teaches only NEW mechanics, treats the player as a qualified peer. Campaign assumes Campaign 1 completion (prerequisite). |
| NICE catalog | **Expand** the `nist-nice-reviewer` skill catalog with official NICE cyber-defense work-role files (Protection & Defense category) so cyber objectives map to codes that actually describe them. |
| Cross-campaign reuse | **Keep ccs and signal-hunter mechanics exclusive.** No player-driven jamming (EA manager) and no TDOA/FDOA geolocation console in nats-eu. Scripted `interferenceEvents` (a NATS Campaign 1 mechanic, see scenario21) IS available. |
| Phase 3 tone | **Escalating adversary arc** — one ambiguous gray-zone adversary thread builds across S17–S24: interference → spoofing → crypto probing → coordinated capstone. |

## 2. Campaign identity

- **Id:** `nats-eu` (already registered, `isLocked: false`). Extract `natsEuCampaignData` out of `src/campaigns/nats/campaign-data.ts` into `src/campaigns/nats-eu/campaign-data.ts` as part of Phase A.
- **Title:** North Atlantic Teleport Services EU · **Subtitle:** Commercial LEO Ground Station Operations
- **Difficulty:** `intermediate` (prerequisite: `nats-scenario24` or at minimum `nats-level-8-night-shift` — decide during Phase A; recommend gating on Campaign 1 graduation S8, not full completion, so players aren't blocked by 16 mastery levels).
- **Theme:** existing `body.campaign-nats-eu` maritime-blue re-theme (`#0f62ac` accent) — no changes needed.
- **Scenario ids:** uniform `nats-eu-scenarioN` / urls `nats-eu/scenarios/nats-eu-scenarioN` (do NOT repeat the `nats-level-8-night-shift` id inconsistency).
- **Dual registration rule applies:** every scenario goes in BOTH `natsEuCampaignData.scenarios` and `SCENARIOS` in `src/scenario-manager.ts`.

### 2.1 Sites

| Station | Location | Role |
|---|---|---|
| **GW-01 Galway** (exists) | 53.27 N, −9.05 W, Ireland | Primary. 4 m Ku LEO tracker (`KU_BAND_4M_LEO_TRACKER`), LNB LO 13100 / BUC LO 12600. |
| **SH-02 Shetland** (new, Phase B) | ~60.15 N, −1.15 W, Scotland | Second EU site (SaxaVord-flavored). Higher latitude → complementary LEO pass geometry (more passes/day on sun-sync birds). Same Ku plan, deliberately similar RF front end so the mechanic being taught is *scheduling*, not new hardware. |

Set `antennaConfigKey` on both stations (the `antennas: []` array is a known dead field — see Campaign 2 retro).

### 2.2 Satellite roster

| Satellite | Status | Notes |
|---|---|---|
| MERIDIAN-SAR-1 (61701) | exists | Sun-sync SAR imager, Ku video downlink + TT&C transponder. |
| MERIDIAN-SAR-2 (61702) | exists | Same, offset plane. Performs the S7 conjunction-avoidance maneuver. |
| MERIDIAN-SAR-3 (new) | Phase C | The S11–S12 LEOP arc bird: launched with a coarse injection TLE, commissioned by the player. |
| MERIDIAN-SAR-4 (new, optional) | Phase D | Background growth; appears in the S24 capstone pass plan. Cut if pass-authoring cost is too high. |

All new birds are `OrbitalSatellite` with grid-search-authored TLEs (see §6, check in the authoring script). Uplink arrays gain TT&C signals once M2 (uplink ops) lands.

### 2.3 Character roster

Immutable after S8, per NATS convention. New characters need `Character` enum entries, avatars, and audio pipeline slots.

| Character | Role | Voice sketch |
|---|---|---|
| **Charlie Brooks** (exists) | GW-01 site lead, player's boss. Teaches NEW mechanics only — never re-explains Campaign 1 material or UI basics. | Established: British, dry, direct. More collegial than in C1 — the player is a peer now. |
| **Fiona MacLeod** (new) | SH-02 Shetland operator; the player's cross-station peer (Catherine Vega analog). | Shetlander; practical, weather-obsessed, understated humor. |
| **Anneke Visser** (new) | MERIDIAN constellation ops engineer (satellite operator HQ, Rotterdam). Spacecraft-side context, commanding coordination, LEOP lead (Marcus Chen analog). | Precise, procedural, warm under pressure. |
| **Erik Halvorsen** (new) | Customer: senior analyst, Nordic Maritime Watch (SAR imagery tasking). SLA/impact pressure (James Okafor analog). | Direct, mission-focused, talks vessels-and-coverage not RF. |
| **Priya Sharma** (new) | NATS Group Security / CSIRT lead. Drives the Phase 3 adversary arc: triage calls, reporting standards, escalation authority (debuts S17; brief cameo possible S6). | Calm, methodical, evidence-first. |
| **Dana Torres** (exists) | One congratulatory text cameo at S8 graduation. No other appearances. | Established. |
| **SYSTEM** | Player's own checklist voice for all `status-check` quizzes. | Established convention. |

Dialog density: Phase 1 ≈ 10–16 clips (qualified peer learning a new domain — half the NATS Phase 1 density, zero UI coaching); Phase 2–3 obey the nats-campaign-builder cap of 3–7 clips (8–10 for S24). Text-message intros canonical from S9.

---

## 3. The 24-scenario arc

Slot-position variation deliberately mirrors the NATS column pattern (+1 rounds, +2 customer, +3/+4 arc, +8 capstone).

### Phase 1 — Foundations: "New Domain" (S1–S8)

One new mechanic per scenario. Commissioning-of-GW-01 frame runs through the phase, which is what unlocks the nearly-untouched **System Testing & Evaluation (DD-WRL-007)** work role.

| # | Title / Subtitle | New mechanic | Key conditions (● = new type) | Primary NICE |
|---|---|---|---|---|
| 1 | **First Light Over Galway** / LEO Pass Operations *(exists — retrofit only)* | LEO pass fundamentals: pass schedule, program-track, video decode, second contact | `tab-active`, `antenna-tracking-mode-set`, `signal-detected`, `receiver-signal-locked`, `receiver-snr-threshold` | S0421, T0153, K1032 |
| 2 | **Proving the Link** / Acceptance Testing & Link Budgets | **M1 Link-budget/EIRP console**: compute predicted C/N for the next pass from slant range/FSPL/gains, set BUC gain + HPA backoff per budget, verify margin during the pass (commissioning test card) | ●`link-budget-computed`, ●`link-margin-met`, `buc-gain-set`, `hpa-back-off-set` | T0080, S0015, S0842, K0740 |
| 3 | **Two-Way Street** / First Commanding Window | **M2 LEO uplink ops**: uplink Doppler compensation, TT&C command sent and ACKed inside a pass window | ●`uplink-doppler-comp-enabled`, ●`command-acknowledged`, `tx-modem-transmitting`, `hpa-enabled` | T1567, K1032, K0773 |
| 4 | **Keys to the Bird** / Command-Link COMSEC | **M5 Command-link auth & key ops**: load/verify keys, crypto ACTIVE both directions, scheduled rotation, auth-tag verification | `tx-crypto-status`, `tx-key-status`, `rx-crypto-status`, ●`key-rotation-completed` | K0874, K0875, K0876, K0728, S0077 |
| 5 | **Shetland Comes Online** / Two-Station Pass Network | **M3 Multi-station scheduling**: SH-02 debut (Fiona), allocate the day's contacts across sites, resolve an overlap conflict | ●`contact-assigned`, ●`contact-plan-valid`, `ground-station-selected` | K0689, T0129, K0737 |
| 6 | **Watch the Watchers** / Station Security Baseline | **M6 Security console (SOC-lite)**: review station audit log during a routine shift, find a benign anomaly (contractor account misconfig), apply access-control hygiene | ●`audit-log-reviewed`, ●`security-event-acknowledged`, ●`access-control-set` | K0685, K0686, S0844, T1569 |
| 7 | **Moving Target** / Ephemeris Management | **M4 Space-domain events**: SAR-2 conjunction-avoidance burn → pass predictions degrade → load updated TLE, reacquire | ●`ephemeris-updated`, `antenna-beacon-locked`, `signal-detected` | K1032, T0431, T1138 |
| 8 | **Night Passes** / Solo Evaluation *(graduation)* | Recombination, no new mechanics: 4 contacts across 2 stations overnight with embedded faults (key mismatch, schedule conflict, budget shortfall). Dana cameo text. | Mix of S1–S7 conditions + `fault-cleared` | T0081, S0421, S0582, T0153 |

### Phase 2 — Qualified Operations: "Running the Network" (S9–S16)

Solo shifts, customers, judgment. Charlie hands-off; Erik (customer) and Anneke (constellation ops) carry pressure. Unlocks the **Data Analysis (IO-WRL-001)** role and contingency/testing depth.

| # | Title / Subtitle | Exercised mechanics | Distinguishing conditions | Primary NICE |
|---|---|---|---|---|
| 9 | **Morning Constellation** / Network Health & Daily Pass Plan | Compressed multi-bird, two-station health check + build the day's contact plan. No new mechanics, no coaching. | `gpsdo-locked`, `contact-plan-valid`, `receiver-signal-locked` | T0153, T0431, S0421 |
| 10 | **Priority Tasking** / Urgent Collect, Low Pass | Erik's urgent SAR collect only fits a low-elevation pass: link-budget tradeoffs, EIRP up without overdriving, margin management | `link-margin-met`, `hpa-not-overdriven`, `receiver-snr-threshold` | S0478, T1580, K0740 |
| 11 | **LEOP: Launch Day** / SAR-3 First Acquisition *(arc 1/2)* | New bird with coarse injection TLE: widened beacon search, first acquisition, initial state-of-health. Anneke leads. | `ephemeris-updated`, `antenna-beacon-locked`, `signal-detected` | T0513, S0630, K1032 |
| 12 | **LEOP: Commissioning** / SAR-3 Acceptance Tests *(arc 2/2)* | Execute the payload acceptance test plan: command checkout, first video decode, test-result recording (Working Document), delivery to customer | `command-acknowledged`, `receiver-signal-locked`, `status-check` w/ documentLine | T1092, T1611, S0842, T1506 |
| 13 | **The Numbers Don't Lie** / Pass-Performance Trending | Trend analysis over pass history: C/N declining at GW-01 only → isolate cause (feed degradation vs TLE aging vs LNB drift); short report | ●`pass-history-reviewed` *(or reuse tab + quiz)*, `lnb-noise-performance` | T0349, S0646, S0892, K0064 |
| 14 | **Atlantic Low** / Weather Reallocation Judgment | Storm over Galway in a high-priority window: Ku rain fade math, feed heater, decide ride-out vs reallocate contacts to SH-02 | `rain`, `feed-heater-enabled`, `contact-assigned`, `receiver-snr-threshold` | K0721, S0675, K0689 |
| 15 | **Rotation Day** / Fleet COMSEC Under Tempo | Fleet-wide scheduled key rotation across a full day of passes; mid-rotation key mismatch on SAR-2; recover without missing tasking | `key-rotation-completed`, `tx-key-status`, `rx-key-status`, `fault-cleared` | K0876, S0844, S0593 |
| 16 | **Cascade** / Network Multi-Failure *(Phase 2 capstone)* | Three unrelated failures during the densest pass window: SH-02 BUC over-temp, GW-01 GPSDO holdover, schedule conflict from a slipped pass. Triage + SLA. | `buc-temperature-normal`, `gpsdo-not-in-holdover`, `contact-plan-valid` | T0531, S0677, S0807 |

### Phase 3 — Crisis Operations: "Gray Zone" (S17–S24)

One escalating, deliberately ambiguous adversary thread (plausible-deniability harassment of commercial SATCOM — never formally attributed). Priya Sharma (CSIRT) drives incident discipline. Each scenario teaches a distinct NICE incident-response/threat family. TRANSEC (M7) and GNSS spoofing (M8) debut here as *response* mechanics, following the NATS precedent of Phase-3 engine additions.

| # | Title / Subtitle | New/Exercised mechanics | Distinguishing conditions | Primary NICE |
|---|---|---|---|---|
| 17 | **Unusual Activity** / First Indicators | Audit-log anomalies (off-hours auth failures, config probe) + one brief unexplained downlink interference event. Characterize, open incident, harden access. Priya debut. | `security-event-acknowledged`, `access-control-set`, `signal-detected` | K0682, K0935, K0946, S0648 |
| 18 | **Dirty Spectrum** / Persistent Interference | Duty-cycled interference on MERIDIAN downlinks at Galway only (scripted `interferenceEvents` — the C1 S21 mechanic, NOT the ccs EA manager). Spectrum forensics, notch mitigation, regulator report. | `notch-filter-configured`, `speca-*`, `status-check` documentLine | K0684, K0926, S0648 |
| 19 | **Frequency Agility** / TRANSEC Ride-Through | **M7 TRANSEC debut**: uplink jamming threatens command windows; coordinate with Anneke to key the hop set, enable anti-jam mode, verify command ACK through jamming | ●`transec-mode-set`, ●`transec-sync-locked`, `command-acknowledged` | K0925, S0583*, K0751 |
| 20 | **False Time** / GNSS Spoofing | **M8 GNSS spoofing debut**: both stations' GPSDO timing walks off while sat count stays healthy (the tell); recognize spoof, force holdover, fly passes on disciplined oscillators, verified re-lock after all-clear | ●`gpsdo-reference-mode-set`, `gpsdo-stability`, `gpsdo-not-in-holdover` (recovery) | K0683, S0806*, K0752 |
| 21 | **Knocking on the Door** / Command-Link Intrusion Attempt | Auth-tag failures on TT&C + replayed-command evidence in the audit log. Prove denial-vs-intrusion (crypto intact?), emergency rotation, zeroize decision on a suspect key. | `tx/rx-key-status`, `security-event-acknowledged`, ●`zeroize-executed` *(or reuse key-status: Zeroized)* | K0729, S0805*, K0726* |
| 22 | **Connecting the Dots** / Incident Attribution Report | Correlate S17–S21 evidence into a timeline; board + regulator report via Working Document; continuity-of-operations recommendations | `status-check` documentLine chain, `audit-log-reviewed` | S0852, T1405, T1427, T1606 |
| 23 | **Dark Passes** / Degraded Manual Operations | Adversary surge after the report goes out: ACU automation fault + spoofing + uplink jamming simultaneously. Manual tracking, TRANSEC active, timing in holdover — keep the single highest-priority tasking alive. | `antenna-tracking-mode-set`, `transec-mode-set`, `receiver-snr-threshold` | S0671, T1277, S0424 |
| 24 | **North Atlantic Storm** / Campaign Capstone | Everything: real storm + adversary surge + SAR-2 emergency maneuver (stale TLE) across both stations and 4 birds; player is incident commander; full incident log; SAR-4 appears in the pass plan | Orchestration of all condition families | S0807, T1606, S0806*, T0531 |

`*` = codes expected from the **expanded** Protection & Defense catalog (§7); confirm exact IDs against the official role files during Phase A. In-catalog fallbacks exist for each (noted in §7).

---

## 4. New engine mechanics to build (the gap analysis)

These are the mechanics the campaign needs that do not exist today, in build-priority order. Sizes: S < 1 wk, M ≈ 1–2 wks, L ≈ 2–4 wks (single dev, includes tests).

### M1 — Link-Budget / EIRP Planning console (size M, needed by S2)

- **What:** New `link-planning` tab (gated by `settings.linkBudget`), rendered per-station. Worksheet: pass geometry (slant range at max el, pulled from pass predictions) → FSPL → antenna gains → required C/N → recommended BUC gain / HPA backoff. Operator fills fields; engine validates within tolerance; operator then applies settings on real equipment.
- **Engine surface:** new tab + console core/UI pair per the Core/UI convention; math already exists in the orbital FSPL path — expose it, don't duplicate it.
- **New conditions:** `link-budget-computed` (worksheet fields within tolerance), `link-margin-met` (achieved C/N within X dB of predicted, `mustMaintain`-capable).
- **NICE unlock:** the T&E family (T0080, S0015, S0842, T1092, T1138…).

### M2 — LEO uplink ops: uplink Doppler + TT&C commanding (size M–L, needed by S3)

- **What:** Apply Doppler to uplinks (currently downlink-only); TX-side Doppler-compensation toggle (modem or BUC AFC). Command model: a small command queue UI on the TX payload; a command "succeeds" (satellite ACK on next telemetry frame) iff sent inside the pass window with compensation on, link margin met, and crypto valid.
- **Engine surface:** opt-in physics change on `OrbitalSatellite` uplink path (keep Campaign 1 backward-compat, same pattern as downlink Doppler); command queue in transmitter/TX-payload adapter.
- **New conditions:** `uplink-doppler-comp-enabled`, `command-acknowledged` (by command id), optional `command-window-met`.
- **NICE unlock:** deepens T1567/K1032; enables S12/S19/S21 content.

### M3 — Multi-station pass scheduling (size M, needed by S5)

- **What:** Pass Schedule tab gains an allocation layer when >1 station present: assign each upcoming contact to a station; conflict detection (overlapping passes at one site, site downtime windows); per-contact priority weights.
- **Engine surface:** UI + validation over existing pass predictions. **No new physics.** Deliberately does NOT reuse the GEO `traffic-*`/`handover-*` conditions — this is a LEO-native parallel concept (and `service-continuity` is a known always-passes placeholder; do not use it in nats-eu).
- **New conditions:** `contact-assigned` (pass id → station), `contact-plan-valid` (no conflicts, all priority-N contacts covered).
- **NICE unlock:** coordination/planning codes; feeds Data Analysis via pass-history data.

### M4 — Space-domain events: maneuvers & ephemeris updates (size S–M, needed by S7)

- **What:** Scenario-scheduled TLE swap on a satellite at T+x (maneuver/burn). Pointing and pass predictions degrade against the stale TLE until the operator loads the updated ephemeris from a "new ephemeris available" notice; then reacquire.
- **Engine surface:** runtime TLE update on `OrbitalSatellite` (builds on existing `ephemerisError*` fields); a lightweight ephemeris inbox in the pass-schedule tab.
- **New conditions:** `ephemeris-updated` (satellite has fresh TLE loaded). Reacquisition reuses `antenna-beacon-locked`/`signal-detected`.

### M5 — Command-link auth & key ops (size S, needed by S4)

- **What:** Mostly scenario content over the EXISTING crypto equipment (key status, rotation, zeroize, auth tags, AUTH_TAG_FAILURE fault template all exist). Add: a scripted key-rotation flow (scheduled rotation event the operator executes), replay-attempt evidence surfaced in the audit log (M6 dependency for S21).
- **New conditions:** `key-rotation-completed`; possibly `zeroize-executed` (or assert via existing `tx-key-status: Zeroized`). Everything else reuses `tx/rx-crypto-status`, `tx/rx-key-status`, `fault-active`/`fault-cleared`.
- **NICE unlock:** KMS/crypto family (K0874/K0875/K0876, K0728, K0729).

### M6 — SOC-lite Security console (size L, needed by S6 — the biggest single build)

- **What:** New `security` tab (gated by `settings.security`). Two panels:
  1. **Station audit log** — timestamped events (auth successes/failures, config changes with actor, equipment commands, remote-access sessions), filterable; scenarios inject anomaly entries via a fault-injector-style event script; operator flags/acknowledges specific entries.
  2. **Access control** — small account list with states (active/disabled/expired), disable-account and require-reauth actions, password/2FA policy toggles.
- **Explicitly out of scope (per SOC-lite decision):** packet simulation, firewall rules, IDS signatures, network topology.
- **Engine surface:** new console core/UI, an audit-event injection framework (model on `faults/fault-injector.ts` priority/expiry patterns), event emission hooks from existing equipment state changes (config changes should generate real log entries so anomalies hide among genuine traffic).
- **New conditions:** `audit-log-reviewed` (tab visited + filter/scroll interaction), `security-event-acknowledged` (specific event id flagged), `access-control-set` (target account/policy state).
- **NICE unlock:** the entire incident-response and access-control families — this console is the load-bearing cyber mechanic for Phase 3.

### M7 — TRANSEC / anti-jam waveform (size M–L, needed by S19)

- **What:** Modem gains a TRANSEC mode: slow frequency hop over a scenario-defined hop set (visually compelling on the spectrum analyzer) requiring both ends keyed (satellite side scripted via Anneke coordination beat). When scripted interference targets the fixed carrier, hopping restores the link; hop-sync must be established (brief acquisition state).
- **Engine surface:** signal-model change (carrier center frequency time-varying), modem UI toggle + hop-set/key state, spectrum analyzer rendering of the hopping carrier.
- **New conditions:** `transec-mode-set`, `transec-sync-locked`.
- **NICE unlock:** K0925 wireless comms techniques; defender-side counterpart to ccs without touching ccs code.

### M8 — GNSS spoofing / timing attack (size S–M, needed by S20)

- **What:** New GPSDO fault mode: GNSS timing solution walks off while satellite count stays healthy (the diagnostic tell vs a normal outage). Operator recognizes the signature, forces holdover / switches reference source, rides passes on the disciplined oscillator, re-verifies after the all-clear.
- **Engine surface:** GPSDO model extension (spoof fault mode + UI tells: drifting phase/time offset with full constellation); GPSDO already deeply modeled so this is cheap.
- **New conditions:** `gpsdo-reference-mode-set` (manual holdover forced while spoof active). Recovery reuses `gpsdo-not-in-holdover`, `gpsdo-stability`.
- **NICE unlock:** threat-recognition codes (K0683, K0752); pairs with audit-log correlation in S22.

### Condition-type budget

~13 new condition types total across M1–M8. Keep them parameterized and generic (e.g., one `command-acknowledged` with params, not per-scenario variants) — NATS added zero condition types after S8 and stayed maintainable; nats-eu should hold the same line after its Phase 1 + the two Phase-3 debuts.

---

## 5. Engine/content fix-ups (pre-existing debt this campaign touches)

| Item | Action | When |
|---|---|---|
| `nats-eu-scenario1` has **zero NICE annotations** | Retro-annotate every objective (2–3 codes, primary first) + add the JSDoc alignment header | Phase A |
| No mission-brief MDX for scenario 1 | Author `signal-range-docs` campaign-2 brief; wire `settings.missionBriefUrl` (`https://docs.signalrange.space/campaign-2/scenario-1?content-only=true&dark=true` — confirm path convention) | Phase A |
| No E2E test for scenario 1 | Add full-completion Playwright spec via the e2e-scenario-test skill | Phase A |
| MERIDIAN RF levels never live-validated (Campaign 2 retro) | Live-run validation of C/N through a full pass BEFORE building 23 scenarios on these numbers | Phase A (blocking) |
| TLE-authoring grid-search script not checked in (retro) | Check in under `scripts/`; extend to batch-author pass windows (24 scenarios × multiple passes is the single biggest content-tooling cost) | Phase A |
| `natsEuCampaignData` lives in `src/campaigns/nats/campaign-data.ts` | Extract to `src/campaigns/nats-eu/campaign-data.ts` | Phase A |
| `service-continuity` condition is a placeholder that always passes | Do NOT use it in nats-eu; track separately whether to implement or deprecate | n/a |
| `K0108` off-catalog code in `signal-hunter/sandbox.ts` | Out of nats-eu scope, but fix opportunistically during the catalog work (map to K1032 or K0812) | Phase A (drive-by) |
| Campaign metadata | Recompute `totalDuration` (24 × ~30–40 min ≈ 700–900 min), update subtitle/difficulty if needed | Phase D |

---

## 6. Content-authoring conventions (inherit from NATS unless noted)

- **First objective** is always `review-mission-brief` (`nice: ['K0645']`, `freezesScenarioTimer`, brief-opened + SYSTEM readiness quiz).
- **Mission briefs** carry the pedagogy in S9+ (frequencies, customer context, procedures); dialog carries narrative only. Use the mission-brief skill; campaign-2 MDX per scenario.
- **Quizzes** default to `Character.SYSTEM`; explanations carry the "why".
- **Working Document** panel is the vehicle for S12 (test results), S13 (trend report), S22 (incident report), S24 (incident log).
- **Determinism:** every scenario with passes gets unit tests asserting AOS/max-el/LOS times (pattern exists for scenario 1).
- **E2E:** one full-completion spec per scenario, added in the same PR as the scenario (workers=1 locally, 127.0.0.1 baseURL — see E2E environment notes).
- **Timing:** LEO pass windows make `timeLimitSeconds` partially redundant — the pass IS the timer. Use objective time limits sparingly; let orbital mechanics create urgency.

---

## 7. NICE/NIST outcome strategy

### 7.1 Catalog expansion (Phase A)

Add official NICE Framework (2024 components) work-role files to `.claude/skills/nist-nice-reviewer/references/`:

1. **Defensive Cybersecurity (PD-WRL-001)** — network/system defense K/S/T statements.
2. **Incident Response (PD-WRL-00x — confirm exact ID from the official components download)** — incident triage, containment, reporting statements.

Also update `code-selection-guide.md` with cyber selection patterns (e.g., "audit-log anomaly found → incident-detection code + K0935"; "spoof recognized → threat-characteristic K + response S"). Keep the 2–3-codes-per-objective and primary-first rules unchanged. Codes marked `*` in §3 must be re-verified against the actual downloaded role files before annotation; each has an in-catalog fallback (S0583→S0593, S0805/S0806→S0593+S0648, K0726→K0725-family via shipped files if present).

### 7.2 Coverage targets

Current state: 45 valid distinct codes claimed product-wide (~12% of the shipped 386-code catalog), all in Campaign 1 + 2 sandbox codes.

| Phase | New-to-product code families targeted | Est. new distinct codes |
|---|---|---|
| P1 (S1–8) | Test & Evaluation (T0080, S0015, S0842, T1138, S0630, T0513…), KMS/crypto (K0874–K0876, K0728), access control (K0685/K0686, S0844, T1569) | ~22 |
| P2 (S9–16) | Data Analysis (T0349, S0646, S0892, T1506, T1611…), contingency (S0575/S0576, T1275–T1277), customer/perf (reinforce) | ~18 |
| P3 (S17–24) | Incident response (K0725/K0726, K0935, K0946, S0805/S0806, S0852, T1405, T1427), threats (K0682–K0684, K0752, K0783), non-repudiation/CIA (K0729, K0728), TRANSEC/wireless (K0925) + expanded PD-role codes | ~28 |

**Target: ≥110 distinct in-catalog codes claimed product-wide after nats-eu (~29% of shipped catalog), plus the expanded PD-role codes.** Secondary rule: every scenario introduces at least one code new to the product; every objective is annotated.

### 7.3 Reporting

Add a coverage assertion/report to the existing campaign-registry test area: a script that diffs claimed codes vs catalog per campaign, fails on off-catalog codes (would have caught `K0108`), and prints the coverage table for docs.

---

## 8. What nats-eu deliberately does NOT do

- No player-driven jamming (ccs-exclusive) — nats-eu is always the defender/victim.
- No TDOA/FDOA geolocation console (signal-hunter-exclusive) — S18/S22 report interference evidence; they do not localize the emitter. Narrative hook: the incident report notes "geolocation referred to specialist assets" (cross-sell to the signal-hunter campaign).
- No IP/packet network simulation, firewall, or IDS (SOC-lite decision).
- No GEO traffic-handover reuse — LEO contact allocation is its own mechanic.
- No re-teaching Campaign 1 fundamentals — the player is a qualified operator.

---

## 9. Build sequencing

Each phase = its own plan file + retro per repo convention, shippable increment, campaign playable end-to-current-scenario at every merge.

| Build phase | Contents | Exit criteria |
|---|---|---|
| **A — Foundation retrofit** | §5 fix-ups: S1 NICE/brief/E2E retrofit, live RF validation, TLE script check-in, campaign-data extraction, NICE catalog expansion + coverage report script, Character enum additions | S1 fully conventional; catalog expanded; link levels validated |
| **B — Foundations phase** | Mechanics M1–M6 + SH-02 station + scenarios 2–8 with briefs/tests/audio | Phase 1 playable; graduation E2E green |
| **C — Qualified ops** | Scenarios 9–16 (content-heavy, mechanics-light), SAR-3 + LEOP TLE authoring, Working-Document report templates | Phase 2 playable |
| **D — Gray zone** | M7 TRANSEC + M8 GNSS spoofing + adversary event scripting, scenarios 17–24, SAR-4 (optional), campaign metadata final | Full campaign playable; coverage target met |

Rough total: M1–M8 ≈ 8–12 dev-weeks of engine work; 23 scenarios of content (each ≈ scenario file + brief MDX + E2E + pass-timing tests + audio) is the larger cost — the TLE batch-authoring tool in Phase A directly attacks the biggest per-scenario cost.

---

## 10. Risks & open questions

1. **Audio volume:** ~24 scenarios × 5–15 clips with 4 new character voices. Decide pipeline (same TTS/VO as NATS?) before Phase B; SYSTEM-clip-heavy design mitigates.
2. **Deterministic pass authoring at scale** is the campaign's structural risk — if the Phase A tooling doesn't make "give me a pass at T+X over station Y" cheap, Phases C/D slip.
3. **Ku LEO link math** unvalidated (retro flag). Phase A gate.
4. **Expanded-catalog code IDs** (`*` in §3) are provisional until the official PD role files are downloaded and diffed.
5. **Prerequisite gating** (graduation S8 vs full S24 of Campaign 1) — recommend S8; confirm.
6. **Docs-site path** for campaign-2 briefs — confirm `campaign-2/scenario-N` convention with the docs repo.
7. **Scope pressure on M6 (Security console):** it's the largest build and the easiest to over-engineer. Hold the SOC-lite line: log + acknowledge + account actions, nothing more.
8. **S24 satellite count** (4 birds, 2 stations, storm, adversary): validate performance and cognitive load in playtest before committing SAR-4.
