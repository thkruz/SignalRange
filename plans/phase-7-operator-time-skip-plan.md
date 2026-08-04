# Phase 7 — Operator time skip (fast-forward to next contact)

## Problem

nats-eu scenarios 7 and 8 put long stretches of empty sky between the shift
starting and the pass the mission is about. Scenario 8's SAR-2 graze is at
T+150 min; scenario 7's second SAR-1 pass is ~T+95. Sitting through that is
realistic and teaches nothing.

## Decisions (agreed with the user before implementation)

| Question | Decision |
|---|---|
| What does the skip target? | The next AOS, minus a lead time, so acquisition is still flown by hand |
| How does time advance? | Fast-forward in steps over ~2.5 s, not a single jump — conditions evaluate through the skipped window |
| Where does the control live? | Mission Control header, gated on a per-scenario `settings.timeSkip` opt-in |
| Timer/objective desync | Block when unsafe **and** advance timers with the skip |
| Scoring elapsed time | Skipped time **counts** toward the operator's shift |
| COMSEC key age | Keys age with the skip; the confirm modal warns when a skip would expire one |

## The load-bearing problem: two clocks

The codebase already had two clocks that were never the same quantity, which
was harmless only because nothing could move one without the other:

- **Scenario clock** (`OpsLogManager` / `getSimulatedNowMs`) — absolute UTC,
  what SGP4 and pass prediction run on.
- **Mission elapsed** — "seconds since mission start", which seven managers
  each computed independently as `Date.now() - this.missionStartTime_`
  (commanding, weather, GNSS threat, hardware faults, interference, space
  events, security console), plus `ObjectivesManager.scenarioStartTime_` and
  `CryptoModule.keyLoadedAt`.

Advancing only the scenario clock would put the console and the sky in
different hours: scenario 8's command window opens at `windowStartS: 220`,
authored to coincide with its satellite's AOS. Skip to a later pass and the
bird is overhead while the console says "out of window".

**Resolution:** `src/simulation/mission-clock.ts` — `missionNowMs()` is wall
clock plus all skipped time. Every mission-elapsed anchor uses it for both the
start stamp and the measurement. With no skip the offset is 0, so behaviour is
byte-identical for every campaign that never skips.

## Implementation

1. `src/simulation/mission-clock.ts` — `missionNowMs` / `addSkippedTime` /
   `getSkippedMs` / `resetMissionClock`, reset on `SimulationManager.destroy()`.
2. Route the nine mission-elapsed anchors through it (one-line change each).
3. `ObjectivesManager.applyTimeSkip(deltaMs)` — countdown timers are decremented
   state rather than derived, so they are told explicitly; elapsed time needs no
   adjustment because it now reads the mission clock. Plus
   `hasRunningObjectiveTimer()` and `hasInstance()` for the guardrail.
4. `CryptoModule.getKeyLifeRemainingMs()` + `hasInstance()` for the modal warning.
5. `src/simulation/time-skip-controller.ts` — target resolution, guardrails,
   stepped fast-forward, `TIME_SKIP_STARTED/PROGRESS/ENDED` events.
6. UI: `time-skip-modal.ts` (confirm), `time-skip-overlay.ts` (racing clock +
   progress bar), `time-skip-format.ts`, `time-skip.css`, and the header control
   in `global-command-bar.ts`.
7. `settings.timeSkip` opt-in block; enabled on scenarios 7 and 8.

## Guardrails

The skip is refused while: the scenario clock is not running or is paused (brief
open, objective failed), any satellite is above the elevation mask, or an
objective countdown is running. `findTarget()` only ever considers the **next**
pass — never one beyond it — so an operator two minutes from AOS cannot skip
over the contact they came to work.

## Verification

- `npm run type-check` clean.
- `npx vitest run` — 4674 pass (26 new: 20 in
  `test/simulation/time-skip-controller.test.ts`, 6 in the objectives suite).
- `e2e/specs/nats-eu-time-skip.spec.ts` — 6 tests, all passing against the real
  app on scenario 7: control mounts only for an opted-in scenario, stays
  disabled while the clock is frozen and while the wait is under the floor,
  enables once the sky is empty, and advances **both** clocks by the same amount
  (asserted via new `window.simClockMs()` / `window.missionSkippedMs()` dev
  hooks, since that invariant is invisible from the DOM).
- Visual check of the button, modal and overlay by screenshot.
