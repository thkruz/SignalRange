# Multi-Regime Tracking System Retrospective

## Overview

Enhanced the step-track controller to handle multiple orbital regimes (GEO, LEO, MEO, HEO, Deep Space) through an adaptive multi-algorithm orchestrator pattern.

## What Worked

### Architecture Decisions

- **Strategy Pattern**: Clean separation between orchestrator and individual strategies made testing and extension straightforward
- **Wrapped Existing Controller**: Keeping `StepTrackController` unchanged and wrapping it in `GeosyncStepTrackStrategy` preserved backward compatibility - all 34 original tests still pass
- **Velocity-Based Detection**: Empirical velocity measurement works better than pure metadata since it adapts to actual target motion regardless of cataloged orbit type
- **Hysteresis for Regime Transitions**: Requiring 10 consecutive samples before regime change prevents rapid mode switching from noisy measurements

### Implementation Details

- **Linear Regression for Velocity**: More robust than simple delta calculation, handles noise well
- **EMA Smoothing**: Consistent with existing codebase patterns (beacon C/N smoothing uses same alpha=0.3)
- **Handoff State Transfer**: Preserving momentum and step size between strategy transitions enables smoother handoffs
- **MEO + Deep Space Consolidation**: User insight that both produce similar relative angular velocities (just opposite directions) simplified the design to a single `moderate_drift` regime

### Testing

- Added 36 new tests covering velocity detection, regime classification, hysteresis, and strategy selection
- Mock RF front-end pattern from existing tests was easily extended

## What Didn't Work

### LEO Tracking Limitations

- **Pure step-track cannot track LEO**: Tests confirm max trackable velocity is ~0.05°/s, but LEO moves at 0.3-0.5°/s
- **LEOHybridStrategy is incomplete**: The program-track integration relies on `SimulationManager.getSatByNoradId()` which returns current satellite position, but the strategy doesn't yet properly constrain step corrections around the predicted position
- **No actual program-track implementation**: The hybrid approach needs real ephemeris-based position prediction, not just current position lookup

### Threshold Tuning

- **Thresholds are theoretical**: Values like 0.0005°/s for geostationary and 0.02°/s for geosync were derived from orbital mechanics theory, not empirical testing with real satellite scenarios
- **HEO detection via variance**: Planned but not implemented - HEO objects transition between fast (perigee) and slow (apogee) motion, requiring velocity variance tracking

### Integration Gaps

- **No UI exposure**: Orchestrator state (current regime, strategy, velocity) is available via `getState()` but not displayed in antenna UI
- **No manual override UI**: `forceRegime()` exists but no UI control to use it

## What to Change Next Time

### Before Implementation

1. **Create test scenarios first**: Should have created specific test satellites for each regime (geostationary, inclined GEO, MEO, LEO) before implementing strategies
2. **Validate thresholds empirically**: Run simulations with actual satellites to tune regime thresholds before committing to specific values

### During Implementation

1. **Implement program-track first**: LEOHybridStrategy needs actual program-track infrastructure - should have tackled this separately before the hybrid approach
2. **Add regime indicators to scenarios**: Scenario files could specify expected orbital regime for validation

### Code Structure

1. **Consider config injection**: Tracking profiles are hardcoded - could benefit from config-based tuning
2. **Add telemetry/logging**: Regime transitions are console.logged but should use proper telemetry for debugging tracking issues

## Key Technical Notes

### Velocity Thresholds (°/s)

| Threshold | Value | Meaning |
|-----------|-------|---------|
| `geostationary` | 0.0005 | Below this = stationary |
| `geosyncInclined` | 0.02 | Below this = slow drift |
| `moderateDrift` | 0.1 | Below this = moderate drift, above = LEO |

### Strategy Update Intervals

| Strategy | Interval (frames) | Real Time (~60fps) |
|----------|-------------------|-------------------|
| GeoStationaryHold | 180 | 3 seconds |
| GeosyncStepTrack | 10 | 166ms |
| ModerateDrift | 5 | 83ms |
| LEOHybrid | 3 | 50ms |

### Step Sizes by Regime

| Regime | Min Step | Max Step |
|--------|----------|----------|
| Geostationary | 0.005° | 0.1° |
| Geosync | 0.015° | 0.2° |
| Moderate | 0.03° | 0.3° |
| LEO | 0.05° | 0.5° |

### Maximum Trackable Velocity

From test results, pure step-track can reliably track up to **0.05°/s** with current parameters. This means:

- Geostationary: YES
- Geosync Inclined: YES
- MEO/Deep Space: MARGINAL (depends on geometry)
- LEO: NO (requires hybrid approach)

## Files Created

- `src/equipment/antenna/tracking/tracking-strategy.ts` - Interfaces and constants
- `src/equipment/antenna/tracking/velocity-monitor.ts` - Velocity measurement
- `src/equipment/antenna/tracking/regime-classifier.ts` - Classification logic
- `src/equipment/antenna/tracking/tracking-orchestrator.ts` - Strategy management
- `src/equipment/antenna/tracking/strategies/*.ts` - Four strategy implementations
- `src/equipment/antenna/tracking/index.ts` - Re-exports

## Files Modified

- `src/types.ts` - Added `DegreesPerSecond` branded type
- `src/equipment/antenna/antenna-core.ts` - Integrated orchestrator
- `test/equipment/antenna/step-track-controller.test.ts` - Added 36 tests

## Future Work

1. Complete LEO hybrid strategy with proper program-track integration
2. Add HEO detection via velocity variance
3. Expose orchestrator state in antenna UI
4. Add regime override controls
5. Create test scenarios for each orbital regime
6. Tune thresholds with empirical testing
