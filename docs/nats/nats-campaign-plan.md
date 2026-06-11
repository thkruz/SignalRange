# NATS Campaign Plan

**24-Scenario Training Progression — Singular Reference for Parallel Scenario Builds**

This document is the canonical plan for the NATS campaign. It exists so that scenarios 10-24 can be built in parallel without contradictions: each entry specifies premise, mechanics, NICE codes, characters, satellites, prerequisites, and what the scenario must teach beyond what prior scenarios already taught.

Mechanical "how to build a scenario" guidance lives in the [scenario-developer](../../.claude/skills/scenario-developer/SKILL.md) skill. NATS-specific tone, character voices, and archetype templates live in the [nats-campaign-builder](../../.claude/skills/nats-campaign-builder/SKILL.md) skill. This document is **what** each scenario covers, not **how** to write one.

---

## Campaign Phase Map

| Phase | Scenarios | Theme | Status |
|-------|-----------|-------|--------|
| 1 | 1-8 | Foundations — Guided learning with Charlie Brooks | Built |
| 2 | 9-16 | Qualified Operations — Solo shifts, real customers, operational judgment | Built |
| 3 | 17-24 | Crisis Operations — High-stakes, multi-system, mentoring | To build |

---

## Phase 1: Foundations (Scenarios 1-8) — Built

*Theme: Orientation and fundamentals. Charlie Brooks guides the player through one new mechanic per scenario.*

| Lvl | Title | Subtitle | Core mechanic introduced | Primary NICE |
|-----|-------|----------|--------------------------|--------------|
| 1 | First Day | TIDEMARK-1 Health Check | UI navigation, equipment observation, alarm reading | K0740, K0741, T0153 |
| 2 | Scheduled Maintenance | Power Down and Recovery Procedures | Power-on/off sequencing, RF safety, antenna positioning | T1567, K0770, S0421 |
| 3 | Weather Emergency Handover | Multi-Site Operations | Feed heater, AGC monitoring, ME-02 commissioning, traffic handover | T0153, K0689, S0421 |
| 4 | New Bird on the Block | Satellite Switchover Operations | IF frequency calculation, satellite acquisition, full-duplex link establishment | S0421, K1032, K0773 |
| 5 | Interference Hunt | Spectrum Analysis and Mitigation | Spectrum analysis at wide span, cross-pol interference, notch filter | T0153, K0773, S0582 |
| 6 | Old Faithful | Step-Track Operations on Inclined Orbit | Step-track mode, AURORA-7 inclined orbit, BUC TX IF calculation | K1032, S0421, K0773 |
| 7 | Uplink Validation | Transmit Enable Sequence & Power Verification | BUC loopback, post-maintenance diagnosis, HPA enable sequencing | S0077, T1313 |
| 8 | Night Shift | Solo Operations Evaluation | Multi-fault diagnosis, intermittent fault, backup modem switching | T0081, S0582, K0773 |

End-of-Phase-1 state (pre-S9):
- Charlie Brooks has transferred to a European station; he is not on-site after S8.
- Dana Torres is the on-site supervisor.
- Catherine Vega runs ME-02 (operational since S3).
- TIDEMARK-1, TIDEMARK-2, SES-10 (visible only), AURORA-7 are in the satellite roster.

---

## Phase 2: Qualified Operations (Scenarios 9-16)

*Theme: The player is qualified. Dialog density drops sharply. Quizzes default to `Character.SYSTEM`. Per-scenario character clips capped at 3-7. Tone is operational, not instructional.*

**Phase 2 satellite roster:** TIDEMARK-1, TIDEMARK-2, TIDEMARK-3 (new in S9), AURORA-7, SES-10 (visible only).
**Phase 2 stations:** VT-01 and ME-02 (both fully operational).
**Phase 2 arc:** Mostly standalone day-in-the-life vignettes. One 2-scenario mini-arc at S11-S12 (planned maintenance: handover out → return to service).

---

### S9 — Morning Rounds | **Built**

| Field | Value |
|-------|-------|
| Subtitle | Multi-Satellite Health Check |
| Status | Built |
| Premise | First qualified shift. Compressed health checks across three TIDEMARK birds: VT-01/TM-1, ME-02/TM-2, and a quick spot-check on the newly commissioned TIDEMARK-3. No drama. |
| Duration | 20-25 min |
| Objectives | 18 |
| Mechanics reused | S1 health-check sequence, S4 antenna repoint, S5 spectrum tuning. Multi-station navigation from S3. |
| Satellites | TIDEMARK-1, TIDEMARK-2, **TIDEMARK-3** (new), SES-10 (visible) |
| Ground stations | VT-01 (active), ME-02 (active) |
| Characters & density | Dana only. 5 clips: text-message intro, 3 phase transitions, sign-off. All quizzes are SYSTEM. |
| NICE — Primary | T0153, T0431, S0421 |
| NICE — Supporting | K0645, K0740, K0741, K0773, K1032 |
| New value beyond Phase 1 | First scenario with no instructional dialog. Demonstrates compressed checklist execution across multiple satellites. Introduces TIDEMARK-3. |
| Prerequisites | nats-level-8-night-shift |
| Arc connection | Standalone |

---

### S10 — Customer Pass

| Field | Value |
|-------|-------|
| Subtitle | High-Throughput Window on AURORA-7 |
| Status | Built |
| Premise | SeaLink requests a 30-minute high-priority data window on AURORA-7. Marcus Chen is on the line throughout. Operator runs step-track, monitors C/N for sustained margin, optimizes HPA backoff for the pass duration. Customer is watching the link live. |
| Duration | 25-30 min |
| Objectives | 18-22 |
| Mechanics reused | S6 step-track on AURORA-7, S1 C/N monitoring, S2/S4 HPA backoff adjustment, S1 payload data integrity check |
| Satellites | AURORA-7 |
| Ground stations | VT-01 |
| Characters & density | Dana (intro). Marcus Chen (3-4 clips: pre-pass briefing, mid-pass throughput acknowledgment, post-pass thank-you). 5-6 clips total. |
| NICE — Primary | S0478, T1580, T0153 |
| NICE — Supporting | K1032, K0740, S0675 |
| New value beyond Phase 1 + S9 | First scenario with **active customer dialog during operations**. Pre-S10 customer interaction was bracketing (brief/debrief); S10 puts the customer on the link in real time. Throughput-vs-margin tradeoff is explicit. |
| Prerequisites | nats-scenario9 |
| Arc connection | Standalone |

---

### S11 — Planned Maintenance: Hand Off (arc 1 of 2)

| Field | Value |
|-------|-------|
| Subtitle | Coordinated Traffic Transfer to Sister Teleport |
| Status | Built |
| Premise | Scheduled 2-hour VT-01 maintenance window for HPA waveguide gasket inspection. Operator pre-coordinates with sister teleport and ME-02 (Catherine), executes planned TIDEMARK-1 handover, stows VT-01 for the maintenance crew. Unlike S3's emergency handover, there is no weather pressure. The grade is procedural cleanliness. |
| Duration | 25-30 min |
| Objectives | 18-22 |
| Mechanics reused | S3 traffic handover, S2 antenna maintenance position, S3 cross-station coordination |
| Satellites | TIDEMARK-1 |
| Ground stations | VT-01 (handing off), ME-02 (receiving control) |
| Characters & density | Dana (intro + sign-off). Catherine (2-3 clips: coordination, receive confirmation). 5-6 clips total. |
| NICE — Primary | K0718, T0129, S0593 |
| NICE — Supporting | K0645, K0741 |
| New value beyond Phase 1 + S9-S10 | S3 emergency handover under time pressure; S11 is the **same mechanic under planning discipline**. Pre-coordination protocol. Formal callouts. The lesson: the procedure does not relax just because the urgency is off. |
| Prerequisites | nats-scenario10 |
| Arc connection | Start of S11-S12 mini-arc (planned maintenance cycle) |

---

### S12 — Planned Maintenance: Return to Service (arc 2 of 2)

| Field | Value |
|-------|-------|
| Subtitle | Post-Maintenance Restoration |
| Status | Built |
| Premise | Maintenance is complete. Operator brings VT-01 back: power-up sequence, RX chain validation, post-maintenance leftover sweep (a small misconfig from the maintenance crew), retake TIDEMARK-1 traffic from the sister teleport, notify customer of restoration. |
| Duration | 25-35 min |
| Objectives | 20-25 |
| Mechanics reused | S2 power-up sequence, S7 post-maintenance validation (incl. leftover detection), S1/S9 beacon spot check, S3 traffic handover (return direction) |
| Satellites | TIDEMARK-1 |
| Ground stations | VT-01 (restoring), ME-02 (releasing) |
| Characters & density | Dana (intro + sign-off). Catherine (2 clips: release coordination). Marcus or James briefly acknowledging service restoration. 5-7 clips total. |
| NICE — Primary | T1314, T1567, T0431 |
| NICE — Supporting | T0153, K0773, K0645 |
| New value beyond Phase 1 + S9-S11 | Closes the **full maintenance cycle** for the first time. S2 and S7 taught the pieces in isolation; S11→S12 demonstrates the entire lifecycle: handover-out → planned downtime → maintenance → validation → handover-back. Discipline of finishing what you started. |
| Prerequisites | nats-scenario11 |
| Arc connection | End of S11-S12 mini-arc |

---

### S13 — Thermal Anomaly

| Field | Value |
|-------|-------|
| Subtitle | Reading the Trend |
| Status | Built |
| Premise | During an otherwise normal shift, BUC temperature trends upward over 15 minutes. No immediate alarm, but the slope matters. Operator must read the trend, decide to de-rate (lower BUC gain), schedule a swap, mute and switch to backup, or hold and monitor. The right answer is judgment, not a checklist. |
| Duration | 25-30 min |
| Objectives | 18-22 |
| Mechanics reused | S2/S7 BUC configuration, S2 HPA backoff, S5 spectrum monitoring |
| Satellites | TIDEMARK-1 (primary carrier on VT-01) |
| Ground stations | VT-01 |
| Characters & density | Dana (1 check-in at decision point). 3-4 clips total. |
| NICE — Primary | K0064, S0672, T1314 |
| NICE — Supporting | K0740, S0675, T0153 |
| New value beyond Phase 1 + S9-S12 | First scenario where the player must read a **trend** rather than respond to a discrete fault. S5 was a binary spike; S13 is "is this worth acting on yet, or am I overreacting?" Operational judgment under uncertainty. |
| Prerequisites | nats-scenario12 |
| Arc connection | Standalone |

---

### S14 — Rain Fade

| Field | Value |
|-------|-------|
| Subtitle | Adapt Without Handover |
| Status | Built |
| Premise | Light to moderate rain approaches VT-01. The customer (James Okafor) prefers no handover — SLA terms allow degradation but penalize handover events. Operator must enable feed heater, watch AGC headroom, optimize HPA backoff, monitor link margin. The scenario can end either way: adapt successfully, or recognize a threshold-justified handover. |
| Duration | 25-35 min |
| Objectives | 20-25 |
| Mechanics reused | S3 feed heater + AGC, S1 C/N margin tracking, S3 traffic handover (only if thresholds exceeded) |
| Satellites | TIDEMARK-1 |
| Ground stations | VT-01 primary, ME-02 standby |
| Characters & density | Dana (decision check-in). James Okafor (1 clip: SLA constraint context). 4-5 clips total. |
| NICE — Primary | K0689, S0675, K0721 |
| NICE — Supporting | T0153, K0773, S0593 |
| New value beyond Phase 1 + S9-S13 | S3 taught "weather hits → hand over." S14 teaches that **the right call is not always to escape**. Adds customer-constraint reasoning. First explicit `K0721` (risk management) introduction. |
| Prerequisites | nats-scenario13 |
| Arc connection | Standalone |

---

### S15 — Frequency Coordination

| Field | Value |
|-------|-------|
| Subtitle | Inter-Operator Spectrum Etiquette |
| Status | Built |
| Premise | Notification from a partner teleport: their next uplink will sit 2 MHz from a current TIDEMARK-3 carrier. Operator verifies guard bands, checks that the VT-01 carrier is not producing spurs that would land on the partner's slot, may need to retune slightly or adjust IF filtering. Coordination, not combat. |
| Duration | 25-30 min |
| Objectives | 18-22 |
| Mechanics reused | S5 spectrum analysis, S5 IF filter configuration, S4/S7 TX modem configuration, S7 uplink validation |
| Satellites | TIDEMARK-3 |
| Ground stations | VT-01 |
| Characters & density | Dana (intro). Partner-teleport coordinator (1-2 clips — render via SYSTEM as email/notification, not a named character, to avoid expanding the roster). 4 clips total. |
| NICE — Primary | K0737, T1143, S0648 |
| NICE — Supporting | K0792, K0773, S0593 |
| New value beyond Phase 1 + S9-S14 | S5 was "someone else interfered with us." S15 reverses the perspective: **make sure we are not interfering with them**. Introduces external-operator coordination — absent from S1-S14. |
| Prerequisites | nats-scenario14 |
| Arc connection | Standalone |

---

### S16 — Cascade Failure

| Field | Value |
|-------|-------|
| Subtitle | Multi-System Recovery Under Customer Pressure |
| Status | Built |
| Premise | Two minutes into a routine shift, multiple unrelated alarms fire at once: BUC over-temperature triggering automatic mute, LNB reference unlock, HPA backoff drift. Customers begin calling. Operator must prioritize (RF safety → customer impact → equipment health), work through each fault systematically without supervisor escalation. |
| Duration | 35-45 min |
| Objectives | 25-32 |
| Mechanics reused | S7 BUC fault diagnosis, S8 LNB power cycle, S2 HPA management, S3 alarm prioritization framework, S5 documentation discipline |
| Satellites | TIDEMARK-1, TIDEMARK-2 (background traffic) |
| Ground stations | VT-01 primary |
| Characters & density | Dana (escalation check). James Okafor (customer pressure, 1-2 clips). SYSTEM for all triage quizzes. 5-7 clips total. |
| NICE — Primary | T0531, S0677, S0807 |
| NICE — Supporting | T1538, S0593, T0081, T1606 |
| New value beyond Phase 1 + S9-S15 | S8 was multi-fault but all faults touched AURORA-7 (related). S16 is **unrelated faults at once**, requiring the operator to hold multiple mental tracks. The capstone of Phase 2. |
| Prerequisites | nats-scenario15 |
| Arc connection | Standalone (Phase 2 capstone) |

---

## Phase 3: Crisis Operations (Scenarios 17-24)

*Theme: High-stakes, time-critical, multi-system. Player begins taking on mentoring and reporting responsibilities. Crisis cadence — each scenario is a distinct kind of stress.*

**Phase 3 satellite roster:** Same as Phase 2.
**Phase 3 stations:** Same as Phase 2.
**Phase 3 arc:** No fixed mini-arc by design. Each scenario is a unique crisis archetype. S22-S24 has loose narrative continuity (AURORA-7 sunset → final ops → constellation reorganization) but no hard dependencies.

---

### S17 — Solar Event

| Field | Value |
|-------|-------|
| Subtitle | Sun Transit Outage |
| Status | To build |
| Premise | The semiannual sun transit window arrives — the Sun passes directly behind TIDEMARK-1 from VT-01's perspective for ~8 minutes, raising the noise floor catastrophically. The event is predictable and mitigatable: pre-coordinate with sister teleport, accept the degradation, ride it out, document customer impact. No equipment failure; just astronomy. |
| Duration | 25-30 min |
| Objectives | 18-22 |
| Mechanics reused | S11-S12 sister-teleport coordination, S10 customer comms, S1/S9 monitoring, S5 documentation |
| Satellites | TIDEMARK-1 |
| Ground stations | VT-01 |
| Characters & density | Dana (briefing + sign-off). Marcus (impact confirm, 1 clip). 4-5 clips total. |
| NICE — Primary | K0751, T1020, K0689 |
| NICE — Supporting | T0153, K1032, S0593 |
| New value beyond Phases 1-2 | First scenario where **the right answer is to accept degradation**, not fight it. Astronomical/environmental factors at predictable scale. Planning around guaranteed degradation, not avoiding it. |
| Prerequisites | nats-scenario16 |
| Arc connection | Standalone |

---

### S18 — Satellite Anomaly

| Field | Value |
|-------|-------|
| Subtitle | TIDEMARK-2 Station-Keeping Drift |
| Status | To build |
| Premise | Marcus reports from Halifax: TIDEMARK-2's station-keeping thrusters degraded; the bird is drifting more than expected. Ground operator must switch from program-track to step-track to maintain lock, monitor C/N stability, prepare customer impact assessment. The spacecraft team is the prime decision-maker; ground role is to keep the link alive while they diagnose. |
| Duration | 30-35 min |
| Objectives | 22-26 |
| Mechanics reused | S6 step-track, S6 antenna tracking-mode transition, S9 beacon monitoring, S10 Marcus collaboration |
| Satellites | TIDEMARK-2 |
| Ground stations | ME-02 primary, VT-01 standby |
| Characters & density | Marcus (primary, 3-4 clips — spacecraft side reports). Dana (incident-handling support). Catherine (ME-02 hands-on). 6-7 clips total. |
| NICE — Primary | K1032, T1314, K0751 |
| NICE — Supporting | K0721, T0153, S0593 |
| New value beyond Phases 1-2 | First scenario where the **satellite itself is the unknown**, not the ground equipment. Working in concert with a spacecraft team during a vehicle anomaly. When to escalate vs. when to keep operating. |
| Prerequisites | nats-scenario17 |
| Arc connection | Standalone |

---

### S19 — Train the New Hire

| Field | Value |
|-------|-------|
| Subtitle | Producing the Quick-Reference Card |
| Status | To build |
| Premise | Dana asks the player to draft a quick-reference card for an incoming new hire by **performing the procedure correctly while selecting which callouts and common-mistake warnings to highlight**. Implementation: SYSTEM-voiced quizzes throughout each phase prompt the player to choose the right teaching emphasis ("Which warning belongs on this step?", "What is the most common new-hire mistake here?"). The output is an in-game training document accumulated across the scenario. |
| Duration | 30-35 min |
| Objectives | 22-28 |
| Mechanics reused | S2 power-up sequence (the procedure being taught), S6 step-track (alt teaching path), S7 BUC loopback. Quiz pattern from S6 ("training day"). |
| Satellites | AURORA-7 (step-track is the most teachable mechanic) |
| Ground stations | VT-01 |
| Characters & density | Dana (intro + acknowledgment of the finished doc). SYSTEM throughout for the "which callout?" quizzes. **No new character is introduced for the new hire** — they exist off-screen. 3-4 clips total. |
| NICE — Primary | T1411, T1334, K0645 |
| NICE — Supporting | T1567, S0421, K0773 |
| New value beyond Phases 1-2 | First scenario where the player **must articulate the why**, not just execute the how. Reinforces mastery by requiring the operator to identify which gotchas and reasons matter most. Aligns with mentoring NICE work-role expectations. |
| Prerequisites | nats-scenario18 |
| Arc connection | Standalone |

---

### S20 — Dual Outage

| Field | Value |
|-------|-------|
| Subtitle | Concurrent Site Loss — Prioritized Recovery |
| Status | To build |
| Premise | A storm front knocks VT-01 receive offline (heavy rain attenuation beyond AGC range). Simultaneously, ME-02 hits an HPA fault. Multiple customers are affected. Operator must prioritize which site to restore first based on SLA exposure, customer mix, and recovery time estimates. |
| Duration | 35-45 min |
| Objectives | 26-32 |
| Mechanics reused | S3/S14 weather mechanics, S2/S7 HPA fault response, S3/S9 multi-station ops, S16 alarm prioritization |
| Satellites | TIDEMARK-1, TIDEMARK-2 |
| Ground stations | Both VT-01 and ME-02 (both degraded) |
| Characters & density | Dana (escalation, 2 clips). Catherine (ME-02 status, 2-3 clips). James Okafor (customer pressure, 1-2 clips). 6-8 clips total. |
| NICE — Primary | T1144, S0671, S0807 |
| NICE — Supporting | T1538, S0593, T0531 |
| New value beyond Phases 1-2 | True **multi-site prioritization** under simultaneous degradation. S16 was one site, multiple faults; S20 is multiple sites, mixed root causes. Decision is which fire to fight first, not how to fight any one fire. |
| Prerequisites | nats-scenario19 |
| Arc connection | Standalone |

---

### S21 — Hostile RF

| Field | Value |
|-------|-------|
| Subtitle | Suspected Intentional Interference |
| Status | To build |
| Premise | Unusual interference appears on TIDEMARK-2: broadband-ish noise that doesn't fit cross-pol patterns or known terrestrial sources, intermittent in a pattern that suggests deliberation. Operator must document signature, distinguish from natural causes, coordinate with regulator (rendered as in-game ticket workflow), apply receive-side countermeasures while the investigation runs. |
| Duration | 30-35 min |
| Objectives | 22-28 |
| Mechanics reused | S5 spectrum analysis at wide span, S5 interference characterization, S5/S15 documentation discipline |
| Satellites | TIDEMARK-2 |
| Ground stations | ME-02 primary |
| Characters & density | Dana (incident-handling, 2 clips). Marcus (spacecraft-side consultation, 1-2 clips). Regulator interaction as SYSTEM-voiced notifications. 5-6 clips total. |
| NICE — Primary | K0926, S0615, S0648 |
| NICE — Supporting | T0081, S0593, T0153 |
| New value beyond Phases 1-2 | First **adversarial-aware** scenario. S5 was unintentional cross-pol leakage; S21 introduces the question "is this intentional?" Differentiating jamming from interference. Regulatory coordination workflow. |
| Prerequisites | nats-scenario20 |
| Arc connection | Standalone |

---

### S22 — End-of-Life Planning

| Field | Value |
|-------|-------|
| Subtitle | AURORA-7 Sunset Recommendation |
| Status | To build |
| Premise | Trend data shows AURORA-7's beacon power has been declining for months. The board (Francis Martin) wants a recommendation on retirement timing. Operator runs final data collection, generates a trend report, evaluates business risk, prepares an executive-level impact summary. Light on RF, heavy on analysis and communication. |
| Duration | 25-30 min |
| Objectives | 18-22 |
| Mechanics reused | S6 step-track session (final ops run), S10 Marcus consultation, status-check pattern for analysis questions |
| Satellites | AURORA-7 |
| Ground stations | VT-01 |
| Characters & density | Marcus (Halifax discussion, 2 clips). Dana (intro). Francis Martin (board-level question, 1-2 clips — rare appearance). SYSTEM for analysis quizzes. 5-6 clips total. |
| NICE — Primary | K0721, T1429, T1606 |
| NICE — Supporting | K0751, S0807 |
| New value beyond Phases 1-2 | First **report-producing** scenario. Earlier scenarios ended in log entries; S22 ends in a multi-paragraph impact assessment. Trend analysis. Business-aware communication. Introduces Francis Martin as an active speaker. |
| Prerequisites | nats-scenario21 |
| Arc connection | Loose narrative continuity with S23 (AURORA-7 sunset thread). No hard dependency. |

---

### S23 — Emergency Bypass

| Field | Value |
|-------|-------|
| Subtitle | Manual Operations During Automation Failure |
| Status | To build |
| Premise | The ACU automation controller crashes mid-shift. Antenna positioning, beacon tracking, and program-track all unavailable. Operator must use manual tracking-mode controls to keep the link alive while IT works the root cause. Reveals what the automation was doing under the hood. |
| Duration | 25-30 min |
| Objectives | 20-25 |
| Mechanics reused | S2/S4/S6 antenna control fundamentals, S6 manual tracking-mode awareness, S5 spectrum-based pointing verification |
| Satellites | TIDEMARK-1 |
| Ground stations | VT-01 |
| Characters & density | Dana (intro + IT-coordination updates). IT contact rendered as SYSTEM-voiced ticket updates (no new character). 4-5 clips total. |
| NICE — Primary | S0424, T1588, S0671 |
| NICE — Supporting | T0531, S0421, K1032 |
| New value beyond Phases 1-2 | First scenario where the **automation itself** is the broken thing. Reveals the dependencies between automation and operator skill. Manual ops as a fallback competency, not a daily skill. |
| Prerequisites | nats-scenario22 |
| Arc connection | Standalone (loose AURORA-7 thread continues if S22 was completed). |

---

### S24 — Constellation Crisis

| Field | Value |
|-------|-------|
| Subtitle | Campaign Capstone |
| Status | To build |
| Premise | Compound emergency: simultaneous degradation on TIDEMARK-1 and TIDEMARK-2, AURORA-7 in step-track with a marginal beacon, an inbound weather event on VT-01, two customers escalating, and a board notification cycle to manage. Operator orchestrates across both stations, all four satellites, all communication channels. The final exam. |
| Duration | 40-50 min |
| Objectives | 30-38 |
| Mechanics reused | Effectively all S1-S23 mechanics. Specifically: multi-station ops (S3/S9/S20), multi-fault triage (S8/S16/S20), customer comms (S10/S14/S20), reporting (S22). |
| Satellites | TIDEMARK-1, TIDEMARK-2, TIDEMARK-3, AURORA-7 |
| Ground stations | Both VT-01 and ME-02 (both stressed) |
| Characters & density | All named characters appear: Dana (primary throughput), Catherine (ME-02), Marcus (TIDEMARK anomaly), James (customer escalation), Francis (board-level pressure). 8-10 clips total — this is the one Phase 2/3 scenario where dialog density is allowed to expand. |
| NICE — Primary | S0807, T1606, T0531 |
| NICE — Supporting | T1538, S0593, S0677, T1429, T1144 |
| New value beyond Phases 1-2 | Highest-stakes problem-solving. First scenario combining **multi-system technical recovery + executive-level reporting + customer escalation management** simultaneously. Demonstrates the operator can hold the entire job in their head at once. |
| Prerequisites | nats-scenario23 |
| Arc connection | Phase 3 capstone and campaign finale. |

---

## Build Coordination Notes

These conventions exist so that parallel builds don't contradict each other. Follow them strictly.

### Tone and dialog density

- All S9-S24 scenarios use the qualified-operator tone — see [nats-campaign-builder/references/dialog-density-guide.md](../../.claude/skills/nats-campaign-builder/references/dialog-density-guide.md).
- Default every `status-check` to `Character.SYSTEM`. Reserve named characters for narrative beats.
- Per-scenario character clip cap: 4-7 clips (S24 may go to 8-10 as the capstone exception).
- Text-message intro format is canonical (see S7, S8, S9).

### Character roster (immutable)

`DANA_TORRES`, `CATHERINE_VEGA`, `MARCUS_CHEN`, `JAMES_OKAFOR`, `FRANCIS_MARTIN`, `SYSTEM`. **Do not introduce new characters.** Charlie Brooks may appear only via phone/text from Europe.

### Satellite roster (immutable)

`tidemark1Satellite` (61525), `tidemark2Satellite` (61526), `tidemark3Satellite` (61527), `aurora7Satellite` (28899), `ses10Satellite` (42432, visible only). **Do not add new satellites.** If a scenario seems to require one, raise the question before building.

### Station roster (immutable)

`vermontGroundStation` (VT-01), `maineGroundStation` (ME-02). Both fully operational from S9 onward. **Do not add new stations.**

### Dual registration

Every new scenario must be registered in **two** places. Missing either causes a runtime "Scenario not found" error:
1. [src/campaigns/nats/campaign-data.ts](../../src/campaigns/nats/campaign-data.ts) — push into `natsCampaignData.scenarios`.
2. [src/scenario-manager.ts](../../src/scenario-manager.ts) — push into the top-level `SCENARIOS` array.

### Per-scenario quality gates

Before declaring a scenario done:
- `npm run type-check` passes clean.
- Scenario loads in the dev server and routes correctly from the campaign page.
- An `*-full-completion.spec.ts` Playwright test passes (see [scenario9-full-completion.spec.ts](../../e2e/specs/scenario9-full-completion.spec.ts) for the qualified-operator pattern with multi-station and antenna-repoint helpers).
- A mission brief MDX exists at `signal-range-docs/src/content/docs/campaign-1/scenario-N.mdx`.

---

## Variation Pattern

*Challenge types are varied across phases to prevent predictability.*

| Position | Phase 1 (built) | Phase 2 (qualified ops) | Phase 3 (crisis ops) |
|----------|-----------------|-------------------------|----------------------|
| +1 (9, 17) | First Day | Morning Rounds | Solar Event |
| +2 (10, 18) | Power | Customer Pass | Satellite Anomaly |
| +3 (11, 19) | Weather | Maintenance arc — out | Train the New Hire |
| +4 (12, 20) | Calculate | Maintenance arc — return | Dual Outage |
| +5 (13, 21) | Multi-Carrier | Thermal Anomaly | Hostile RF |
| +6 (14, 22) | Step-Track | Rain Fade | End-of-Life Planning |
| +7 (15, 23) | Transmit | Frequency Coordination | Emergency Bypass |
| +8 (16, 24) | Fault | Cascade Failure | Constellation Crisis |

---

## NICE Code Reference

*Refreshed to reflect actual codes used across S1-S24. Sorted by NICE work role.*

### Network Operations (IO-WRL-004)

| Code | Description | First introduced | Reinforced in |
|------|-------------|------------------|---------------|
| K0689 | Knowledge of network infrastructure principles and practices | S3 | S14, S17 |
| K0718 | Knowledge of network communications principles and practices | S11 | S12 |
| K0721 | Knowledge of risk management principles and practices | S14 | S18, S22 |
| K0737 | Knowledge of bandwidth management tools and techniques | S5 | S15 |
| K0740 | Knowledge of system performance indicators | S1 | S9, S13 |
| K0741 | Knowledge of system availability measures | S1 | S9, S11 |
| K0751 | Knowledge of system threats | S17 | S18, S22 |
| K0770 | Knowledge of system administration principles and practices | S2 | — |
| K0773 | Knowledge of telecommunications principles and practices | S1 | S4, S5, S15 |
| K0792 | Knowledge of network configurations | S2 | S15 |
| K0926 | Knowledge of signal jamming tools and techniques | S21 | — |
| K1032 | Knowledge of satellite-based communication systems and software | S1 | S4, S6, S18 |
| S0077 | Skill in securing network communications | S7 | — |
| S0421 | Skill in operating network equipment | S1 | All phase 1 |
| S0582 | Skill in troubleshooting system performance | S5 | S8 |
| S0648 | Skill in detecting anomalies | S15 | S21 |
| S0675 | Skill in optimizing system performance | S3 | S10, S14 |
| S0815 | Skill in troubleshooting network equipment | S8 | — |
| T0081 | Diagnose network connectivity problems | S8 | S16, S21 |
| T0129 | Integrate new systems into existing network architecture | S11 | S12 |
| T0153 | Monitor network capacity and performance | S1 | S9, S10, S17 |
| T1143 | Develop network backup and recovery procedures | S15 | — |
| T1313 | Test network infrastructure | S7 | — |
| T1314 | Maintain network infrastructure | S12 | S13, S18 |

### System Administration (IO-WRL-005)

| Code | Description | First introduced | Reinforced in |
|------|-------------|------------------|---------------|
| K0064 | Knowledge of performance tuning tools and techniques | S13 | — |
| S0424 | Skill in executing command line tools | S23 | — |
| S0593 | Skill in handling incidents | S11 | S14, S16, S20, S21 |
| S0671 | Skill in implementing contingency and recovery plans | S20 | S23 |
| S0672 | Skill in troubleshooting failed system components | S13 | — |
| S0677 | Skill in recovering failed systems | S16 | S20, S24 |
| T1538 | Resolve customer-reported system incidents | S8 | S16, S20, S24 |
| T1567 | Configure system hardware, software, peripheral equipment | S2 | S12, S19 |
| T1588 | Diagnose faulty system and server hardware | S23 | — |

### Technical Support (IO-WRL-007)

| Code | Description | First introduced | Reinforced in |
|------|-------------|------------------|---------------|
| S0478 | Skill in providing customer support | S10 | — |
| T1580 | Monitor client-level computer system performance | S10 | — |

### Systems Testing and Evaluation (DD-WRL-007)

| Code | Description | First introduced | Reinforced in |
|------|-------------|------------------|---------------|
| T0531 | Troubleshoot hardware/software interoperability problems | S16 | S20, S23 |
| T1020 | Determine operational and safety impacts | S17 | — |

### Data Analysis (IO-WRL-001)

| Code | Description | First introduced | Reinforced in |
|------|-------------|------------------|---------------|
| T1429 | Prepare trend analysis reports | S22 | S24 |

### Cross-Cutting / Other

| Code | Description | First introduced | Reinforced in |
|------|-------------|------------------|---------------|
| K0645 | Knowledge of standard operating procedures (SOPs) | S1 | All scenarios |
| S0615 | Skill in protecting a network against malware | S21 | — |
| S0807 | Skill in solving problems | S16 | S20, S24 |
| T0431 | Check system hardware availability and integrity | S1 | S9, S12 |
| T1144 | Implement network backup and recovery procedures | S20 | S24 |
| T1334 | Produce cybersecurity instructional materials | S19 | — |
| T1411 | Deliver technical training to customers | S19 | — |
| T1606 | Prepare impact reports | S22 | S24 |

### Coverage Summary

- **Network Operations (IO-WRL-004):** 24 codes covered across the campaign. Heaviest representation — this is the primary NICE work role NATS targets.
- **System Administration (IO-WRL-005):** 9 codes covered. Concentrated in S11-S13, S16-S20, S23-S24.
- **Technical Support (IO-WRL-007):** 2 codes, both introduced in S10. Reinforcement happens implicitly in S14, S16, S20, S24 via customer-facing situations.
- **Systems Testing (DD-WRL-007):** 2 codes. S16 introduces interoperability troubleshooting; S17 introduces operational impact assessment.
- **Data Analysis (IO-WRL-001):** 1 code (T1429) — trend reporting, S22.
- **Cross-cutting / instructional:** T1334 and T1411 enter via S19's mentoring scenario.
