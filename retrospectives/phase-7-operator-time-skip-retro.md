# Phase 7 retrospective — Operator time skip

Plan: [phase-7-operator-time-skip-plan.md](../plans/phase-7-operator-time-skip-plan.md)

## What worked

- **Reading the clock plumbing before writing anything.** The feature looked
  like "call `advanceClock(delta)` behind a button". Grepping for
  `Date.now()`-anchored mission starts first turned up seven managers with
  their own private mission clock, which is the difference between a working
  feature and one that silently breaks scenario 8's command window.
- **A shared `missionNowMs()` instead of an `applyTimeSkip()` on nine classes.**
  One-line change per manager, zero behaviour change when nothing skips, and
  new mechanics get it for free as long as they use the accessor.
- **Stepping the clock rather than jumping it.** The existing simulation loop
  already propagates orbits and evaluates conditions per frame, so advancing in
  chunks means everything scheduled inside the skipped window still fires. The
  "visual feedback" the user asked for fell out of the same design: the header
  clock races because it is genuinely being advanced 150 times.
- **The E2E spec earned its keep immediately** — see below.

## What didn't

- **Two real bugs survived a clean type-check and 4,674 green unit tests**, and
  both died in the first live run:
  1. The control refreshed on `SIMULATED_TIME_TICK`, which does not fire while
     the scenario clock is paused — i.e. exactly while the brief is open, which
     is the first thing the operator sees. The button sat there with a stale
     "No upcoming contact to skip to" instead of "Scenario clock is paused".
     Fixed by refreshing on the command bar's 1 Hz real-time interval. The
     Pass Schedule tab had already hit this exact trap and documented it; I
     did not read that comment closely enough the first time.
  2. `findTarget()` searched forward for the first pass with enough lead time.
     After a completed skip the operator sits 2 min from AOS, so it happily
     offered to skip **over** the contact they had just skipped to. Fixed by
     only ever considering `passes[0]`.
- **A fragile quiz click in the throwaway screenshot script** (`.first()` on
  `.quiz-option-btn`) passed once and failed the next run. The same fragility
  was in the real spec. Both now select the option by text.
- **The first button label wrapped to two lines** in the header
  ("SKIP 1H 18M 06S"). Only visible in a screenshot; no assertion would have
  caught it. Added a compact one-unit format for the button and kept the
  precise value in the modal.

## What to change next time

- **Any new control that reports state needs to be told what drives its
  refresh, explicitly.** "Refresh on the sim tick" is wrong for anything that
  must stay accurate while the sim is paused. Default to the real-time
  interval and only use the sim tick for values that are meaningless when
  time is stopped.
- **When a feature moves a clock, enumerate every clock first.** `grep` for
  `Date.now()` in the domain before designing. The seven-manager finding
  reframed the whole task.
- **Screenshot the UI, not just assert on it.** Both the wrapped label and the
  overlay's legibility were only checkable by looking.
- **The `isOptional` gap is still open** (`areAllObjectivesCompleted()` ignores
  it). Untouched here, still a live bug in three shipped scenarios.

## Deliberate limits

- Only scenarios 7 and 8 opt in. The control is inert everywhere else.
- The COMSEC expiry warning is wired and tested but will not fire in practice
  today: keys are loaded with `keyValidDays: 90` and `timeScaleFactor_` is 1,
  so an hour-long skip ages a key by 0.05%. It becomes real the moment a
  scenario loads a short-lived key or calls `setTimeScale()`.
- Skipped time counts toward scored elapsed time, per the user's decision. On a
  scenario with an `elapsedTimeThreshold` penalty, a long skip can therefore
  cost points. No such scenario exists in nats-eu today.
