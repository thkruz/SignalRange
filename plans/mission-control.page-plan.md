# Mission Control Interface (AppShell) Implementation Plan

## Executive Summary

This plan details the implementation of a modern web-based mission control interface that replaces the physical equipment mockup UI with a professional ground station control system, inspired by Major Tom by xPlore.

**Key Objectives:**

- Create GroundStation class to encapsulate equipment (antennas, receivers, transmitters, RF front-ends, spectrum analyzers)
- Build AppShellPage with dynamic tabbed interface (ACU/RX/TX/GPS tabs for ground stations)
- Maintain existing business logic while modernizing UI layer
- Support multiple ground station instances per scenario
- Integrate with existing EventBus and SyncManager state management

---

## Architecture Overview

### Core Design Principles

1. **GroundStation Class** - Extends `BaseEquipment`, manages equipment lifecycle like existing `Equipment` class
2. **AppShellPage** - Extends `BasePage`, orchestrates mission control UI with asset tree and dynamic tabs
3. **UI Adapter Pattern** - Bridges equipment Core classes to modern web controls without modifying business logic
4. **State Management** - Leverages existing `SyncManager` + `EventBus` (UPDATE/SYNC/DRAW cycle)
5. **Dynamic Tab System** - Switches tabs based on selected asset (ground station vs. satellite)

### User Flow

```
Navigate to /mission-control
    ↓
Asset Tree displays ground stations (dynamic based on scenario)
    ↓
User selects ground station → Shows ACU/RX/TX/GPS tabs
    ↓
User selects satellite → Shows placeholder with "not implemented" alert
    ↓
User interacts with controls → Updates equipment Core state
    ↓
State persists via SyncManager → EventBus notifies updates → UI refreshes
```

---

## 1. GroundStation Class Design

**Location:** `src/assets/ground-station/ground-station.ts`

### State Interface

```typescript
interface GroundStationState {
  uuid: string;
  id: string;                    // "MIA-01"
  name: string;                  // "Miami Ground Station"
  location: {
    latitude: number;
    longitude: number;
    elevation: number;
  };
  isOperational: boolean;
  equipment: {
    antennas: AntennaState[];
    rfFrontEnds: RFFrontEndState[];
    spectrumAnalyzers: RealTimeSpectrumAnalyzerState[];
    transmitters: TransmitterState[];
    receivers: ReceiverState[];
  };
}
```

### Key Responsibilities

- **Equipment Lifecycle**: Create, initialize, and destroy equipment instances using existing factories
- **Equipment Wiring**: Connect equipment modules (antenna ↔ RF front-end, transmitter → RF front-end, etc.)
- **State Aggregation**: Collect equipment states and emit `Events.GROUND_STATION_STATE_CHANGED`
- **Sync Management**: Distribute synced state to individual equipment modules

### Implementation Pattern

```typescript
export class GroundStation extends BaseEquipment {
  // Equipment collections (same pattern as Equipment class)
  readonly antennas: AntennaCore[] = [];
  readonly rfFrontEnds: RFFrontEndCore[] = [];
  readonly spectrumAnalyzers: RealTimeSpectrumAnalyzer[] = [];
  readonly transmitters: Transmitter[] = [];
  readonly receivers: Receiver[] = [];

  constructor(config: GroundStationConfig) {
    // Initialize state
    // Create equipment using existing factories
    // Wire equipment connections
    // Register with EventBus (UPDATE/SYNC)
  }

  update(): void {
    // Aggregate equipment states
    // Emit GROUND_STATION_STATE_CHANGED
  }

  sync(data: Partial<GroundStationState>): void {
    // Distribute state to equipment modules
  }
}
```

**Reference:** Follow patterns from `src/pages/sandbox/equipment.ts` for equipment creation and wiring.

---

## 2. File Structure

```
src/
├── assets/
│   └── ground-station/
│       ├── ground-station.ts              # GroundStation class
│       ├── ground-station-state.ts        # State interfaces
│       └── ground-station-factory.ts      # Factory function
│
├── pages/
│   └── mission-control/
│       ├── app-shell-page.ts              # Main page extending BasePage
│       ├── app-shell-page.css             # Styling
│       │
│       └── components/
│           ├── global-command-bar.ts      # Top bar (clock, status)
│           ├── asset-tree-sidebar.ts      # Left sidebar (GS/SAT tree)
│           ├── timeline-deck.ts           # Bottom timeline (collapsible)
│           │
│           └── tabbed-canvas/
│               ├── tabbed-canvas.ts       # Tab container & switcher
│               ├── tabs/
│               │   ├── base-tab.ts        # Abstract base class
│               │   ├── acu-control-tab.ts # ACU + OMT
│               │   ├── rx-analysis-tab.ts # LNB + Filter + SpecA
│               │   ├── tx-chain-tab.ts    # BUC + HPA
│               │   ├── gps-timing-tab.ts  # GPSDO
│               │   └── satellite-placeholder-tab.ts
│               │
│               └── ui-adapters/
│                   ├── antenna-ui-adapter.ts
│                   ├── lnb-ui-adapter.ts
│                   ├── filter-ui-adapter.ts
│                   ├── buc-ui-adapter.ts
│                   ├── hpa-ui-adapter.ts
│                   ├── omt-ui-adapter.ts
│                   ├── gpsdo-ui-adapter.ts
│                   └── spectrum-analyzer-ui-adapter.ts
```

---

## 3. AppShellPage Implementation

**Location:** `src/pages/mission-control/app-shell-page.ts`

### Route Registration

**File:** `src/router.ts`

Add route handling:

```typescript
if (path === '/mission-control') {
  this.showPage('mission-control');
}
```

Add to `showPage()` switch:

```typescript
case 'mission-control':
  Header.getInstance().makeSmall(true);
  Footer.getInstance().makeSmall(true);
  AppShellPage.create();
  AppShellPage.getInstance().show();
  break;
```

Add to `hideAll()`:

```typescript
AppShellPage.getInstance()?.hide();
```

### Page Structure

```typescript
export class AppShellPage extends BasePage {
  readonly id = 'app-shell-page';
  private static instance_: AppShellPage | null = null;

  // Components
  private globalCommandBar_: GlobalCommandBar;
  private assetTreeSidebar_: AssetTreeSidebar;
  private tabbedCanvas_: TabbedCanvas;
  private timelineDeck_: TimelineDeck;

  // State
  private groundStations_: GroundStation[] = [];
  private satellites_: any[] = [];  // Placeholder

  protected html_ = `
    <div id="${this.id}" class="app-shell-page">
      <div id="global-command-bar-container"></div>
      <div class="app-shell-main">
        <div id="asset-tree-sidebar-container"></div>
        <div id="tabbed-canvas-container"></div>
      </div>
      <div id="timeline-deck-container"></div>
    </div>
  `;

  init_(): void {
    // Create DOM
    // Initialize components
    // Create ground stations from scenario config
    // Wire asset selection events
  }

  private handleAssetSelection_(data: { type: 'ground-station' | 'satellite', id: string }): void {
    if (data.type === 'ground-station') {
      const gs = this.groundStations_.find(g => g.state.id === data.id);
      if (gs) {
        this.tabbedCanvas_.showGroundStationTabs(gs);
      }
    } else {
      this.tabbedCanvas_.showSatelliteTabs(data.id);
    }
  }
}
```

**Key Features:**

- Singleton pattern (like other pages)
- Creates ground stations from scenario config
- Manages component lifecycle
- Handles asset selection routing

---

## 4. Equipment-to-Tab Mapping

### ACU Control Tab

**Equipment:** Antenna (azimuth, elevation, polarization) + OMT (TX/RX polarization)

**UI Controls:**

- Azimuth input (0-360°)
- Elevation input (0-90°)
- Polarization input (-90 to 90°)
- Auto-track toggle
- OMT polarization selector

### RX & Analysis Tab

**Equipment:** LNB (downconverter) + Spectrum Analyzer + Filter (bandwidth) + Demodulator (placeholder)

**UI Controls:**

- LNB LO frequency
- LNB gain
- Filter bandwidth selector
- Spectrum analyzer canvas
- Demodulator status (static for now)

### TX Chain Tab

**Equipment:** BUC (upconverter) + HPA (power amplifier) + Modulator (placeholder) + Redundancy (placeholder)

**UI Controls:**

- BUC LO frequency
- BUC gain
- BUC mute toggle
- HPA power/back-off
- HPA enable switch
- Modulator config (static for now)
- Redundancy controller (static for now)

### GPS Timing Tab

**Equipment:** GPSDO (GPS-disciplined oscillator)

**UI Controls:**

- Lock status
- Constellation view
- 10 MHz reference output
- OCXO metrics

---

## 5. UI Adapter Pattern

UI Adapters bridge equipment Core business logic to modern web controls without modifying Core classes.

### Pattern Structure

```typescript
export class AntennaUIAdapter {
  private antenna: AntennaCore;

  renderPositionControls(): string {
    // Generate HTML for number inputs, toggles
    // Use equipment state for current values
  }

  attachEventListeners(): void {
    // Wire input changes to Core protected handlers
    document.getElementById('azimuth-input')?.addEventListener('change', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.antenna['handleAzimuthChange'](value);  // Call protected handler
    });
  }

  updateDisplay(state: Partial<AntennaState>): void {
    // Update DOM elements when state changes
    const azimuthInput = document.getElementById('azimuth-input') as HTMLInputElement;
    if (azimuthInput && state.azimuth !== undefined) {
      azimuthInput.value = state.azimuth.toFixed(2);
    }
  }
}
```

### Key Benefits

1. **Separation of Concerns**: Core classes remain unchanged, UI adapters handle DOM
2. **Reusability**: Same adapter pattern for all equipment types
3. **Testability**: Adapters can be tested independently
4. **Flexibility**: Easy to swap between different UI styles

---

## 6. State Synchronization Flow

```
User interacts with UI control (e.g., changes azimuth input)
    ↓
UIAdapter event handler calls Core protected method
    ↓
Equipment Core updates internal state
    ↓
Core emits Events.EQUIPMENT_STATE_CHANGED via EventBus
    ↓
├─→ UIAdapter.updateDisplay() refreshes UI
├─→ GroundStation.update() aggregates state
└─→ SyncManager debounced save (500ms)
        ↓
    LocalStorage/Backend persistence
        ↓
    Events.SYNC emitted
        ↓
    Equipment.syncDomWithState() ensures consistency
```

### SyncManager Extension

**File:** `src/sync/sync-manager.ts`

Add to `AppState` interface:

```typescript
export interface AppState {
  objectiveStates?: ObjectiveState[];
  equipment?: { /* existing */ };
  groundStationsState?: GroundStationState[];  // NEW
}
```

Update sync methods to include ground stations:

```typescript
private syncFromStorage(state: AppState): void {
  // Existing equipment sync...

  // New ground station sync
  state.groundStationsState?.forEach((gsState, i) => {
    this.groundStations[i]?.sync(gsState);
  });
}
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Days 1-3)

**Goal:** Setup basic page structure and routing

**Tasks:**

- Create `GroundStation` class skeleton with state interface
- Create `AppShellPage` with basic HTML layout
- Add `/mission-control` route to Router
- Create placeholder components (GlobalCommandBar, AssetTreeSidebar, TabbedCanvas, TimelineDeck)
- Test navigation to new route

**Deliverables:**

- Can navigate to `/mission-control` and see basic layout
- Ground station class can be instantiated

### Phase 2: Equipment Integration (Days 4-6)

**Goal:** Wire ground station to existing equipment

**Tasks:**

- Implement GroundStation equipment creation using existing factories
- Wire equipment connections (antenna ↔ RF front-end, etc.)
- Extend SyncManager to include ground station state
- Test equipment state aggregation

**Deliverables:**

- GroundStation creates and wires equipment correctly
- Equipment state persists via SyncManager
- EventBus integration works

### Phase 3: Asset Tree & Selection (Days 7-9)

**Goal:** Interactive asset selection

**Tasks:**

- Implement AssetTreeSidebar with hierarchical tree view
- Connect asset selection to Events.ASSET_SELECTED
- Implement TabbedCanvas tab switching logic
- Create SatellitePlaceholderTab with "not implemented" alert

**Deliverables:**

- Asset tree shows ground stations
- Clicking ground station shows equipment tabs
- Clicking satellite shows placeholder

### Phase 4: ACU Control Tab (Days 10-13)

**Goal:** First functional equipment tab

**Tasks:**

- Create AntennaUIAdapter
- Create OMTUIAdapter
- Implement ACUControlTab with real-time state updates
- Test state persistence and checkpoint restore

**Deliverables:**

- Can control antenna azimuth, elevation, polarization
- OMT polarization switching works
- State persists across page refresh

### Phase 5: RX & Analysis Tab (Days 14-17)

**Goal:** Receive chain control

**Tasks:**

- Create LNBUIAdapter
- Create FilterUIAdapter
- Create SpectrumAnalyzerUIAdapter
- Implement RxAnalysisTab
- Integrate spectrum analyzer canvas rendering

**Deliverables:**

- Can control LNB LO frequency and gain
- Filter bandwidth selection works
- Spectrum analyzer displays real-time signals

### Phase 6: TX Chain Tab (Days 18-20)

**Goal:** Transmit chain control

**Tasks:**

- Create BUCUIAdapter
- Create HPAUIAdapter
- Implement TxChainTab
- Add static placeholders for Modulator and Redundancy Controller

**Deliverables:**

- Can control BUC LO, gain, mute
- HPA power control works
- Placeholders show "coming soon" messages

### Phase 7: GPS Timing Tab (Days 21-23)

**Goal:** Timing reference display

**Tasks:**

- Create GPSDOUIAdapter
- Implement GPSTimingTab
- Display lock status, constellation, metrics

**Deliverables:**

- GPSDO status displays correctly
- Lock indicators update in real-time

### Phase 8: Polish & Testing (Days 24-28)

**Goal:** Production-ready interface

**Tasks:**

- Implement checkpoint save/restore for ground stations
- Add loading states and error handling
- Performance optimization (debounce updates, lazy rendering)
- CSS polish and responsive layout
- Documentation and inline comments

**Deliverables:**

- Checkpoint save/restore works seamlessly
- No memory leaks (EventBus cleanup verified)
- Professional UI polish
- Comprehensive documentation

---

## 8. Critical Files Reference

### Must Read Before Implementation

1. **`src/pages/sandbox-page.ts`**
   - BasePage extension pattern
   - Equipment initialization and lifecycle
   - Checkpoint save/restore logic
   - NavigationOptions usage

2. **`src/pages/sandbox/equipment.ts`**
   - Equipment creation using factories
   - Equipment wiring (antenna ↔ RF front-end)
   - EventBus registration pattern

3. **`src/equipment/rf-front-end/rf-front-end-core.ts`**
   - Module composition architecture
   - State aggregation pattern
   - Abstract method structure

4. **`src/equipment/rf-front-end/rf-front-end-ui-standard.ts`**
   - Composite layout pattern
   - Module HTML injection strategy
   - Event listener wiring after DOM creation

5. **`src/equipment/antenna/antenna-core.ts`**
   - Equipment Core class structure
   - Protected handler pattern
   - State change notification

6. **`src/sync/sync-manager.ts`**
   - State persistence architecture
   - AppState interface
   - syncFromStorage/saveToStorage pattern

7. **`src/router.ts`**
   - Route registration pattern
   - Page lifecycle (show/hide)
   - Navigation handling

### Equipment Module References

- **BUC:** `src/equipment/rf-front-end/buc-module/buc-module-core.ts`
- **HPA:** `src/equipment/rf-front-end/hpa-module/hpa-module-core.ts`
- **LNB:** `src/equipment/rf-front-end/lnb-module/lnb-module-core.ts`
- **Filter:** `src/equipment/rf-front-end/filter-module/filter-module-core.ts`
- **OMT:** `src/equipment/rf-front-end/omt-module/omt-module.ts`
- **GPSDO:** `src/equipment/rf-front-end/gpsdo-module/gpsdo-module-core.ts`
- **Spectrum Analyzer:** `src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer.ts`

---

## 9. Success Criteria

### Functional Requirements

- ✅ Navigate to `/mission-control` route displays app-shell interface
- ✅ Asset tree displays ground stations dynamically from scenario config
- ✅ Selecting ground station switches to ACU/RX/TX/GPS tabs
- ✅ Selecting satellite shows placeholder with alert
- ✅ All equipment controls update Core state correctly
- ✅ State persists via SyncManager to LocalStorage
- ✅ Real-time UI updates via EventBus (UPDATE/SYNC/DRAW cycle)
- ✅ Checkpoint save/restore works for ground stations
- ✅ Timeline is collapsible (static HTML for now)

### Non-Functional Requirements

- ✅ No modifications to existing equipment Core classes
- ✅ No memory leaks (EventBus listeners properly cleaned up)
- ✅ Responsive layout works on desktop/tablet
- ✅ Performance: <100ms response to user interactions
- ✅ Code follows existing patterns (factory, composite, adapter)

### User Experience

- ✅ Modern web interface (dropdowns, inputs, toggles instead of knobs)
- ✅ Professional styling (inspired by Major Tom)
- ✅ Loading states during async operations
- ✅ Error messages for invalid inputs
- ✅ Helpful tooltips and labels

---

## 10. Technical Considerations

### Event Cleanup

Always clean up EventBus listeners to prevent memory leaks:

```typescript
class MyComponent {
  private eventHandlers: (() => void)[] = [];

  constructor() {
    const handler = this.handleUpdate.bind(this);
    EventBus.getInstance().on(Events.UPDATE, handler);
    this.eventHandlers.push(() => EventBus.getInstance().off(Events.UPDATE, handler));
  }

  destroy(): void {
    this.eventHandlers.forEach(cleanup => cleanup());
    this.eventHandlers = [];
  }
}
```

### Performance Optimization

- Debounce SyncManager saves (already implemented at 500ms)
- Use `requestAnimationFrame` for visual updates
- Lazy render tab content (only render visible tab)
- Virtual scrolling for long asset lists

### Error Handling

- Validate user inputs before calling Core handlers
- Gracefully handle missing equipment modules
- Display user-friendly error messages
- Log errors for debugging

---

## 11. Future Enhancements (Post-MVP)

### Phase 2 Features

- **Satellite Telemetry:** Implement EPS, Thermal, ADCS subsystem tabs
- **Command Stack:** Implement command queueing and execution
- **Pass Scheduling:** Calculate and display upcoming ground station passes
- **Multi-User:** Real-time collaboration via WebSocketStorageProvider
- **Historical Data:** Charts and graphs for telemetry trends
- **Automation:** Script-based command sequences

### Extensibility Points

- **Custom Tabs:** Plugin system for scenario-specific tabs
- **Widgets:** Draggable widgets for customizable layouts
- **Themes:** Dark/light mode support
- **Localization:** Multi-language support

---

## Summary

This plan provides a complete roadmap for implementing a modern mission control interface that:

1. **Maintains Compatibility:** No changes to existing equipment Core business logic
2. **Follows Patterns:** Uses existing architectural patterns (factory, composite, adapter)
3. **Modernizes UI:** Replaces physical equipment mockups with professional web controls
4. **Scales Well:** Supports multiple ground stations and future satellite telemetry
5. **Integrates Seamlessly:** Works with existing EventBus and SyncManager systems

The phased implementation approach allows for incremental development and testing, with each phase building on the previous one. The UI adapter pattern provides a clean separation between business logic and presentation, enabling future UI improvements without touching Core classes.
