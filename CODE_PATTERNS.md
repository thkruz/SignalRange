# Code Patterns and Conventions

This document outlines the architectural patterns, naming conventions, and best practices used throughout the Signal Range codebase.

## Table of Contents

- [Class Structure](#class-structure)
- [Services and Singletons](#services-and-singletons)
- [Interfaces and Types](#interfaces-and-types)
- [Naming Conventions](#naming-conventions)
- [Event-Driven Architecture](#event-driven-architecture)
- [Module Composition](#module-composition)
- [Testing Patterns](#testing-patterns)

---

## Class Structure

### Equipment Classes

Equipment classes follow a consistent lifecycle and structure pattern:

```typescript
export class RFFrontEnd extends BaseEquipment {
  // 1. State (typed with interface)
  state: RFFrontEndState;
  private lastRenderState: string = '';

  // 2. Module/Component references
  omtModule: OMTModule;
  bucModule: BUCModule;

  // 3. Service references
  signalPathManager: SignalPathManager;

  // 4. External equipment references
  antenna: Antenna | null = null;
  transmitters: Transmitter[] = [];

  // 5. Constructor
  constructor(parentId: string, state?: Partial<RFFrontEndState>, teamId: number = 1, serverId: number = 1) {
    super(parentId, teamId);

    // Initialize state with defaults
    this.state = {
      uuid: this.uuid,
      teamId: this.teamId,
      serverId: serverId,
      // Module states
      omt: OMTModule.getDefaultState(),
      buc: BUCModule.getDefaultState(),
      ...state
    };

    // Instantiate modules
    this.omtModule = new OMTModule(this.state.omt, this);

    // Build DOM
    this.build(parentId);

    // Subscribe to events
    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
  }

  // 6. Lifecycle methods
  update(): void {
    // Update component states
    this.updateComponentStates();

    // Update modules
    this.omtModule.update();
    this.bucModule.update();

    // Check for alarms
    this.checkForAlarms_();
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);
    parentDom.innerHTML = html`...`;
    return parentDom;
  }

  // 7. Protected methods (with trailing underscore)
  protected addListeners_(): void {
    // Add module event listeners
    this.omtModule.addEventListeners((state: OMTState) => {
      this.state.omt = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_OMT_CHANGED, state);
    });
  }

  protected initialize_(): void {
    this.syncDomWithState();
  }

  protected checkForAlarms_(): void {
    // Implementation
  }

  // 8. Public API methods (no underscore)
  connectAntenna(antenna: Antenna): void {
    this.antenna = antenna;
  }

  sync(data: Partial<RFFrontEndState>): void {
    // Deep merge state
    if (data.omt) {
      this.state.omt = { ...this.state.omt, ...data.omt };
      this.omtModule.sync(data.omt);
    }
    this.syncDomWithState();
  }

  // 9. Getters for computed values
  get externalNoise() {
    return this.signalPathManager.getExternalNoise();
  }

  // 10. Private methods (with trailing underscore)
  private updateComponentStates(): void {
    // Implementation
  }

  private syncDomWithState(): void {
    // Prevent unnecessary re-renders
    if (JSON.stringify(this.state) === this.lastRenderState) {
      return;
    }
    this.lastRenderState = JSON.stringify(this.state);
  }
}
```

### Key Principles

1. **State-driven**: All component state is stored in a typed state object
2. **Module composition**: Complex systems are broken into smaller module classes
3. **Lifecycle hooks**: Use `update()`, `initialize_()`, `addListeners_()` consistently
4. **Event-driven**: Use EventBus for cross-component communication
5. **Immutability-friendly**: Use readonly properties where appropriate

---

## Services and Singletons

### Singleton Pattern

Services use the singleton pattern with private constructors:

```typescript
export class EventBus {
  private static instance: EventBus;
  private readonly events: EventHandlersMap = {};

  private constructor() { }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // Public API methods
  on<T extends Events>(event: T, cb: (...args: EventMap[T]) => void) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(cb);
  }

  emit<T extends Events>(event: T, ...args: EventMap[T]): void {
    Logger.log(`EventBus: Emitting event '${event}' with args:`, args);
    const callbacks = this.events[event];
    if (callbacks) {
      for (const callback of callbacks) {
        callback(...args);
      }
    }
  }

  // Cleanup for testing
  static destroy(): void {
    EventBus.instance = null;
  }
}
```

### Application-Level Singletons

Application classes use a slightly different singleton pattern:

```typescript
export class App extends BaseElement {
  private static instance_: App;
  protected html_: string = '';
  private readonly router = Router.getInstance();

  private constructor() {
    super();
  }

  static create(): App {
    if (App.instance_) {
      throw new Error("App instance already exists.");
    }

    this.instance_ = new App();
    window.signalRange = this.instance_;
    this.instance_.init_();

    return App.instance_;
  }

  static getInstance(): App {
    return App.instance_;
  }

  // For testing
  static __resetAll__(): void {
    Header['instance_'] = null;
    Body['instance_'] = null;
    App.instance_ = null;
  }
}
```

### Service Design Principles

1. **Private constructor**: Prevent direct instantiation
2. **Static getInstance()**: Single point of access
3. **Type-safe APIs**: Use generics for type safety
4. **Cleanup methods**: Provide destroy/reset for testing
5. **Readonly properties**: Mark internal state as readonly when appropriate

---

## Interfaces and Types

### State Interfaces

State interfaces define the complete shape of component state:

```typescript
/**
 * Complete RF Front-End state
 */
export interface RFFrontEndState {
  uuid: string;
  teamId: number;
  serverId: number;

  omt: OMTState;
  buc: BUCState;
  hpa: HPAState;
  filter: IfFilterBankState;
  lnb: LNBState;
  coupler: CouplerState;
  gpsdo: GPSDOState;
}
```

### Type Branding

Use branded types for domain-specific values:

```typescript
export type dBm = number & { __brand: 'dBm' };
export type RfFrequency = number & { __brand: 'RfFrequency' };
export type IfFrequency = number & { __brand: 'IfFrequency' };

// Usage
const power = -10 as dBm;
const freq = 4200 as RfFrequency;
```

### Event Type Maps

Use mapped types for type-safe event handling:

```typescript
export interface EventMap {
  [Events.UPDATE]: [];
  [Events.SYNC]: [];
  [Events.RF_FE_OMT_CHANGED]: [OMTState];
  [Events.RF_FE_BUC_CHANGED]: [BUCState];
}

type EventHandlersMap = Partial<Record<Events, Array<(...args: EventMap[Events]) => void>>>;
```

---

## Naming Conventions

### Variables and Properties

| Type | Convention | Example |
|------|-----------|---------|
| Public properties | camelCase | `antenna`, `transmitters`, `signalPathManager` |
| Private properties | camelCase + underscore | `instance_`, `lastRenderState` |
| Constants | UPPER_SNAKE_CASE | `MAX_POWER`, `DEFAULT_FREQUENCY` |
| Boolean properties | is/has prefix | `isPowered`, `isOverdriven`, `hasError` |
| Type parameters | Single letter or PascalCase | `T`, `TEvent`, `TState` |

### Methods

| Type | Convention | Example |
|------|-----------|---------|
| Public methods | camelCase | `connectAntenna()`, `update()`, `sync()` |
| Protected methods | camelCase + underscore | `addListeners_()`, `initialize_()` |
| Private methods | camelCase + underscore | `updateComponentStates()`, `checkForAlarms_()` |
| Event handlers | handle prefix | `handleInputChange()`, `handleButtonAction()` |
| Getters | noun/adjective | `get externalNoise()`, `get isReady()` |

### Classes and Interfaces

| Type | Convention | Example |
|------|-----------|---------|
| Classes | PascalCase | `RFFrontEnd`, `EventBus`, `SignalPathManager` |
| Interfaces | PascalCase + suffix | `RFFrontEndState`, `BUCState`, `AlarmStatus` |
| Enums | PascalCase | `Events`, `TapPoint`, `Polarization` |
| Types | PascalCase | `dBm`, `RfFrequency` |

### Files

| Type | Convention | Example |
|------|-----------|---------|
| Component files | kebab-case | `rf-front-end.ts`, `event-bus.ts` |
| Test files | name + .test.ts | `rf-front-end.test.ts` |
| Style files | name + .css | `rf-front-end.css` |

---

## Event-Driven Architecture

### EventBus Usage

The EventBus is the primary mechanism for cross-component communication:

```typescript
// 1. Subscribe to events in constructor
EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));

// 2. Emit events when state changes
EventBus.getInstance().emit(Events.RF_FE_OMT_CHANGED, state);

// 3. One-time subscriptions
EventBus.getInstance().once(Events.INIT_COMPLETE, () => {
  console.log('Initialization complete');
});

// 4. Unsubscribe when needed
EventBus.getInstance().off(Events.UPDATE, this.update);

// 5. Clear all listeners for an event
EventBus.getInstance().clear(Events.UPDATE);
```

### Event Naming

- Use enum for event names (type-safe)
- Name events as past-tense actions: `BUTTON_CLICKED`, `STATE_CHANGED`
- Use specific event names: `RF_FE_OMT_CHANGED` vs generic `CHANGED`

---

## Module Composition

Break complex components into smaller, focused modules:

```typescript
export class RFFrontEnd extends BaseEquipment {
  // Module classes
  omtModule: OMTModule;
  bucModule: BUCModule;
  hpaModule: HPAModule;
  filterModule: IfFilterBankModule;
  lnbModule: LNBModule;

  constructor(parentId: string, state?: Partial<RFFrontEndState>) {
    // Instantiate module classes
    this.omtModule = new OMTModule(this.state.omt, this);
    this.bucModule = new BUCModule(this.state.buc, this);

    // Register module event listeners
    this.omtModule.addEventListeners((state: OMTState) => {
      this.state.omt = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_OMT_CHANGED, state);
    });
  }

  update(): void {
    // Update all modules
    this.omtModule.update();
    this.bucModule.update();
    this.hpaModule.update();
  }
}
```

### Module Design Principles

1. **Single responsibility**: Each module handles one concern
2. **State ownership**: Parent owns state, modules receive state references
3. **Callback pattern**: Modules notify parent via callbacks
4. **Static defaults**: Use `getDefaultState()` static methods

---

## Testing Patterns

### Test Organization

Organize tests by feature area using nested `describe` blocks:

```typescript
describe('RFFrontEnd class', () => {
  let rfFrontEnd: RFFrontEnd;
  let parentElement: HTMLElement;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="test-root"></div>';
    parentElement = document.getElementById('test-root')!;

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('should create RF Front-End with default state', () => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);

      expect(rfFrontEnd).toBeDefined();
      expect(rfFrontEnd.state.teamId).toBe(1);
      expect(rfFrontEnd.state.serverId).toBe(1);
    });

    it('should initialize all modules', () => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);

      expect(rfFrontEnd.omtModule).toBeDefined();
      expect(rfFrontEnd.bucModule).toBeDefined();
    });
  });

  describe('Component State Updates', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should disable HPA if BUC is not powered', () => {
      rfFrontEnd.state.buc.isPowered = false;
      rfFrontEnd.state.hpa.isPowered = true;

      rfFrontEnd.update();

      expect(rfFrontEnd.state.hpa.isPowered).toBe(false);
    });
  });

  describe('API Methods', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should get coupler output A', () => {
      const output = rfFrontEnd.getCouplerOutputA();

      expect(output).toHaveProperty('frequency');
      expect(output).toHaveProperty('power');
    });
  });
});
```

### Test Naming

Use descriptive test names that read like sentences:

```typescript
// Good
it('should disable HPA if BUC is not powered', () => {});
it('should calculate LNB noise temperature from noise figure', () => {});
it('should connect to multiple transmitters', () => {});

// Avoid
it('HPA test', () => {});
it('works', () => {});
```

### Test Categories

1. **Initialization tests**: Verify proper setup and default values
2. **State update tests**: Verify state changes and calculations
3. **Integration tests**: Verify component interactions
4. **API tests**: Verify public method contracts
5. **Alarm/error tests**: Verify error conditions and edge cases

### Testing Best Practices

1. **Arrange-Act-Assert**: Structure tests in three clear sections
2. **One assertion per concept**: Each test should verify one behavior
3. **Use spies for side effects**: Verify method calls with jest.spyOn()
4. **Clean up**: Always restore mocks and clear DOM in afterEach
5. **Test edge cases**: Include boundary conditions and error states
6. **Use toBeCloseTo()**: For floating-point comparisons

```typescript
// Arrange
rfFrontEnd.state.lnb.lnaNoiseFigure = 0.6;

// Act
rfFrontEnd.update();

// Assert
const nfLinear = Math.pow(10, 0.6 / 10);
const expectedTemp = 290 * (nfLinear - 1);
expect(rfFrontEnd.state.lnb.noiseTemperature).toBeCloseTo(expectedTemp, 1);
```

---

## Summary

### Key Takeaways

1. **Consistency is paramount**: Follow established patterns throughout the codebase
2. **Type safety first**: Leverage TypeScript's type system fully
3. **Event-driven architecture**: Use EventBus for loose coupling
4. **Module composition**: Break down complexity into manageable pieces
5. **Trailing underscore convention**: Clearly distinguish public from private/protected APIs
6. **Test thoroughly**: Write comprehensive tests for all public APIs and edge cases

### When in Doubt

- Look at existing similar components for guidance
- Prefer composition over inheritance
- Keep methods small and focused
- Write tests as you code
- Document complex logic with JSDoc comments
