# Simulation model registry

One row per physical quantity: where the engine computes it, what it implements, the standard it
should match, the reference case that checks it (`test/reference/`), and the deviation that
explains any gap (`docs/known-deviations.md`). Phase 19.1 built this registry; each Phase 19 track
updates its rows when it replaces a model.

Run the reference cases with `npx vitest run test/reference` (they are also part of the unit
suite, so pre-push runs them). `REFERENCE_STRICT=1` runs the deviation cases as ordinary tests
to show how far the engine is from each reference.

## Propagation

| Quantity | Engine | Implements | Standard | Reference case | Deviation |
|---|---|---|---|---|---|
| Free-space path loss | `AntennaCore.calculateFreeSpacePathLoss_` | 32.45 + 20 log d_km + 20 log f_MHz | ITU-R P.525 | `propagation`: 3 cases, pass | |
| Specific rain attenuation γ | `AntennaCore.rainAttenuation_dB` (internal k, α table) | P.838-1 coefficients, H pol, log-log interpolation | ITU-R P.838-3 | `propagation`: Table 5 k_H, α_H at 4/12/20/30 GHz; validation γ_R | DEV-PROP-01 |
| Slant-path rain attenuation | `AntennaCore.rainAttenuation_dB` | γ · (2.5 km / sin el) · old reduction factor | ITU-R P.618-13 §2.2.1.1 | `propagation`: 16 validation sites at p = 0.01 % | DEV-PROP-01 |
| Rain rate over time | `WeatherManager.rainRateAt` | trapezoid, severity defaults 4/12/30/50 mm/h | (authored weather) | | |
| Gaseous attenuation | `AntennaCore.calculateAtmosphericLoss_` | piecewise-linear zenith loss × min(csc el, 3) | ITU-R P.676-13 | `propagation`: 11 validation slant paths | DEV-PROP-03 |
| Cloud, scintillation | none (19.2 deleted the random per-frame terms) | | ITU-R P.840, P.618 §2.4 | | DEV-PROP-02, DEV-PROP-03 |

## Antenna

| Quantity | Engine | Implements | Standard / anchor | Reference case | Deviation |
|---|---|---|---|---|---|
| Boresight gain | `AntennaCore.antennaGain_dBi` | 10 log(η (πD/λ)²), η with Ruze and blockage; efficiencies fitted to the anchors (19.4) | CPI 9.0 m and Prodelin 1244 datasheets (`test/reference/anchors.ts`) | `antenna`: gain at the flange within 0.5 dB for both dishes | |
| −3 dB beamwidth | `AntennaCore.beamwidth3dB_deg_` | 70 λ/D | datasheets | `antenna`: both dishes within 15 % | |
| Off-axis pattern | `AntennaCore.patternGain_dBi_` | Gmax − 12(θ/θ3)² down to G1 = 2 + 15 log(D/λ), then the sidelobe envelope: S.580-6 (29 − 25 log θ) for D/λ > 50, else S.465-6 (32 − 25 log θ), −10 dBi beyond 48°; `patternModel` overrides; wire antennas: main lobe capped at the front-to-back ratio | ITU-R S.580-6, S.465-6, RR Appendix 8 | `antenna`: S.580 envelope at 2/10/30/60°, 4 dBi at 10°, never above G1 beyond the main lobe | |
| Pointing loss | `AntennaCore.applyPropagationEffects_` (the pattern only) | one pattern term at the effective off-axis angle | one pattern term | `antenna`: θ3/2 costs 3 dB, charged once | |
| Off-axis angle | `AntennaCore.effectiveOffAxisDeg_` | great-circle separation (azimuth wrap, cos el), with wind de-pointing and servo jitter in quadrature | spherical geometry | `antenna`: Δaz at 60° el is cos(el) of itself; azimuth wraps through north | DEV-ANT-08 |
| Satellites heard | `AntennaCore.rxSignals`, `updateRxSignals_` | every satellite above the horizon in the RX band, through the pattern; dropped under −10 dB C/N in its own bandwidth | | (ledger: `adjacentCarriers` per link) | DEV-ANT-09 |
| Program-track lock | `AntennaCore.checkProgramTrackLock_` | servo error from the commanded track (ephemeris + step-track offsets) costs < 1 dB of beam | ACU "on track" | `pointing`: LOCKED on a stale track, not when driven 1.5 dB off it | |
| Step-track | `StepTrackController` | dither ±0.1 θ3 per axis (cross-elevation), arrive + 0.5 s settle + 1 s dwell per beacon reading, keep the higher; keeps dithering | hill-climb on beacon power | `pointing`: 5 dB stale ephemeris climbed to < 0.3 dB in 20-120 s; follows a drifting satellite; `nats-step-track-validation` (C1 S18, S22) | DEV-ANT-10 |
| Servo | `AntennaCore.updateSlew_` | per-axis rate and acceleration limits (`maxRate_deg_s`, `maxAccel_deg_s2`) with target-rate feed-forward; a clock skip is spent at the rate limit | pedestal limits (`LEO_TRACKER_SERVO`) | `pointing`: 20° of elevation in 41 s on the 9 m | DEV-ANT-08 |
| Wind de-pointing | `AntennaCore.windDePointingDeg` (+ `WeatherManager.windSpeedAt`) | coefficient × wind speed | | `antenna-core` unit tests | DEV-ANT-08 |
| Polarization skew | `geo-geometry.ts` `geoPolarizationSkewDeg` via `Satellite.stationOffsets`; program-track drives the feed to it | atan(sin Δλ / tan φ) | GEO geometry | `pointing`: zero on the station meridian, sign by side | DEV-ANT-04 |
| OMT isolation | `OMTModule` | authored spec + 0-5 dB per-unit scatter, drawn once | | `omt-module` unit tests | DEV-RF-05 |
| G/T | `AntennaCore.gOverT_dB_perK_` | (G - feed loss - ice) - 10 log Tsys at the LNA plane, at the pointing elevation | datasheet G - 10 log(T_ant + T_LNA) | `antenna`: both dishes within 1 dB | |
| Antenna temperature | `AntennaCore.systemNoise().antennaAtLnaK` | sky + spillover through the feed | datasheet T_ant at 20 deg | `antenna`: both dishes within 15 % | |

## Noise and link

| Quantity | Engine | Implements | Standard | Reference case | Deviation |
|---|---|---|---|---|---|
| Worksheet C/N | `LinkBudgetManager.computeCNRDb` | EIRP − FSPL + G − L − 10 log(kTB) | C/N0 = EIRP − L + G/T − k | `link`: textbook Ku downlink within 0.3 dB | |
| System noise temperature | `noise-model.ts` `systemNoiseTemperature` via `AntennaCore.systemNoise`, `SignalPathManager.systemNoiseK` | sky + rain + spillover + sun through the feed, + T_LNB (Friis), at the LNA input | ITU-R P.372, P.618 §3 | `link`: modem floor = k(T_ant,datasheet + T_LNB)B within 0.5 dB; rain rise = T_mr(1 − 10^(−A/10)) | DEV-NOISE-04, DEV-NOISE-06 |
| Modem, beacon, AGC noise | `SignalPathManager.getNoiseFloorAt` / `getExternalNoise` | k·Tsys·B (modem BW, beacon tracking BW, IF filter BW) | | (as above) | |
| Sky temperature | `noise-model.ts` `clearSkyNoiseK`, `skyWithRainK` | T_mr(1 − a) + (T_cmb + T_gal) a, rain layer at 275 K | ITU-R P.372, P.618 §3 | `antenna`: antenna temperature within 15 % | DEV-NOISE-06 |
| Galactic noise | `noise-model.ts` `galacticNoiseK` | Fa = 52 − 23 log f(MHz) | ITU-R P.372-16 Fig. 2 (median) | | DEV-NOISE-04 |
| Sun transit | `AntennaCore.systemNoise` (+ `WeatherManager`) | authored sin² rise in dB → solar K at the aperture | solar flux, ephemeris | | DEV-PROP-04 |
| Weather C/N cost | `AntennaCore.weatherCnLossDb` | rain + ice attenuation + noise rise | | (evidence fact `weather-attenuation-dominant`) | |
| Analyzer floor | `RealTimeSpectrumAnalyzer.getInputSignals` | line k·T·ENBW + instrument kT0·ENBW·F referred through the coupling factor, power sum; Auto RBW = span/300 (1-3 steps), ENBW = 1.065 RBW | Keysight AN 150 | `analyzer`: instrument floor, Auto RBW, coupling | |
| Analyzer traces | `SpectrumDataProcessor` | Gaussian RBW convolution (raised-cosine carriers, α 0.2), log-detected Rayleigh noise (−2.51 dB, σ 5.57 dB), VBW averaging (auto VBW = RBW/10), sample/peak/average detectors, power-sum combine | Keysight AN 150 | `analyzer`: statistics, power sum, CW shape | DEV-NOISE-07 |
| Transponder | `Satellite.processSignals` | per-carrier saturation, noise added to carrier, +36.5 dB | composite C/N, flux-density saturation | | DEV-XPDR-01..05 |

## Modem

| Quantity | Engine | Implements | Standard | Reference case | Deviation |
|---|---|---|---|---|---|
| Lock threshold | `modcod.ts` `modcodFor` (+ `Receiver.requiredCnDb` as C/N) | DVB-S2 QEF Es/N0 by MODCOD + 1.0 dB implementation loss; legacy labels mapped onto DVB-S2 | ETSI EN 302 307-1 Table 13 | `modem`: Table 13 for QPSK/8PSK/16APSK 2/3, 3/4, 5/6; QPSK 3/4 = 5.03 dB Es/N0 = 4.24 dB C/N in 36 MHz; code-rate span; BPSK −3.01 dB | DEV-MODEM-06 |
| Es/N0, C/N0 | `Receiver.getSignalsInBandwidth` | C / (k T Rs + I in the carrier's band), Rs = occupied BW / 1.2; C / kT | matched-filter noise bandwidth | `receiver` unit tests | |
| Lock | `Receiver.trackLock_` | labels match, carrier fits and is centred, effective Es/N0 ≥ threshold + 0.5 dB for the acquisition time; drops below threshold − 0.5 dB; "degraded" under 1 dB of margin (back to good at 1.5 dB) | | `receiver`: hysteresis, acquisition time, seeding | DEV-MODEM-06 |
| Carrier detection | `Receiver.clearsReceiveNoise_` | C/N ≥ −10 dB in the carrier's own bandwidth | | `receiver` unit tests | DEV-ANT-09 |
| Uncoded BER | `modcod.ts` `uncodedBer` | BPSK Q(√(2Es/N0)); QPSK Q(√(Es/N0)); 8PSK (2/3)Q(√(2Es/N0) sin π/8); 16QAM (3/4)Q(√(Es/5N0)); NR `erfcc` | Sklar Fig. 4.25; Proakis Fig. 4.3-8 | `modem`: BPSK and QPSK at 1e-3 to 1e-7; 16QAM at 1e-5 | |
| Coded PER, decoded BER | `modcod.ts` `codedPer`, `decodedBer` | waterfall table interpolated in log PER, anchored at the practical threshold (PER 1e-7); BER = PER × pre-FEC BER | DVB-S2 QEF definition | `modem`: QEF at threshold, waterfall width, monotonic; `fec-simulator` tests | DEV-MODEM-06 |
| Frame sync, frame errors | `FECSimulator.calculate` | sync = lock and PER < 0.1; uncorrectable frames = PER × frames/s (64 800-bit FECFRAMEs) | | `fec-simulator` tests | DEV-MODEM-06 |
| IQ scatter | `IQConstellationAdapter.noiseSpreadForEsN0` | σ = 1/√(2 Es/N0) per axis, unit symbol energy | complex AWGN | `modem`: 10 dB and 0 dB | |
| ADC | `adc-degradation.ts` (drive from `Receiver.getSignalsInBandwidth`: the modem's channel after a 0-30 dB tuner IF AGC) | SNR_q = 6.02 N + 1.76 dB below a full-scale sine over fs/2 (processing gain to Rs); Bussgang clipping of a Gaussian composite; penalties as added noise | ADI MT-001 | `modem`: SQNR, numerical Bussgang integral, sweet spot | DEV-MODEM-07 |

## Orbit and geometry

| Quantity | Engine | Implements | Standard | Reference case | Deviation |
|---|---|---|---|---|---|
| Propagation | `OrbitalSatellite` → ootk SGP4 | SGP4 | Vallado et al. 2006 (AIAA 2006-6753) test vectors | `orbit`: 00005 at 0/360/720/1440 min within 5 m | |
| Look angles, range | `OrbitalSatellite.geometryFor` → ootk `rae` | topocentric az/el/range | | (covered by pass-geometry tests in `test/campaigns`) | |
| GEO geometry | legacy `Satellite`; `geo-geometry.ts` `geoLookAngles` | authored az/el at a reference station, shifted by the geometric difference at other stations (slot from the authored azimuth); fixed 38,000 km | slot longitude → look angles, slant range | `pointing`: zenith and 30° E cases (Pratt & Bostian ch. 2); reference station sees the authored angles; Maine vs Vermont difference | DEV-XPDR-04 |
| Doppler | ootk `Satellite.dopplerFactor` | 1 − ṙ/c from ECI state | f_rx/f_tx = 1 − ṙ/c | `orbit`: vs finite-difference range rate; sign convention passes | DEV-PROP-07 |

## Hardware anchors (plan Q6)

Sourced 2026-09-27 for Ted's review; see `test/reference/anchors.ts` for every number.

- **9 m C-band Cassegrain:** CPI 9.0 m, datasheet 655-0025C 10-2023. Ext. C-band linear: 50.0 dBi
  at 4 GHz, θ3 0.53°, T_ant 40 K at 20°, G/T 31.5 dB/K with a 30 K LNA. The plan's placeholder
  "≈ 33 dB/K" is replaced by the datasheet's 30.5-31.5.
- **2.4 m Ku VSAT:** Prodelin Series 1244, datasheet 1000-057 Rev. 04/12. 47.4 dBi receive
  midband, θ3 0.70°, T_ant 48 K at 20°; no published G/T (it depends on the LNB). With a 0.8 dB NF
  LNB, G/T ≈ 27.1 dB/K. The plan's placeholder "≈ 22 dB/K" matches the engine's own value, not
  the hardware.
- **4 m Ku LEO tracker:** no public datasheet found. The one cited limit: a 4 °/s azimuth
  pedestal cannot hold a 780 km sun-synchronous pass above ~82° elevation (Microwave Journal,
  "Selecting a Pedestal for Tracking LEO Satellites at Ka Band"). Ted to confirm or substitute.
  Since 19.4 the engine flies it at 10 °/s and 5 °/s², the 9 m C-band at 0.5 °/s and 0.5 °/s²
  (plan Q6 classes; DEV-ANT-08).

## Reference data

`test/reference/data/`: the ITU-R software validation examples for P.618-13, P.676-12/-13 and
P.838-3, via ITU-Rpy (MIT). See its README.
