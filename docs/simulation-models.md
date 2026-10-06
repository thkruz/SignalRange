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
| Cloud, scintillation | none (random terms in `Satellite.applyAtmosphericEffects_inPlace`) | U(0,1) rain and ±0.15 dB per frame | ITU-R P.840, P.618 §2.4 | | DEV-PROP-02, DEV-PROP-03 |

## Antenna

| Quantity | Engine | Implements | Standard / anchor | Reference case | Deviation |
|---|---|---|---|---|---|
| Boresight gain | `AntennaCore.antennaGain_dBi` | 10 log(η (πD/λ)²), η with Ruze and blockage | CPI 9.0 m and Prodelin 1244 datasheets (`test/reference/anchors.ts`) | `antenna`: 9 m C passes (±1 dB); 2.4 m Ku 1.0 dB low | DEV-ANT-07 |
| −3 dB beamwidth | `AntennaCore.beamwidth3dB_deg_` | 70 λ/D | datasheets | `antenna`: both dishes within 15 % | |
| Off-axis pattern | `AntennaCore.patternGain_dBi_` | Gmax − 12(θ/θ3)², then Gmax − min(32, 25 log(θD/λ)) | ITU-R S.580-6 (29 − 25 log θ) | `antenna`: 2/10/30/60° envelope | DEV-ANT-01 |
| Pointing loss | `AntennaCore.pointingLoss_dB_` + pattern in `applyPropagationEffects_` | 12(θ/θ3)², charged twice | one pattern term | `antenna`: θ3/2 costs 3 dB | DEV-ANT-02 |
| Off-axis angle | `AntennaCore.applyPropagationEffects_` | planar hypot(Δaz, Δel) | great-circle separation | `antenna`: Δaz at 60° el | DEV-ANT-03 |
| G/T | `AntennaCore.gOverT_dB_perK_` | G − 10 log Tsys(engine model) | datasheet G − 10 log(T_ant + T_LNA) | `antenna`: 9 m 3.0 dB low, 2.4 m 4.0 dB low | DEV-NOISE-02 |
| Servo rate | `antenna-configs.ts` `maxRate` | constant rate | pedestal limits (`LEO_TRACKER_SERVO`) | | DEV-ANT-06 |

## Noise and link

| Quantity | Engine | Implements | Standard | Reference case | Deviation |
|---|---|---|---|---|---|
| Worksheet C/N | `LinkBudgetManager.computeCNRDb` | EIRP − FSPL + G − L − 10 log(kTB) | C/N0 = EIRP − L + G/T − k | `link`: textbook Ku downlink within 0.3 dB | |
| Modem noise floor | `LNBModuleCore.getNoiseFloor` | −198.6 + 10 log T_LNB + 10 log B | k(T_ant + T_LNB)B at one reference plane | `link`: 2.6 dB low at 20° clear sky | DEV-NOISE-01 |
| Sky temperature | `AntennaCore.skyTempK_` | 8 + 4(sec z − 1) K | ITU-R P.372 | | DEV-NOISE-02 |
| Transponder | `Satellite.processSignals` | per-carrier saturation, noise added to carrier, +36.5 dB | composite C/N, flux-density saturation | | DEV-XPDR-01..05 |

## Modem

| Quantity | Engine | Implements | Standard | Reference case | Deviation |
|---|---|---|---|---|---|
| Degraded threshold | `Receiver.requiredCnDb` | 7/10/13/16 dB by modulation | ETSI EN 302 307 Table 13 + 1 dB implementation loss | `modem`: QPSK 3/4; code-rate span | DEV-MODEM-02 |
| Lock | `Receiver` `hasLock` | modulation/FEC match + bandwidth ratio | threshold C/N | | DEV-MODEM-01 |
| Uncoded BER | `FECSimulator.calculateRawBer_` | 0.5 erfc(√(Eb/N0)), A&S 7.1.26 | Pb = Q(√(2Eb/N0)) | `modem`: BPSK and QPSK at 1e-3 to 1e-7, pass | (coded BER: DEV-MODEM-03) |

## Orbit and geometry

| Quantity | Engine | Implements | Standard | Reference case | Deviation |
|---|---|---|---|---|---|
| Propagation | `OrbitalSatellite` → ootk SGP4 | SGP4 | Vallado et al. 2006 (AIAA 2006-6753) test vectors | `orbit`: 00005 at 0/360/720/1440 min within 5 m | |
| Look angles, range | `OrbitalSatellite.geometryFor` → ootk `rae` | topocentric az/el/range | | (covered by pass-geometry tests in `test/campaigns`) | |
| GEO geometry | legacy `Satellite` | authored az/el, fixed 38,000 km | slot longitude → look angles, slant range | | DEV-XPDR-04 |
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

## Reference data

`test/reference/data/`: the ITU-R software validation examples for P.618-13, P.676-12/-13 and
P.838-3, via ITU-Rpy (MIT). See its README.
