# NATS Campaign (Campaign 1) — Detailed Analysis Notes

Reference notes from a full read-through of the NATS campaign (2026-07-03), captured while designing the nats-eu campaign. Companion doc: `plans/phase-1-nats-eu-campaign-design-plan.md`.

**Sources of truth:**
- `docs/nats/nats-campaign-plan.md` — canonical 24-scenario plan (phase map, NICE tables, variation pattern)
- `src/campaigns/nats/campaign-data.ts` — campaign wiring (also currently hosts the sibling campaign objects: `natsEuCampaignData`, `hamSdrCampaignData`, `ccsCampaignData`, `geolocationCampaignData`)
- `src/campaigns/nats/scenario1.ts` … `scenario24.ts`
- `.claude/skills/nats-campaign-builder/SKILL.md` + references — conventions for S9+ (qualified phase)

---

## 1. Campaign structure

- **Identity:** `id: 'nats'`, "North Atlantic Teleport Services", `difficulty: 'beginner'`, `campaignType: 'GEO Commercial Communications'`, `totalDuration: '175-240 min'`.
- **Setting:** fictional commercial C-band GEO teleport, rural Vermont (**VT-01**), sister station **ME-02** in Maine (starts non-operational; commissioned via S3 handover). Customer: **SeaLink Maritime** (Halifax), serving Atlantic Shipping Alliance vessels.
- **Scenario list:** `[sandboxData, scenario1Data … scenario24Data]` (sandbox + 24).
- **Dual registration requirement:** every scenario must appear in BOTH `natsCampaignData.scenarios` AND the flat `SCENARIOS` array in `src/scenario-manager.ts`, or you get a runtime "Scenario not found" error.
- **Progression:** strictly linear via `prerequisiteScenarioIds`, one prerequisite each. **Id oddity:** S8 is `nats-level-8-night-shift` (url `nats/level-8/night-shift`); all others are `nats-scenarioN`.

### Three-phase map (3×8)

| Phase | Scenarios | Theme | Tone |
|---|---|---|---|
| 1 — Foundations | 1–8 | Guided learning, Charlie Brooks coaches, ONE new mechanic per scenario | Instructional ("click the X tab, here's why"). S8 = graduation exam. |
| 2 — Qualified Operations | 9–16 | Solo shifts, real customers, operational judgment | Operational. **Hard tonal break at S9.** Mostly standalone vignettes + one S11–S12 mini-arc. S16 = phase capstone. |
| 3 — Crisis Operations | 17–24 | High-stakes, multi-system, mentoring & reporting | Crisis cadence, each scenario a distinct stress archetype. Loose S22–S24 AURORA-7-sunset continuity. S24 = campaign capstone. |

### Variation pattern (plan §Variation)

The three 8-slot phases are aligned column-wise (+1…+8), deliberately varying challenge type by slot position. E.g., slot **+8 is always a fault/capstone** (S8 Night Shift ↔ S16 Cascade Failure ↔ S24 Constellation Crisis); slot +1 is a rounds/health-check shape; +2 is a customer shape.

---

## 2. Per-scenario table

Condition types listed are the distinguishing/mechanic-bearing ones; every scenario also uses `mission-brief-opened`, `ground-station-selected`, `tab-active`, `status-check`. "Primary NICE" = the plan's "NICE — Primary" codes.

| # | Title / Subtitle | Primary mechanic(s) introduced / exercised | Distinguishing condition types | Satellites | Primary NICE |
|---|---|---|---|---|---|
| 1 | First Day / TIDEMARK-1 Health Check | UI nav, equipment observation, alarm reading (no controls) | `equipment-powered`, `lnb-thermally-stable`, `signal-detected` | TM-1 | K0740, K0741, T0153 |
| 2 | Scheduled Maintenance / Power Down & Recovery | Power on/off sequencing (HPA→BUC→modem→LNB), RF safety, antenna positioning | `equipment-powered`/`-not-powered`, `hpa-enabled`/`-disabled`, `antenna-position`, `antenna-tracking-mode-set`, `lnb-lo-set`, `tx-modem-transmitting` | TM-1, SES-10 | T1567, K0770, S0421 |
| 3 | Weather Emergency Handover / Multi-Site Operations | Feed heater, AGC, ME-02 commissioning, traffic handover, stow | `snow`, `feed-heater-enabled`, `traffic-transferred`, `service-continuity`, `satellite-selected`, full rx-/tx-modem-* set | TM-1, SES-10 | T0153, K0689, S0421 |
| 4 | New Bird on the Block / Satellite Switchover | IF-frequency calc, satellite acquisition, full-duplex link | `speca-*` (rbw/span/ref-level), `signal-level-correct`, rx/tx-modem-*, `buc-unmuted`, `hpa-not-overdriven` | TM-1, TM-2, SES-10 | S0421, K1032, K0773 |
| 5 | Interference Hunt / Spectrum Analysis & Mitigation | Wide-span spectrum analysis, cross-pol interference ID, notch filter | `notch-filter-configured`, `speca-min/max-amplitude`, `speca-span-set`, `speca-rbw-set` | TM-2, SES-10 | T0153, K0773, S0582 |
| 6 | Old Faithful / Step-Track on Inclined Orbit | Step-track mode, inclined-orbit AURORA-7, BUC TX IF calc | `antenna-beacon-locked`, `antenna-locked`, `antenna-tracking-mode-set` | AURORA-7, TM-1, SES-10 | K1032, S0421, K0773 |
| 7 | Uplink Validation / Transmit Enable Sequence & Power | BUC loopback, post-maint diagnosis, HPA enable sequencing, crypto check | `buc-loopback-enabled`/`-disabled`, `buc-gain-set`, `buc-muted`, `hpa-output-power-set`, `tx-crypto-status`, `tx-key-status`, `lnb-reference-locked` | TM-1, SES-10 | S0077, T1313 (+T0081, S0582) |
| 8 | Level 8: Night Shift / Solo Operations Evaluation | GRADUATION: multi-fault diagnosis (LNB unlock power-cycle, wrong track mode, intermittent TX modem→backup); recombines S1–S7 | `gpsdo-locked`, `lnb-reference-locked`, `tx-active-modem`, `feed-heater-enabled`, `buc-loopback-*`, full modem set | AURORA-7, TM-1 | T0081, S0421, K0773, T0153, S0582 |
| 9 | Morning Rounds / Multi-Satellite Health Check | First qualified shift; compressed S1 check across 3 birds + repoint; NO new mechanic, NO instructional dialog | `gpsdo-locked`, `antenna-locked`, `receiver-signal-locked`, `hpa-not-overdriven` | TM-1, TM-2, **TM-3 (new)**, SES-10 | T0153, T0431, S0421 |
| 10 | Customer Pass / High-Throughput Window on AURORA-7 | Step-track (S6) + HPA backoff optimization, sustained C/N, IMD tradeoff; first live customer during ops | `hpa-back-off-set`, `antenna-beacon-locked`, `receiver-snr-threshold`, `buc-unmuted` | AURORA-7 | S0478, T1580, T0153 |
| 11 | Planned Maintenance: Hand Off / Coordinated Transfer (arc 1/2) | Planned (non-emergency) traffic handover to ME-02, stow VT-01, pre-coordination discipline | `traffic-owner`, `traffic-transferred`, `service-continuity`, `antenna-position`, `buc-muted`, `hpa-disabled` | TM-1, TM-2, TM-3, SES-10 | K0718, T0129, S0593 |
| 12 | Planned Maintenance: Return to Service / Post-Maint Restoration (arc 2/2) | Full maintenance cycle close: power-up, leftover sweep, handover-back | `buc-reference-locked`, `buc-gain-set`, `lnb-reference-locked`, `traffic-transferred`, `service-continuity` | TM-1, TM-2, SES-10 | T1314, T1567, T0431 |
| 13 | Thermal Anomaly / Reading the Trend | Read a rising BUC-temp TREND (not discrete fault); de-rate/swap/hold judgment | `buc-gain-set`, `buc-not-saturated`, `hpa-not-overdriven` | TM-1, TM-2 | K0064, S0672, T1314 |
| 14 | Rain Fade / Adapt Without Handover | Feed heater + AGC + backoff to RIDE OUT weather (vs S3 handover); customer SLA constraint; first K0721 | `rain`, `feed-heater-enabled`, `hpa-not-overdriven`, `receiver-snr-threshold` | TM-1, TM-2, SES-10 | K0689, S0675, K0721 |
| 15 | Frequency Coordination / Inter-Operator Spectrum Etiquette | NEW MECHANIC: external-operator coordination — guard bands, spur check, don't interfere with a partner | `speca-*` set, `tx-modem-frequency/bandwidth-set`, `hpa-back-off-set` | TM-1, TM-2, TM-3, SES-10 | K0737, T1143, S0648 |
| 16 | Cascade Failure / Multi-System Recovery Under Customer Pressure | Phase-2 capstone: 3 UNRELATED simultaneous faults (BUC over-temp mute, LNB unlock, HPA backoff drift), prioritization | `buc-current-normal`, `buc-temperature-normal`, `buc-muted`, `hpa-back-off-set`, `lnb-reference-locked` | TM-1, TM-2 | T0531, S0677, S0807 |
| 17 | Solar Event / Sun Transit Outage | NEW ENGINE: `sun-transit` weather event (RX sky-noise sin² rise); accept degradation, ride out | `sun-transit`, `custom`, `receiver-snr-threshold` | TM-1, TM-2, SES-10 | K0751, T1020, K0689 |
| 18 | Satellite Anomaly / TIDEMARK-2 Station-Keeping Drift | NEW ENGINE: scenario-local drifting satellite variant (`tidemark2DriftingSatellite`); program→step-track to hold | `antenna-beacon-locked`, `antenna-tracking-mode-set`, `receiver-snr-threshold` | TM-1, **TM-2-DRIFTING**, SES-10 | K1032, T1314, K0751 |
| 19 | Train the New Hire / Producing the Quick-Reference Card | NEW ENGINE: Working Document panel — perform procedure while choosing teaching callouts; accumulates in-game doc | `antenna-beacon-locked`, `speca-center-frequency`, `status-check` w/ `documentLine` | AURORA-7, TM-1 | T1411, T1334, K0645 |
| 20 | Dual Outage / Concurrent Site Loss — Prioritized Recovery | Multi-SITE prioritization: VT-01 rain-out + ME-02 HPA fault simultaneously; SLA triage | `snow`, `custom`, `feed-heater-enabled`, `hpa-back-off-set`, `hpa-disabled`/`-enabled` | TM-1, TM-2, SES-10 | T1144, S0671, S0807 |
| 21 | Hostile RF / Suspected Intentional Interference | NEW ENGINE: time-windowed interference (`interferenceEvents`, duty-cycled jammer); adversarial ID, notch + crypto, regulator workflow | `notch-filter-configured`, `rx-crypto-status`, `rx-key-status`, `speca-*` | TM-1, TM-2, SES-10 | K0926, S0615, S0648 |
| 22 | End-of-Life Planning / AURORA-7 Sunset Recommendation | First REPORT-producing scenario: trend analysis → board impact report; Francis Martin as active speaker | `antenna-beacon-locked`, `speca-center-frequency`, `status-check` w/ working-doc report lines | AURORA-7, TM-1 | K0721, T1429, T1606 |
| 23 | Emergency Bypass / Manual Operations During Automation Failure | NEW ENGINE: ACU automation fault (`isAcuAutomationFaulted`); manual tracking-mode ops, spectrum-based pointing | `antenna-tracking-mode-set`, `receiver-snr-threshold`, `signal-detected` | TM-1, SES-10 | S0424, T1588, S0671 |
| 24 | Constellation Crisis / Campaign Capstone | Orchestration of ALL mechanics: 2 stations, 4 sats, storm, 2 customers, board note; 5 concurrent tracks | `snow`, `buc-gain-set`, `buc-not-saturated`, `feed-heater-enabled`, `antenna-beacon-locked`, working-doc incident log | TM-1, TM-2, AURORA-7, SES-10 | S0807, T1606, T0531 |

### Key structural fact

**No new condition types were added in S9+** (a SKILL.md invariant). The Phase-3 "new mechanics" (sun-transit, drifting-satellite variant, Working Document panel, `interferenceEvents`, ACU automation fault) are additive *engine capabilities*, not new condition types.

### Condition-type frequency (campaign-wide, top of list)

`status-check` 271 · `tab-active` 201 · `ground-station-selected` 56 · `mission-brief-opened` 24 · `antenna-tracking-mode-set` 24 · `receiver-signal-locked` 23 · `receiver-snr-threshold` 18 · `speca-center-frequency` 17 · `signal-detected` 17 · `hpa-not-overdriven` 15 · `equipment-powered` 15. Long tail: `custom`, `traffic-owner`/`-transferred`, `service-continuity`, `notch-filter-configured`, `sun-transit`, `rain`, `snow`, crypto/key statuses.

---

## 3. NICE/NIST annotation model

- Every one of the 24 scenarios carries objective-level `nice: [...]` arrays (`nice?: string[]` defined at `src/objectives/objective-types.ts` on the objective type). 22/24 also carry a top-of-file JSDoc "NICE Framework Alignment" block with Primary + Supporting codes (exceptions: S5 and S13, objective-level only).
- Format: `nice: ['K0645', 'S0077']` per objective, plus inline `// K0645: <description> - <why>` comments. Primary competency first; 2–3 codes per objective max (split the objective if more apply).
- **Work-role distribution** (per plan): Network Operations (IO-WRL-004) is primary/heaviest (~24 codes), System Administration (IO-WRL-005, 9), Technical Support (IO-WRL-007, 2), System Testing & Evaluation (DD-WRL-007, 2), Data Analysis (IO-WRL-001, 1 — just T1429). The plan includes a "first introduced / reinforced in" table per code.
- **Most-used codes campaign-wide:** S0421 ("operate network equipment", all 24 scenarios) · T0153 (monitor network performance) · K1032 (satellite comms) · K0773 (telecom principles) · K0740 (performance indicators) · K0645 (SOPs, all scenarios via mission-brief objective) · K0741 (availability measures) · T1567 (configure hw/sw) · S0593 (incident handling) · T0431 (hardware availability checks).
- **Coverage reality (product-wide, as of 2026-07-03):** the nist-nice-reviewer catalog has 386 codes (174 K / 123 S / 89 T, five work roles, no A-codes). Only **46 distinct tokens are used anywhere** (45 valid + 1 off-catalog `K0108` in `signal-hunter/sandbox.ts`) ≈ 12% coverage. All annotation is concentrated in nats 1–24; nats-eu, ccs, ham-sdr have zero.
- **Biggest untouched in-catalog families:** crypto/access-control/IAM (19 codes), network defense (16), threat/vulnerability (13), incident response (10), plus two nearly-virgin work roles: System Testing & Evaluation (~35 unused) and Data Analysis (~35 unused).
- The catalog is structurally thin on space ops: only `K1032` (satellite comms) and `K0926` (signal jamming) are space/RF-specific, and both are already claimed.

---

## 4. Storyline & characters

### Roster (immutable after S8)

| Character | Enum | Role | Voice |
|---|---|---|---|
| Charlie Brooks | (S1–S8 only) | Senior operator, 6 yrs, transfers to European NATS station (announced in S1). Coach in Phase 1. | British, dry, direct. Phone/text cameo only after S8; NEVER on-site again. |
| Dana Torres | `DANA_TORRES` | On-site shift supervisor from S9; player's boss | Terse, peer-respectful, texts more than talks. Intros, transitions, sign-offs. |
| Catherine Vega | `CATHERINE_VEGA` | Runs ME-02 (Maine); cross-station peer | Collaborative, observant. Handover/coordination beats. |
| Marcus Chen | `MARCUS_CHEN` | SeaLink Halifax spacecraft-ops engineer | Warm Canadian ("eh", "beauty"); payload/spacecraft-side context. |
| James Okafor | `JAMES_OKAFOR` | SeaLink fleet captain (customer end-user) | Direct, impatient under outage; speaks customer impact not RF. SLA pressure. |
| Francis Martin | `FRANCIS_MARTIN` | SeaLink board member, ex-banker | Cost-focused, skeptical. Rare pre-S22; active speaker S22+. |
| SYSTEM | `Character.SYSTEM` | Player's own checklist voice (no audio/avatar) | Neutral, factual. Default for all quizzes. |

### Arc

1. **Phase 1 (S1–8):** new-hire training under Charlie, one mechanic per scenario; S8 is a 2 AM solo graduation exam (Charlie out of state, Dana asleep-on-call).
2. **Post-S8 canon shift:** Charlie gone to Europe; Dana supervises; Catherine peers at ME-02 (fully operational since S3); TIDEMARK-3 commissioned offstage (debuts S9). Player is a qualified operator, treated as a peer.
3. **Phase 2 (S9–16):** day-in-the-life vignettes; S11–S12 is the only hard mini-arc (planned maintenance out/back); S16 cascade capstone.
4. **Phase 3 (S17–24):** crisis archetypes + mentoring (S19 the player mentors a new hire) + reporting (S22 board report); loose AURORA-7-sunset thread S22→S24; S24 puts the player in incident command.

### Open threads a sequel inherits

- AURORA-7 final ops/stow (set up in S22, not closed)
- ME-02 BUC-swap procurement (recurring over-gain thermal trend; Francis owns budget)
- TIDEMARK-2 anomaly assumed resolved offstage; TIDEMARK-4 commissioning; SeaLink capacity growth
- Hostile-RF (S21) follow-up — never attributed
- Player is now senior/IC — sequels must NOT re-prove competence
- **Charlie is in Europe** — the direct narrative bridge to nats-eu (Galway, GW-01)

---

## 5. Dialog & mission-brief conventions

### Dialog structure

- `dialogClips.intro` — scenario-open clip `{ text (HTML), character, emotion, audioUrl }`; `dialogClips.objectives['<objectiveId>']` — fire on objective activation (used for phase transitions).
- `emotion` from the `Emotion` enum (NEUTRAL/CONFIDENT/HAPPY/CONCERNED/FRUSTRATED/SKEPTICAL); audio via `getAssetUrl('/assets/campaigns/nats/<N>/<clip>.mp3')`; `Character.SYSTEM` clips have no audio/avatar.

### Density rules (hard, from nats-campaign-builder skill)

- Phase 1 ≈ 20+ clips (Charlie carries setup). **S9+ capped at 3–7 clips** (S24 allowed 8–10). Acceptable slots: intro, 2–3 phase transitions, sign-off, 1–2 narrative beats.
- Default every `status-check` quiz to `Character.SYSTEM`; the educational "why" goes in the `explanation` field, not a character's mouth.
- No UI coaching and no re-explaining S1–S7 mechanics in S9+. Treat S8 as the last scenario where hand-holding is acceptable.
- **Text-message intro is canonical** for qualified scenarios: `<em>[Text message from Dana at HH:MM]</em>` (S9 "06:42", S8 "2:17 AM").
- Word budgets per clip: Dana 20–40, Catherine 15–50, Marcus 30–60, James 20–40, Charlie 15–30, SYSTEM 10–25.

### Mission-brief pattern

- First objective is always `id: 'review-mission-brief'`, `nice: ['K0645']`, `freezesScenarioTimer: true`, two ANDed conditions: `mission-brief-opened` (`params.boxId: 'mission-brief'`) + a SYSTEM `status-check` readiness acknowledgment (`pointPenalty: 0`).
- Brief content is external MDX: `settings.missionBriefUrl` = `https://docs.signalrange.space/campaign-1/scenario-{N}?content-only=true&dark=true`, mirrored in `signal-range-docs/src/content/docs/campaign-1/scenario-N.mdx`. In qualified scenarios the brief (not dialog) carries pedagogy/frequencies/customer context.
- Per-objective timers use `timerStartTrigger: 'on-activate'`; objectives chain via `prerequisiteObjectiveIds` with `conditionLogic: 'AND'`.

---

## 6. Gotchas worth remembering

- **Dual registration** (campaign-data + scenario-manager) or runtime "Scenario not found".
- **S8 id inconsistency** (`nats-level-8-night-shift`) — don't imitate in new campaigns.
- **`service-continuity` condition is a placeholder that always passes** (`maxPacketLoss` unused) — it "works" in S3/S11/S12 only because it can't fail.
- The sibling campaign objects (nats-eu, ham-sdr, ccs, signal-hunter) are all defined inside `src/campaigns/nats/campaign-data.ts`, not in their own campaign folders.
- `K0108` (signal-hunter sandbox) is off-catalog for the nist-nice-reviewer skill — annotation validation would flag it.
