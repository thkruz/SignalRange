# Step-Track Algorithm Retrospective

**Date:** January 2026
**Topic:** Proactive Pursuit Algorithm for Moving Target Tracking

## Summary

Refactored the step-track (hill-climbing) algorithm to track geosynchronous satellites with inclined orbits (figure-8 motion pattern). Extended testing to characterize behavior with LEO satellites.

## What Worked

### 1. Proactive Pursuit Algorithm
The key insight was that traditional hill-climbing **stops when signal is stable**, which causes the antenna to fall behind a moving target. The fix:

- **Never stop**: Continue stepping in the "momentum" direction even when power is stable
- **Momentum tracking**: Remember the last successful direction for each axis independently
- **Minimum step size**: Enforce a floor (0.015°) to prevent convergence to steps too small to track motion

### 2. Momentum-Based Direction Selection
Instead of always starting positive after reversals, the algorithm now:
- Stores the last successful direction for each axis (`azMomentum_`, `elMomentum_`)
- Uses momentum when switching axes or when signal is stable
- Updates momentum only when a direction proves successful

### 3. Periodic Axis Alternation
Two mechanisms ensure both axes are tracked:
- **Stable threshold**: Switch after 3 consecutive stable readings
- **Forced switch**: Switch every 5 cycles regardless of power changes

### 4. Test-Driven Tuning
The 1000-iteration simulation against aurora7Satellite was invaluable for tuning:
- Exposed that original algorithm achieved only ~5% track success
- Allowed rapid iteration on parameters (step size, smoothing, thresholds)
- Final result: >45% track success rate with max error ~3°

## What Didn't Work

### 1. LEO Satellite Tracking
Step-track is fundamentally unsuitable for LEO:

| Metric | Value |
|--------|-------|
| LEO angular velocity | 0.3-0.45°/s |
| Step-track theoretical max | ~0.12°/s |
| **Gap** | **3-4x too slow** |

Even the "slowest" part of a LEO pass (near zenith) moves 2.5x faster than step-track's maximum rate.

### 2. Initial Parameter Guesses
Several initial parameter choices proved wrong:
- Step size 0.02° was correct, but minimum was initially too low
- Power smoothing alpha 0.3 was too aggressive (settled on 0.4)
- Axis switch threshold was initially too high

### 3. Test Expectations for LEO
Initially wrote tests expecting step-track to partially succeed on LEO - had to revise to document limitations instead of asserting success.

## Key Technical Learnings

### 1. Hill-Climbing vs. Proactive Pursuit

| Hill-Climbing | Proactive Pursuit |
|--------------|-------------------|
| Stops when optimal | Never stops |
| Converges to minimum step | Maintains tracking step |
| Forgets direction after reversal | Remembers momentum per axis |
| Designed for static targets | Designed for moving targets |

### 2. Theoretical Maximum Tracking Rate
```
max_rate = step_size × decisions_per_second
         = 0.02° × 6/sec (60fps / 10 updates)
         = 0.12°/s
```

This sets a hard limit on what step-track can follow without program track.

### 3. Satellite Motion Rates

| Satellite Type | Angular Velocity | Step-Track Compatible? |
|---------------|------------------|------------------------|
| Geostationary | ~0° | Yes |
| Geosync inclined (aurora7) | ~0.003°/s | Yes (with proactive pursuit) |
| LEO near zenith | ~0.3°/s | No |
| LEO near horizon | ~0.45°/s | No |

### 4. Pointing Loss Model
Used realistic loss model for testing:
```
loss_dB = 12 × (θ / θ_3dB)²
```
Where θ is pointing error and θ_3dB is the 3dB beamwidth.

## What to Change Next Time

### 1. Start with Theoretical Analysis
Before coding, calculate the theoretical maximum tracking rate. This would have immediately shown LEO incompatibility.

### 2. Use Smaller Test Iterations First
1000 iterations takes time to run. Start with 100-iteration smoke tests, then scale up.

### 3. Document Limitations in Tests
Tests that document limitations (like LEO tests) are valuable - they prevent future developers from expecting impossible behavior.

### 4. Consider Hybrid Approaches
For LEO support in the future, consider:
- **Program track + step-track**: Use TLE/orbital elements for gross pointing, step-track for fine correction
- **Velocity feedforward**: If satellite velocity is known, add it to step decisions
- **Adaptive update rate**: Faster updates for faster targets

## Files Modified

- [step-track-controller.ts](src/equipment/antenna/step-track-controller.ts) - Algorithm implementation
- [step-track-controller.test.ts](test/equipment/antenna/step-track-controller.test.ts) - Comprehensive tests

## Algorithm State Variables Added

```typescript
private azMomentum_: 1 | -1 = 1;           // Last successful az direction
private elMomentum_: 1 | -1 = 1;           // Last successful el direction
private stableCount_: number = 0;          // Consecutive stable readings
private cyclesSinceAxisSwitch_: number = 0; // For forced axis switching
private readonly minTrackingStepSize_: number = 0.015; // Don't go smaller
```

## Test Results Summary

### aurora7Satellite (Geosynchronous, ±3° figure-8)
- Track success rate: >45%
- Max pointing error: ~3°
- Recovery after signal dropout: <3° error

### LEO Satellite
- Slow segment (0.3°/s): 12% success - documents limitation
- Fast segment (0.44°/s): 21% success - documents limitation
- Algorithm remains stable (doesn't crash or auto-disable)
