# Phase 7: Environmental Controls Implementation Plan

## Overview

Implement functional effects for the feed heater and rain blower controls, currently marked as "cosmetic for now" in the codebase. Add a weather simulation model that triggers precipitation conditions.

## Current State

- **Feed heater & rain blower**: UI toggles work, state tracked, LED feedback shown, but no simulation effects
- **Location**: `src/equipment/antenna/antenna-core.ts` (lines 85-91, 628-642)
- **UI**: `src/pages/mission-control/tabs/acu-control-tab.ts`
- **Existing atmospheric effects**: Rain fade and scintillation in `src/equipment/satellite/satellite.ts` (lines 388-393)

## Implementation Plan

### 1. Add Weather/Precipitation Model

**File**: Create `src/simulation/weather-model.ts`

- Simple precipitation state machine with states: `clear`, `light_rain`, `heavy_rain`, `snow`
- Configurable via scenario or random transitions
- Expose `getPrecipitationState()` and `getPrecipitationIntensity()` (0-1 scale)
- Register with EventBus to update on simulation tick
- Optionally tie to existing `SimulationController` or make standalone singleton

### 2. Wire Precipitation Detection to Antenna State

**File**: `src/equipment/antenna/antenna-core.ts`

- In `update()` or via EventBus listener, query weather model
- Set `precipitationDetected` based on weather state (true if rain/snow active)
- This makes the existing UI indicator functional

### 3. Implement Rain Blower Effect

**File**: `src/equipment/satellite/satellite.ts`

Modify `applyAtmosphericEffects_inPlace()` (around line 388):

- Query antenna's `isRainBlowerEnabled` state
- When precipitation active AND rain blower enabled: reduce `rainFadeDb` by 60-80%
- When precipitation active AND rain blower disabled: apply full rain fade
- When no precipitation: rain blower has no effect (nothing to blow off)

```typescript
// Pseudocode
const precipitationIntensity = weatherModel.getPrecipitationIntensity();
let rainFadeDb = (frequencyGHz / 10) * precipitationIntensity * 4; // Scale with intensity

if (antenna.state.isRainBlowerEnabled && precipitationIntensity > 0) {
  rainFadeDb *= 0.3; // 70% reduction when blower active
}
```

### 4. Implement Feed Heater Effect

**File**: `src/equipment/antenna/antenna-core.ts`

Modify `systemTempK_()` (around line 1440):

- When precipitation detected AND heater disabled: add ice/moisture noise penalty (+10-20K to system temp)
- When precipitation detected AND heater enabled: no penalty (ice prevented)
- When no precipitation: heater has no effect

```typescript
// Pseudocode in systemTempK_()
let moisturePenaltyK = 0;
if (this.state.precipitationDetected && !this.state.isHeaterEnabled) {
  moisturePenaltyK = 15; // Kelvin penalty from moisture/ice on feed
}
return skyTempK + atmosphericTempK + feedLossTempK + lnaTempK + moisturePenaltyK;
```

### 5. Update UI Feedback

**File**: `src/pages/mission-control/tabs/acu-control-tab.ts`

- Precipitation indicator already exists (lines 682-688) - will now show actual state
- Consider adding tooltip or status text showing rain fade reduction when blower active
- Consider showing noise temperature impact when heater active/inactive during precipitation

### 6. Add Scenario Support

**File**: `src/campaigns/nats/scenario1.ts` (or relevant scenario files)

- Allow scenarios to set initial weather state
- Allow scenarios to trigger weather changes at specific times
- Example: "At T+5min, precipitation begins"

## Files to Modify

| File | Changes |
|------|---------|
| `src/simulation/weather-model.ts` | **NEW** - Weather state machine |
| `src/equipment/antenna/antenna-core.ts` | Query weather, update `precipitationDetected`, add heater noise effect |
| `src/equipment/satellite/satellite.ts` | Rain blower reduces rain fade |
| `src/pages/mission-control/tabs/acu-control-tab.ts` | Enhanced UI feedback (optional) |
| `src/simulation/simulation-controller.ts` | Initialize weather model (if integrated) |

## Testing Considerations

1. Verify precipitation indicator lights up when weather model reports rain
2. Verify rain fade increases when precipitation active, decreases with rain blower
3. Verify noise floor increases during precipitation without heater, normalizes with heater
4. Verify controls still require antenna power to toggle
5. Test at different frequencies (rain fade is frequency-dependent)

## Out of Scope

- Complex weather patterns (storms, variable intensity over time)
- Geographic weather differences between antennas
- Temperature-based heater behavior (cold weather ice prevention)
- Power consumption modeling for heater/blower
