# Post-Mortem — Campaign 3 (Backyard Operator) & SkyWatcher SDR Console

**Scope of work:** Campaign 3 foundations (fixed-gain antennas, direct-sampling SDR chain,
circular polarization handedness, AFC, three authored satellites, sandbox scenario, Riley
Brooks, freeware theme), the SDR Console tab through three feedback iterations
(tab-set cleanup → SDR++ feature benchmark → bandwidth/rendering fixes), and two
pre-existing engine bugs surfaced along the way. Companion doc:
`phase-1-campaign3-backyard-operator-retro.md` (phase-level what-worked/what-didn't).

## Incident log

Four defects were found only by driving the live app; none were reachable by unit tests
or type checks, and all four were invisible to a code read that trusted local reasoning.

| # | Symptom | Root cause | Fix |
| --- | --- | --- | --- |
| 1 | Wide-beam QFH heard nothing during a pass it should own | `antenna-core.ts get rxSignals()` gates reception to a planar ±1° az/el box of boresight; planar `hypot(dAz,dEl)` also breaks near zenith | Fixed-gain antennas branch to great-circle separation accepted out to one HPBW; parabolic path bit-identical |
| 2 | Receiver LOCKED but decoder showed NO SIGNAL | `getVisibleSignals()` rejects signals below `filterModule.noiseFloor + totalRxGain`; the filter *recomputes* noiseFloor from `bandwidthIndex` each tick, so the explicit config value was dead weight | Physically-correct narrow receive filters per station (200 kHz VHF/UHF, 5 MHz GPS) |
| 3 | "BW too narrow despite visually looking well wide of the margins" (user) | Spectrum analyzer clamped every displayed signal's bandwidth to the RBW — a 2 MHz GPS hump drew as a 30 kHz needle (and Galway's 36 MHz video as a 1 MHz spike, since Campaign 2) | Removed the clamp; renderer now applies per-RBW-bin PSD correction so wideband signals draw at true width and honest height |
| 4 | Dead readouts (`--.-`, empty meter, bare NO LOCK) while a carrier blazed on the waterfall | Modem-bandwidth rules are realistic (channel must bracket the signal, ≥40% fill) but the instrument reported nothing about *why* demodulation failed | S-meter reads passband energy from spectrum bins when the demod has no carrier; lock indicator self-diagnoses (BW TOO WIDE / BW TOO NARROW / MODE?) |

## Lessons learned

1. **Grep institutional memory before designing, not after.** The ±1° reception cliff
   (incident 1) was named, verbatim, in the step-track retrospective — "±1° reception
   cliffs doomed the real algorithm." A five-minute search for remembered failure modes
   against the new design (wide-beam antennas vs. a pencil-beam assumption) would have
   caught it at planning time instead of during a live pass.

2. **When armchair analysis fails once, instrument — don't theorize twice.** Both decode
   bugs (2, 3) resisted two rounds each of unit-level reasoning; a single temporary
   `console.log` in the suspect path plus a Playwright console capture found each root
   cause in one run. The cost of instrumenting is minutes; the cost of a wrong theory is
   a full pass-length verification cycle (~5 min of wall clock per attempt here).

3. **Config fields that a module recomputes are traps.** `filter.noiseFloor`/`bandwidth`/
   `insertionLoss` are overwritten from `bandwidthIndex` every update, so setting them in
   a station config silently does nothing — the same foot-gun class as Campaign 2's dead
   `antennas: []` array. When a config knob doesn't behave, check whether anything
   *recomputes* it before checking whether it's plumbed. (Cleanup candidate: derive these
   from the index alone and delete the dead fields.)

4. **Instruments must not lie, and failures must explain themselves.** Three of the four
   incidents were, at heart, display/feedback defects: the graph disagreed with the
   physics (RBW clamp), or the physics was right but mute (dead readouts, unexplained
   NO LOCK). A training sim's rules can be as strict as reality only if the instruments
   show the *why* — the fix pattern (energy on the meter regardless of demod state,
   self-diagnosing status text) applies to every future mechanic.

5. **User playtesting finds what scripted probes don't — and a "wrong" report still
   points at a real bug.** My probes followed the happy path (default bandwidth, correct
   mode); the user immediately poked the BW field and eyeballed signal widths. Both user
   reports were factually inverted (decode never worked at ≥30 MHz; the graphs were
   aligned) yet each led straight to a genuine defect the probes had walked past.
   Reproduce the report before explaining it away.

6. **Testing against a hot-reloading dev server the user is also using produces phantom
   bug reports.** Mid-refactor HMR states (old filter + new UI, etc.) were live while the
   user experimented, which likely produced the unreproducible "works at 30 MHz"
   observation. Either coordinate test windows or state clearly which build a report was
   observed against.

7. **The opt-in-field gating idiom scales.** Seven seams (`gainModel`, `isDirectSampling`,
   `circularHandedness`, `circularCrossPolLoss_dB`, `isAfcEnabled`, `stationClass`,
   circular OMT mode) all default to legacy behavior when absent; 4,550 existing tests
   stayed green across the entire effort with only intentional updates (the band
   whitelist). Backwards compatibility by construction beats backwards compatibility by
   auditing.

8. **Model missing physics once, at the right layer — never twice.** Handedness loss
   lives at the antenna feed; the OMT became a pass-through in circular mode specifically
   to avoid double-counting (the exact error that sank the original step-track). The
   corollary was honored in reverse for displays: the PSD correction lives in the one
   shared renderer, not per-consumer.

9. **Deterministic orbital authoring pays for itself immediately.** The checked-in
   grid-search tool (`scripts/author-tle.mjs`) produced all three birds in one run with
   pass times asserted in unit tests; every live verification could then say "AOS at
   exactly T+3:00" and treat any deviation as a regression, not noise.

10. **Fictional UIs still need real information design.** The freeware skin is set
    dressing, but the features that survived user contact are the ones carrying signal:
    the VFO passband overlay (makes Doppler drift and BW mismatches visible), dB axis
    labels, the self-diagnosing lock text. Chrome first, then truth — in that order the
    console failed; truth first made the chrome land.

## Follow-ups (carried in the phase retro)

- E2E `ham-sdr-sandbox` Playwright spec; live-verify the yagi/Doppler-chase leg (T+18–30 min).
- Audio demodulation phase (the one defining SDR feature still missing; Recorder is a stub).
- Real APT/SSTV imagery + Riley portrait/audio into R2; campaign card art.
- Eyeball a Campaign 1/2 scenario spectrum after the PSD change (display-only, but visuals shift).
- Cleanup: dead recomputed filter config fields; duplicate `getVisibleSignals`/`getSignalsInBandwidth`
  noise-gate inconsistency (`s.power` vs `s.power + totalGain`).
