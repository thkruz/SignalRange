# Retrospective — nats-eu Phase A (Foundation Retrofit)

**Scope:** `plans/phase-4-nats-eu-foundation-retrofit-plan.md` (design Build Phase A).
Brought `nats-eu-scenario1` to full NATS conventions, validated the MERIDIAN Ku
link numbers with an automated gate, expanded the NICE catalog + coverage
tooling, and landed the pass-authoring tool — the groundwork every later
scenario builds on.

## What was built

- **Campaign data extraction** — `natsEuCampaignData` moved to
  `src/campaigns/nats-eu/campaign-data.ts`; importers updated (`router.ts`,
  `campaign-registry.test.ts`, `router.test.ts` mock). S8 prerequisite gating
  (`prerequisiteScenarioIds: ['nats-level-8-night-shift']`) added to scenario1.
- **RF validation gate** — `test/campaigns/nats-eu-rf-validation.test.ts` drives
  the real chain (OrbitalSatellite → AntennaCore → OMT/LNB/IF/AGC → Receiver)
  through the full SAR-1 and SAR-2 passes and asserts the S1 objective
  thresholds hold with margin. **This test caught two real content bugs** (see
  below).
- **Scenario1 retrofit** — added the conventional `review-mission-brief` first
  objective (K0645 + SYSTEM readiness quiz), NICE annotations on every
  objective, the JSDoc alignment header, and `missionBriefUrl`.
- **Mission brief** — `signal-range-docs/.../campaign-2/scenario-1.mdx` authored
  per the mission-brief skill; registered in the docs sidebar.
- **E2E** — `e2e/specs/nats-eu-scenario1-full-completion.spec.ts`, 6 tests, green.
- **NICE catalog** — official PD-WRL-001 (Defensive Cybersecurity) and
  PD-WRL-003 (Incident Response) reference files added; code-selection-guide.md
  gained cyber patterns 6–10; all provisional `*` codes verified real.
- **NICE coverage tooling** — `scripts/gen-nice-catalog.mjs` snapshots the valid
  codes into checked-in `scripts/nice-catalog.json` (542 codes);
  `scripts/nice-coverage.mjs` prints the table + fails on off-catalog codes;
  `test/campaigns/nice-coverage.test.ts` enforces it in CI. Fixed the K0108
  drive-by (→ K1032). `npm run nice-coverage` / `nice-catalog` added.
- **Characters** — Fiona MacLeod, Anneke Visser, Erik Halvorsen, Priya Sharma
  enum entries + name/title/company maps (avatars/audio deferred to Phase B).
- **Pass tooling** — `scripts/author-passes.mjs` batch-authors LEO pass windows
  by grid search with a self-verifying pass table; reproduces the checked-in
  MERIDIAN-SAR-1 pass as its correctness demo.

## Follow-up: the zenith keyhole (post-review, playtest finding)

A playtest after the initial Phase A merge exposed that the gate had a blind
spot of its own, and chasing it down produced the phase's biggest engine fix.

- **Symptom the owner reported:** in the live app the displayed downlink C/N
  only reached ~6.4 dB and needed non-obvious tweaks (widen IF filter, bypass
  AGC) to clear 8, even though the gate claimed a ~14 dB peak.
- **Root cause, found by measuring the live browser app (not just tests):** the
  first gate **slaved the antenna to satellite truth** — perfect boresight — so
  it never exercised real program-track pointing. The original scenario-1 pass
  peaked at ~88° (near zenith). Azimuth rate → ∞ at the zenith, so the pedestal
  cannot slew through the "keyhole": the narrow (~0.45°) Ku beam falls off the
  bird at culmination and C/N craters to nothing *at the top of the pass*. The
  C/N recovered on the descending leg — so the operator's IF-filter/AGC changes
  were coincidental, not causal (verified: those settings move C/N by 0 dB in a
  faithful headless probe). The ADC/effective-C/N theory from the first pass was
  a red herring the live measurement killed.
- **Two real engine mismodels fixed:**
  1. The `KU_BAND_4M_LEO_TRACKER` pedestal was set to **5°/s azimuth** —
     unrealistically slow for a purpose-built Ku LEO tracker (real ones do
     20–30°/s). Bumped to **20°/s**. This alone is what makes moderate passes
     trackable at all.
  2. Scenario 1's passes were re-authored (via `author-passes.mjs`) to a low,
     strong orbit (~360 km) at **moderate max elevation (~25–28°)**, where the
     20°/s pedestal holds the beam within the ephemeris-error floor (~0.1°) and
     C/N peaks at max elevation as it should (~11 dB). A near-zenith pass still
     keyholes — reserved as a future "tracking through the zenith" lesson
     (filed in the campaign design plan).
- **The gate now drives REAL program-track** (program-track mode + target,
  ticked at 60 Hz so the pedestal's slew limit bites) and asserts boresight
  stays tight, plus a **keyhole regression** that a near-zenith pass MUST fail.
  A subtlety worth recording: the satellite position is throttled to
  `POSITION_UPDATE_INTERVAL_MS` (1 s), so it steps discretely and the pedestal
  catches up within each second; the gate samples the *settled* C/N (lets the
  pedestal converge on the throttle-static target, capped at one interval) —
  which is what the player sees ~all the time, and which still fails a keyhole
  because there the pedestal never catches up.

**Lesson:** a pointing-agnostic link budget is not a playability gate. Any RF
validation for a tracked pass must exercise the actual pointing loop, and when
the model disagrees with a playtest, measure the live app before theorizing.

## What worked

- **The RF gate paid for itself immediately.** Running the real signal chain
  headlessly (mocking only `sim-time` and `SimulationManager`) surfaced two
  bugs the Campaign 2 retro predicted: (1) the SAR-1/2 telemetry beacon at
  11699/11703 MHz sat *inside* the 36 MHz video carrier's occupied band, so the
  antenna's co-channel adjacency filter **blocked** it — the beacon the S1
  `signal-detected` objective checks was never detectable; moved to
  11711/11703 MHz clear of the carrier. (2) 22 dBm video EIRP peaked at only
  8.1 dB C/N (SAR-1) and 6.8 dB (SAR-2) — at or below the 8 dB objective
  threshold with zero/negative margin; raised to 28 dBm (that ~14 dB "peak" was
  the ideal-boresight number — the real peak under program-track on the final
  ~28° geometry is ~11 dB, see the keyhole follow-up above). Both would have made
  scenario1 intermittently uncompletable and every later scenario would have
  inherited the bad numbers.
- **A checked-in catalog JSON** decoupled the CI test from the gitignored
  `.claude/` skill files — the test is self-contained and CI-safe, while the
  generator keeps it regenerable from the authoritative reference files.
- **Parallel subagents** for the NICE-file fetch and the pass-authoring tool ran
  while the main thread did the extraction/RF work — no idle time.

## What didn't (and how it was resolved)

- **The E2E was the whole afternoon's tax.** Three separate traps:
  1. **Sim-time gap.** LEO objectives are minutes apart; wall-clock waiting is
     infeasible. Added a small dev/E2E hook `window.advanceSimClock(deltaMs)` on
     OpsLogManager (mirrors `window.debugSignalPath`) so the spec jumps the
     scenario clock; orbital physics follow on the next tick.
  2. **The shared `waitForObjectiveCompleted` helper is buggy** for
     mostly-quiz-free objectives: `data-objective-id` only exists on the
     transient quiz "?" button, so when the element is absent the helper's
     `null?.querySelector('.completed') !== null` evaluates to `true` — a false
     pass. Replaced with a checklist `.objective-item` class check; the final
     objective waits on the completion modal (which freezes the checklist).
  3. **Two-step quiz feedback.** A correct SYSTEM quiz renders a second
     `#quiz-continue-btn` inside `#quiz-feedback` that emits QUIZ_COMPLETED; the
     shared `answerQuizByText`'s broad `:has-text("Continue")` selector could
     miss it. The spec clicks the option then that specific button.
- **`isOptional` does not exempt an objective from the completion gate.**
  `areAllObjectivesCompleted()` is `every(isCompleted)` with no optional
  filtering, so the optional SAR-2 second-contact still had to be driven to
  reach Mission Complete. Worth a design decision later (is "optional" doing
  what authors think?), tracked as a note — not changed in Phase A.
- **Minor UI quirk noted, not fixed:** answering a status-check quiz faster than
  the 5 s pending-indicator delay can leave a stale "Complete the quiz to
  continue" indicator flashing after the objective already completed. Harmless
  (doesn't block play); out of Phase A scope.

## What to change next time

- **Fix `waitForObjectiveCompleted` in the shared E2E utils** (it silently false-
  passes on absent elements) so Phase B scenarios don't each re-discover this.
  A one-line guard (`el && ...`) would do it.
- **Author RF numbers against the validation harness first, not the scenario
  file.** For Phase B scenarios 2–8, add the pass + link-budget assertions
  before writing dialog, so the "beacon inside the carrier" / "no margin" class
  of bug is caught at authoring time.
- **Decide the `isOptional` semantics** before Phase B authors more optional
  objectives on the current (misleading) behavior.
- The `advanceSimClock` hook is now the standard way to test LEO pass scenarios
  end-to-end; reuse it in every nats-eu E2E.

## Verification

- `npm run type-check` — clean.
- `npx vitest run` — 144 files, 4597 passed / 10 skipped (incl. new RF-gate and
  NICE-coverage tests).
- `npx playwright test nats-eu-scenario1-full-completion` — 6/6 green.
- `node scripts/nice-coverage.mjs` — all claimed codes in-catalog; 45 distinct
  product-wide (pre-Phase-B baseline).
