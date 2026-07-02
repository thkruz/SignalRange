# Phase 1 — Campaign 3 (Backyard Operator) Foundations Plan

## Goal

Enable Campaign 3 ("Backyard Operator" — Charlie's niece teaches you to track satellites from your backyard) with:

1. **DIY antennas** — non-parabolic antenna models (QFH, crossed yagi, GPS patch) at VHF/UHF/L-band.
2. **Circular polarization gameplay** — LHCP/RHCP handedness selection on a crossed yagi; wrong handedness costs real dB.
3. **SDR-style receiver** — a hobbyist "SDR console" with waterfall, click-to-tune, manual Doppler chasing, and an AFC toggle.
4. **SatNOGS-style observations** — pass prediction reused from Campaign 2, reskinned as an amateur "Observations" list.
5. **GPS signal tracking** — receive GPS L1 from a real MEO bird with a patch antenna (spread-spectrum "noise bump" teaching moment).
6. **Amateur-software UI** — the campaign should look like 2000s hobbyist freeware (SDR#/Gpredict/Orbitron vibes), not a professional mission-control product.
7. **New character** — Charlie's niece, the campaign's mentor voice.
8. **One sandbox scenario** exercising every new mechanic end-to-end.

**Hard constraint:** 100% backwards compatibility with Campaigns 1 (`nats`) and 2 (`nats-eu`). Every new behavior is opt-in via optional config fields or campaign-scoped CSS; defaults preserve current behavior bit-for-bit. There is no central feature-flag system in this codebase — the established gating idiom is optional fields that default to legacy behavior (e.g. `antennaConfigKey`), and that is what this plan uses throughout.

## Current-state findings (deep dive summary)

Campaign 2 built almost the entire spine this campaign needs:

- **Campaign shell already exists.** `hamSdrCampaignData` (`id: 'ham-sdr'`, "Ham Radio SDR Station") is defined in `src/campaigns/nats/campaign-data.ts` (line ~93) and already registered in `src/router.ts` `init()` (line 45). It is currently `isDisabled: true` with `disabledText: 'Access Denied'` and an empty `scenarios: []`. Activating Campaign 3 = populate scenarios + flip the flag + update copy/image. Scenarios must ALSO be appended to the flat `SCENARIOS` array in `src/scenario-manager.ts` (dual registration). Scenario ids are a **global flat namespace** (progress records are keyed by scenario id) → prefix everything `ham-sdr-*`.
- **Orbital physics done.** `OrbitalSatellite` (`src/equipment/satellite/orbital-satellite.ts`) propagates any TLE via SGP4 against the simulated clock, refreshes `az/el/rangeKm`, suppresses signals below horizon, and Doppler-shifts downlinks (`sig.frequency * dopplerFactor`). Works for MEO (GPS) as-is — SGP4 doesn't care.
- **Pass planning done.** `PassPlannerService` (`src/services/pass-planner-service.ts`) + `pass-schedule-tab.ts` (registered only for scenarios with orbital sats). Reusable as the "Observations" list with a reskin.
- **Polarization exists in the model.** `BaseSignal.polarization: null | 'H' | 'V' | 'LHCP' | 'RHCP'` (`src/types.ts`); `AntennaConfig.polType: 'linear' | 'circular'`; `antenna-core.ts` `polMismatchLoss_dB_()` handles circular (0.5 dB matched / 3 dB wrong-handedness today — too forgiving for gameplay, see D3). `X_BAND_3M_ANTESTAR_RS` is the existing circular-pol config template.
- **Waterfall + IQ displays exist.** `src/equipment/real-time-spectrum-analyzer/rtsa-screen/waterfall-display.ts` (canvas ImageData waterfall) and `iq-constellation-adapter.ts`. The spectrum is synthesized from the signal/noise model via `spectrum-data-processor.ts` — perfect for an SDR-console look without a real FFT pipeline.
- **Antenna physics is dish-only.** `antenna-core.ts` computes gain as η·(πD/λ)² and HPBW as k·λ/D — meaningless for a yagi/QFH/patch. This is the one genuinely new physics seam (D1). Off-axis pattern, pointing loss, and lock logic all consume only *gain + HPBW*, so a fixed-gain model slots in cleanly beneath them.
- **No VHF/UHF bands.** `FrequencyBand` in `src/constants.ts` starts at L-band; the `AntennaConfig.band` union has no VHF/UHF members. Additive extension needed.
- **UI variant seam anticipated.** Equipment factories switch on `uiType` (`'standard' | 'basic' | 'headless' | 'modern'` in `antenna-factory.ts`; `'basic'`/`'headless'` stubs throw "not yet implemented" in the RF-module factories). The variant literal is hard-coded in `src/pages/mission-control/ground-station.ts::createEquipment_()`. We do NOT need to build a full parallel adapter set (see D5) — a campaign-gated tab + body-class CSS gets the amateur look with far less risk.
- **Theming done.** `Router.updateCampaignBodyClass_()` already applies `campaign-<id>` to `<body>` from the URL generically — `campaign-ham-sdr` will apply with zero router changes. Theme = one `body.campaign-ham-sdr { ... }` block in `src/tabler-overrides.css`. The C2 retro lesson (hardcoded reds, `index.css` `!important` cascade) is already fixed: brand red is routed through `--mc-accent-red*`, and fault/alarm colors live in campaign-independent `--mc-danger*` (leave those alone).
- **Characters are one file.** `src/modal/character-enum.ts`: enum + four exhaustive `Record<Character, string>` maps (TS flags any map you miss) + `getCharacterAvatarUrl()` with graceful fallback to the base portrait / placeholder. Dialog clips are authored per-scenario.
- **Retro action item still open:** the TLE-authoring grid-search script from Campaign 2 was never checked in (`scripts/` has only asset/test-migration tools). This phase checks it in — GPS/NOAA/FM-bird TLEs all need pass timing authored against the scenario epoch.
- **Known latent bug nearby:** `ccsCampaignData` and `geolocationCampaignData` share `id: 'ccs'` in `campaign-data.ts`. We're editing that file anyway — fix the duplicate id (`geolocation`) in this phase since both are disabled placeholders (zero user-facing impact).

## Design decisions

### D1 — Non-parabolic antennas via opt-in `gainModel: 'fixed'` on `AntennaConfig`

New optional fields on `AntennaConfig` (`src/equipment/antenna/antenna-configs.ts`):

```typescript
gainModel?: 'parabolic' | 'fixed';   // absent → 'parabolic' (current physics, bit-identical)
fixedGain_dBi?: number;              // boresight gain when gainModel === 'fixed'
fixedBeamwidth3dB_deg?: number;      // HPBW when gainModel === 'fixed'
```

In `antenna-core.ts`, `antennaGain_dBi` and `beamwidth3dB_deg_` short-circuit to the fixed values when `gainModel === 'fixed'`, skipping the Ruze/blockage/aperture math (whose inputs — diameter, surface RMS — are meaningless for wire antennas). Everything downstream (`patternGain_dBi_` main-lobe rolloff, ITU-R 465 sidelobes, `pointingLoss_dB_`, beacon C/N, lock tolerance) consumes only gain + HPBW and works unmodified. All existing configs lack the field → parabolic → zero change to C1/C2 link budgets.

New band entries (additive): `FrequencyBand.vhf` (137–138 MHz weather-sat down; 144–146 MHz amateur) and `FrequencyBand.uhf` (435–438 MHz amateur) in `src/constants.ts`, plus `'VHF' | 'UHF'` in the `AntennaConfig.band` union.

New `ANTENNA_CONFIG_KEYS` + configs (wired per-station via the existing `antennaConfigKey` opt-in):

| Key | Antenna | Gain / HPBW | Pol | Pointing |
| --- | --- | --- | --- | --- |
| `VHF_QFH_137` | DIY quadrifilar helix, 137 MHz | ~3 dBi / ~140° | circular (RHCP) | fixed skyward (el 90°, no rotator; HPBW so wide pointing loss is small above ~25° el) |
| `UHF_CROSSED_YAGI_70CM` | Crossed yagi on a cheap TV rotator | ~12 dBic / ~40° | circular, **switchable handedness** (D3) | `maxRate_deg_s: 6`, el 0–90°, az non-continuous |
| `L_BAND_GPS_PATCH` | GPS patch on a paint-stick mast | ~5 dBi / ~100° | circular (RHCP) | fixed skyward |

### D2 — SDR receive chain: direct-sampling front end (opt-in)

A backyard station has no BUC/HPA/LNB rack — an RTL-SDR samples RF directly. Rather than a new equipment class, add an opt-in passthrough to the existing LNB module (`lnb-module-core.ts`): optional state/config field `isDirectSampling?: boolean` (default `false`). When true, the mixer stage is bypassed (RF frequency presented as IF unchanged, i.e. effective LO = 0 Hz) and the passband widens to ~100–1700 MHz. The receiver, AGC, coupler/`signalPathManager` noise summation, and spectrum analyzer then operate at the true RF frequency with no other changes. Backyard `GroundStationConfig`s carry no transmitter/BUC/HPA entries at all (receive-only station — the config arrays already support this).

**Verification risk (flagged, not assumed):** receiver tuning UI, spectrum-analyzer center-frequency ranges, and the branded `RfFrequency`/`IfFrequency` casts may have C-band-shaped assumptions (min/max clamps) that reject 137 MHz. A unit test + live dev-server check on the direct-sampling chain is an explicit step-1 exit criterion.

### D3 — Circular handedness selection + honest cross-pol loss (both opt-in)

- `AntennaState` gains optional `circularHandedness?: 'LHCP' | 'RHCP'` (default `'RHCP'`, which matches current implicit behavior). Settable from the SDR console (D5) via the standard staged-value + Apply pattern.
- `polMismatchLoss_dB_()` currently charges only 3 dB for wrong-handed circular — not enough to make handedness a real decision. Add optional `AntennaConfig.circularCrossPolLoss_dB?: number`; when present, wrong-handedness costs that much (crossed yagi config sets ~18 dB — realistic for a well-built crossed yagi, and decisively kills lock). When absent, the existing 3 dB constant applies → `X_BAND_3M_ANTESTAR_RS` and all C1/C2 physics unchanged.
- Gameplay: the FM bird downlink is RHCP; flipping the yagi's handedness switch swings C/N by ~15+ dB. The niece's dialog teaches *why* (reflection reverses handedness, spin fading, etc.).

### D4 — Doppler chasing + AFC (opt-in receiver behavior)

Doppler is already applied to orbital downlinks. The numbers make the gameplay tiering automatic:

- 137 MHz APT (34 kHz BW): Doppler ±3 kHz — inside the modem bandwidth, no retuning needed. **Easy first contact.**
- 435 MHz FM bird (15 kHz BW): Doppler ±10 kHz — exceeds the channel; the signal audibly/visibly slides out of the passband mid-pass. **Requires manual retuning** via the SDR console's ±1 kHz / ±10 kHz tune steps (existing `equip-adjust-control` pattern).
- GPS L1 (MEO): Doppler well under ±1 kHz relative to 2 MHz BW — teaching contrast.

New opt-in modem behavior in `receiver.ts`: `isAfcEnabled?: boolean` per modem (default `false` → zero change). When enabled and a lock exists, the modem center frequency slews toward the locked signal's measured frequency offset (rate-limited, e.g. ≤200 Hz/tick, drops back to manual on loss of lock). The existing `IQSignalInfo.frequencyOffset` from `getSignalsInBandwidth()` provides the error signal — no new measurement plumbing. AFC is presented in the SDR console as a checkbox; the sandbox first forces a manual-chase pass, then lets the player switch AFC on and compare.

### D5 — Amateur UI: campaign-gated "SDR Console" tab + body-class theme (no adapter fork)

Two complementary layers, both scoped so C1/C2 render byte-identically:

**(a) New Mission Control tab — "SDR Console".** Registered in `tabbed-canvas.ts` only when the scenario's ground station opts in via a new optional `GroundStationConfig.stationClass?: 'professional' | 'backyard'` (absent → `'professional'`, nothing changes; same conditional-registration precedent as the Pass Schedule tab). The tab is the campaign's centerpiece and is built amateur-native:

- Full-width waterfall reusing `SpectrumDataProcessor` + `WaterfallDisplay` (the SatNOGS look for free).
- Click-to-tune on the waterfall + ±1 kHz/±10 kHz step buttons; big monospace frequency readout using the existing `Doto` dot-matrix LCD styling (`lcd-screen.css`).
- Handedness switch (D3), AFC checkbox (D4), squelch-style C/N bar.
- Decoded-payload panel: the existing receiver feed pipeline renders the NOAA weather image / SSTV frame when locked (feeds already support `<img>`/`<video>` with degradation).
- Cosmetic amateur touches live here freely: fake window chrome, "SkyWatcher v0.9.4 beta — registered to RILEY" title bar, low-effort About dialog.

Under the hood the tab is an adapter over the **existing headless `Receiver`** (modem 1) and antenna core — so every existing objective condition type (`signal-detected`, `receiver-signal-locked`, `receiver-snr-threshold`, `rx-*`) works with zero evaluator changes. We deliberately do NOT thread a `uiType` through `ground-station.ts::createEquipment_()` or implement the stubbed `'basic'` RF-module UI variants this phase — a new tab plus theming achieves the amateur look with a fraction of the surface area.

**(b) `body.campaign-ham-sdr` theme block** in `src/tabler-overrides.css` (the router already applies the class):

- Accent: `--mc-accent-red*` → hobbyist phosphor green/amber (SDR#-meets-Orbitron). Keep `--mc-danger*` untouched (C2 retro rule) so faults stay red.
- Surfaces: slightly blue-black "cheap dark theme" tint; `--tblr-border-radius` → 0 (boxy freeware).
- Typography: body font → `Verdana, Tahoma, 'MS Sans Serif', sans-serif` within the campaign scope; readouts stay monospace/Doto.
- Campaign-scoped component rules (beveled `outset`/`inset` borders on buttons and cards, chunky scrollbars) under the same `body.campaign-ham-sdr` selector — impossible to leak into other campaigns.
- Pass Schedule tab gets campaign-scoped CSS + a data-driven title ("Observations") so it reads as a SatNOGS-style scheduler in this campaign only.

### D6 — Satellites: three amateur birds + one GPS bird (data + authored TLEs, no new physics)

All `OrbitalSatellite` with TLEs authored against the sandbox `scenarioStartDate` (grid-search RAAN/mean-anomaly, per C2 method). Receive-only: empty uplink arrays, downlinks as direct transmit signals (`origin: SignalOrigin.TRANSMITTER`).

| Bird | Downlink | Signal | Purpose |
| --- | --- | --- | --- |
| WXSAT-19 (NOAA-19-alike, LEO sun-sync) | 137.100 MHz, RHCP, 34 kHz | APT; `feed` = weather-image asset | easy first acquisition on the QFH; decode payoff |
| CUBEHOP-1 (AO-91-alike FM bird, LEO) | 435.250 MHz, RHCP, 15 kHz FM | `feed` = SSTV-style image | yagi program-track + handedness + Doppler chase |
| NAVSTAR-77 (GPS Block III, MEO ~20,200 km, real-constellation TLE) | 1575.42 MHz L1, RHCP, 2 MHz | low PSD, no feed — appears as a broad hump barely above the noise floor | GPS tracking objective; MEO-vs-LEO pass contrast |

Pass-schedule gating currently keys on `orbitType === 'leo'`; broaden the check to "any `OrbitalSatellite` present" (C1 has none → no behavioral change) so the MEO GPS bird appears in Observations. Downlink powers must be calibrated **live in-app**, not just on paper (C2 retro lesson — MERIDIAN's relative calibration was flagged as a gap).

**Check in the TLE-authoring tool** as `scripts/author-tle.mjs` (open C2 retro action item) with a short README comment; every future scenario in this campaign needs it.

### D7 — Character: Charlie's niece

Add to `src/modal/character-enum.ts`: `Character.RILEY_BROOKS = 'riley-brooks'` (name is a placeholder — confirm before recording audio) plus entries in all four exhaustive maps (`CharacterAvatars`, `CharacterNames`: "Riley Brooks", `CharacterTitles`: "Amateur Radio Operator · KD2RLY", `CharacterCompany`: "Backyard / AMSAT member"). Portraits drop into `public/assets/characters/riley-brooks*.png` when art exists; until then `getCharacterAvatarUrl()` falls back to the base image and `dialog-manager.ts` has an `onerror` placeholder, so dialog ships before art. Voice: enthusiastic, informal, first-name basis, explains with analogies — deliberate contrast with C1/C2's professional radio discipline. Cameo `Character.CHARLIE_BROOKS` clip in the intro hands the player off to her.

### D8 — Campaign shell + sandbox scenario

**Shell:** in `src/campaigns/nats/campaign-data.ts`, update `hamSdrCampaignData`: remove `isDisabled`/`disabledText`, rewrite `description`/`subtitle` to the Backyard Operator premise, new `imageUrl`, populate `scenarios: [hamSdrSandboxData]`. Fix the duplicate `'ccs'` id on `geolocationCampaignData` → `'geolocation'` while in the file. New directory `src/campaigns/ham-sdr/` with `ground-stations.ts`, `satellites.ts`, `sandbox.ts`. Register `hamSdrSandboxData` in the flat `SCENARIOS` array in `src/scenario-manager.ts` (router registration already exists).

**Ground stations** (all `stationClass: 'backyard'`, receive-only, direct-sampling front ends; backyard in Vermont — Riley is Charlie's niece, keeps the family geography):

1. `RILEY-QFH` — `VHF_QFH_137`, fixed skyward, manual mode.
2. `RILEY-YAGI` — `UHF_CROSSED_YAGI_70CM` on the rotator, program-track capable, handedness switch.
3. `RILEY-GPS` — `L_BAND_GPS_PATCH`, fixed skyward.

**Sandbox scenario** — `id: 'ham-sdr-sandbox'`, `number: 0`, `missionType: 'Sandbox'` (excluded from campaign progress by `campaign-manager.ts`, so it's a pure mechanics testbed), unlimited duration, `scenarioStartDate` chosen so WXSAT-19 AOS lands ~T+3 min, CUBEHOP-1 ~T+18 min, NAVSTAR-77 already high in the sky. Objectives exist to *validate mechanics*, ordered as a guided tour (Riley dialog clip per objective):

1. **Check the Observations list** — `tab-active` on the pass-schedule tab (`requiresObservation` gating per current convention). *Validates: pass planner + reskin + MEO entry.*
2. **First contact (QFH):** during the WXSAT-19 pass, `signal-detected` at 137.1 MHz on RILEY-QFH, then `receiver-signal-locked` + decoded weather image visible. *Validates: fixed-gain antenna model, VHF band, direct-sampling chain, feed decode, SDR console tuning.*
3. **Work the FM bird (yagi):** `antenna-tracking-mode-set: program-track` on RILEY-YAGI, `receiver-snr-threshold` on the 435.25 downlink — reachable **only** with RHCP selected (the ~18 dB wrong-handedness penalty enforces it without a new condition type; an explicit `antenna-polarization-set` condition is a nice-to-have, not required).
4. **Chase the Doppler:** `receiver-signal-locked` with `mustMaintain` across a mid-pass window — forces manual retune (or discovering AFC). *Validates: Doppler drift magnitude, tune steps, AFC.*
5. **Find GPS (optional objective):** `signal-detected` around 1575.42 MHz on RILEY-GPS. Riley's dialog explains why it looks like a noise bump, not a carrier. *Validates: MEO propagation, L-band patch, low-PSD rendering.*

## Backwards-compatibility guarantees

| Change | C1/C2 impact |
| --- | --- |
| `gainModel`/`fixedGain_dBi`/`fixedBeamwidth3dB_deg` on `AntennaConfig` | Absent on all existing configs → parabolic math untouched |
| `FrequencyBand.vhf/uhf` + band union members | Additive constants; nothing reads them until a config does |
| `isDirectSampling` on LNB | Default `false` → mixer path identical |
| `circularHandedness` on `AntennaState` | Default `'RHCP'` = current implicit behavior |
| `circularCrossPolLoss_dB` on `AntennaConfig` | Absent → existing 3 dB constant (X-band config unchanged) |
| `isAfcEnabled` per modem | Default `false` → receiver tuning unchanged |
| `stationClass` on `GroundStationConfig` | Absent → `'professional'`; SDR Console tab never registers for C1/C2 |
| Pass-schedule gating broadened to any `OrbitalSatellite` | C1 has none; C2 sats already qualified via `'leo'` |
| `body.campaign-ham-sdr` CSS block | Selector can't match C1/C2 routes; `--mc-danger*` untouched |
| `Character.RILEY_BROOKS` | Additive; exhaustive `Record` maps enforce completeness at compile time |
| Campaign/scenario registration | `hamSdrCampaignData` already registered; new unique `ham-sdr-*` scenario ids keep the global progress namespace clean |
| `geolocation` id fix | Both campaigns disabled placeholders; no stored progress references `'ccs'`-as-geolocation |

## Verification

- `npm run type-check` and the full vitest suite stay green at every step.
- New unit tests: fixed-gain antenna model (gain/HPBW/pointing-loss vs parabolic control), handedness mismatch loss (default vs config-driven), direct-sampling LNB passthrough, AFC slew/drop behavior, pass-planner numbers for all three authored TLEs (deterministic AOS/max-el/LOS, C2 pattern).
- **Live dev-server pass is an explicit exit criterion** (top C2 retro lesson): drive the sandbox end-to-end, calibrate downlink powers in-app, confirm VHF/L-band values survive the receiver/spectrum-analyzer UI clamps, and screenshot the theme for hardcoded-color leaks.
- An `e2e-scenario-test` Playwright spec for `ham-sdr-sandbox` (workers=1 locally, 127.0.0.1 baseURL per environment quirks) as the final artifact.

## Step order

1. **Antenna model:** `gainModel: 'fixed'` in `antenna-core.ts` + VHF/UHF bands + the three new configs + unit tests.
2. **Direct-sampling chain:** LNB `isDirectSampling` + receive-only station config path + unit test + a throwaway live check that 137 MHz survives the full chain (de-risks everything downstream).
3. **Polarization:** `circularHandedness` state + `circularCrossPolLoss_dB` + tests.
4. **AFC + tune steps:** receiver `isAfcEnabled` + tests.
5. **Satellites + TLE tool:** `scripts/author-tle.mjs` checked in; author WXSAT-19/CUBEHOP-1/NAVSTAR-77 TLEs against the sandbox epoch; `src/campaigns/ham-sdr/satellites.ts`; pass-planner gating broadened; deterministic pass tests.
6. **SDR Console tab:** `stationClass` opt-in, tab registration, waterfall/tune/handedness/AFC/decode panel wiring to headless cores.
7. **Campaign shell + sandbox:** ground stations, sandbox scenario + objectives + Riley dialog clips, character enum entry, campaign-data updates (+ `geolocation` id fix), `SCENARIOS` registration.
8. **Theme:** `body.campaign-ham-sdr` block + campaign-scoped freeware styling + Observations reskin.
9. **Regression + live calibration:** full suite, live sandbox run with power calibration, e2e spec, retro to `retrospectives/phase-1-campaign3-backyard-operator-retro.md`.

## Out of scope (later phases)

- The full scenario arc (scenarios 1–8: antenna building, SatNOGS-network fiction, transmitting/working FM birds with uplink, licensing subplot).
- Line-by-line APT/SSTV progressive image decoding (phase 1 uses the existing lock-gated feed reveal).
- True IQ-sample/FFT pipeline (spectrum stays model-synthesized).
- GPS position solve / C/A-code correlation gameplay (phase 1 is detection + concept only).
- Uplink Doppler compensation, rotator computer-interface (hamlib-style) minigame, Riley voice audio and final portrait art.
- Threading `uiType` through `createEquipment_()` / implementing the stubbed `'basic'` RF-module UI variants.
