# Mission Control UI Completion - Implementation Plan

## Overview

Complete the migration of equipment control functionality from legacy sandbox-page.ts to the modern mission-control-page.ts, following established adapter patterns, Tabler CSS framework, and modern web design principles.

**Priority Order:** ACU Polar Plot → TX Chain Modems → RX Analysis Modems → Spectrum Analyzer Advanced Controls
**Estimated Timeline:** 10-15 days (2-3 weeks)
**Scope:** All four missing components plus any additional polish needed

---

## Architectural Principles (from Retrospectives)

### Adapter Pattern (from 2025-11-28-adapter-refactoring.md)

- ✅ Use `readonly` modifiers for immutable properties (module, containerEl)
- ✅ Implement DOM caching with `Map<string, HTMLElement>` to eliminate repeated queries
- ✅ Private methods use underscore suffix (`setupDomCache_()`, `syncDomWithState_()`)
- ✅ Extract event handlers to private methods (not inline)
- ✅ Strongly-typed state handlers: `(state: Partial<TState>) => void`
- ✅ Prevent circular updates via state string comparison
- ✅ Make core module handler methods public (follow HPAModuleCore pattern)

### Tabler CSS Patterns (from 2025-11-28-tabler-css-migration.md)

- ✅ Bootstrap grid: `.row`, `.col-lg-6` (992px breakpoint for 2-column layout)
- ✅ Tabler cards: `.card`, `.card-header`, `.card-title`, `.card-body`, `.h-100`
- ✅ Utility classes: `.d-flex`, `.justify-content-between`, `.mb-3`, `.fw-bold`, `.font-monospace`
- ✅ Form controls: `.form-range`, `.form-check`, `.form-switch`, `.form-control`
- ✅ Preserve custom CSS for domain-specific components (LED indicators, canvas elements)
- ✅ Colocation: component-specific CSS stays in component CSS files

### Component Lifecycle (from RETROSPECTIVE-RF-FRONTEND-REFACTOR-2025-11-27.md)

- ✅ Create components BEFORE `super()` (with temp IDs if needed)
- ✅ Build UI AFTER `super()` call
- ✅ Use `protected` for properties UI layer needs access to
- ✅ RotaryKnob: callback-in-constructor pattern
- ✅ ToggleSwitch/PowerSwitch: `addEventListeners()` method pattern

---

## Phase 1: ACU Polar Plot Integration (Quick Win)

**Estimated Time:** 2-4 hours
**Complexity:** Low
**Goal:** Restore polar plot visualization to ACU Control tab

### Files to Modify

**[acu-control-tab.ts](../src/pages/mission-control/tabs/acu-control-tab.ts)**

### Implementation Steps

1. **Import PolarPlot component**

   ```typescript
   import { PolarPlot } from '../../components/polar-plot/polar-plot';
   ```

2. **Add property to class**

   ```typescript
   private polarPlot_: PolarPlot | null = null;
   ```

3. **Update HTML template** (in `getHtml_()`)
   - Add new card in the grid after existing antenna controls:

   ```html
   <div class="col-lg-6">
     <div class="card h-100">
       <div class="card-header">
         <h3 class="card-title">Antenna Position</h3>
       </div>
       <div class="card-body d-flex justify-content-center align-items-center">
         <div id="polar-plot-container"></div>
       </div>
     </div>
   </div>
   ```

4. **Create and inject PolarPlot** (in `addEventListenersLate_()`)

   ```typescript
   // Create polar plot with appropriate sizing for card
   this.polarPlot_ = PolarPlot.create(
     `polar-plot-${this.groundStation.uuid}`,
     { width: 300, height: 300, showGrid: true, showLabels: true }
   );

   // Inject HTML
   const polarPlotContainer = this.dom_!.querySelector('#polar-plot-container');
   if (polarPlotContainer) {
     polarPlotContainer.innerHTML = this.polarPlot_.html;
   }

   // Wire to antenna state changes
   const antenna = this.groundStation.antenna;
   EventBus.getInstance().on(Events.ANTENNA_STATE_CHANGED, () => {
     this.polarPlot_?.draw(antenna.state.azimuth, antenna.state.elevation);
   });

   // Initial draw
   this.polarPlot_.draw(antenna.state.azimuth, antenna.state.elevation);
   ```

5. **Cleanup in dispose()**

   ```typescript
   // Remove event listeners
   EventBus.getInstance().off(Events.ANTENNA_STATE_CHANGED);
   this.polarPlot_ = null;
   ```

### Testing Checklist

- [ ] Polar plot renders correctly in card
- [ ] Position updates when antenna moves (azimuth/elevation)
- [ ] Grid and labels display properly
- [ ] No console errors
- [ ] Responsive layout works (card stacks on mobile)

---

## Phase 2: TX Chain Modem Control

**Estimated Time:** 2-3 days
**Complexity:** Medium-High
**Goal:** Add complete 4-modem transmitter management to TX Chain tab

### Files to Create

**[transmitter-adapter.ts](../src/pages/mission-control/tabs/transmitter-adapter.ts)** (NEW)

### Files to Modify

1. **[transmitter.ts](../src/equipment/transmitter/transmitter.ts)** - Add public handler methods
2. **[tx-chain-tab.ts](../src/pages/mission-control/tabs/tx-chain-tab.ts)** - Integrate adapter
3. **[tx-chain-tab.css](../src/pages/mission-control/tabs/tx-chain-tab.css)** - Add styles

### 2.1 Create TransmitterAdapter

**Pattern:** Follow HPAAdapter/AntennaAdapter established patterns

**Class Structure:**

```typescript
export class TransmitterAdapter {
  private readonly transmitter: Transmitter;
  private readonly containerEl: HTMLElement;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<TransmitterState>) => void;
  private lastStateString: string = '';

  constructor(transmitter: Transmitter, containerEl: HTMLElement) {
    // Initialization
  }

  private setupDomCache_(): void {
    // Cache all DOM elements (modem buttons, inputs, switches, LEDs, etc.)
  }

  private setupEventListeners_(): void {
    // Wire all event handlers
  }

  private syncDomWithState_(state: Partial<TransmitterState>): void {
    // Update UI to match state
  }

  // Private event handlers
  private modemSelectHandler_(modemNumber: number): void
  private antennaHandler_(e: Event): void
  private frequencyHandler_(e: Event): void
  private bandwidthHandler_(e: Event): void
  private powerHandler_(e: Event): void
  private applyHandler_(): void
  private txSwitchHandler_(e: Event): void
  private faultResetHandler_(e: Event): void
  private loopbackHandler_(e: Event): void
  private powerSwitchHandler_(e: Event): void

  // Helper methods
  private updatePowerBudgetBar_(): void
  private updateStatusBar_(): void
  private updateModemButtons_(): void

  dispose(): void
}
```

**DOM Cache Elements:**

- Modem selection buttons (1-4): `modem-btn-1`, `modem-btn-2`, etc.
- Configuration inputs: `antenna-select`, `frequency-input`, `bandwidth-input`, `power-input`
- Current value displays: `frequency-current`, `bandwidth-current`, `power-current`
- Apply button: `apply-btn`
- Power budget bar: `power-bar`, `power-percentage`
- Switches: `tx-switch`, `fault-reset-btn`, `loopback-switch`, `power-switch`
- LEDs: `tx-led`, `fault-led`, `loopback-led`, `online-led`
- Status bar: `status-bar`

**Event Handlers:**

- Modem buttons → `modemSelectHandler_()` → calls `transmitter.setActiveModem(n)`
- Config inputs → handlers → update pending config
- Apply button → `applyHandler_()` → calls `transmitter.applyChanges()`
- Switches → handlers → call transmitter public methods

**State Sync Logic:**

```typescript
private syncDomWithState_(state: Partial<TransmitterState>): void {
  // Prevent circular updates
  const stateString = JSON.stringify(state);
  if (stateString === this.lastStateString) return;
  this.lastStateString = stateString;

  // Update modem buttons (active state + transmitting indicator)
  this.updateModemButtons_();

  // Sync configuration inputs/displays
  const activeModem = state.modems?.[state.activeModem ?? 0];
  if (activeModem) {
    const antennaSelect = this.domCache_.get('antenna-select') as HTMLSelectElement;
    const freqDisplay = this.domCache_.get('frequency-current');
    // ... update all config fields
  }

  // Update power budget visualization
  this.updatePowerBudgetBar_();

  // Update switches/LEDs
  const txSwitch = this.domCache_.get('tx-switch') as HTMLInputElement;
  txSwitch.checked = state.transmitting ?? false;
  // ... update all switches/LEDs

  // Update status bar
  this.updateStatusBar_();
}
```

**Power Budget Calculation:**

```typescript
private updatePowerBudgetBar_(): void {
  const percentage = this.transmitter.getPowerPercentage();
  const bar = this.domCache_.get('power-bar');
  const display = this.domCache_.get('power-percentage');

  bar.style.width = `${Math.min(percentage, 100)}%`;
  display.textContent = `${percentage.toFixed(1)}%`;

  // Color coding
  bar.classList.remove('bg-success', 'bg-warning', 'bg-danger');
  if (percentage >= 100) bar.classList.add('bg-danger');
  else if (percentage >= 80) bar.classList.add('bg-warning');
  else bar.classList.add('bg-success');
}
```

### 2.2 Modify Transmitter Class

**Add Public Methods:**

```typescript
// Modem selection
public setActiveModem(modemNumber: number): void {
  this.state_.activeModem = modemNumber - 1;
  this.emitStateChange();
}

// Configuration handlers
public handleAntennaChange(antennaId: number): void
public handleFrequencyChange(frequencyMHz: number): void
public handleBandwidthChange(bandwidthMHz: number): void
public handlePowerChange(powerDbm: number): void

// Apply pending changes
public applyChanges(): void {
  // Apply pending config to active modem
  this.emitStateChange();
}

// Control switches
public handleTransmitToggle(isEnabled: boolean): void
public handleFaultReset(): void
public handleLoopbackToggle(isEnabled: boolean): void
public handlePowerToggle(isEnabled: boolean): void

// Helper methods for UI
public getPowerPercentage(): number {
  // Calculate total power budget percentage
  return (this.state_.totalPowerDbm / 10) * 100;
}

public getStatusAlarms(): string[] {
  const alarms: string[] = [];
  if (this.state_.fault) alarms.push('FAULT: Power budget exceeded');
  if (this.state_.loopback) alarms.push('LOOPBACK MODE');
  // ...
  return alarms;
}
```

### 2.3 Update TX Chain Tab

**HTML Template Structure:**

```html
<div class="tx-chain-tab">
  <div class="row g-3">
    <!-- Existing BUC/HPA cards remain -->

    <!-- New Transmitter Control Card (full width) -->
    <div class="col-12">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Transmitter Modems</h3>
        </div>
        <div class="card-body">
          <!-- Modem Selection Buttons -->
          <div class="btn-group mb-3" role="group">
            <button class="btn btn-outline-primary modem-btn" data-modem="1">TX 1</button>
            <button class="btn btn-outline-primary modem-btn" data-modem="2">TX 2</button>
            <button class="btn btn-outline-primary modem-btn" data-modem="3">TX 3</button>
            <button class="btn btn-outline-primary modem-btn" data-modem="4">TX 4</button>
          </div>

          <div class="row g-3">
            <!-- Configuration Panel -->
            <div class="col-lg-6">
              <div class="card h-100">
                <div class="card-header">
                  <h4 class="card-title">Configuration</h4>
                </div>
                <div class="card-body">
                  <!-- Antenna selector -->
                  <div class="mb-3">
                    <label class="form-label">Antenna</label>
                    <select id="antenna-select" class="form-select">
                      <option value="1">Antenna 1</option>
                      <option value="2">Antenna 2</option>
                    </select>
                  </div>

                  <!-- Frequency input -->
                  <div class="mb-3">
                    <label class="form-label">Frequency (MHz)</label>
                    <input id="frequency-input" type="number" class="form-control" />
                    <small class="text-muted">Current: <span id="frequency-current">--</span> MHz</small>
                  </div>

                  <!-- Bandwidth, Power inputs... -->

                  <button id="apply-btn" class="btn btn-primary w-100">Apply Changes</button>
                </div>
              </div>
            </div>

            <!-- Status & Control Panel -->
            <div class="col-lg-6">
              <div class="card h-100">
                <div class="card-header">
                  <h4 class="card-title">Status & Control</h4>
                </div>
                <div class="card-body">
                  <!-- Power Budget Bar -->
                  <div class="mb-3">
                    <label class="form-label d-flex justify-content-between">
                      <span>Power Budget</span>
                      <span id="power-percentage" class="fw-bold">0%</span>
                    </label>
                    <div class="progress">
                      <div id="power-bar" class="progress-bar" style="width: 0%"></div>
                    </div>
                  </div>

                  <!-- Switches -->
                  <div class="mb-3">
                    <div class="form-check form-switch">
                      <input id="tx-switch" type="checkbox" class="form-check-input" role="switch" />
                      <label class="form-check-label">Transmit</label>
                    </div>
                    <!-- Loopback, Power switches... -->
                  </div>

                  <!-- Status LEDs -->
                  <div class="mb-3">
                    <div class="d-flex justify-content-around">
                      <div class="text-center">
                        <div id="tx-led" class="led led-gray mb-1"></div>
                        <small class="text-muted">TX</small>
                      </div>
                      <!-- Fault, Loopback, Online LEDs... -->
                    </div>
                  </div>

                  <!-- Fault Reset Button -->
                  <button id="fault-reset-btn" class="btn btn-warning w-100">Reset Fault</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Status Bar -->
          <div id="status-bar" class="alert alert-info mt-3" role="alert">
            Ready
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

**TypeScript Integration:**

```typescript
export class TxChainTab extends Tab {
  // Existing adapters
  private bucAdapter: BUCAdapter | null = null;
  private hpaAdapter: HPAAdapter | null = null;

  // NEW
  private transmitterAdapter: TransmitterAdapter | null = null;

  protected addEventListenersLate_(): void {
    // Existing adapter setup...

    // NEW: Setup transmitter adapter
    const transmitter = this.groundStation.transmitters[0]; // First transmitter
    const txContainer = this.dom_!.querySelector('.tx-chain-tab');
    if (txContainer && transmitter) {
      this.transmitterAdapter = new TransmitterAdapter(transmitter, txContainer as HTMLElement);
    }
  }

  dispose(): void {
    super.dispose();
    this.bucAdapter = null;
    this.hpaAdapter = null;
    this.transmitterAdapter = null; // NEW
  }
}
```

### 2.4 CSS Styling

**Add to tx-chain-tab.css:**

```css
/* Modem button states */
.modem-btn.active {
  background-color: var(--tblr-primary);
  border-color: var(--tblr-primary);
  color: white;
}

.modem-btn.transmitting {
  animation: pulse-red 1s infinite;
  border-color: #dc2626;
}

@keyframes pulse-red {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); }
  50% { box-shadow: 0 0 0 6px rgba(220, 38, 38, 0); }
}

/* Power budget bar colors */
.progress-bar.bg-success { background-color: #22c55e !important; }
.progress-bar.bg-warning { background-color: #f59e0b !important; }
.progress-bar.bg-danger { background-color: #dc2626 !important; }

/* LED indicators */
.led {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  transition: all 0.3s ease;
}

.led-gray { background-color: #6b7280; }
.led-green {
  background-color: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}
.led-red {
  background-color: #dc2626;
  box-shadow: 0 0 8px #dc2626;
}
.led-amber {
  background-color: #f59e0b;
  box-shadow: 0 0 8px #f59e0b;
}
```

### Testing Checklist

- [ ] All 4 modem buttons functional
- [ ] Active modem highlighting works
- [ ] Configuration inputs update correctly
- [ ] Apply button commits changes
- [ ] Power budget calculates and displays correctly
- [ ] Power bar colors (green < 80%, yellow < 100%, red >= 100%)
- [ ] TX switch enables/disables transmission
- [ ] Fault triggers on >100% power budget
- [ ] Fault reset clears fault
- [ ] Loopback switch toggles test mode
- [ ] All 4 LEDs update correctly
- [ ] Status bar shows alarms
- [ ] Multiple modems can be configured independently

---

## Phase 3: RX Analysis Modem Control

**Estimated Time:** 2-3 days
**Complexity:** Medium-High
**Goal:** Add complete 4-modem receiver management with video monitor to RX Analysis tab

### Files to Create

**[receiver-adapter.ts](../src/pages/mission-control/tabs/receiver-adapter.ts)** (NEW)

### Files to Modify

1. **[receiver.ts](../src/equipment/receiver/receiver.ts)** - Add public handler methods
2. **[rx-analysis-tab.ts](../src/pages/mission-control/tabs/rx-analysis-tab.ts)** - Integrate adapter
3. **[rx-analysis-tab.css](../src/pages/mission-control/tabs/rx-analysis-tab.css)** - Add video monitor styles

### 3.1 Create ReceiverAdapter

**Pattern:** Similar to TransmitterAdapter

**Key Differences from TX:**

- Configuration includes **modulation** (BPSK, QPSK, 8QAM, 16QAM) and **FEC** (1/2, 2/3, 3/4, 5/6, 7/8)
- **Video monitor** displays feed when signal locked
- **Signal quality indicators** on modem buttons (good/degraded/no signal)
- Status bar shows signal detection instead of alarms

**Class Structure:**

```typescript
export class ReceiverAdapter {
  private readonly receiver: Receiver;
  private readonly containerEl: HTMLElement;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly boundHandlers: Map<string, EventListener> = new Map();
  private readonly stateChangeHandler: (state: Partial<ReceiverState>) => void;
  private lastStateString: string = '';

  // Event handlers
  private modemSelectHandler_(modemNumber: number): void
  private antennaHandler_(e: Event): void
  private frequencyHandler_(e: Event): void
  private bandwidthHandler_(e: Event): void
  private modulationHandler_(e: Event): void
  private fecHandler_(e: Event): void
  private applyHandler_(): void
  private powerSwitchHandler_(e: Event): void

  // Helper methods
  private updateModemButtons_(): void
  private updateVideoMonitor_(): void
  private updateStatusBar_(): void
  private getModemSignalClass_(modemIndex: number): string
  private getSignalQualityLedColor_(): string
}
```

**DOM Cache Elements:**

- Modem buttons: `modem-btn-1`, `modem-btn-2`, etc.
- Config inputs: `antenna-select`, `frequency-input`, `bandwidth-input`, `modulation-select`, `fec-select`
- Current displays: `frequency-current`, `bandwidth-current`, `modulation-current`, `fec-current`
- Apply button: `apply-btn`
- Video monitor: `video-monitor`, `video-feed`
- Power switch: `power-switch`
- Signal quality LED: `signal-led`
- Status bar: `status-bar`

**Video Monitor Update Logic:**

```typescript
private updateVideoMonitor_(): void {
  const monitor = this.domCache_.get('video-monitor');
  const videoFeed = this.domCache_.get('video-feed') as HTMLImageElement;

  const activeModem = this.receiver.state.modems[this.receiver.state.activeModem];

  // Check power state
  if (!activeModem.power) {
    monitor.classList.add('no-power');
    monitor.classList.remove('no-signal', 'signal-found', 'signal-degraded');
    return;
  }

  // Check for matching signal
  const hasSignal = this.receiver.hasSignalForModem(activeModem);
  const isDegraded = this.receiver.isSignalDegraded(activeModem);

  if (!hasSignal) {
    monitor.classList.add('no-signal');
    monitor.classList.remove('no-power', 'signal-found', 'signal-degraded');
  } else {
    monitor.classList.add('signal-found');
    monitor.classList.remove('no-power', 'no-signal');

    if (isDegraded) {
      monitor.classList.add('signal-degraded');
    } else {
      monitor.classList.remove('signal-degraded');
    }

    // Set video feed source
    const visibleSignals = this.receiver.getVisibleSignals(activeModem);
    if (visibleSignals.length > 0) {
      videoFeed.src = visibleSignals[0].mediaUrl;
    }
  }
}
```

**Modem Button Signal Quality:**

```typescript
private getModemSignalClass_(modemIndex: number): string {
  const modem = this.receiver.state.modems[modemIndex];
  if (!modem.power) return '';

  const hasSignal = this.receiver.hasSignalForModem(modem);
  const isDegraded = this.receiver.isSignalDegraded(modem);

  if (!hasSignal) return '';
  if (isDegraded) return 'btn-rx-signal-degraded';
  return 'btn-rx-signal-good';
}

private updateModemButtons_(): void {
  for (let i = 0; i < 4; i++) {
    const btn = this.domCache_.get(`modem-btn-${i + 1}`);
    btn?.classList.remove('active', 'btn-rx-signal-good', 'btn-rx-signal-degraded');

    if (i === this.receiver.state.activeModem) {
      btn?.classList.add('active');
    }

    const signalClass = this.getModemSignalClass_(i);
    if (signalClass) btn?.classList.add(signalClass);
  }
}
```

### 3.2 Modify Receiver Class

**Add Public Methods:**

```typescript
// Modem selection
public setActiveModem(modemNumber: number): void {
  this.state_.activeModem = modemNumber - 1;
  this.emitStateChange();
}

// Configuration handlers
public handleAntennaChange(antennaUuid: string): void
public handleFrequencyChange(frequencyMHz: number): void
public handleBandwidthChange(bandwidthMHz: number): void
public handleModulationChange(modulation: ModulationType): void
public handleFecChange(fec: FECType): void

// Apply pending changes
public applyChanges(): void {
  // Apply pending config to active modem
  this.emitStateChange();
}

// Power control
public handlePowerToggle(isEnabled: boolean): void

// Helper methods for UI
public hasSignalForModem(modem: ReceiverModemState): boolean {
  const visibleSignals = this.getVisibleSignals(modem);
  return visibleSignals.length > 0;
}

public isSignalDegraded(modem: ReceiverModemState): boolean {
  // Check if signal quality is degraded (SNR, power level, etc.)
}

// Make this method public (currently private)
public getVisibleSignals(modemData?: ReceiverModemState): IfSignal[]
```

### 3.3 Update RX Analysis Tab

**HTML Template Structure:**

```html
<div class="rx-analysis-tab">
  <div class="row g-3">
    <!-- Existing spectrum analyzer cards remain -->

    <!-- New Receiver Control Card (full width) -->
    <div class="col-12">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Receiver Modems</h3>
        </div>
        <div class="card-body">
          <!-- Modem Selection Buttons -->
          <div class="btn-group mb-3" role="group">
            <button class="btn btn-outline-primary modem-btn" data-modem="1">RX 1</button>
            <button class="btn btn-outline-primary modem-btn" data-modem="2">RX 2</button>
            <button class="btn btn-outline-primary modem-btn" data-modem="3">RX 3</button>
            <button class="btn btn-outline-primary modem-btn" data-modem="4">RX 4</button>
          </div>

          <div class="row g-3">
            <!-- Configuration Panel -->
            <div class="col-lg-4">
              <div class="card h-100">
                <div class="card-header">
                  <h4 class="card-title">Configuration</h4>
                </div>
                <div class="card-body">
                  <!-- Antenna selector -->
                  <div class="mb-3">
                    <label class="form-label">Antenna</label>
                    <select id="antenna-select" class="form-select">
                      <option value="1">Antenna 1</option>
                      <option value="2">Antenna 2</option>
                    </select>
                  </div>

                  <!-- Frequency, Bandwidth inputs... -->

                  <!-- Modulation selector (NEW) -->
                  <div class="mb-3">
                    <label class="form-label">Modulation</label>
                    <select id="modulation-select" class="form-select">
                      <option value="BPSK">BPSK</option>
                      <option value="QPSK">QPSK</option>
                      <option value="8QAM">8QAM</option>
                      <option value="16QAM">16QAM</option>
                    </select>
                  </div>

                  <!-- FEC selector (NEW) -->
                  <div class="mb-3">
                    <label class="form-label">FEC Rate</label>
                    <select id="fec-select" class="form-select">
                      <option value="1/2">1/2</option>
                      <option value="2/3">2/3</option>
                      <option value="3/4">3/4</option>
                      <option value="5/6">5/6</option>
                      <option value="7/8">7/8</option>
                    </select>
                  </div>

                  <button id="apply-btn" class="btn btn-primary w-100">Apply Changes</button>
                </div>
              </div>
            </div>

            <!-- Video Monitor -->
            <div class="col-lg-4">
              <div class="card h-100">
                <div class="card-header">
                  <h4 class="card-title">Video Monitor</h4>
                </div>
                <div class="card-body d-flex align-items-center justify-content-center p-0">
                  <div id="video-monitor" class="video-monitor no-signal">
                    <img id="video-feed" class="video-feed" alt="Video feed" />
                    <div class="video-overlay">NO SIGNAL</div>
                    <div class="signal-degraded-overlay"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Status & Control Panel -->
            <div class="col-lg-4">
              <div class="card h-100">
                <div class="card-header">
                  <h4 class="card-title">Status & Control</h4>
                </div>
                <div class="card-body">
                  <!-- Power Switch -->
                  <div class="mb-3">
                    <div class="form-check form-switch">
                      <input id="power-switch" type="checkbox" class="form-check-input" role="switch" />
                      <label class="form-check-label">Power</label>
                    </div>
                  </div>

                  <!-- Signal Quality LED -->
                  <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="text-muted">Signal Quality:</span>
                      <div id="signal-led" class="led led-gray"></div>
                    </div>
                  </div>

                  <!-- Status Info -->
                  <div class="mb-2">
                    <div class="d-flex justify-content-between">
                      <span class="text-muted small">Frequency:</span>
                      <span id="frequency-current" class="fw-bold font-monospace">--</span>
                    </div>
                  </div>
                  <!-- Bandwidth, Modulation, FEC current displays... -->
                </div>
              </div>
            </div>
          </div>

          <!-- Status Bar -->
          <div id="status-bar" class="alert alert-info mt-3" role="alert">
            Ready
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

**TypeScript Integration:**

```typescript
export class RxAnalysisTab extends Tab {
  // Existing adapters
  private lnbAdapter: LNBAdapter | null = null;
  private filterAdapter: FilterAdapter | null = null;
  private spectrumAnalyzerAdapter: SpectrumAnalyzerAdapter | null = null;

  // NEW
  private receiverAdapter: ReceiverAdapter | null = null;

  protected addEventListenersLate_(): void {
    // Existing adapter setup...

    // NEW: Setup receiver adapter
    const receiver = this.groundStation.receivers[0]; // First receiver
    const rxContainer = this.dom_!.querySelector('.rx-analysis-tab');
    if (rxContainer && receiver) {
      this.receiverAdapter = new ReceiverAdapter(receiver, rxContainer as HTMLElement);
    }
  }

  dispose(): void {
    super.dispose();
    this.lnbAdapter = null;
    this.filterAdapter = null;
    this.spectrumAnalyzerAdapter = null;
    this.receiverAdapter = null; // NEW
  }
}
```

### 3.4 CSS Styling

**Add to rx-analysis-tab.css:**

```css
/* Modem button signal quality states */
.modem-btn.btn-rx-signal-good {
  border: 2px solid #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
}

.modem-btn.btn-rx-signal-degraded {
  border: 2px solid #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
}

/* Video monitor container */
.video-monitor {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background-color: #000;
  border: 1px solid var(--mc-surface-3);
  overflow: hidden;
}

/* Video feed element */
.video-feed {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: none;
}

.video-monitor.signal-found .video-feed {
  display: block;
}

/* Video overlay states */
.video-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #6b7280;
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  pointer-events: none;
}

.video-monitor.no-signal .video-overlay::after {
  content: 'NO SIGNAL';
}

.video-monitor.no-power .video-overlay::after {
  content: 'NO POWER';
}

.video-monitor.signal-found .video-overlay {
  display: none;
}

/* Signal degraded overlay */
.signal-degraded-overlay {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.1) 2px,
    rgba(0, 0, 0, 0.1) 4px
  );
  display: none;
  pointer-events: none;
  animation: scanline 8s linear infinite;
}

.video-monitor.signal-degraded .signal-degraded-overlay {
  display: block;
}

.video-monitor.signal-degraded .video-feed {
  filter: contrast(1.2) saturate(0.8);
  animation: glitch 0.3s infinite;
}

@keyframes scanline {
  0% { transform: translateY(0); }
  100% { transform: translateY(100%); }
}

@keyframes glitch {
  0%, 90% { transform: translate(0); }
  92% { transform: translate(-2px, 1px); }
  94% { transform: translate(2px, -1px); }
  96% { transform: translate(-1px, 2px); }
  98% { transform: translate(1px, -2px); }
  100% { transform: translate(0); }
}
```

### Testing Checklist

- [ ] All 4 modem buttons functional
- [ ] Active modem highlighting works
- [ ] Signal quality indicators (green/yellow borders) on buttons
- [ ] Configuration inputs update correctly (including modulation/FEC)
- [ ] Apply button commits changes
- [ ] Video monitor displays "NO POWER" when modem off
- [ ] Video monitor displays "NO SIGNAL" when no matching signal
- [ ] Video feed appears when signal found
- [ ] Degraded signal shows scanline overlay and glitch effect
- [ ] Signal quality LED updates (gray/green/yellow/red)
- [ ] Status bar shows signal detection messages
- [ ] Multiple modems can receive different signals simultaneously

---

## Phase 4: Spectrum Analyzer Advanced Controls

**Estimated Time:** 3-5 days
**Complexity:** High
**Goal:** Add expandable advanced control panel to RX Analysis tab (integrated, not modal)

### Design Decision

**Legacy:** AnalyzerControlBox creates modal popup with draggable control panel
**Modern:** Integrate AnalyzerControl component into expandable card (Tabler collapse pattern)

**Key Insight:** AnalyzerControl component is already decoupled from the modal wrapper (AnalyzerControlBox). We can reuse it directly in the expandable card without modification.

### Files to Create

**[spectrum-analyzer-advanced-adapter.ts](../src/pages/mission-control/tabs/spectrum-analyzer-advanced-adapter.ts)** (NEW)

### Files to Modify

1. **[rx-analysis-tab.ts](../src/pages/mission-control/tabs/rx-analysis-tab.ts)** - Add expandable card
2. **[rx-analysis-tab.css](../src/pages/mission-control/tabs/rx-analysis-tab.css)** - Collapse button styles

### Files to Review (No Changes)

1. **[analyzer-control.ts](../src/equipment/real-time-spectrum-analyzer/analyzer-control.ts)** - Reuse as-is
2. **[analyzer-control/\*](../src/equipment/real-time-spectrum-analyzer/analyzer-control/)** - All sub-modules

### 4.1 Create SpectrumAnalyzerAdvancedAdapter

**Responsibilities:**

- Embed AnalyzerControl component in card body
- Handle expand/collapse toggle
- Wire to spectrum analyzer instance
- Proper cleanup on dispose

**Implementation:**

```typescript
import { AnalyzerControl } from '../../equipment/real-time-spectrum-analyzer/analyzer-control';
import { RealTimeSpectrumAnalyzer } from '../../equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';

export class SpectrumAnalyzerAdvancedAdapter {
  private readonly spectrumAnalyzer: RealTimeSpectrumAnalyzer;
  private readonly containerEl: HTMLElement;
  private analyzerControl: AnalyzerControl | null = null;
  private isExpanded: boolean = false;

  constructor(spectrumAnalyzer: RealTimeSpectrumAnalyzer, containerEl: HTMLElement) {
    this.spectrumAnalyzer = spectrumAnalyzer;
    this.containerEl = containerEl;
    this.initialize_();
  }

  private initialize_(): void {
    // Find the control container element
    const controlContainer = this.containerEl.querySelector('#spec-analyzer-advanced-controls');
    if (!controlContainer) {
      console.error('Advanced controls container not found');
      return;
    }

    // Create AnalyzerControl instance
    this.analyzerControl = new AnalyzerControl({
      element: controlContainer as HTMLElement,
      spectrumAnalyzer: this.spectrumAnalyzer,
    });

    // Initialize the control (injects HTML)
    this.analyzerControl.init_(controlContainer.id, 'replace');

    // Setup expand/collapse handler
    this.setupExpandCollapseHandler_();
  }

  private setupExpandCollapseHandler_(): void {
    const toggleBtn = this.containerEl.querySelector('#spec-analyzer-advanced-toggle');
    const collapseEl = this.containerEl.querySelector('#spec-analyzer-advanced-collapse');
    const icon = toggleBtn?.querySelector('.icon');

    if (!toggleBtn || !collapseEl) return;

    toggleBtn.addEventListener('click', () => {
      this.isExpanded = !this.isExpanded;

      if (this.isExpanded) {
        collapseEl.classList.add('show');
        toggleBtn.innerHTML = '<span class="icon">▼</span> Hide Advanced Controls';
      } else {
        collapseEl.classList.remove('show');
        toggleBtn.innerHTML = '<span class="icon">▶</span> Show Advanced Controls';
      }
    });
  }

  dispose(): void {
    this.analyzerControl = null;
  }
}
```

### 4.2 Update RX Analysis Tab

**HTML Template Addition** (add after spectrum analyzer cards, before receiver card):

```html
<!-- Advanced Spectrum Analyzer Controls (Expandable) -->
<div class="col-12">
  <div class="card">
    <div class="card-header">
      <div class="d-flex justify-content-between align-items-center">
        <h3 class="card-title">Advanced Spectrum Analyzer Controls</h3>
        <button id="spec-analyzer-advanced-toggle" class="btn btn-sm btn-outline-primary">
          <span class="icon">▶</span> Show Advanced Controls
        </button>
      </div>
    </div>
    <div class="collapse" id="spec-analyzer-advanced-collapse">
      <div class="card-body">
        <!-- AnalyzerControl component will be injected here -->
        <div id="spec-analyzer-advanced-controls"></div>
      </div>
    </div>
  </div>
</div>
```

**TypeScript Integration:**

```typescript
import { SpectrumAnalyzerAdvancedAdapter } from './spectrum-analyzer-advanced-adapter';

export class RxAnalysisTab extends Tab {
  // Existing adapters...
  private receiverAdapter: ReceiverAdapter | null = null;

  // NEW
  private spectrumAnalyzerAdvancedAdapter: SpectrumAnalyzerAdvancedAdapter | null = null;

  protected addEventListenersLate_(): void {
    // Existing adapter setup...

    // NEW: Setup advanced spectrum analyzer controls
    const spectrumAnalyzer = this.groundStation.spectrumAnalyzers[0];
    if (spectrumAnalyzer && this.dom_) {
      this.spectrumAnalyzerAdvancedAdapter = new SpectrumAnalyzerAdvancedAdapter(
        spectrumAnalyzer,
        this.dom_
      );
    }
  }

  dispose(): void {
    super.dispose();
    this.lnbAdapter = null;
    this.filterAdapter = null;
    this.spectrumAnalyzerAdapter = null;
    this.receiverAdapter = null;
    this.spectrumAnalyzerAdvancedAdapter = null; // NEW
  }
}
```

### 4.3 CSS Styling

**Add to rx-analysis-tab.css:**

```css
/* Expandable controls button */
#spec-analyzer-advanced-toggle {
  transition: all 0.2s ease;
}

#spec-analyzer-advanced-toggle .icon {
  display: inline-block;
  transition: transform 0.2s ease;
}

/* Collapse transition */
#spec-analyzer-advanced-collapse {
  transition: height 0.3s ease;
}

#spec-analyzer-advanced-collapse.show {
  display: block;
}

/* Ensure analyzer-control styles are loaded */
/* (AnalyzerControl component has its own CSS) */
```

### 4.4 Verify AnalyzerControl Functionality

**No code changes needed** - just verify existing features work in new context:

**Menu System:**

- ✅ FREQ menu: Center frequency control
- ✅ SPAN menu: Span/bandwidth control
- ✅ AMPT menu: Amplitude scale
- ✅ MKR/MKR 2 menus: Dual marker controls
- ✅ BW menu: Resolution bandwidth
- ✅ SWEEP menu: Sweep controls
- ✅ TRACE menu: Max Hold, Min Hold, Clear/Write, View, Blank
- ✅ MODE menu: Spectral density, Waterfall, Both
- ✅ SAVE menu: Save trace functionality

**UI Components:**

- ✅ 10 main menu buttons
- ✅ 8 dynamic sub-menu buttons
- ✅ Number pad (0-9)
- ✅ Unit selection (GHz, MHz, kHz, Hz)
- ✅ Special buttons (ESC, Backspace, Enter, Power)
- ✅ 2 rotary adjustment knobs

### Testing Checklist

- [ ] Expand/collapse button works
- [ ] Icon rotates on expand (▶ → ▼)
- [ ] AnalyzerControl renders correctly in card
- [ ] All menu buttons functional
- [ ] Number pad and unit selection work
- [ ] Rotary knobs adjust values
- [ ] Trace modes update spectrum display
- [ ] Markers display and move correctly
- [ ] Save trace functionality works
- [ ] No conflicts with basic spectrum analyzer controls
- [ ] Collapse animation smooth

---

## Testing & Verification Strategy

### Per-Phase Testing

**Phase 1 (ACU Polar Plot):**

- Manual testing: Move antenna, verify plot updates
- Visual inspection: Correct grid, labels, position marker
- Responsive testing: Check card layout at 992px breakpoint

**Phase 2 (TX Chain):**

- Functional testing: All 4 modems configurable independently
- Power budget testing: Verify calculation, bar colors, fault triggering
- Switch testing: TX enable/disable, loopback mode, fault reset
- Status testing: LED updates, status bar alarms

**Phase 3 (RX Analysis):**

- Functional testing: All 4 modems configurable independently
- Signal matching: Test with various TX configurations
- Video monitor: Verify NO SIGNAL, NO POWER, signal found, degraded states
- Modulation/FEC: Test all combinations

**Phase 4 (Spectrum Analyzer):**

- Menu testing: Verify all 10 main menus functional
- Trace modes: Test Max Hold, Min Hold, Clear/Write
- Markers: Test dual marker functionality
- Display modes: Spectral density, waterfall, both
- Expand/collapse: Smooth animation, state persistence

### End-to-End Scenarios

**Full TX→RX Path:**

1. Configure ACU: Point antenna at 45° azimuth, 30° elevation
2. Configure TX1: Antenna 1, 2200 MHz, 10 MHz BW, 0 dBm, QPSK, 3/4 FEC
3. Enable TX1 transmission
4. Configure RX1: Antenna 1, 2200 MHz, 10 MHz BW, QPSK, 3/4 FEC
5. Verify: RX1 shows signal found, video monitor displays feed
6. Verify: Spectrum analyzer shows signal at 2200 MHz

**Multi-Modem:**

1. Configure TX1 and TX3 with different frequencies
2. Enable both
3. Configure RX1 to match TX1, RX3 to match TX3
4. Verify: Both video monitors show independent feeds
5. Verify: Spectrum shows both signals

**Power Budget Fault:**

1. Configure 3 TX modems with high power (e.g., 3 dBm each)
2. Enable all 3
3. Verify: Power budget >100%, fault LED lit, TX disabled, alarm displayed

### Browser Testing

**Browsers:** Chrome, Firefox, Edge (latest versions)
**Resolutions:**

- 1920x1080 (primary target)
- 1366x768 (common laptop)
- 1280x720 (minimum supported)

**Responsive Testing:**

- Above 992px: 2-column card layout
- Below 992px: Cards stack vertically

### Performance Testing

**DOM Query Performance:**

- Use browser DevTools Performance tab
- Record interaction (e.g., modem selection)
- Verify: No excessive DOM queries (DOM caching working)
- Target: <16ms per interaction (60 FPS)

**State Update Performance:**

- Monitor EventBus event frequency
- Verify: State string comparison prevents circular updates
- Verify: No infinite loops, no duplicate renders

---

## Success Criteria

### Functional Completeness

- [ ] ACU polar plot displays and updates correctly
- [ ] All 4 TX modems configurable and functional
- [ ] All 4 RX modems configurable and functional
- [ ] Video monitors display feeds correctly
- [ ] Power budget calculation and fault detection accurate
- [ ] Advanced spectrum analyzer controls fully functional
- [ ] All switches, LEDs, status bars working

### Code Quality

- [ ] All adapters follow established pattern (readonly, DOM caching, event handlers)
- [ ] TypeScript compiles with zero errors
- [ ] No console errors or warnings
- [ ] Proper cleanup in dispose() methods
- [ ] Event listeners properly removed

### UI/UX Quality

- [ ] Tabler CSS patterns consistently applied
- [ ] Responsive layout works at all breakpoints
- [ ] Animations smooth (expand/collapse, pulse effects)
- [ ] LED indicators visible and clear
- [ ] Status messages informative
- [ ] No layout shifts or visual glitches

### Performance

- [ ] DOM caching reduces query overhead
- [ ] State string comparison prevents circular updates
- [ ] Interactions feel snappy (<16ms frame time)
- [ ] No memory leaks (check DevTools Memory tab)

### Documentation

- [ ] Code comments explain complex logic
- [ ] TypeScript types properly documented
- [ ] Adapter pattern documented in retrospective
- [ ] Testing procedures documented

---

## Risk Mitigation

### Risk: Breaking Legacy Sandbox UI

**Mitigation:** All changes isolated to mission-control-page and new adapter files. No modifications to legacy equipment classes except adding public methods (backward compatible).

### Risk: State Management Conflicts

**Mitigation:** Use EventBus for all state changes, prevent circular updates with state string comparison.

### Risk: Performance Degradation

**Mitigation:** DOM caching pattern from adapter retrospective, performance testing after each phase.

### Risk: Complex Merge Conflicts

**Mitigation:** Work incrementally, commit after each phase, test before proceeding.

### Risk: Video Monitor Cross-Origin Issues

**Mitigation:** Ensure media URLs served from same origin or with proper CORS headers.

---

## Post-Implementation Tasks

1. **Update Retrospective:** Document lessons learned from this migration
2. **Performance Analysis:** Measure DOM query reduction, render times
3. **Accessibility Audit:** Run axe-core on new components
4. **Documentation:** Update project README with new adapter pattern
5. **Code Review:** Review adapter implementations for consistency
6. **Visual Regression Testing:** Consider adding Playwright snapshots

---

## Key Files Summary

### To Create (4 new files)

1. `src/pages/mission-control/tabs/transmitter-adapter.ts`
2. `src/pages/mission-control/tabs/receiver-adapter.ts`
3. `src/pages/mission-control/tabs/spectrum-analyzer-advanced-adapter.ts`

### To Modify (8 existing files)

1. `src/pages/mission-control/tabs/acu-control-tab.ts` - Add polar plot
2. `src/pages/mission-control/tabs/acu-control-tab.css` - (if needed)
3. `src/pages/mission-control/tabs/tx-chain-tab.ts` - Add transmitter controls
4. `src/pages/mission-control/tabs/tx-chain-tab.css` - Add LED/power bar styles
5. `src/pages/mission-control/tabs/rx-analysis-tab.ts` - Add receiver controls + advanced SA
6. `src/pages/mission-control/tabs/rx-analysis-tab.css` - Add video monitor styles
7. `src/equipment/transmitter/transmitter.ts` - Add public handler methods
8. `src/equipment/receiver/receiver.ts` - Add public handler methods

### To Review (No Changes)

1. `src/equipment/real-time-spectrum-analyzer/analyzer-control.ts`
2. `src/components/polar-plot/polar-plot.ts`

---

## Estimated Timeline

**Conservative (3 weeks / 15 days):**

- Phase 1: 0.5 days
- Phase 2: 4 days
- Phase 3: 4 days
- Phase 4: 3.5 days
- Testing: 2 days
- Documentation: 1 day

**Aggressive (2 weeks / 10 days):**

- Phase 1: 0.25 days
- Phase 2: 2.5 days
- Phase 3: 2.5 days
- Phase 4: 2.5 days
- Testing: 1.5 days
- Documentation: 0.75 days

**Recommended (2.5 weeks / 13 days):**

- Phase 1: 0.5 days
- Phase 2: 3 days
- Phase 3: 3 days
- Phase 4: 3.5 days
- Testing: 2 days
- Documentation: 1 day

---

## Conclusion

This plan provides a complete roadmap for migrating the remaining Mission Control UI functionality from the legacy sandbox page to the modern Tabler-based implementation. By following established patterns from the retrospectives, maintaining strict architectural discipline, and testing incrementally, we can deliver a professional, performant, and maintainable control interface that completes the Mission Control modernization effort.

The phased approach ensures each component is fully functional before moving to the next, minimizing risk and allowing for course corrections. The comprehensive testing strategy ensures quality, and the detailed implementation guidelines ensure consistency with existing code patterns.
