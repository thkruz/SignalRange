# Phase 1 — Campaign 4 (9th EWS / Counter Communications) Retro

Activated the pre-stubbed `ccs` campaign as an offensive SATCOM-denial trainer with an
X-band electronic-attack station, player-driven jamming, redundant transmit strings,
multi-antenna coordination, an EA Assessment console, and an own-force deconfliction
instant-fail. Ships one validation sandbox, `ccs-scenario1` ("Blackout").

## What worked

- **Mirroring the Campaign 5 (signal-hunter) pattern** made the whole feature set additive
  and low-risk: an opt-in `SimulationSettings.electronicAttack` block, a settings-gated
  Mission Control tab (copied from the Geolocation tab wiring), a singleton engine started
  in `base-page.ts` and torn down in the mission-control/sandbox pages, and additive
  condition types. `npm run type-check`, the full 140-file vitest suite (4572 tests), and a
  production webpack build all pass with zero changes to Campaigns 1-3/5.
- **`ElectronicAttackManager` as the offensive twin of `InterferenceManager`.** Reading the
  player's live jam chain (`hpaModule.outputSignals`) and injecting a matching interferer
  into the target satellite's `externalSignal` reuses the exact scripted-jammer path, so the
  denial emerges from the real transponder relay + C/I model instead of a bespoke effect.
  Grading, though, uses a deterministic computed J/S from the same manager, so scenario
  completion never depends on fragile RX-chain tuning.
- **Two mechanics collapsed into existing primitives**, shrinking the new surface:
  multi-antenna targeting reused the existing `equipmentIndex` condition param (no evaluator
  change), and A/B failover reused `tx-active-modem` + `tx-modem-transmitting` against two
  transmit modems — so only two genuinely new condition types were added
  (`jamming-uplink-active`, `jamming-effective`) plus one optional `maxCNRatio` param.
- **Deconfliction landed in `ElectronicAttackManager`, not `RFFrontEndCore`.** Co-locating it
  with the jam logic avoided an `RFFrontEndCore → ScenarioManager` import cycle, and it is a
  Campaign-4-only concept anyway. It emits a one-shot `PROTECTED_FREQ_VIOLATION` that
  `BasePage` turns into the same blocking failure modal as the HPA/dual-transmission
  invariants.
- **The HPA math made "enable the HPA" a hard gate for free.** `processSignals_()` returns no
  output when the HPA is disabled, so no radiation → not effective; enabled output is
  ≈ maxOut − 2·backOff (~43-47 dBm), which at `jamPathGainDb: -20` yields J/S ≈ 17-21 dB, well
  past the 6 dB threshold. Confirmed by reading the module rather than guessing.

## What didn't

- **The plan's theme assumption was already taken.** The plan proposed coyote-brown for
  `ccs`, but Campaign 5 (signal-hunter, 22nd EWS) had already shipped a coyote-brown /
  black-ops theme. Reconciled by giving `ccs` a *sibling but distinct* olive-drab (OD green)
  black-ops palette so the two EW squadrons read as related, not identical.
- **The `ccs` id collision the plan flagged was already fixed upstream** (geolocation renamed
  to `signal-hunter`). Half of step D1 was a no-op — a reminder to re-verify a plan's
  current-state findings against HEAD before executing, not just against when it was written.
- **Redundancy was reframed from A/B HPA chains to A/B transmit strings (modems).** The fixed
  `antenna[i] ↔ rfFrontEnd[i]` wiring ties a second RF front end to the *monitor* antenna, so
  a true backup HPA on the jam aperture would have needed a rewire. Two pre-tuned jam modems
  on one transmitter, with `hardwareFaultEvents` tripping the primary, delivers the same
  detect-fault → fail-over → restore loop with zero engine change.
- **J/S / victim-carrier power levels are calibrated by analysis, not a live run** (like the
  Campaign 2 downlink levels were). The HPA-output math gives wide margin, but a browser
  walkthrough should still confirm the DENIED transition and the monitor C/N drop before the
  scenario is considered shippable.

## What to change next time

- **Drive the scenario in the app (dev server + Playwright) as part of the phase**, not just
  type-check + unit tests. The natural next artifact is an `e2e-scenario-test` for
  `ccs-scenario1` that keys up the jam, asserts the EA Assessment tab reaches DENIED, trips
  the fault, and completes the failover — plus a negative test that jamming the protected band
  fires the fratricide modal.
- **The `hardwareFaultEvents` timer is wall-clock from manager construction** (matching
  `InterferenceManager`). A slow operator can hit the fault mid-establishment; a faster one
  never sees it and fails over proactively. Both paths complete, but an
  objective-activation-relative or event-triggered fault would make the drama land reliably.
- **Consider promoting `equipmentIndex` to a first-class per-antenna selector in the ACU UI.**
  The evaluator already targets antennas by index, but the plan's ACU antenna-selector UI was
  descoped; the scenario grades monitor coordination via `antenna-position` instead. A visible
  selector would make multi-antenna ops clearer for future EA scenarios.
