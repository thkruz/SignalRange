# Reference data (phase 19.1)

The CSV files here are the ITU-R software validation examples ("Validation examples for the
development of software implementing ITU-R P-Series Recommendations", ITU-R Study Group 3,
rev 5.1), as extracted by the ITU-Rpy project
(<https://github.com/inigodelportillo/ITU-Rpy>, `test/test_data/`, MIT licence). Copied
unchanged apart from line endings. The ITU publishes the originals for exactly this use: to check
an implementation against the Recommendation.

| File | Recommendation | Columns used |
|---|---|---|
| `ITURP838-3_rain_specific_attenuation.csv` | P.838-3 | el, f, R, tau → k, alpha, gamma_r (dB/km) |
| `ITURP618-13_A_rain.csv` | P.618-13 §2.2.1.1 | site, f, el, tau, p, R001, hs → A_rain (dB) |
| `ITURP676-13_gamma.csv` | P.676-13 Annex 1 | f, P, T, rho → gamma0, gammaw (dB/km) |
| `ITURP676-13_A_gas.csv` | P.676-13 | slant-path gaseous attenuation (dB) |
| `ITURP676-12_zenith_attenuation.csv` | P.676-12 | zenith water-vapour attenuation (dB) |

Hardware anchors (datasheets) are cited in `test/reference/anchors.ts` and
`docs/simulation-models.md`.
