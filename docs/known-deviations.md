# Known deviations from physical reality

Every place the simulation knowingly differs from the real system, why, and which track removes
it. Phase 19 (simulation fidelity) seeded this list from the 2026-09-24 physics audit; each
entry is deleted when its track closes, with the ledger diff (`test/calibration/`) showing
what moved.

**Status** is one of:

- **open**: a known fake the owning track will replace.
- **kept**: deliberate, for teaching or cost. It stays, and this document is where it is
  justified.

A reference case in `test/reference/` that names a deviation ID runs as `it.fails`. It fails
today by design, and fixing the model makes that test error, which forces this entry and the
test to be updated together (`test/reference/deviations.test.ts` checks that every ID a test
cites is listed here).

Owning tracks are from `src/private/plans/phase-19-simulation-fidelity-plan.md` §4: 19.2 noise
and analyzer, 19.3 transponder link, 19.4 antenna and pointing, 19.5 modem, 19.6 RF modules,
19.7 propagation, 19.8 measurement models.

## Noise and the spectrum analyzer (19.2)

Phase 19.2 closed DEV-NOISE-01, -02, -03, -05 and DEV-SA-01: every receive-side noise figure
(modem and beacon C/N, analyzer floor, AGC detector, antenna Tsys and G/T, link-budget tab,
weather evidence fact) is now k·T·B of one system temperature from `src/simulation/noise-model.ts`
(sky, galactic, rain, spillover and sun through the feed, plus the LNB by Friis), at the LNA
input plane where carrier powers are referred. What remains:

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-NOISE-04 | kept | Galactic noise (P.372 median) is modelled; man-made noise is not, and spillover (ground pickup) is a per-antenna constant (default 5 K for a dish, 60 K for a wire antenna) rather than a pattern integral over the ground. | Below ~300 MHz man-made noise (P.372 Fig. 10) can exceed galactic at a suburban site; ground pickup varies with elevation. | `noise-model.ts` `galacticNoiseK`; `antenna-configs.ts` `spilloverK` |
| DEV-NOISE-06 | kept | Sky brightness uses the engine's gas attenuation (DEV-PROP-03, capped at 3x the zenith value below ~20 deg), so low-elevation sky noise is under-read; the noise is evaluated at the RX band centre, not per carrier. | P.676 slant-path absorption at each carrier's frequency. | `AntennaCore.systemNoise` |
| DEV-NOISE-07 | kept | The spectrum analyzer's traces are statistical models of a log detector (Rayleigh noise, Gaussian RBW, raised-cosine carriers), not an FFT of sampled IQ; carriers are steady (only the noise fluctuates). | A real analyzer detects the summed waveform; modulated carriers are noise-like themselves. | `spectrum-data-processor.ts` |

## Transponder link (19.3)

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-XPDR-01 | open | Dish uplinks apply no free-space loss: ground EIRP arrives at the transponder input. | Uplink FSPL ≈ 200 dB at 6 or 14 GHz from GEO. | `antenna-core.ts` `updateTxSignals_` (locked in by `test/equipment/uplink-tx-path.test.ts`) |
| DEV-XPDR-02 | open | Saturation is applied per carrier to EIRP-sized inputs (soft above 47 dBm, clamp 50 dBm), so HPA backoff has no effect. | A transponder saturates on total input flux density; input backoff sets output backoff and IM. | `satellite.ts` `processSignals` |
| DEV-XPDR-03 | open | Transponder noise (kTB·NF) is added into the carrier's own power; no uplink C/N, no composite C/N, no C/I or intermod; then +36.5 dB. | (C/N)_total⁻¹ = (C/N)_up⁻¹ + (C/N)_down⁻¹ + (C/I)⁻¹ + (C/IM)⁻¹. | `satellite.ts` |
| DEV-XPDR-04 | open | GEO range is a fixed 38,000 km; legacy GEO satellites have authored az/el, not look angles from a slot longitude. | Slant range 35,786-41,679 km and look angles follow from station and slot. | `antenna-core.ts` `GEO_SATELLITE_DISTANCE_KM`; `satellite.ts` |
| DEV-XPDR-05 | open | Beacons and the nats-eu SAR "video" downlinks bypass transponder physics (authored dBm EIRP). Authored satellite powers are tuned to the simulator (NAVSTAR +13 dB for visibility). | Beacon and payload EIRP from the spacecraft's own chain. | `satellite.ts`; `ham-sdr/satellites.ts`; `nats-eu/satellites.ts` |

## Antenna and pointing (19.4)

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-ANT-01 | open | Beyond 1.2·θ3 the pattern is Gmax − min(32, 25 log(θD/λ)): a floor relative to Gmax. `patternModel` is never read. | ITU-R S.580-6 / S.465: absolute 29 − 25 log θ dBi, −10 dBi beyond 48°. | `antenna-core.ts` `patternGain_dBi_` |
| DEV-ANT-02 | open | Main-lobe pointing error is charged twice: the pattern already contains 12(θ/θ3)², then `pointingLoss_dB_` subtracts it again (effective beamwidth 0.71·θ3). | One pattern term. | `antenna-core.ts` `applyPropagationEffects_` |
| DEV-ANT-03 | open | Dish off-axis angle is planar `hypot(Δaz, Δel)` with no cos(el) and no 360° wrap; dishes only accept satellites in a ±1° box, so adjacent-satellite interference cannot occur. | Great-circle angle between boresight and target; every satellite in the sidelobes contributes. | `antenna-core.ts` |
| DEV-ANT-04 | open | Linear polarization skew is authored (random ±45° when omitted), not geometric. | Skew follows station and slot geometry. | `satellite.ts` |
| DEV-ANT-05 | open | Step-track eases toward the known ephemeris error instead of hill-climbing. (Since 19.2 it reads the antenna's own beacon receiver, so the ACU, Dashboard and step-track show one beacon C/N; its old copy left the receive gain out of the noise.) | A hill-climb on measured beacon power. | `step-track-controller.ts` |
| DEV-ANT-06 | open | Servo is constant-rate and fast: C1's 9 m slews 2.5°/s (config notes "REAL: 0.35"), the nats-eu 4 m LEO tracker 20°/s. Wind and pointing σ are computed but unused. | Rate and acceleration limits per pedestal (see `test/reference/anchors.ts`). | `antenna-configs.ts`; `antenna-core.ts` |
| DEV-ANT-07 | open | Dish efficiencies are authored, not calibrated to a datasheet: the 2.4 m Ku config is 1.0 dB under the Prodelin 1244's 47.4 dBi at 11.725 GHz, and the 9 m C-band config's gain at the feed flange (aperture gain less its 0.44 dB feed loss) is 1.2 dB under CPI's 50.0 dBi. Since 19.2 the noise half of G/T matches both datasheets (antenna temperature at the flange within 15 %), so this gain gap is what keeps G/T 1.2-1.3 dB low. | Aperture efficiency fitted to the anchor datasheets (`test/reference/anchors.ts`). | `antenna-configs.ts` |

## Modem and receiver (19.5)

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-MODEM-01 | open | Lock depends only on modulation/FEC labels and bandwidth ratio, never on C/N. | A demodulator loses lock below its threshold. | `receiver.ts` `hasLock` |
| DEV-MODEM-02 | open | Required C/N is BPSK 7 / QPSK 10 / 8QAM 13 / 16QAM 16 dB for every code rate. | DVB-S2 QEF Es/N0 by MODCOD (EN 302 307 Table 13: QPSK 3/4 = 4.03 dB), plus implementation loss. | `receiver.ts` `getVisibleSignals` |
| DEV-MODEM-03 | open | BER is the uncoded BPSK curve with fixed modulation offsets; code rate and symbol rate are ignored; coding gain feeds only a cosmetic sigmoid; noise bandwidth is the modem bandwidth, and there is no C/N0. | Eb/N0 = C/N0 − 10 log Rb; coded BER from the FEC's waterfall. | `fec-simulator.ts` |
| DEV-MODEM-04 | open | The ADC charges 1 dB of C/N per dB below −20 dBFS. | Quantization noise depends on ENOB and crest factor. | `adc-degradation.ts` |
| DEV-MODEM-05 | open | Unit and bookkeeping slips: `getVisibleSignals` compares Hz with MHz; the carrier gate adds RX gain to a power that already includes it. | n/a (bugs) | `receiver.ts` |

## RF modules and the reference chain (19.6)

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-RF-01 | open | HPA output = Pmax − 2·backoff regardless of drive; `p1db` unused; IMD is a displayed number; the RF front end divides a dBm value by 10. | Output follows drive through the AM/AM curve; IM3 rises 3 dB per dB of drive. | `hpa-module-core.ts`; `rf-front-end-core.ts` |
| DEV-RF-02 | open | BUC hard-clips at P1dB + 2 dB; unlocked LO drift is fresh uniform ppm each frame; phase noise and spurs are computed but never applied. | Soft compression; drift is a slow random walk; phase noise spreads the carrier. | `buc-module-core.ts` |
| DEV-RF-03 | open | LNB passband is a 40 dB brick wall with high-side LO; unlocked drift is per-frame white; the IF filter has no centre or skirts. | Real filter responses; drift correlated in time. | `lnb-module-core.ts`; `filter-module-core.ts` |
| DEV-RF-05 | open | OMT isolation is re-drawn every frame; its 0.5 dB insertion loss is never applied; the coupler returns a random frequency. | Fixed hardware values. | `omt-module.ts`; coupler |
| DEV-RF-06 | open | GPSDO holdover never affects LO accuracy; Allan deviation and phase noise are display values. | Holdover drift propagates to every LO. | `gpsdo-module-core.ts` |

## Propagation and geometry (19.7)

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-PROP-01 | open | Rain uses the 1992 (P.838-1) coefficients although the comment says P.838-3, horizontal polarization only, a fixed 2.5 km rain height, the old horizontal reduction factor and no 0.01 %→p % scaling. The elevation is the antenna's pointing, not the satellite's. | ITU-R P.838-3 with polarization and path tilt; rain height from P.839; P.618-13 §2.2.1.1. | `antenna-core.ts` `rainAttenuation_dB` |
| DEV-PROP-02 | open | No tropospheric scintillation. (19.2 deleted the per-frame random "rain" and ±0.15 dB scintillation that `satellite.ts` added to every transponded carrier in any weather; `SignalDegradationConfig.atmosphericEffects` is now a no-op stub.) | Scintillation as a seeded P.618 §2.4 process (19.7). | `satellite.ts` |
| DEV-PROP-03 | open | Gas absorption is a piecewise-linear heuristic, not P.676; there is no cloud (P.840) model. | ITU-R P.676-13, P.840. | `antenna-core.ts` `calculateAtmosphericLoss_` |
| DEV-PROP-04 | open | Sun transit timing and peak are authored (a sin² profile of `linkMarginDegradation` dB). Since 19.2 it is a noise rise (solar antenna temperature at the aperture, through the feed), not a carrier loss; the solar ephemeris cannot place it because legacy GEO satellites have authored look angles (DEV-XPDR-04), and the authored peak (16 dB in C1 S17) is a little under the ~20 dB a quiet Sun gives a 9 m C-band dish. | The timing and the peak follow the solar ephemeris, the beam and the solar flux. | `weather-manager.ts`; `AntennaCore.systemNoise` |
| DEV-PROP-05 | open | Cloud, fog, dust and wind weather events do nothing. | Cloud and fog attenuate at Ka; wind moves the beam. | `weather-manager.ts` |
| DEV-PROP-06 | open | The terrestrial path is FSPL only (no horizon, diffraction or clutter); no refraction, light-time or uplink Doppler. | P.452/P.526 for terrestrial paths; uplink Doppler is real on LEO commanding. | `antenna-core.ts`; `orbital-satellite.ts` |
| DEV-PROP-07 | open | The downlink Doppler factor (ootk `Satellite.dopplerFactor`) disagrees with the range rate implied by ootk's own `rae()` range by up to 0.22 km/s near closest approach (0.7 ppm: ~300 Hz at 437 MHz, ~9 kHz at 12 GHz; 780 km LEO over Galway, found 2026-09-27). Root cause not yet traced; the Earth-rotation term and constant look right. | f_rx/f_tx = 1 − ṙ/c with ṙ the geometric range rate. | `orbital-satellite.ts` → ootk `utils/functions.js` `dopplerFactor` |

## Measurement models (19.8)

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-MEAS-01 | open | Ranging records the exact geometric range. | Noise, bias, station delay and light-time. | `commanding-manager.ts` |
| DEV-MEAS-02 | open | TDOA/FDOA σ are authored (1.5 µs / 3 Hz) with no ephemeris-error term. | σ from SNR, bandwidth and integration time plus ephemeris error. | geolocation console |
| DEV-MEAS-03 | open | Telemetry frames flow on pointing alone, not frame sync. | Frames need a locked, decoding carrier. | `telemetry-manager.ts` |
| DEV-MEAS-04 | open | EA J/S = HPA output + authored path gain − authored victim power. | J/S from both link budgets. | `electronic-attack-manager.ts` |
| DEV-MEAS-05 | open | GNSS spoofing is a display-only time-offset walk. | A spoofer captures the receiver's tracking loops. | `gnss-threat-manager.ts` |

## Units (19.3 with each track)

| ID | Status | Deviation | Where |
|---|---|---|---|
| DEV-UNIT-01 | open | Branded unit types are cast freely (transponder gain typed dBi); `power` means EIRP, received power or "at transponder input" depending on the path; MHz/Hz mix-ups in receiver, filter, notch and LO; transmitter power percentage is a ratio of logarithms; BUC thermal mixes mW and W. | across `src/equipment` |

## Gameplay conventions that lean on a deviation

These are rules authors and specs follow today. Each is re-decided, not silently broken, when
its deviation closes:

- "The board is never clean" before AOS: since 19.2 the AGC measures noise, so a pre-AOS LEO
  station no longer rails at max gain; it raises "AGC on noise only - no carrier in passband"
  instead (decision recorded in the phase 19 plan, 19.2 status entry).
- `cnHoldSeconds` and "commit the displayed C/N" in the link-budget tab: workarounds for the old
  1 Hz position step. The hysteresis stays for grading; the comments are stale.
- Lock-delay timers and the HPA-on-muted-BUC instant fail.
- The zenith keyhole lesson, partly an artefact of DEV-ANT-03 (planar off-axis angle, ±1° box).
- "Tsys is the LNB noise temperature" was retired in 19.2: Tsys = antenna (sky, spillover, feed)
  + LNB, so an LNB fault costs 10 log((T_ant + T_new) / (T_ant + T_old)), not 10 log(T_new / T_old).
