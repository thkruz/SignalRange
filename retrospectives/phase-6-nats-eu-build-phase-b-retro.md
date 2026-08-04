# Retrospective — nats-eu Build Phase B (scenarios 2–8)

**Scope:** the Foundations half of the Campaign 2 arc from the
[design plan](../plans/phase-1-nats-eu-campaign-design-plan.md) §3: one new
mechanic per scenario, ending in a solo-evaluation graduation.

## What was built

| # | Title | Mechanic exercised |
|---|---|---|
| 2 | Proving the Link | M1 link budget — predict, measure, prove margin |
| 3 | Two-Way Street | M2 uplink ops — Doppler comp, keyed uplink, command ACK |
| 4 | Keys to the Bird | M5 COMSEC — scheduled key rotation gating the command |
| 5 | Shetland Comes Online | M3 multi-station scheduling + SH-02 debut |
| 6 | Watch the Watchers | M6 SOC-lite — audit review, flag, account hygiene |
| 7 | Moving Target | M4 space events — stale ephemeris, load, reacquire |
| 8 | Night Passes | graduation: recombination on a real 40° night pass |

Plus **SH-02 Shetland**, the **ephemeris status panel** (below), and
`test/campaigns/nats-eu-phase-b-validation.test.ts` (26 assertions).

## Three defects found before the playtest, not by it

1. **M4 had no player-facing UI at all.** `applyEphemerisUpdate()` was called
   only from tests — nothing in the app could clear a stale ephemeris, so S7's
   `ephemeris-updated` condition was unsatisfiable by construction. Found by
   grepping for callers *before* authoring S7 rather than after. Built the
   ephemeris status panel into the Pass Schedule tab (the tab whose predictions
   the stale set corrupts).
2. **The panel then didn't repaint.** It refreshed on `SIMULATED_TIME_TICK`, but
   `freezesScenarioTimer` on the opening brief pauses `OpsLogManager` — so the
   clock, and the tick, stop exactly while the operator reads the brief telling
   them a burn happened. The manager's own timer is wall-clock, so the state
   went stale invisibly. Fixed by also repainting on `Events.UPDATE`.
3. **All seven scenarios were unplayable on first draft.** The sidebar's entire
   mission-icons section — Mission Brief *and the objectives Checklist* — is
   hidden unless `settings.missionBriefUrl` is set. Without it the player cannot
   see their objectives, and every scenario's `mission-brief-opened` opener is
   impossible. Caught only by opening the app and finding the Checklist icon
   present but `display: none` on its parent. Now covered by a regression test.

## What worked

- **Measuring before authoring.** A throwaway probe flew every candidate pass
  through the real chain first, so every threshold in S2 and S8 is a measured
  number: SAR-1 day pass peaks at 10.93 dB (193 s above 8 dB), the S8 night pass
  at 13.38 dB. The published worksheet constants were then *chosen* so a correct
  operator computation lands within 0.1 dB of the measurement — rather than
  publishing plausible numbers and hoping.
- **Picking the geometry to fit the lesson.** S8 is called "Night Passes", so it
  uses an actual night pass (2027-03-16 00:28Z) — which happens to be the best
  geometry in the phase (40.4°, 581 km). The title, the fiction and the physics
  agree instead of one being set dressing.
- **A reachability gate.** The new validation test asserts that every condition
  names a mechanic the scenario actually enables and that every referenced id
  (contact, account, audit event, command, space event) exists. That is the
  generalisation of defect 1: it fails CI instead of a playtest.
- **Re-using scenario 1's validated clock** for S2–S7 meant the Phase A RF
  envelope carried over unchanged rather than needing seven re-validations.

## What didn't

- **No dialog clips.** `DialogClip.audioUrl` is required and the VO pipeline is
  still undecided, so — following scenario 1's precedent — the voice is carried
  by SYSTEM `status-check` quizzes. The design plan asks for 10–16 clips per
  Phase 1 scenario; this is well under that, and is the largest remaining gap.
- **Mission brief pages do not exist.** `missionBriefUrl` now points at
  `campaign-2/scenario-N`, but only scenario 1's MDX was ever authored, and the
  docs live in a separate repo outside this working tree. The brief opens to a
  404 today. It is set anyway because the Checklist depends on it.
- **SH-02 is a scheduling abstraction.** `OrbitalSatellite` carries one observer
  (Galway), so satellite az/el is Galway-relative everywhere. S5 and S8 allocate
  contacts to Shetland but never ask the operator to *track* from it, and the
  Shetland window times are authored rather than propagated. Real two-station
  work needs per-station propagation.
- **`isOptional` is still broken** (it does not exempt an objective from the
  completion gate). Phase B avoided the trap by not using it — which is dodging
  the bug, not fixing it.

## What to change next time

- **Grep for a mechanic's UI callers before writing a scenario against it.** M4
  had a manager, a settings block, a condition type, an evaluator, and unit
  tests — everything except a button. Nothing in the type system notices that.
- **Any new scenario needs `missionBriefUrl` from the first line**, or it has no
  checklist. Worth making the checklist independent of the brief instead.
- **Author the Phase C briefs and audio pipeline before the scenarios**, so
  content does not land in a state that needs a second pass to be shippable.

## Verification

- `npm run type-check` — clean.
- `npx vitest run` — 146 files, **4648 passed / 10 skipped**.
- Live browser sweep of all seven: each loads with the correct title, mounts its
  mechanic's tab (and *only* that mechanic's tab), renders its console, and
  shows its full objective checklist. Zero console errors.
- S7 driven end to end in the browser: nominal → stale + Load button → clicked →
  UPDATED, stale cleared.
- **Not verified:** no scenario has been played to completion end-to-end, and no
  E2E spec was written for S2–S8.
