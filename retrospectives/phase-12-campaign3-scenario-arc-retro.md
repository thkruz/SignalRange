# Phase 12 retrospective — Campaign 3 scenario arc (S1–S8)

Plan: [phase-12-campaign3-scenario-arc-plan.md](../plans/phase-12-campaign3-scenario-arc-plan.md)

Eight scenarios, five engine seams (E1–E5), and the campaign's whole security
half, built across three sessions on top of the phase-1 mechanics. The arc
teaches amateur satellite craft in S1–S4 and amateur RF security in S5–S8,
ending on the campaign's thesis: **RF is unauthenticated; physics is your
authentication.**

## What worked

- **Spiking the three risky seams before designing against them.** Three
  parallel subagents read E2/E3/E4 and came back with findings that changed
  the design rather than the implementation. The E4 spike found that
  `GnssThreatManager` had *zero* coupling to the GPSDO and that direct-sampling
  LNBs short-circuit any frequency-error path — so the planned "watch the
  spoof walk the waterfall" tell was not merely unbuilt, it was unbuildable,
  and would have been invisible at the GPS station's 8 MHz span anyway. The
  replacement tell (CLK ΔT walking while SATS stays healthy, plus the
  spoofer's own over-the-air carrier) is better teaching *and* consistent with
  S8's fake beacon. Finding that in a spike cost an hour; finding it in a
  live playthrough would have cost a scenario.
- **One mechanic per scenario, one dB-scale decision per scenario.** Every
  entry in the arc turns on exactly one thing the operator can get wrong:
  channel width (S1), Doppler by hand (S2), handedness (S3), when to trust the
  loop (S4), when to stop trusting GPS (S5), when to stop trusting a text file
  (S6), where the decibels went (S7), what makes a transmission authorized
  (S8). Scenarios that tried to teach two things got split during authoring,
  not during review.
- **Opt-in gating held for five straight engine seams.** `path: 'terrestrial'`,
  `spaceEvents[].initialTle`, `HPAState.maxOutputPower`, the fixed-gain uplink
  branch, and two new condition types are all additive with legacy defaults.
  4,735 unit tests stayed green through the entire phase and the C1 TX-chain
  regression passed 40/40 untouched. This is now five phases of evidence that
  the house pattern works.
- **Authoring passes against the pass planner first.** Every scenario's window
  is a checked-in unit test asserting AOS/max-el before a single objective was
  written. S8's fake-beacon epilogue depends on the sky being *provably* empty
  — that's a test, not a comment, and it is the reason the beat lands.
- **Live verification caught what nothing else could.** Every scenario in the
  arc is a Playwright full-completion spec, and each one found something.

## What didn't

- **The transponder was silently destroying circular polarization, and no test
  could have found it.** `processSignals()` flipped the downlink polarization
  with `signal.polarization === 'H' ? 'V' : 'H'` — so an RHCP uplink came back
  linear and then paid 18 dB of cross-pol at the receiving feed. Every unit
  test passed. Every type-check passed. It surfaced only when a player-driven
  uplink had to close a real loop, because **no campaign had ever transmitted
  into a circular transponder before**. The bug had been sitting in shared code
  the whole time, waiting for the first scenario that exercised it.
- **Two wide-beam antennas in one yard nearly broke the uplink.** The fixed-gain
  TX path inherited the legacy `sat.rxSignal = []` blanket clear. With S8
  running a transmitting yagi *and* a receive-only QFH — whose 140° beam sees
  the same satellite — whichever station updated last wiped the other's
  uplink. The S8 E2E happened to pass, which is the dangerous kind of passing:
  correct by update order, not by design. Fixed with per-antenna attribution
  (`txFedSignalIds_`) plus making a non-transmitting antenna a no-op on the TX
  path, and pinned with a test that asserts *both* update orders.
- **An opaque E2E failure ate an hour for want of a debugging tool.** S8's final
  objective would not complete and the checklist showed only "In Progress" —
  which could mean an unmet condition, an unobserved one, a stale render, or a
  wrong prerequisite, with no way to tell them apart. Two guessing rounds
  produced nothing. Adding `window.debugObjective('<id>')` (per-condition
  satisfied / observed / maintenance-complete / evaluates-now / observation-tab)
  produced the answer in one run: the objective *was* complete and the DOM was
  stale. The tool should have existed before the specs did.
- **The final objective's checklist row never repaints.** The checklist box's
  1 s refresh stops when the completion flow takes over, so the last objective
  keeps `active`/"In Progress" while its state is `isCompleted: true`. It's
  cosmetic (the stale row sits behind the Mission Complete modal) and
  pre-existing — but every prior spec had accidentally dodged it by asserting
  the modal instead, so it stayed invisible until a spec asserted the
  checklist. Still unfixed; it wants a UI phase.
- **I nearly reported a regression that wasn't one.** The C1 scenario3
  regression failed on a quiz following a 90-second antenna slew — while an S8
  re-run was competing for the same CPU. Run alone it passed 40/40. Two
  Playwright processes on one machine make real-time specs unreliable, and the
  failure looked exactly like a real break.

## What to change next time

- **Before authoring a scenario that exercises a code path no campaign has used
  before, write the smallest possible live loop first.** The circular-pol bug
  and the two-antenna clear were both "shared code that had never been
  exercised this way". A ten-minute throwaway that closes the loop end to end
  would have found both before any scenario copy existed.
- **Build the observability tool at the start of a scenario batch, not in the
  middle of the first failure.** `debugObjective` is now permanent; the next
  arc should start by asking what *else* is invisible from the DOM.
- **Run live specs one at a time, always.** Add it to the runbook rather than
  rediscovering it: a real-time spec sharing a machine with another browser is
  a coin flip, and a flaky failure in a regression suite is worse than no
  regression suite because it burns trust.
- **When a "verify it's bit-identical" claim is load-bearing, encode it as a
  test rather than an argument.** The parabolic TX path being untouched is
  asserted now (`leaves the legacy parabolic TX path bit-identical`), which is
  worth more than the branch structure that makes it true.
- **The `isOptional` bug is still live** (`areAllObjectivesCompleted()` ignores
  it, so optional objectives still gate Mission Complete). This arc dodged it
  by never using the flag — the third phase in a row to do so. It should either
  be fixed or the field removed from the type; silently-wrong API is worse
  than no API.
