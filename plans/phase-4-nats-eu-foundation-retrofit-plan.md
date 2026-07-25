# Phase 4 — nats-eu Foundation Retrofit (Design-Plan Build Phase A)

**Status:** In progress
**Parent:** `plans/phase-1-nats-eu-campaign-design-plan.md` §5 (fix-ups) and §9 (Build Phase A)
**Prior phases:** phase-2 (M1–M8 engine mechanics), phase-3 (operator console tabs)
**Exit criteria:** S1 fully conventional; NICE catalog expanded; MERIDIAN link levels validated by an automated test.

## Why this phase exists

Before building scenarios 2–24 on top of the Campaign 2 engine work, the existing
`nats-eu-scenario1` must be brought up to full NATS content conventions, the RF numbers
it (and every later scenario) depends on must be validated, and the content-tooling and
NICE-catalog groundwork must land so the per-scenario cost in Phases B–D is low.

## Work items

1. **Campaign data extraction + prerequisite gating**
   - Move `natsEuCampaignData` from `src/campaigns/nats/campaign-data.ts` to
     `src/campaigns/nats-eu/campaign-data.ts`; update importers (`src/router.ts`,
     `test/campaigns/campaign-registry.test.ts`, and any others).
   - Gate on Campaign 1 graduation (S8), not full completion: add
     `prerequisiteScenarioIds: ['nats-level-8-night-shift']` to `natsEuScenario1Data`.
     Scenario-level gating (not `prerequisiteCampaignIds`) because campaign-level
     prerequisites require FULL campaign completion. `isScenarioLocked()` checks the
     global completed-ids list, so cross-campaign gating already works; developer mode
     bypasses it.
   - Leave the nats-eu sandbox ungated.

2. **Automated RF validation test (blocking gate)**
   - Campaign 2 retro flag: MERIDIAN RF levels were never live-validated. Add a vitest
     integration test that steps the sim through the full MERIDIAN-SAR-1 pass
     (AOS T+2 min → max el 88° T+8 → LOS T+14.5 min, scenario clock 2027-03-15 14:00 UTC)
     and asserts:
     - beacon power at the receiver crosses the `-130 dBm` detection threshold used by S1,
     - C/N on the video downlink exceeds the S1 objective threshold (8 dB) around max
       elevation with margin,
     - C/N falls back below usable levels after LOS (sanity that the numbers move).
   - This is the gate for authoring 23 more scenarios on these link numbers.

3. **Retrofit `nats-eu-scenario1` to full conventions**
   - Add `review-mission-brief` first objective (`nice: ['K0645']`, `freezesScenarioTimer`,
     `mission-brief-opened` + SYSTEM readiness `status-check` quiz), matching the
     nats scenario9 pattern.
   - Annotate every objective with `nice` codes (2–3 codes, primary first) per the
     design plan §3 row S1: S0421, T0153, K1032 primaries.
   - Add the JSDoc NICE Framework Alignment header (Primary Codes / Supporting Codes).

4. **Mission brief MDX + missionBriefUrl**
   - Author the scenario-1 brief in `../signal-range-docs` under the campaign-2 path
     (confirm `campaign-2/scenario-1` convention against the docs repo structure).
   - Wire `settings.missionBriefUrl:
     'https://docs.signalrange.space/campaign-2/scenario-1?content-only=true&dark=true'`.

5. **E2E full-completion spec**
   - `e2e/specs/nats-eu-scenario1-full-completion.spec.ts` via the e2e-scenario-test
     skill; workers=1 locally, 127.0.0.1 baseURL (E2E environment notes).

6. **NICE catalog expansion**
   - Fetch official NICE Framework (2024 components) Protection & Defense work-role
     files: Defensive Cybersecurity (PD-WRL-001) and Incident Response (confirm exact
     PD-WRL id), add to `.claude/skills/nist-nice-reviewer/references/` in the same
     format as the shipped role files.
   - Update `code-selection-guide.md` with cyber selection patterns.
   - Re-verify the `*`-marked provisional codes from design plan §3 (S0583, S0805,
     S0806, K0726) against the downloaded files; record fallbacks if absent.

7. **NICE coverage report script + off-catalog test**
   - Script that extracts all `nice:` codes claimed across campaigns, diffs against the
     reference catalog, fails on off-catalog codes, prints the per-campaign coverage
     table. Wire an assertion into the test suite (campaign-registry test area).
   - Drive-by: fix the `K0108` off-catalog code in `signal-hunter/sandbox.ts`
     (map to K1032 or K0812 per design plan §5).

8. **Character enum entries**
   - Add Fiona MacLeod (SH-02 operator), Anneke Visser (MERIDIAN constellation ops),
     Erik Halvorsen (customer, Nordic Maritime Watch), Priya Sharma (NATS Group
     Security/CSIRT) to `src/modal/character-enum.ts`. Enum entries only — avatars and
     audio slots are Phase B when the characters first speak.

9. **TLE batch pass-window authoring**
   - Extend the checked-in TLE grid-search tooling (`scripts/author-tle.mjs`,
     `scripts/author-tle-signal-hunter.mjs`) to batch-author pass windows: given
     station + list of desired (AOS offset, max-el, duration) tuples, emit TLEs +
     verified pass tables. This attacks the single biggest per-scenario content cost
     (design plan §9, risk #2).

10. **Verification + retro**
    - `npm run type-check`, unit tests, new RF gate test, scenario1 E2E green.
    - Retro to `retrospectives/phase-4-nats-eu-foundation-retrofit-retro.md`.

## Decisions taken in this phase

- **Prerequisite gating:** S8 graduation (`nats-level-8-night-shift`), per design-plan
  recommendation — players are not blocked by Campaign 1's 16 mastery levels.
- **Plan numbering:** design-plan build phases are lettered A–D; repo work-phase files
  are numbered. This file is work-phase 4 = design Build Phase A.

## Out of scope (deferred)

- SH-02 Shetland station, scenarios 2–8, avatars/audio for new characters → Phase B.
- `service-continuity` placeholder condition disposition → tracked separately.
- Campaign metadata recompute (`totalDuration`) → Phase D.
