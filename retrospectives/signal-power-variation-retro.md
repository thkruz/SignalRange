# Retrospective: Signal Power Variation Sources

## Summary

Investigated and tuned signal power variation across the SATCOM simulation to achieve realistic ±0.8 dB variation. The variation was originally ±3 dB due to multiple stacking sources.

## What I Learned

### Signal Power Variation Chain

Signal power variation occurs at **three distinct layers**, each adding independent noise:

```
Satellite (source) → Antenna (propagation) → Spectrum Analyzer (display)
```

### 1. Satellite Layer (`satellite.ts`)

The satellite applies degradation effects in `applyDegradationEffects()`:

| Effect | Method | Original | Tuned | Notes |
|--------|--------|----------|-------|-------|
| Power variation | `applyPowerVariation_inPlace()` | ±0.4 dB | ±1.0 dB | Uses Perlin noise for smooth, slow-varying drift |
| Rain fade | `applyAtmosphericEffects_inPlace()` | `* 2` (~0.8 dB @ 4 GHz) | `* 0.3` (~0.12 dB) | Frequency-dependent: `(freqGHz/10) * factor` |
| Scintillation | `applyAtmosphericEffects_inPlace()` | `* 1.5` (±0.75 dB) | `* 0.3` (±0.15 dB) | Rapid amplitude fluctuations |

**Key insight**: The `powerVariationRange` config is the primary dial for satellite-level variation. Atmospheric effects should be subtle additions, not major contributors.

### 2. Antenna Layer (`antenna-core.ts`)

The antenna's `applyPropagationEffects_()` applies **deterministic** losses based on geometry:

- Free-space path loss (FSPL)
- Atmospheric loss (elevation-dependent)
- Polarization mismatch
- Pattern gain (off-axis angle)
- Feed loss
- Pointing loss

**Key insight**: These are physics-based calculations, not random. The `currentDePointing_deg_()` method has random jitter capability (`pointingSigma_deg`) but it's not currently used in the propagation path.

### 3. Spectrum Analyzer Layer (`spectrum-data-processor.ts`)

Two separate noise sources in the display:

#### Noise Floor Generation (`generateNoise()`)

| Layer | Original | Tuned | Purpose |
|-------|----------|-------|---------|
| Base random | `* 2` (±1 dB) | `* 1.5` (±0.75 dB) | Per-pixel noise floor variation |
| Low-freq drift | `* 0.5` | `* 0.15` | Smooth undulation across display |
| Clamp | ±2 dB | ±0.5 dB | Hard limit on noise variation |
| Impulse spikes | 2-5 dB (0.01% chance) | unchanged | Rare interference bursts |

#### Signal Jitter (`addSignalToData()`)

| Region | Original | Tuned | Notes |
|--------|----------|-------|-------|
| Main lobe | `* 0.4` (±0.2 dB) | `* 0.14` (±0.07 dB) | Center of signal |
| Transition | `* 0.6` (±0.3 dB) | `* 0.2` (±0.1 dB) | Skirt region |
| Outer | `* 1.0` (±0.5 dB) | `* 0.3` (±0.15 dB) | Beyond main bandwidth |
| Beyond | `* 1.5` (±0.75 dB) | `* 0.4` (±0.2 dB) | Far out-of-band |

### How Variations Stack

The total variation is approximately the **sum** of independent sources (worst case):

```
Total ≈ Satellite + Antenna + Display
      ≈ (±1.0 Perlin + ±0.15 scint + 0.12 rain) + 0 + ±0.07 jitter
      ≈ ±0.8 to ±1.0 dB typical
```

## What Worked

1. **Systematic exploration** - Traced the signal path from satellite → antenna → display to find all variation sources
2. **Grep for patterns** - Searching for `Math.random` and `variation` quickly located noise injection points
3. **Understanding the math** - `(Math.random() - 0.5) * X` gives ±(X/2) dB variation

## What Didn't Work

1. **Initial focus was too narrow** - Started by only looking at `spectrum-data-processor.ts` when the satellite was the primary source
2. **Missed the stacking effect** - Each layer's contribution seemed small in isolation but stacked to ±3 dB

## Key Files

| File | Purpose |
|------|---------|
| `src/equipment/satellite/satellite.ts` | Source signal degradation (lines 355-396) |
| `src/equipment/antenna/antenna-core.ts` | Propagation effects (lines 1653-1697) |
| `src/equipment/real-time-spectrum-analyzer/spectrum-data-processor.ts` | Display noise/jitter (lines 61-111, 133-189) |

## Recommendations for Future Work

1. **Centralize variation config** - Consider a single "realism" dial that scales all noise sources proportionally
2. **Document the noise budget** - Add comments showing expected contribution from each source
3. **Make Perlin noise configurable** - The satellite's `powerVariationRange` is the right approach; apply similar pattern to other sources
4. **Consider correlation** - Currently all sources are independent; real systems have correlated fading (e.g., rain affects both uplink and downlink)
