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
| DEV-XPDR-04 | open | GEO range is a fixed 38,000 km; legacy GEO satellites have authored az/el, not look angles from an authored slot longitude. Since 19.4 a satellite with a reference station (`lookAnglesFrom`, all of Campaign 1) is seen elsewhere at the authored angles plus the real geometric difference between the sites (slot derived from the authored azimuth; nats-s03-F2), but the authored angles themselves are not always on a real GEO arc (C1's TIDEMARK-2 is "45 W" in the story, 102.8 W by its azimuth). Phase 20.2 replaces them with slots. | Slant range 35,786-41,679 km and look angles follow from station and slot. | `antenna-core.ts` `GEO_SATELLITE_DISTANCE_KM`; `satellite.ts`; `geo-geometry.ts` |
| DEV-XPDR-05 | open | Beacons and the nats-eu SAR "video" downlinks bypass transponder physics (authored dBm EIRP). Authored satellite powers are tuned to the simulator (NAVSTAR +13 dB for visibility). | Beacon and payload EIRP from the spacecraft's own chain. | `satellite.ts`; `ham-sdr/satellites.ts`; `nats-eu/satellites.ts` |

## Antenna and pointing (19.4)

Phase 19.4 closed DEV-ANT-01, -02, -03, -05, -06 and -07: the pattern is ITU-R S.580-6 / S.465-6
under the Appendix 8 near-in pattern (`patternModel` honoured), the main-lobe error is charged
once, the off-axis angle is the great-circle separation with azimuth wrap, every satellite above
the horizon in the receive band is heard through the pattern (no acceptance box), program-track
LOCKED is the servo within 1 dB of beam of its commanded track, step-track is a dither hill-climb
on the measured beacon on SimClock, the pedestal has rate and acceleration limits per config
(9 m 0.5 deg/s, 4 m LEO tracker 10 deg/s), wind de-points the beam, and both anchor dishes meet
their datasheet gain at the flange. What remains:

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-ANT-04 | open | Linear polarization skew is geometric only for legacy GEO satellites that name the station their authored look angles belong to (`lookAnglesFrom`, all of Campaign 1): their slot is derived from the authored azimuth there, and other stations get the geometric skew difference. Other campaigns' GEO satellites keep their authored skew (hashed ±45 deg when omitted) at every station. | Skew follows station and slot geometry. | `satellite.ts`; `geo-geometry.ts` |
| DEV-ANT-08 | kept | Servo limits are class values from the plan (9 m teleport pedestal 0.5 deg/s and 0.5 deg/s²; 4 m Ku LEO tracker 10 deg/s and 5 deg/s²), not a datasheet (no public 4 m tracker datasheet; Ted to confirm). The servo is an ideal rate/acceleration-limited follower with target-rate feed-forward: no structural modes, backlash or overshoot. Wind de-pointing is a deterministic coefficient × wind speed (no gusts), and servo jitter is an RMS angle; both are combined with the off-axis angle in quadrature (their mean loss). | Pedestal datasheets; gust spectra; servo bandwidth. | `antenna-configs.ts`; `AntennaCore.updateSlew_`, `effectiveOffAxisDeg_` |
| DEV-ANT-09 | open | A satellite in the sidelobes is received (adjacent-satellite interference exists). Since 19.5 the receiver adds every overlapping carrier at the AGC output to N + I at any level, and the antenna's carrier filter compares spectral densities, but that filter still drops a weaker co-channel carrier that shares half its band with a denser one, instead of passing it on as interference. Carriers under −10 dB C/N in their own bandwidth are not carried at all. Sidelobe uplinks into adjacent satellites are not radiated (the legacy TX path stops at the main lobe until 19.3 adds uplink FSPL, DEV-XPDR-01). | C/(N+I) with every co-channel carrier's power, at any level. | `AntennaCore.updateRxSignals_`, `updateTxSignals_` |
| DEV-ANT-10 | kept | Step-track's beacon measurement has no noise of its own (the beacon is a steady CW carrier against a deterministic noise floor), so the hill-climb never mis-steps on a noisy reading and its floor is the beacon lock threshold (6.5 dB C/N in 1 kHz), not a measurement-statistics limit. | Beacon receivers average against noise; step size and dwell trade against it. | `step-track-controller.ts` |

## Modem and receiver (19.5)

Phase 19.5 closed DEV-MODEM-01 to -05: the modem locks on Es/N0 (noise in the symbol-rate
bandwidth, co-channel interference, the ADC's quantization and clipping noise) against its
MODCOD's DVB-S2 QEF threshold (EN 302 307 Table 13) + 1 dB implementation loss, with ±0.5 dB
hysteresis and a seeded acquisition time; "degraded" is under 1 dB of margin; frame errors,
frame sync and the decoded BER come from the coded curve; C/N0 and Es/N0 are on RX Analysis; the
ADC is a quantization (6.02 N + 1.76 dB over fs/2) and Bussgang clipping model; one carrier
gate (−10 dB C/N in the carrier's own bandwidth) serves every receive path, in Hz. What remains:

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-MODEM-06 | kept | The coded packet-error curve is one representative DVB-S2 waterfall (PER 1e-1 to 1e-7 over 0.6 dB) anchored at each MODCOD's Table 13 point, not a per-MODCOD LDPC simulation. The engine's labels map onto DVB-S2: 8QAM → 8PSK, 16QAM → 16APSK, BPSK → QPSK at the same code rate less 3.01 dB; 7/8 (all), 1/2 (8PSK, 16APSK) are interpolated or extrapolated linearly in code rate. Roll-off is fixed at 0.2. Acquisition time is a formula (0.5 s + 2·10⁶ symbols, clamped 0.5-10 s, ±20 % seeded), not a carrier/timing-loop model. The payload panel shows a concatenated Viterbi + RS(255,223) view whose numbers are derived from the DVB-S2 PER. | Per-MODCOD simulated PER curves; a modem's own acquisition behaviour; LDPC/BCH decoder statistics. | `modcod.ts`; `fec-simulator.ts` |
| DEV-MODEM-07 | kept | ADC class values (8 bits ENOB, 200 Msps, full scale −22 dBm so the AGC target is −8 dBFS), not a datasheet. The ADC samples the modem's channel (every carrier overlapping the modem bandwidth plus the noise in it) after a tuner IF AGC with 30 dB of gain range and no attenuation, a class model of a satellite demodulator's tuner. The composite is treated as Gaussian, and its clipping distortion is applied to each carrier as white noise at the composite's signal-to-distortion ratio. | The demodulator's own tuner, ADC and AGC loops; distortion spectra that depend on the composite. | `adc-constants.ts`; `adc-degradation.ts` |
| DEV-MODEM-08 | open | No analog/FM threshold model: Campaign 3's APT/FM payloads still use the digital labels and the DVB-S2 table (the plan's Q4 asks for an FM threshold of about 10 dB C/N in the 34 kHz APT channel). Phase 21/24. | FM threshold and capture effect. | `modcod.ts` |

## RF modules and the reference chain (19.6)

Phase 19.6 closed DEV-RF-01, -02, -03 and -06: the HPA is a memoryless amplifier (Saleh AM/AM
and AM/PM for a TWTA, Rapp for an SSPA) behind an attenuator, with an explicit ALC mode (output
held at P1dB − back-off) or fixed gain (back-off calibrated on the rated drive), so input + gain =
output and the back-off is measured from P1dB; its two-tone C/IM3 comes from the curve and rises
as the back-off drops; IM3 products (several carriers) and spectral-regrowth shoulders (one) are
drawn on the TX analyzer. The BUC compresses softly (Rapp, P1dB at `saturationPower`), its
current and temperature follow the real drive in watts with first-order lags on SimClock, and a
staged fault scales its thermal resistance or adds supply current. Every LO error comes from the
reference chain: locked converters carry the GPSDO's fractional error (locked, holdover with its
time error, or a GNSS spoofer's ramp), unlocked ones a seeded random walk; LO phase noise rides
on the carriers and costs Es/N0 above the carrier-recovery loop. The LNB passband has skirts,
low- or high-side injection per config and `lnb-thermally-stable` waits out the stabilization
time. The IF filter (centre, bandwidth, Butterworth order) and the notch act by overlap integral.
Cable losses per segment are config (`RFFrontEndState.cables`). What remains:

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-RF-05 | kept | On receive the OMT's nominal insertion loss is counted inside the antenna's feed loss (the anchor datasheets quote gain at the feed flange, after the OMT); only a fault that raises `insertionLoss` above the unit's nominal costs the carriers and adds its 290 K noise. On transmit the whole loss is charged. Cross-pol isolation is the authored spec plus a 0-5 dB per-unit scatter drawn once (19.4). | The OMT is one more passive between feed and LNA. | `omt-module.ts`; `SignalPathManager.antennaNoiseAtLnaK` |
| DEV-RF-07 | kept | Amplifiers are memoryless class curves fitted to the datasheet P1dB (Saleh with the normalised αφ = π/3, βφ = 1; Rapp smoothness from the P1dB-to-Psat gap): no memory effects or frequency response, and every carrier in a composite takes the composite gain (no small-signal suppression). An SSPA's two-tone IM3 is never better than its third-order intercept line, OIP3 = P1dB + 10 dB (a datasheet rule of thumb: the Rapp curve has no third-order term and alone reads unrealistically clean IM3 below compression). IM3 products of several carriers are scaled from the equal two-tone result at the same composite power (2 dB per dB of fᵢ, 1 dB per dB of fⱼ, width 2Bᵢ + Bⱼ); a single carrier's regrowth is two shoulders at the two-tone C/IM3. Products are drawn on the TX analyzer only and are not radiated (the transponder's C/IM is 19.3). HPA thermal: class-AB DC model (η at saturation 50 % TWTA, 30 % SSPA, 5 % idle), first-order lag τ = 2 min. | Measured AM/AM-AM/PM and memory; IM from the real composite; the amplifier's real thermal network. | `amplifier-models.ts`; `hpa-module-core.ts` |
| DEV-RF-08 | kept | LO phase noise is one plateau to a 10 kHz corner, 20 dB/decade beyond, with class values (synthesiser on the station reference −95 dBc/Hz; BUC on its TCXO −75; LNB whose PLL lost its reference −60); the demodulator tracks everything below Rs × 10⁻⁴ (at least 100 Hz). Free-running LO drift is a seeded random walk (BUC ±10 ppm start, 2 ppm/√h, ±30 ppm; LNB ±20 ppm, 5 ppm/√h, ±200 ppm) plus the LNB's 0.5 ppm/°C during warm-up. BUC power and heat are class values (24 V; 2.6 A idle; 2.4 A more at saturation, following the output amplitude; 0.30 °C/W; τ 10 min; a staged excess current belongs to the output stage, so muting removes it). Mixer spurs are fixed levels and not applied. | Measured phase-noise masks and loop bandwidths; oscillator temperature curves; the unit's datasheet supply current and thermal network. | `lo-reference.ts`; `buc-module-core.ts`; `lnb-module-core.ts` |
| DEV-RF-09 | kept | An IF filter with no configured centre is a channel filter centred on each carrier (the bank's legacy behaviour). Filters and notches act on carrier power by overlap integral with a raised-cosine (α 0.2) spectrum; the noise the demodulator sees is not filtered by them (the matched-filter view: a notched slice's signal energy is lost). The analyzer floor is not shaped by the IF filter or the LNB passband (it is shaped by notches). The LNB passband is flat across 950-2150 MHz with 3rd-order skirts (−3 dB 25 MHz beyond each edge). Gain and noise figure do not vary with temperature. | Real filter responses on signal and noise; temperature coefficients. | `filter-module-core.ts`; `notch-filter-module-core.ts`; `lnb-module-core.ts`; `spectrum-data-processor.ts` |
| DEV-RF-10 | kept | The GPSDO is a class OCXO: disciplined to ±2×10⁻¹² (a fixed per-unit offset), holdover a constant 4.64×10⁻¹⁰ offset (1.67 µs/h of time error) plus the configured ageing, Allan deviation a constant 10⁻¹¹ at 1 s (no τ dependence). A GNSS spoofer's time ramp passes straight to the disciplined frequency (rate µs/s → parts in 10⁶) with no loop filter or EFC limit. | The disciplining loop's time constant and pull range; σy(τ) curves. | `gpsdo-module-core.ts`; `gnss-threat-manager.ts` |

## Propagation and geometry (19.7)

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-PROP-01 | open | Rain uses the 1992 (P.838-1) coefficients although the comment says P.838-3, horizontal polarization only, a fixed 2.5 km rain height, the old horizontal reduction factor and no 0.01 %→p % scaling. Carriers are charged at their own path elevation (19.4); the rain-fade alarm and the noise model use the antenna's pointing. | ITU-R P.838-3 with polarization and path tilt; rain height from P.839; P.618-13 §2.2.1.1. | `antenna-core.ts` `rainAttenuation_dB` |
| DEV-PROP-02 | open | No tropospheric scintillation. (19.2 deleted the per-frame random "rain" and ±0.15 dB scintillation that `satellite.ts` added to every transponded carrier in any weather; `SignalDegradationConfig.atmosphericEffects` is now a no-op stub.) | Scintillation as a seeded P.618 §2.4 process (19.7). | `satellite.ts` |
| DEV-PROP-03 | open | Gas absorption is a piecewise-linear heuristic, not P.676; there is no cloud (P.840) model. | ITU-R P.676-13, P.840. | `antenna-core.ts` `calculateAtmosphericLoss_` |
| DEV-PROP-04 | open | Sun transit timing and peak are authored (a sin² profile of `linkMarginDegradation` dB). Since 19.2 it is a noise rise (solar antenna temperature at the aperture, through the feed), not a carrier loss; the solar ephemeris cannot place it because legacy GEO satellites have authored look angles (DEV-XPDR-04), and the authored peak (16 dB in C1 S17) is a little under the ~20 dB a quiet Sun gives a 9 m C-band dish. | The timing and the peak follow the solar ephemeris, the beam and the solar flux. | `weather-manager.ts`; `AntennaCore.systemNoise` |
| DEV-PROP-05 | open | Cloud, fog and dust weather events do nothing. (Since 19.4 wind and storm events de-point the beam: `windSpeedMps`, or 8/14/22 m/s by severity, 10/18/26 for a storm, times the antenna's `windDePointingCoef_deg_per_mps`.) | Cloud and fog attenuate at Ka. | `weather-manager.ts` |
| DEV-PROP-06 | open | The terrestrial path is FSPL only (no horizon, diffraction or clutter); no refraction, light-time or uplink Doppler. | P.452/P.526 for terrestrial paths; uplink Doppler is real on LEO commanding. | `antenna-core.ts`; `orbital-satellite.ts` |
| DEV-PROP-07 | open | The downlink Doppler factor (ootk `Satellite.dopplerFactor`) disagrees with the range rate implied by ootk's own `rae()` range by up to 0.22 km/s near closest approach (0.7 ppm: ~300 Hz at 437 MHz, ~9 kHz at 12 GHz; 780 km LEO over Galway, found 2026-09-27). Root cause not yet traced; the Earth-rotation term and constant look right. | f_rx/f_tx = 1 − ṙ/c with ṙ the geometric range rate. | `orbital-satellite.ts` → ootk `utils/functions.js` `dopplerFactor` |

## Measurement models (19.8)

| ID | Status | Deviation | Reality | Where |
|---|---|---|---|---|
| DEV-MEAS-01 | open | Ranging records the exact geometric range. | Noise, bias, station delay and light-time. | `commanding-manager.ts` |
| DEV-MEAS-02 | open | TDOA/FDOA σ are authored (1.5 µs / 3 Hz) with no ephemeris-error term. | σ from SNR, bandwidth and integration time plus ephemeris error. | geolocation console |
| DEV-MEAS-03 | open | Telemetry frames flow on pointing alone, not frame sync. | Frames need a locked, decoding carrier. | `telemetry-manager.ts` |
| DEV-MEAS-04 | open | EA J/S = HPA output + authored path gain − authored victim power. | J/S from both link budgets. | `electronic-attack-manager.ts` |
| DEV-MEAS-05 | open | GNSS spoofing is an authored time-offset walk (since 19.6 it drives the GPSDO's time and frequency error, and through it every disciplined LO, DEV-RF-10); the receiver's tracking loops are not modelled. | A spoofer captures the receiver's tracking loops. | `gnss-threat-manager.ts` |

## Units (19.3 with each track)

| ID | Status | Deviation | Where |
|---|---|---|---|
| DEV-UNIT-01 | open | Branded unit types are cast freely (transponder gain typed dBi); `power` means EIRP, received power or "at transponder input" depending on the path. (19.6 fixed the RF front end's dBm/10 HPA output, the transmitter power percentage taken as a ratio of logarithms, and the BUC thermal mW/W mix; filter, notch and LO units are Hz internally.) | across `src/equipment` |

## Gameplay conventions that lean on a deviation

These are rules authors and specs follow today. Each is re-decided, not silently broken, when
its deviation closes:

- "The board is never clean" before AOS: since 19.2 the AGC measures noise, so a pre-AOS LEO
  station no longer rails at max gain; it raises "AGC on noise only - no carrier in passband"
  instead (decision recorded in the phase 19 plan, 19.2 status entry).
- `cnHoldSeconds` and "commit the displayed C/N" in the link-budget tab: workarounds for the old
  1 Hz position step. The hysteresis stays for grading; the comments are stale.
- Lock-delay timers and the HPA-on-muted-BUC instant fail. Since 19.5 the receive modem's lock
  needs Es/N0 over its MODCOD threshold (QPSK 3/4: 5.0 dB, about 4.2 dB of C/N in its channel)
  held for a seeded acquisition time (~0.6 s at 30 Msps); a carrier under threshold − 0.5 dB
  reads "no lock" on every surface, and content that quotes a lock or demod threshold quotes
  that number. Unit-test and headless harnesses must advance `SimClock` (run time) for a modem to
  lock.
- The zenith keyhole lesson (C2 S13) was partly an artefact of DEV-ANT-03. Since 19.4 it is the
  real one: a 10 deg/s, 5 deg/s² azimuth axis cannot follow the azimuth swing of a near-zenith pass,
  and the beam (true great-circle angle) falls off the spacecraft until the pedestal catches up.
- Program-track LOCKED means "the pedestal is on its commanded track", as on a real ACU, not "on
  the satellite": a stale ephemeris reads LOCKED while the beacon is down (C2 S7, C1 S18). Under an
  ACU automation fault the lock reads UNKNOWN (C1 S23).
- HPA back-off (since 19.6): with ALC on (Campaign 1 stations), output = P1dB − back-off whatever
  the drive, so a BUC de-rate is absorbed by the HPA's gain (the ALC's own alarm says when it
  runs out of range); with fixed gain (Campaign 2's GW-01 SSPA) the back-off is calibrated on the
  rated drive and a weak drive comes out weak. Either way input + gain = output, the back-off is
  measured from P1dB, and the two-tone IM3 rises about 2 dB per dB of back-off given up.
- "Tsys is the LNB noise temperature" was retired in 19.2: Tsys = antenna (sky, spillover, feed)
  + LNB, so an LNB fault costs 10 log((T_ant + T_new) / (T_ant + T_old)), not 10 log(T_new / T_old).
