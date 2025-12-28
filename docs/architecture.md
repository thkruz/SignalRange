# Architecture Overview

The codebase follows a **Core/UI separation pattern** with three main file types:

## File Type Conventions

| File Pattern      | Layer          | Responsibility                                   |
| ----------------- | -------------- | ------------------------------------------------ |
| `-core.ts`        | Business Logic | Physics, math, state management, signal processing |
| `-ui-standard.ts` | UI Binding     | DOM manipulation, components, event handlers     |
| `-factory.ts`     | Creation       | Polymorphic instantiation of UI variants         |

---

## Layer Responsibilities

### 1. `-core.ts` (Business Logic Layer)

**Contains:**

- State interface definitions (e.g., `LNBState`, `HPAState`)
- `getDefaultState()` static method
- `update()` for physics calculations each simulation tick
- `getAlarms()` for fault detection
- Public handler methods for UI calls (e.g., `handlePowerToggle()`)
- Signal routing and RF calculations

**No dependencies on:**

- DOM APIs
- UI components
- CSS or styling

**Examples:**

- [lnb-module-core.ts](../src/equipment/rf-front-end/lnb-module/lnb-module-core.ts) - LO frequency, noise calculations
- [hpa-module-core.ts](../src/equipment/rf-front-end/hpa-module/hpa-module-core.ts) - Power, compression, IMD
- [filter-module-core.ts](../src/equipment/rf-front-end/filter-module/filter-module-core.ts) - Bandwidth, insertion loss

---

### 2. `-ui-standard.ts` (UI Binding Layer)

**Extends** the corresponding `-core.ts` class.

**Contains:**

- Component creation (RotaryKnob, PowerSwitch, ToggleSwitch)
- `initializeDom()` - injects HTML template
- `addEventListeners()` - binds user interactions to core handlers
- `syncDomWithState_()` - updates DOM when state changes
- `getComponents()`, `getDisplays()`, `getLEDs()` - for composite layouts

**Key pattern - UI components created in constructor:**

```typescript
class LNBModuleUIStandard extends LNBModuleCore {
  constructor(rfFrontEnd: RFFrontEndCore, containerEl: HTMLElement) {
    // Components needing uniqueId created AFTER super()
    super(rfFrontEnd, containerEl);
    this.loKnob_ = new RotaryKnob(...);
    this.powerSwitch_ = this.createPowerSwitch();
  }
}
```

**Examples:**

- [lnb-module-ui-standard.ts](../src/equipment/rf-front-end/lnb-module/lnb-module-ui-standard.ts)
- [hpa-module-ui-standard.ts](../src/equipment/rf-front-end/hpa-module/hpa-module-ui-standard.ts)

---

### 3. `-factory.ts` (Polymorphic Creation)

**Enables** switching between UI implementations without changing calling code.

**Pattern:**

```typescript
export type LNBModuleUIType = 'standard' | 'basic' | 'headless';

export function createLNBModule(
  rfFrontEnd: RFFrontEndCore,
  containerEl: HTMLElement,
  uiType: LNBModuleUIType = 'standard'
): LNBModuleCore {
  switch (uiType) {
    case 'standard': return new LNBModuleUIStandard(rfFrontEnd, containerEl);
    case 'headless': return new LNBModuleUIHeadless(rfFrontEnd, containerEl);
    default: throw new Error('not yet implemented');
  }
}
```

**Returns base Core type** for polymorphism - callers work with `LNBModuleCore`, not specific UI variant.

---

## Complete Module Stack Example

### LNB Module

```text
lnb-module/
├── lnb-module-core.ts        → RF physics, noise temperature, frequency drift
├── lnb-module-ui-standard.ts → RotaryKnob, PowerSwitch, LED indicators
├── lnb-module-factory.ts     → Creates standard/basic/headless variant
└── lnb-module.css            → Module-specific styling
```

---

## UI Variant Types

| Variant    | Purpose                                    |
| ---------- | ------------------------------------------ |
| `standard` | Full DOM with knobs, switches, displays    |
| `basic`    | Simplified UI (fewer controls)             |
| `headless` | No DOM - for automated/testing scenarios   |
| `modern`   | Alternative visual style (antenna only)    |

---

## Inheritance Hierarchy

```text
BaseEquipment
└── RFFrontEndModule<TState>  (common RF module lifecycle)
    ├── LNBModuleCore         (LNB business logic)
    │   └── LNBModuleUIStandard (LNB DOM binding)
    ├── HPAModuleCore
    │   └── HPAModuleUIStandard
    └── FilterModuleCore
        └── FilterModuleUIStandard
```

---

## Benefits of This Architecture

1. **Separation of concerns** - Physics isolated from UI code
2. **Testability** - Core can be unit tested without DOM
3. **Reusability** - Multiple UIs can share same core logic
4. **Flexibility** - Factories allow runtime UI selection
5. **Maintainability** - Changes to physics don't affect UI and vice versa
