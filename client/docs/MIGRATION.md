# Spectrum Analyzer Migration - Architecture Summary

## Overview

This document outlines the TypeScript class-based architecture for migrating React components to self-contained equipment classes.

## Architecture Principles

### 1. **Base Equipment Class**

- All physical equipment inherits from `Equipment` base class
- Provides standard lifecycle: `loadCSS()` → `render()` → `addListeners()` → `initialize()`
- Enforces consistent patterns across all equipment
- Handles cleanup and event management

### 2. **Self-Contained Design**

Each equipment piece (e.g., `SpectrumAnalyzer.ts`) contains:

- ✅ **State management** - All internal state variables
- ✅ **CSS imports** - Equipment-specific styles (`SpectrumAnalyzer.css`)
- ✅ **Render logic** - HTML structure generation
- ✅ **Event listeners** - Button clicks, window resize, etc.
- ✅ **Business logic** - Signal processing, canvas drawing, etc.
- ✅ **Public API** - Methods like `changeCenterFreq()`, `changeBandwidth()`
- ✅ **Interfaces** - TypeScript types for config and data structures

### 3. **CSS Architecture**

```
equipment/
├── Equipment.css           # Common styles (shared buttons, inputs, grids)
├── SpectrumAnalyzer.css    # Analyzer-specific styles
├── TxModem.css            # (future) Transmitter-specific styles
└── RxModem.css            # (future) Receiver-specific styles
```

**Pattern**: Each equipment CSS imports common equipment styles:

```css
@import './Equipment.css';
```

### 4. **Event Communication**

- Uses `EventBus` singleton for cross-component communication
- Equipment emits events: `this.emit(Events.SPEC_A_MODE_CHANGED, data)`
- Equipment listens to events: `this.on(Events.ANTENNA_FREQUENCY_CHANGED, callback)`
- No prop drilling, no context providers

## File Structure

```
client/src/
├── equipment/
│   ├── Equipment.ts              # Base class (127 lines)
│   ├── Equipment.css             # Common styles
│   ├── SpectrumAnalyzer.ts       # Complete migrated analyzer (800+ lines)
│   ├── SpectrumAnalyzer.css      # Analyzer styles
│   └── StudentEquipment.ts       # Orchestrator (manages layout)
├── events/
│   └── event-bus.ts              # Pub/sub event system
└── pages/
    └── student-page.ts           # Page container
```

## Migration Pattern

### React Component (Before)

```jsx
// SpectrumAnalyzerBox.jsx
export const SpectrumAnalyzerBox = (props) => {
  const [isRfMode, setIsRfMode] = useState(false);
  const sewAppCtx = useSewApp();

  useEffect(() => {
    // Setup
  }, []);

  return <div>...</div>;
};
```

### TypeScript Class (After)

```typescript
// SpectrumAnalyzer.ts
import './SpectrumAnalyzer.css';

export class SpectrumAnalyzer extends Equipment {
  private isRfMode: boolean = false;

  protected render(): void {
    this.element.innerHTML = html`<div>...</div>`;
  }

  protected addListeners(): void {
    this.element.addEventListener('click', ...);
  }

  protected initialize(): void {
    this.start();
  }
}
```

## Key Features Migrated

### ✅ Spectrum Analyzer Complete Features

1. **Canvas Rendering**
   - Real-time spectrum display
   - Grid overlay
   - Noise floor generation
   - Signal processing and drawing

2. **Controls**
   - Config button (opens modal)
   - RF/IF mode toggle
   - Pause/Resume animation

3. **Signal Processing**
   - IF (Intermediate Frequency) mode
   - RF (Radio Frequency) mode
   - Upconversion/downconversion
   - Loopback vs antenna mode
   - HPA (High Power Amplifier) detection

4. **Interactive Features**
   - Frequency center adjustment
   - Bandwidth (span) control
   - Max hold display
   - Signal marker
   - Responsive canvas resizing

5. **Frequency Bands**
   - HF, VHF, UHF, L, S, C, X, Ku, K, Ka bands
   - Automatic offset calculation

6. **Event Integration**
   - Emits `SPEC_A_CONFIG_CHANGED` when config button clicked
   - Emits `SPEC_A_MODE_CHANGED` when RF/IF toggled
   - Listens to `ANTENNA_FREQUENCY_CHANGED` events

## Usage Example

```typescript
// Creating 4 spectrum analyzers
for (let i = 1; i <= 4; i++) {
  const specA = new SpectrumAnalyzer(
    `specA${i}-container`,  // Parent element ID
    i,                       // Unit number (1-4)
    1,                       // Team ID
    1                        // Antenna ID
  );
  this.spectrumAnalyzers.push(specA);
}

// Updating analyzer state
specA.update({
  signals: [...],
  target_id: 1,
  locked: true,
  operational: true
});

// Changing frequency
specA.changeCenterFreq(4700e6); // Hz

// Cleanup
specA.destroy();
```

## Benefits of This Architecture

### 1. **Easy Removal**

Want to remove Spectrum Analyzer 3? Just delete:

- `SpectrumAnalyzer.ts`
- `SpectrumAnalyzer.css`
- Remove from `StudentEquipment.ts`

Done! No hunting through context providers, no orphaned state.

### 2. **Self-Documented**

- Everything for one piece of equipment is in one file
- Clear interfaces define public API
- TypeScript ensures type safety

### 3. **Testable**

```typescript
const specA = new SpectrumAnalyzer('test-container', 1);
specA.changeCenterFreq(5000e6);
expect(specA.getConfig().frequency).toBe(5000);
specA.destroy();
```

### 4. **Reusable**

- Create multiple instances easily
- Each instance manages its own state
- No singleton issues

### 5. **Maintainable**

- Clear separation of concerns
- Standard patterns via base class
- CSS encapsulation

## Next Steps

To migrate other equipment (Antennas, Transmitters, Receivers):

1. Create `Antenna.ts` extending `Equipment`
2. Create `Antenna.css` importing `Equipment.css`
3. Port React component logic to class methods
4. Follow the same lifecycle pattern
5. Use EventBus for cross-equipment communication

## Questions Resolved

✅ **CSS Structure**: Common + specific (Equipment.css + SpectrumAnalyzer.css)
✅ **Equipment Interface**: Base Equipment class with standard lifecycle
✅ **State Management**: EventBus pattern, no React context
✅ **Self-Containment**: Everything in one file per equipment
✅ **Inheritance**: Classic OOP with child classes

## Performance Notes

- Each analyzer runs its own animation loop
- Staggered start (random delay) prevents synchronization
- Uses `requestAnimationFrame` for smooth 60fps rendering
- Float32Array for efficient signal processing
- Typed arrays reused, not reallocated

## Comparison: React vs TypeScript Class

| Aspect | React | TypeScript Class |
|--------|-------|------------------|
| State | useState, useContext | Private class properties |
| Lifecycle | useEffect | Constructor → lifecycle methods |
| Events | Props, callbacks | EventBus pub/sub |
| Cleanup | return () => {} | destroy() method |
| Reusability | Components + props | new ClassName() |
| Type Safety | PropTypes (runtime) | TypeScript (compile-time) |
| File Count | 5+ files | 2 files (TS + CSS) |

## Migration Checklist

When migrating a new equipment piece:

- [ ] Create `EquipmentName.ts` extending `Equipment`
- [ ] Create `EquipmentName.css` importing `Equipment.css`
- [ ] Define config interface
- [ ] Implement `render()` with HTML structure
- [ ] Implement `addListeners()` for user interactions
- [ ] Implement `initialize()` for startup logic
- [ ] Implement `update()` for external state changes
- [ ] Implement `getConfig()` for state export
- [ ] Implement `destroy()` for cleanup
- [ ] Add EventBus integration
- [ ] Test instantiation, operation, and cleanup

---

**Status**: Spectrum Analyzer fully migrated ✅
**Next**: Antenna, TxModem, RxModem (awaiting approval)
