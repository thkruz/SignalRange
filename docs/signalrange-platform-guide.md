# SignalRange Platform Guide

**Document Type:** Platform Architecture & Reference  
**Audience:** Developers  
**Last Updated:** January 2026

---

## 1. Platform Vision and Purpose

SignalRange is an **interactive web-based training environment** focused on radio frequency (RF) communications and satellite ground station operations. It combines realistic equipment simulation, guided scenarios, and progressive educational pathways.

Learners develop practical skills in satellite ground station operations and RF signal handling through simulated, increasingly complex operational contexts. The platform targets students aged 14-25 who might not otherwise have access to expensive hardware, serving as both an educational tool and a potential pathway to space industry careers.

The architectural framing is both pedagogical and operational: learners progress through structured units (Campaigns, Scenarios, Objectives) that gradually build expertise from RF fundamentals toward advanced signal management and troubleshooting.

---

## 2. Content Hierarchy

```
Platform
└── Campaign
    └── Scenario
        └── Objective
            └── Condition
```

This layered model ensures logical progression, mapping from broad learning goals to discrete actionable tasks.

### Campaign

A *Campaign* represents the topmost logical container for a sequence of related training activities designed to achieve a cohesive set of competencies. It encapsulates multiple Scenarios ordered so that complexity increases systematically.

- **Purpose:** Organize the curriculum into overarching themes or training tracks
- **Scope:** Can span from introductory RF basics to advanced troubleshooting scenarios
- **Temporal Structure:** Scenarios within a campaign generally unfold in a planned sequence, with prerequisite requirements controlling progression

> **Example:** The NATS (North Atlantic Teleport Services) campaign takes learners from their first day at a satellite ground station through to independent crisis operations across 24 scenarios in three phases. See `nats-campaign-plan.md` for details. Other campaigns (e.g., Beacon Orbital Analytics) follow the same structural pattern.

### Scenario

A *Scenario* is a discrete, structured learning unit within a campaign focusing on a set of related skills or operational tasks.

- **Function:** Break complex competencies into manageable sub-areas
- **Character:** Centers on a real-world operational context (e.g., performing a health check, executing a weather handover, troubleshooting equipment failures)
- **Sequencing:** Scenarios are ordered to scaffold knowledge, introducing foundational skills before advanced ones
- **Prerequisites:** Each scenario may require completion of prior scenarios before becoming available
- **Properties:** Includes difficulty rating, duration estimate, equipment list, and learning objectives

### Objective

An *Objective* forms the specific, measurable competency or outcome that a Scenario is designed to achieve.

- **Granularity:** Targets a focused skill or concept (e.g., verify GPSDO lock status, configure LNB local oscillator frequency)
- **Assessment Ready:** Each objective is evaluated against defined success criteria through one or more Conditions
- **Scoring:** Objectives award points upon completion, with optional time penalties for slow completion
- **Time Limits:** Individual objectives may have countdown timers that trigger failure if exceeded
- **Prerequisites:** Objectives may require prior objectives to be completed before becoming active

### Condition

A *Condition* is a verifiable requirement within an Objective that the learner must satisfy.

- **Nature:** Equipment state checks, quiz questions, or custom evaluations
- **Verification:** System automatically evaluates conditions in real-time based on simulation state
- **Maintenance:** Some conditions must be held for a duration or maintained until all conditions in the objective are complete
- **Logic:** Multiple conditions within an objective can be combined with AND (all required) or OR (any one sufficient) logic

For the complete list of condition types and their parameters, see `scenario-development-guide.md`.

---

## 3. How the Structure Supports Learning

Rather than fragmenting content into isolated tasks, this hierarchical structure:

- **Frames learning as narrative progress**, where campaigns tell a story of increasing sophistication through character-driven dialog and realistic operational contexts
- **Enables clear mapping between pedagogical goals (objectives)** and the activities learners engage with
- **Supports adaptive pacing**, letting learners work through objectives and conditions at their own rhythm but within an ordered context
- **Facilitates assessment**, as each layer can be evaluated: conditions for procedural fluency, objectives for competency, scenarios for operational mastery, and campaigns for holistic expertise
- **Provides immediate feedback** through real-time condition evaluation and scoring

---

## 4. Equipment Simulation

SignalRange simulates a complete satellite ground station RF chain. Each piece of equipment has realistic state, controls, and interdependencies.

### 4.1 Simulated Equipment

| Equipment | Description | Key Parameters |
|-----------|-------------|----------------|
| **9m C-band Antenna** | Pointing, tracking modes, polarization control | Azimuth, elevation, polarization, tracking mode (stow, manual, step-track, program-track) |
| **GPSDO** | GPS-disciplined oscillator providing 10 MHz frequency reference | Lock status, holdover state, frequency accuracy, GNSS satellite count |
| **LNB** | Low-noise block downconverter for receive chain | Local oscillator frequency, gain, noise temperature, thermal stability |
| **BUC** | Block upconverter for transmit chain | LO frequency, output power, mute state, reference lock |
| **HPA** | High power amplifier with safety interlocks | Enable state, back-off level, output power, overdrive protection |
| **IF Filter Bank** | Intermediate frequency filter selection | Bandwidth index (12 selectable bandwidths) |
| **Spectrum Analyzer** | Real-time RF visualization | Center frequency, span, RBW, reference level |
| **Receiver Modem** | Signal demodulation | Frequency, modulation type, FEC rate, lock status, C/N ratio |
| **Transmitter Modem** | Signal generation | Frequency, modulation type, power level |

### 4.2 Equipment Interdependencies

- **GPSDO** provides 10 MHz reference to LNB, BUC, and modems
- **LNB** requires GPSDO lock before achieving reference lock
- **BUC** requires GPSDO lock and proper mute sequencing for safety
- **HPA** has dual-action enable switch (ARM then ENABLE) to prevent accidental activation
- **Antenna** beacon tracking requires LNB to be locked and signal to be present

### 4.3 Ground Stations

Scenarios can include multiple ground stations. Each ground station has its own complete equipment complement. For example, the NATS campaign includes:

- **VT-01** (Vermont): Primary ground station
- **ME-02** (Maine): Backup ground station for weather failover

See campaign-specific technical reference documents for ground station specifications.

---

## 5. Dialog and Quiz System

### 5.1 Character Dialog

Scenarios include character-driven dialog to provide context, instructions, and feedback.

**Dialog Components:**
- **Intro clips:** Play at scenario start
- **Objective clips:** Play when objectives are completed
- **Character:** Identified speaker (e.g., Charlie Brooks)
- **Emotion:** Emotional context for voice/avatar display

### 5.2 Quiz System (Status Checks)

The `status-check` condition type presents interactive quizzes to verify comprehension.

**Quiz Properties:**
- `question`: The question text displayed
- `options`: Array of 2-4 answer choices
- `correctIndex`: Index of the correct answer (0-based)
- `explanation`: Shown after correct answer
- `pointPenalty`: Points deducted per wrong answer (default: 5)

**Quiz Behavior:**
- Quizzes appear after a 15-second delay when objectives activate
- A pending indicator appears; learners click to open the quiz
- Learners must answer correctly and click "Continue" to complete the condition
- Wrong answers deduct points but allow retry

---

## 6. Scoring and Progression

### 6.1 Scoring

- Each objective awards points upon completion
- Time penalties can deduct points if objectives take too long
- Wrong quiz answers deduct points (configurable per question)

### 6.2 Time Limits

- **Scenario time limit:** Overall limit for completing all objectives
- **Objective time limit:** Individual countdown per objective
- Timer starts either on objective activation or scenario load (configurable via `timerStartTrigger`)

### 6.3 Progression

- Scenarios unlock when prerequisites are completed
- Progress is saved via checkpoint system
- Learners can replay completed scenarios

---

## 7. Code Architecture

The codebase follows a **Core/UI separation pattern** with three main file types:

### 7.1 File Type Conventions

| File Pattern | Layer | Responsibility |
|--------------|-------|----------------|
| `-core.ts` | Business Logic | Physics, math, state management, signal processing |
| `-ui-standard.ts` | UI Binding | DOM manipulation, components, event handlers |
| `-factory.ts` | Creation | Polymorphic instantiation of UI variants |

### 7.2 Layer Responsibilities

#### `-core.ts` (Business Logic Layer)

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
- `src/equipment/rf-front-end/lnb-module/lnb-module-core.ts` - LO frequency, noise calculations
- `src/equipment/rf-front-end/hpa-module/hpa-module-core.ts` - Power, compression, IMD
- `src/equipment/rf-front-end/filter-module/filter-module-core.ts` - Bandwidth, insertion loss

#### `-ui-standard.ts` (UI Binding Layer)

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
- `src/equipment/rf-front-end/lnb-module/lnb-module-ui-standard.ts`
- `src/equipment/rf-front-end/hpa-module/hpa-module-ui-standard.ts`

#### `-factory.ts` (Polymorphic Creation)

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

### 7.3 Complete Module Stack Example

```text
lnb-module/
├── lnb-module-core.ts        → RF physics, noise temperature, frequency drift
├── lnb-module-ui-standard.ts → RotaryKnob, PowerSwitch, LED indicators
├── lnb-module-factory.ts     → Creates standard/basic/headless variant
└── lnb-module.css            → Module-specific styling
```

### 7.4 UI Variant Types

| Variant | Purpose |
|---------|---------|
| `standard` | Full DOM with knobs, switches, displays |
| `basic` | Simplified UI (fewer controls) |
| `headless` | No DOM - for automated/testing scenarios |
| `modern` | Alternative visual style (antenna only) |

### 7.5 Inheritance Hierarchy

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

### 7.6 Benefits of This Architecture

1. **Separation of concerns** - Physics isolated from UI code
2. **Testability** - Core can be unit tested without DOM
3. **Reusability** - Multiple UIs can share same core logic
4. **Flexibility** - Factories allow runtime UI selection
5. **Maintainability** - Changes to physics don't affect UI and vice versa
6. **Removability** - Each equipment piece should be removable by deleting its file

---

## 8. Event-Driven Communication

The platform uses an **EventBus pub/sub pattern** for decoupled module communication.

### 8.1 Core Events

| Event | Purpose |
|-------|---------|
| `MISSION_STARTED` | Scenario begins |
| `OBJECTIVE_ACTIVATED` | New objective becomes active |
| `OBJECTIVE_COMPLETED` | Objective conditions satisfied |
| `CONDITION_CHANGED` | Individual condition state updated |
| `EQUIPMENT_STATE_CHANGED` | Equipment parameter modified |

### 8.2 Pattern

```typescript
// Subscribe
EventBus.getInstance().on('OBJECTIVE_COMPLETED', (data) => {
  // Handle objective completion
});

// Publish
EventBus.getInstance().emit('EQUIPMENT_STATE_CHANGED', {
  equipment: 'lnb',
  property: 'loFrequency',
  value: 5250e6
});

// Unsubscribe (in dispose)
EventBus.getInstance().off('OBJECTIVE_COMPLETED', this.handler);
```

---

## 9. State Persistence

### 9.1 Two-Layer Storage Pattern

- **Backend saves** (ProgressSaveManager): Persistent progress to Supabase
- **Local storage sync** (SyncManager): Session state and checkpoints

### 9.2 Checkpoint System

Full AppState snapshots allow scenario resume:

```typescript
// Save checkpoint
await checkpointManager.save(scenarioId, appState);

// Load checkpoint
const state = await checkpointManager.load(scenarioId);
```

See `supabase-schema.md` for database structure.

---

## 10. Related Documentation

| Document | Purpose |
|----------|---------|
| `scenario-development-guide.md` | How to write scenarios, condition types, patterns |
| `nice-framework-guide.md` | NICE cybersecurity framework code mapping |
| `nats-campaign-plan.md` | NATS campaign structure (24 scenarios) |
| `nats-character-guide.md` | Charlie Brooks dialog writing guide |
| `nats-technical-reference.md` | TIDEMARK frequencies, ground station specs |
| `supabase-schema.md` | Database schema documentation |
| `development-retrospective.md` | Lessons learned from development |
