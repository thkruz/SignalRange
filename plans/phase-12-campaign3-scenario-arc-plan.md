# Phase 12 — Campaign 3 Scenario Arc (S1–S8) Plan

**Status: PHASES A–D COMPLETE (S1–S8 shipped, E1–E5 built); REMAINING: Phase E** · This is the working
tracker — update the checkboxes and the Status log at the bottom as work proceeds.
Sub-phases are designed to be executed in order (A → E), each with its own exit
criteria. Phase A was executed partially (E5 only — the spikes and E1 are not needed
until S5–S8) and Phase B in full.

## Goal

Author Campaign 3 (`ham-sdr`, "Backyard Operator") scenarios 1–8 on top of the
phase-1 mechanics (fixed-gain antennas, direct-sampling chain, handedness, AFC,
SDR Console, freeware theme — all shipped and sandbox-verified), plus the four
engine seams the arc needs. The campaign teaches amateur satellite craft in the
front half and **amateur RF security** in the back half.

**Distinctness contract vs C1/C2** (every scenario is checked against these):

1. **Progression = hardware, not qualification.** The station physically grows
   scenario by scenario (QFH → yagi/rotator → GPS patch → TX rig). No
   certifications, no shift-work fiction.
2. **Discovery, not procedure.** No checklists, no ops-log discipline, no
   insta-fails. Failure is a missed pass; Riley explains after the fumble.
3. **Weak-signal craft.** Every scenario turns on one dB-scale decision
   (filter bandwidth, handedness, pointing, Doppler). The two hidden gates
   (great-circle HPBW box, filter-noise decode gate — see memory
   `campaign3-backyard-architecture`) are gameplay, not gotchas.
4. **RF is unauthenticated; physics is your authentication.** The security
   spine (S5–S8): GPS spoofing, poisoned TLEs, local RFI, pirate uplinks,
   fake beacons detected by their missing Doppler.

**Hard constraint (unchanged from phase 1):** 100% backwards compatibility with
C1/C2/C4/C5. Every engine change is opt-in via optional fields defaulting to
legacy behavior.

## Prior art this plan builds on

- [phase-1-campaign3-backyard-operator-plan.md](phase-1-campaign3-backyard-operator-plan.md) — mechanics + sandbox (shipped)
- [retrospectives/phase-1-campaign3-backyard-operator-retro.md](../retrospectives/phase-1-campaign3-backyard-operator-retro.md) — two standing design notes: S3 must start the yagi on LHCP; AFC discovery is staged (manual chase first, AFC second). **Open item: the yagi/CUBEHOP-1 leg has never been driven live** — closed in Phase B.
- Engine reuse: `settings.interferenceEvents` ([scenario-manager.ts:101](../src/scenario-manager.ts#L101)), `settings.gnssThreat` (:359), `settings.timeSkip` (:310), `GnssThreatManager` ([gnss-threat-manager.ts](../src/gnss-threat/gnss-threat-manager.ts)), nats-eu M4 ephemeris panel, `ephemeris-updated` / `status-check` / `custom` condition types ([objective-types.ts](../src/objectives/objective-types.ts)).
- TLE authoring: `scripts/author-tle.mjs` (run from repo root), per-scenario epoch.
- Scenario ids are a global flat namespace → all ids `ham-sdr-s<n>`. Dual
  registration: campaign `scenarios` array **and** flat `SCENARIOS` in
  `scenario-manager.ts`.

## The eight scenarios

One new mechanic per scenario (C2's proven pattern). All stations
`stationClass: 'backyard'`, receive-only until S8. Epochs advance through
summer 2027 from the sandbox epoch (2027-06-19); every scenario's TLEs are
authored against its own `scenarioStartDate`.

| # | id | Title | Teaches | Station hardware | New engine dep |
| --- | --- | --- | --- | --- | --- |
| S1 | `ham-sdr-s1` | First Light | QFH + click-to-tune + APT decode (WXSAT-19) | QFH only | — |
| S2 | `ham-sdr-s2` | The Slippery Bird | Manual Doppler chase (CUBEHOP-1), program-track | + yagi/rotator (RHCP preset, AFC absent) | — |
| S3 | `ham-sdr-s3` | Wrong-Handed | Polarization handedness diagnosis | yagi **starts LHCP** | — |
| S4 | `ham-sdr-s4` | Set and Forget | AFC discovery across two passes | same | E5 (`receiver-afc-enabled` condition) |
| S5 | `ham-sdr-s5` | The Noise Bump | GPS L1 acquisition, then **GPS spoofing** detection + holdover | + GPS patch | E4 |
| S6 | `ham-sdr-s6` | The Network Wants Vermont | Multi-pass scheduling for the network, then **tampered TLE** diagnosis + element update | full RX station | E3 |
| S7 | `ham-sdr-s7` | Margin Call | **Local RFI foxhunt** (yagi DF + front-to-back null), then marginal low-el decode with narrow filter | full RX station | E1 |
| S8 | `ham-sdr-s8` | Callsign | License exam → **pirate carrier** ethics → **first uplink TX** → **fake beacon** caught by missing Doppler | + TX rig | E1, E2 |

### Per-scenario objective sketches

Condition types named below all exist today unless tagged (E5).

- **S1** — `mission-brief-opened`; `tab-active` (Observations); `signal-detected`
  @137.1 MHz; `receiver-signal-locked` + decoded weather image; `status-check`
  (Riley: what is APT / why no retuning needed at 137 MHz). WXSAT-19 AOS ~T+3 min.
- **S2** — `antenna-tracking-mode-set: program-track` on the yagi (set mode
  BEFORE target — `handleTrackingModeChange` clears `targetSatelliteId`);
  `receiver-signal-locked` with `mustMaintain` across the mid-pass Doppler slide
  (forces ±1/±10 kHz manual retunes); `status-check` on why 435 MHz slides but
  137 MHz didn't. **Live-verify the yagi leg here (retro debt).**
- **S3** — yagi initialized LHCP via `antennasState`; `receiver-snr-threshold`
  on 435.25 only reachable after flipping to RHCP (~18 dB swing);
  `status-check` (reflection reverses handedness). Optional: add
  `antenna-polarization-set` condition (E5, nice-to-have — the SNR gate already
  enforces the flip).
- **S4** — two passes with `settings.timeSkip` enabled. Pass 1: maintain lock
  manually (as S2). Pass 2: `receiver-afc-enabled` (E5) + `receiver-signal-locked`
  with `mustMaintain`, hands off the tuning knob. Riley compares the two.
- **S5** — `signal-detected` near 1575.42 MHz (the noise bump; `status-check` on
  spread spectrum). Then `settings.gnssThreat` spoof begins: reference walks,
  displayed frequencies drift. Detect (`status-check` reading the timing-offset
  tell) → switch reference to holdover (gpsdo condition per E4 design) → spoof
  ends, re-lock.
- **S6** — network "observation requests" frame 3 passes; `settings.timeSkip`
  between them. Pass 2 no-shows (scenario starts with a tampered/stale TLE for
  that bird, E3): predicted AOS passes with empty sky. Open ephemeris panel,
  load fresh elements → `ephemeris-updated` → recapture on the next pass.
  `status-check` on TLE supply-chain trust.
- **S7** — terrestrial RFI emitter (E1) near the backyard raises the noise floor.
  DF it with manual yagi sweeps (signal-strength-vs-azimuth), then null it with
  the front-to-back ratio (`antenna-position` pointing away / `custom` evaluator
  on the C/N recovery) or `notch-filter-configured`. Then the marginal pass:
  `filter-bandwidth-set` (narrow, index 5 = 100 kHz) + `receiver-signal-locked`
  on a ≤15° max-el pass that only closes with the narrow filter.
- **S8** — three acts. (1) License exam: `status-check` quiz chain (band plan,
  control-operator responsibility, why ham bands can't encrypt). (2) Pirate
  prelude: existing transponder-injected `interferenceEvents` carrier on
  CUBEHOP-1's uplink — hear the unauthorized user, `status-check` on what makes
  a transmission authorized. (3) First TX (E2): `tx-modem-frequency-set` /
  `tx-modem-transmitting` on the 435 uplink, then `receiver-signal-locked` on
  your own transponded downlink. Epilogue: terrestrial fake WXSAT-19 beacon
  (E1) — right frequency, zero Doppler; `status-check` (which signal is real
  and how do you know) + `custom` condition flagging the spoof.

## Engine work packages

### E1 — Terrestrial emitters received at the station (S7 RFI + S8 fake beacon)

The one genuinely new seam. Today `interferenceEvents` are transponder-injected
(require `satelliteNoradId`, uplink pol `'H' | 'V'`). Backyard RFI and fake
beacons are **ground-based emitters received directly by the station antenna**.

Design direction (confirm at implementation): extend the `interferenceEvents`
entry with an opt-in discriminator, e.g. `path?: 'transponder' | 'terrestrial'`
(absent → `'transponder'`, bit-identical). A terrestrial event carries
`emitter: { latitude, longitude }` (field already exists for C5) and is summed
into the station's received spectrum via great-circle bearing → antenna
off-axis pattern gain (fixed-gain pattern math already computes this) at 0°
elevation. **No Doppler applied — that absence is the S8 gameplay.** Circular
pol option needed (fake beacon is RHCP; current union is `'H' | 'V'`).
BC: absent discriminator → existing path untouched; C1/C2/C4/C5 configs carry
no terrestrial events.

### E2 — Backyard transmit path (S8)

S8's station gains a transmitter. The config arrays already support
transmitters; the work is: (a) a minimal TX panel inside the SDR Console
(stationClass `'backyard'` shows no TX tab), gated on the station actually
having a transmitter; (b) verify the uplink→transponder→downlink loop works
with an `OrbitalSatellite` (uplink Doppler: check whether satellite RX applies
the Doppler factor; if not, additive opt-in so the player's uplink lands in the
transponder passband); (c) low power/EIRP numbers calibrated live so the
return downlink is decodable but modest. BC: professional TX tab and C1/C2
transmit chains untouched.

### E3 — Ephemeris tamper/staleness (S6)

Reuse the nats-eu M4 ephemeris panel + `ephemeris-updated` condition. Work:
(a) verify the panel's opt-in gating activates for a ham-sdr scenario (it was
built for nats-eu — confirm the settings key and tab registration);
(b) per-satellite **initial-TLE override** so the scenario boots with the
tampered element set while the panel's "fresh" elements are the authored truth
(may already be expressible; verify before building anything). Reskin copy to
amateur voice ("Update elements from network").

### E4 — GNSS threat on the backyard chain (S5)

`GnssThreatManager` drives a GPSDO timing offset; backyard stations have no
GPSDO module. Design at implementation: either attach a headless GPSDO to the
S5 station config (zero UI work; SDR Console gets a small "REF: GPS / HOLDOVER"
indicator+toggle) or add a minimal reference-mode field to the SDR front end.
Prefer whichever reuses `GpsdoReferenceMode` and the existing gpsdo-* condition
types unchanged. The spoof's frequency-walk must be visible on the waterfall
(that's the amateur tell).

### E5 — Additive condition types (S3/S4)

- `receiver-afc-enabled` — modem AFC state matches target (required, S4).
- `antenna-polarization-set` — handedness matches target (nice-to-have, S3).
Both additive to the `ConditionType` union + evaluator; pattern-match the
existing rx-* evaluators.

## Sub-phases (execute in order; check off as completed)

### Phase A — Verification spikes + E1 + E5

- [x] Spike: M4 ephemeris panel (2026-07-26). Gating: any OrbitalSatellite
      (registers the tab — labelled "Observations" on backyard stations) +
      `settings.spaceEvents` non-empty (renders the panel). Fresh elements are
      scenario-authored in `spaceEvents[].newTle`; a wrong BOOT TLE is
      expressible via a scenario-local satellite instance — but replay safety
      required a small additive anyway: `spaceEvents[].initialTle` re-tampers
      the (reloadTle-mutated) instance on every load. Copy reskin needed
      (strings were professional voice) — done, conditional on backyard.
- [x] Spike: GnssThreatManager↔GPSDO (2026-07-26). NO coupling existed at all:
      the manager is self-contained, `setReferenceMode` had zero production
      callers, and direct-sampling LNBs short-circuit any frequency-error path
      — the plan's "frequency walk on the waterfall" tell is unbuildable
      without a new RF seam AND would be invisible at the GPS station's 8 MHz
      span. **Design change:** the spoof tells are (a) the CLK ΔT readout
      walking while SATS stay healthy (the manager's own documented signature,
      now surfaced on the SDR console) and (b) the spoofer's own over-the-air
      L1 carrier via E1 — which also keeps the no-Doppler lesson consistent
      with S8's fake beacon.
- [x] Spike: uplink Doppler (E2 scoping, 2026-07-26). Not modeled, documented
      as such; a fixed uplink always lands in the transponder passband and the
      TRANSPONDED DOWNLINK still Dopplers (free chase gameplay), so no opt-in
      needed for S8. Real E2 gaps mapped instead: no uplink link budget
      (missing FSPL/pattern → downlink ~58 dB hot), HPA ALCs to a hardcoded
      2 kW, ±2° TX beam gate vs the 40° RX beam, stale-uplink leak on slew,
      CUBEHOP needs an uplink transponder config, TX modem constraints
      validator rejects 435 MHz (bypass by wiring handlers directly).
- [x] E1: terrestrial-emitter path (2026-07-26): `path: 'terrestrial'`
      discriminator + pol union widened to RHCP/LHCP; emissions received
      per-antenna via great-circle bearing/distance → FSPL → off-axis pattern
      → pol/feed losses; joins the existing C/I blocking pass so strong RFI
      degrades wanted signals. `attachStationLocation` wired in GroundStation.
      Unit tests: activation, satellite-path regression, link-budget power,
      front-to-back DF sweep, legacy no-op (test/interference/).
- [x] E5: `receiver-afc-enabled` + `antenna-polarization-set` conditions +
      evaluators + unit tests (2026-07-25; both used by S2–S4, live-verified)
- [x] Exit (E1 portion): terrestrial emitter visible on the SDR Console live
      (S5 E2E: spoofer carrier detected on the waterfall at 1575.42)

### Phase B — S1–S4 (craft half) — COMPLETE 2026-07-25

- [x] Pass timing: **no new TLEs needed** — the checked-in sandbox TLEs serve
      all four scenarios via successive-evening `scenarioStartWallTime`s
      (S1/S2 June 19 16:00/16:14, S3 June 20 16:24 @63°, S4 June 21 16:34
      @83°); deterministic pass unit tests added per window (C2 pattern)
- [x] Station configs (S1 QFH-only → S2+ yagi; S3 boots the yagi on LHCP)
- [x] S1 "First Light" + objectives + Riley dialog (text clips, `audioUrl: ''`)
- [x] S2 "The Slippery Bird" + objectives + dialog (AFC forbidden via
      `receiver-afc-enabled { afcEnabled: false }` — the retro's "by hand once")
- [x] S3 "Wrong-Handed" (starts LHCP per retro note) + objectives + dialog
- [x] S4 "Set and Forget" — **design change from this plan**: single-pass A/B
      (manual first half → AFC second half) instead of two passes + timeSkip;
      the second same-evening CUBEHOP pass peaks at only 15.6° and Doppler is
      at its extremes near AOS/LOS anyway, so one pass carries both lessons
      with no marginal-signal risk. timeSkip deferred to S6 as first use.
- [x] Register all four (campaign array + flat `SCENARIOS` + registration test)
- [x] **Live yagi verification (retro debt CLOSED): S2 driven end-to-end
      in-browser — program-track, 435.25 detect, 120 s hand-flown Doppler
      chase, Mission Complete**
- [x] Live full completions of S1/S3/S4 as Playwright specs (S3 asserts the
      >10 dB C/N swing on the RHCP flip; S4 asserts 120 s hands-off AFC hold)
- [x] Exit: type-check clean, 4701 vitest green, all four completable live via
      e2e/specs/ham-sdr-scenario{1..4}-full-completion.spec.ts (+ shared
      e2e/utils/ham-sdr-helpers.ts)

### Phase C — E3 + E4 + S5–S6 (security spine, part 1)

- [x] E4 build (2026-07-26, per the spike's design change): SDR console SOURCE
      section gains REF row (GPS · n SATS / HOLDOVER / ACQUIRING) + toggle +
      CLK ΔT readout (reads GnssThreatManager.timeOffsetUs, red past 20 µs).
      The toggle drives BOTH the GPSDO's physical GNSS switch (real holdover
      physics, gpsdo-* conditions) and GnssThreatManager.setReferenceMode —
      the first production caller `gpsdo-reference-mode-set` ever had.
      Live-verified in the S5 E2E: offset walks under spoof, freezes in
      holdover, GNSS re-acquires on return.
- [x] S5 "The Noise Bump" (2026-07-26): 7 objectives / 85 pts on BKYD-GPS.
      Detect the L1 hump (detect-vs-demodulate lesson), spot the terrestrial
      spoofer carrier (E1), read the walking-clock tell, 60 s holdover hold,
      verified all-clear, principle log. New e2e helper `advanceMissionClock`
      (window hook advancing sim + mission clocks together — gnssThreat and
      interference envelopes run on the mission clock, which advanceSimClock
      deliberately does not touch). E2E 7/7 green live (1.6 min).
- [x] E3 build (2026-07-26): `spaceEvents[].initialTle` (tamper-at-load,
      replay-safe) + amateur copy reskin of the ephemeris panel (Observations /
      TLE SUSPECT / Fetch Fresh Elements), conditional on backyard stations —
      C2 strings byte-identical. Unit tests: test/space-events/initial-tle.test.ts.
- [x] S6 "The Network Wants Vermont" (2026-07-26) — **design change from the
      plan's "3 passes" sketch:** two passes carry the story (WXSAT 14:50 +
      recovered CUBEHOP 16:59); the "pass 2 no-show" is the DISAGREEMENT
      between the network request sheet and the tampered predictions (with one
      TLE per bird, truth and prediction cannot diverge in-sim — the E3 spike's
      key finding), sold by brief/dialog/quiz + the TLE SUSPECT panel. Tamper =
      RAAN +60° (no CUBEHOP pass ≥5° all afternoon, unit-tested); scenario-local
      satellite instance so S2–S4's shared bird is never touched. First use of
      settings.timeSkip. 6 objectives / 75 pts.
- [x] Exit: type-check clean; S5 E2E 7/7 and S6 E2E 6/6 green live
      (ham-sdr-scenario{5,6}-full-completion.spec.ts); C2 panel strings are
      untouched when no backyard station is present (conditional reskin) —
      a live nats-eu S7 replay is still owed as a belt-and-braces check

### Phase D — E2 + S7–S8 (security spine, part 2)

- [x] S7 "Margin Call" (2026-07-26): RFI foxhunt + marginal pass, 6 objectives
      / 75 pts. New SDR-console surfaces this needed (grep-for-UI-callers rule
      caught them): a FILTER section (IF BW select over
      FILTER_BANDWIDTH_CONFIGS + one-knob notch: fixed 300 kHz / 30 dB at an
      entered center) and a MAN AZ + GO manual slew row in the ROTATOR panel.
      RFI = E1 terrestrial at 435.36 MHz / 80 kHz (deliberately clear of the
      bird's channel + Doppler excursion so the notch never bites the
      downlink), 1.2 km due east, CONTINUOUS (accidents have no duty cycle).
      DF objective = antenna-position az 90 ±12; margin objective gates on
      filter index 5 + program-track + lock through the 18.4° June-24 pass.
      E2E 6/6 green live (3.7 min; lock held through the low pass).
- [x] E2 build (2026-07-26) — all seven mapped gaps closed, every change
      gated so C1/C2/C4/C5 are untouched:
      - uplink link budget in `updateTxSignals_` (FSPL over true slant range +
        atmosphere + off-axis pattern rolloff), on a `gainModel === 'fixed'`
        branch; the parabolic branch is the original code, unchanged;
      - beam gate for that branch is the antenna's own HPBW via true angular
        separation (mirrors `rxSignals`), replacing the ±2° planar box;
      - stale-uplink leak fixed with per-antenna attribution
        (`txFedSignalIds_`): leaving the beam withdraws only the signals THIS
        antenna pushed, never another station's uplink or injected RFI. A
        receive-only wide-beam antenna is a **no-op** on the TX path — S8's
        QFH sees the same bird through its 140° beam, and the legacy blanket
        `sat.rxSignal = []` would have deleted the yagi's uplink depending on
        station update order (unit-tested both orders);
      - `HPAState.maxOutputPower` / `p1db` optional overrides (absent → 63/59
        dBm exactly as before); S8 authors a 37 dBm brick;
      - CUBEHOP `VU-XPD` transponder 435.90 up / 435.29 down, RHCP, 30 kHz,
        gain +132 dB (calibrated: ~42 dBm EIRP − ~147 dB FSPL → ~−105 dBm at
        the bird → ~+27 dBm down, just above the +28 dBm beacon);
      - **circular polarization now passes THROUGH the transponder** — the
        downlink pol flip was unconditional (`'H' ? 'V' : 'H'`), which turned
        every RHCP uplink into a linear downlink the circular feed could not
        hear. Linear H↔V behavior is unchanged;
      - SDR-console TRANSMIT section (TX FRQ / PA OUT watts / TX key + ON AIR
        pill) wired straight to the transmitter core, bypassing the
        adapter-level L-band validator; renders an "RX ONLY — NO TRANSMITTER"
        stub unless the station's BUC is powered, so S1–S7 are unchanged;
      - `backyardTxStation`: BUC powered AND unmuted with the HPA enabled —
        the HPA-without-drive insta-fail checks exactly those flags and is
        neither campaign- nor station-class-gated;
      - E1 addition: terrestrial emitters are now filtered to the receiving
        antenna's own RX band (S8 runs a 137 MHz emitter and a 70cm rig in
        one yard).
- [x] S8 "Callsign" (2026-07-26) — 9 objectives / 100 pts, four acts on the
      authored June-26 passes: license exam (2 quizzes) → pirate carrier
      relayed by the new transponder (CUBEHOP 15:55 @28.9°) → first TX with
      the player's own transponded downlink (CUBEHOP 17:31 @25.7°) → fake
      WXSAT-19 beacon on the QFH at ~17:47, when the real bird's next pass is
      a 2° graze at 23:46 (unit-tested: the sky is provably empty).
- [x] Exit: type-check clean; 4735 vitest green (+13); S8 E2E 8/8 green live
      ([ham-sdr-scenario8-full-completion.spec.ts](../e2e/specs/ham-sdr-scenario8-full-completion.spec.ts)),
      driving the real uplink → transponder → downlink loop; C1 TX-chain
      regression **40/40 green** (nats scenario3 full-completion, incl. the
      transmitter-modem and traffic-handover objectives).
      **E2E timing note:** two Playwright processes on one machine make the
      real-time specs flaky — the first scenario3 run failed a quiz that
      follows a 90 s antenna slew purely from CPU contention with a concurrent
      run, and passed cleanly when run alone. Run live specs one at a time
      before believing a regression.

### Phase E — Campaign polish + verification

- [x] Campaign-data copy (2026-07-26): `hamSdrCampaignData` description
      rewritten for the full arc (craft half → hostile-band half → the
      unauthenticated-RF thesis); `totalDuration` 30-60 → **170-210 min**
      (the old value predated S2–S8). Unlock ordering S1←…←S8 is asserted by
      the registration test, not just eyeballed.
- [x] Mission-brief MDX pages S1–S8 (2026-07-26) — `campaign-3/` did not exist
      at all, so all eight briefs were 404 from the day their URLs were
      authored. Written in Riley's voice (notes taped to the laptop lid, not
      NOC shift packages) per the `/mission-brief` skill's structure rules:
      reference tables for every frequency/pass/rig-state number, operational
      Asides, verification checklists that hint without instructing, no
      "Learning Objectives" anywhere. Registered in the docs sidebar
      ([astro.config.mjs](../../signal-range-docs/astro.config.mjs)).
      Verified: `astro build` succeeds and `astro check` reports 0 errors.
- [x] Playwright full-completion specs: **all eight** exist (the plan's
      minimum was four), one per scenario, plus shared `ham-sdr-helpers.ts`.
- [x] **Fixed the `waitForObjectiveCompleted` false-pass** the handoff notes
      flagged: a missing element resolved `undefined !== null` → true, so a
      typo'd id or unrendered checklist passed instantly. No spec depended on
      it (only a doc comment referenced it), so the fix was free.
- [x] Full-campaign playthrough S1→S8 in order: **50/50 green in one
      sequential single-worker run (22.5 min)** — every scenario driven to
      Mission Complete back to back, which is also the arc's first end-to-end
      regression run.
- [x] Theme/copy sweep: no professional-ops vocabulary anywhere in C3 (grep for
      NOC / ticket / escalation / customer / shift-work returns nothing; every
      "shift" in the campaign is a Doppler shift). Security beats S5–S8 are all
      in Riley's voice.
- [x] Retro → [phase-12-campaign3-scenario-arc-retro.md](../retrospectives/phase-12-campaign3-scenario-arc-retro.md)
- [x] Update PROJECT_STATE.md + memory

## House gotchas that apply to this phase (from PROJECT_STATE handoff notes)

- **`missionBriefUrl` is required for the objectives checklist to exist at all** —
  set it on every scenario from day one (even before the MDX page is written in
  Phase E), or the scenario is unplayable exactly like C2 Phase B was.
- **Do not use `isOptional` on objectives** — `areAllObjectivesCompleted()`
  ignores it, so "optional" objectives still gate Mission Complete (live bug in
  3 shipped scenarios). Everything in S1–S8 is mandatory or omitted.
- **Author RF numbers against a validation harness before authoring objectives**
  (pattern: [nats-eu-rf-validation.test.ts](../test/campaigns/nats-eu-rf-validation.test.ts)).
  Keep pass max elevations ~25–30° unless the keyhole is the lesson — but note
  the fixed-gain great-circle branch removed the planar near-zenith math for
  backyard antennas; S1's QFH pass can be high-elevation.
- **Grep for UI callers before authoring against a mechanic** — a manager +
  condition type + tests can exist with no button (the original M4 lesson).
  This is exactly what the Phase A spikes are for (E3/E4).
- **New managers measuring elapsed time must use `missionNowMs()`** for both
  stamp and measurement or time skip breaks them — applies to E1's duty-cycle
  windows if they don't reuse InterferenceManager's clock handling verbatim.
- **Fix the `waitForObjectiveCompleted` null-guard false-pass** in the shared
  E2E utils before writing the Phase E specs.
- Live-app validation is non-optional; `window.advanceSimClock(deltaMs)` jumps
  LEO scenarios in Playwright; dialogs are hold-to-skip (~2.2 s mouse-down).

## Backwards-compatibility ledger

| Change | C1/C2/C4/C5 impact |
| --- | --- |
| `path: 'terrestrial'` on interference events | Absent → transponder path bit-identical; no existing config uses it |
| Circular pol on interference events | Additive union members; existing events use `'H' \| 'V'` |
| SDR Console TX panel | Renders only for `stationClass: 'backyard'` + transmitter present; no such station exists outside C3 |
| Uplink link budget + HPBW TX gate | `gainModel === 'fixed'` branch only; parabolic path is the original code |
| Circular pol through the transponder | H↔V flip unchanged; only RHCP/LHCP (previously mangled) now pass through |
| `HPAState.maxOutputPower` / `p1db` | Optional; absent → 63/59 dBm as before |
| SDR-console TRANSMIT section | Backyard console only, and only when the station's BUC is powered |
| Initial-TLE override | Absent → satellites boot from their authored TLE as today |
| Headless GPSDO on backyard config (E4) | Scenario-config-scoped; no shared-code default changes |
| `receiver-afc-enabled` / `antenna-polarization-set` | Additive `ConditionType` members; evaluators keyed by type |
| New scenarios/ids | `ham-sdr-s1..s8` — unique in the global namespace |

## Out of scope (unchanged from phase 1 + new deferrals)

Audio demodulation, true IQ/FFT pipeline, GPS position solve, progressive
line-by-line APT decode, Riley VO recording and final portrait art, rotator
computer-interface minigame, S9+ (contests, meteor scatter, ISS-event fiction),
software-supply-chain beat beyond dialog (no simulated malware UI).

## Status log

- [2026-07-25] Plan authored. Not started. Next action: Phase A spikes.
- [2026-07-25] **Phase B complete (S1–S4), plus E5 from Phase A.** All four
  scenarios authored, registered, unit-tested (4701 vitest, +10) and driven to
  Mission Complete live via new Playwright full-completion specs. The phase-1
  retro's outstanding yagi-leg live verification is closed by the S2 spec.
  Notable findings for later phases:
  - Objective `maintainDuration` ticks on REAL update deltas — advanceSimClock
    cannot shortcut a maintain window, and a mid-window sim jump leaps the
    Doppler and resets it (helpers ride windows in real time).
  - The draggable checklist box can float over SDR Console controls and
    intercept Playwright pointer clicks — `domClick()` in ham-sdr-helpers
    dispatches DOM clicks instead.
  - The e2e specs double as the Phase E full-completion artifacts for S1–S4;
    Phase E still owes the mission-brief MDX pages (URLs are set, pages 404).
  Next action: Phase A remainder (E2/E3/E4 spikes + E1) then Phase C (S5–S6).
- [2026-07-26] **Phase A COMPLETE + Phase C (S5/S6) COMPLETE.** All three
  spikes ran as parallel subagents; findings folded into the checkboxes above.
  Two design changes recorded there: the E4 spoof tell (CLK ΔT readout + E1
  spoofer carrier, not a waterfall frequency walk) and the S6 no-show (request
  sheet vs tampered predictions, not a phantom pass — one TLE per bird means
  truth and prediction cannot diverge in-sim). New engine seams, all opt-in:
  `interferenceEvents[].path: 'terrestrial'` (+RHCP/LHCP pol),
  `spaceEvents[].initialTle`, the SDR-console REF/holdover control, and the
  `advanceMissionClock` window hook (sim + mission clocks together; specs
  crossing gnssThreat/interference/spaceEvents thresholds MUST use it —
  advanceSimClock alone never fires them). S5 E2E 7/7, S6 E2E 6/6 green live.
  Gotcha for Phase D: budget dead-sky time when jumping to a pass — the first
  S6 run expired its ride window ~1 min before AOS.
  Next action: Phase D (E2 TX path build per the spike's gap list, then S7+S8).
- [2026-07-26] **Phase D COMPLETE (E2 + S8).** Campaign 3's eight-scenario arc
  is authored end to end. Findings worth carrying into Phase E and beyond:
  - **The transponder was silently destroying circular polarization.** The
    downlink pol flip was `signal.polarization === 'H' ? 'V' : 'H'`, so an
    RHCP uplink came back linear and the RHCP feed charged it 18 dB of
    cross-pol. No campaign had noticed because no campaign had ever uplinked
    into a circular transponder. This is the kind of defect only a live loop
    finds — the unit tests all passed around it.
  - **The uplink budget had to be branch-gated, not fixed globally.** C1/C2
    are calibrated around EIRP-arrives-at-satellite with no FSPL; adding real
    path loss to the shared path would have broken every teleport scenario.
    The fixed-gain branch is additive and the parabolic branch is verbatim.
  - **Stale uplinks needed per-antenna attribution.** Clearing `sat.rxSignal`
    wholesale would delete other stations' uplinks and injected interference;
    `txFedSignalIds_` tracks what each antenna pushed so it removes only its
    own.
  - **A dev hook for objective state was the missing debugging tool.** Added
    `window.debugObjective('<id>')` (disposed in `destroy()`): it prints, per
    condition, satisfied / observed / maintenance-complete / evaluates-now /
    observation-tab-active. It turned an opaque E2E failure into a two-minute
    diagnosis and belongs in the next spec author's toolkit.
  - **The final objective's checklist row never repaints.** When the last
    objective completes, the checklist box stops its 1 s refresh as the
    completion flow takes over, so that row keeps `active`/"In Progress" even
    though the state is completed (it sits behind the Mission Complete modal).
    Pre-existing and cosmetic; specs must assert the modal, not the checklist,
    for the FINAL objective. Worth a real fix in a UI phase.
  - New E2E helper `advanceMissionClockToUtc(page, iso)` jumps both clocks to
    an absolute scenario time — chaining relative jumps across serial tests
    drifts once any test's real-time duration varies.
- [2026-07-26] **S1 enriched + sign-up funnel built** (user feedback: S1 too light,
  and completing it while signed out never unlocked S2). S1 now boots the rig
  as-Riley-left-it (VFO 137.170 MHz, 15 kHz voice channel that clips the 34 kHz
  APT) and adds `tune-apt` (click-to-tune, ±5 kHz), a bandwidth condition on
  `lock-apt` (50 kHz ± 25), and `hold-the-picture` (45 s hands-off maintain) —
  7 objectives / 65 pts; the S1 station is a scenario-local override so the
  sandbox QFH still boots on-frequency. Unlock root cause was persistence, not
  data: progress saves only to the signed-in account by design, so the Mission
  Complete modal now funnels signed-out players to Sign Up / Log In and the
  completion is held session-statically and saved on any later sign-in.
  Verified: type-check clean, 4709 vitest (+8), S1 E2E spec rewritten (8 steps
  incl. the funnel assert) and green live. Signed-in unlock still needs one
  manual playthrough (E2E runs unauthenticated).
