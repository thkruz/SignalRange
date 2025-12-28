# SignalRange – Platform Architecture Overview

## 1. Platform Vision and Purpose

SignalRange is an **interactive web-based training environment** focused on *radio frequency (RF) communications and satellite ground station operations*, combining **realistic equipment simulation**, **guided scenarios**, and progressive educational pathways. Learners develop practical skills in satellite ground station operations and RF signal handling through simulated, increasingly complex operational contexts.

The architectural framing is both pedagogical and operational: learners progress through structured units (Campaigns, Scenarios, Objectives) that gradually build expertise from RF fundamentals toward advanced signal management and troubleshooting.

## 2. High-Level Structure

```
Platform
└── Campaign
    ├── Scenario
    │   ├── Objective
    │   │   ├── Condition
    │   │   └── …
    │   └── …
    └── …
```

This layered model ensures **logical progression**, mapping from broad learning goals to discrete actionable tasks.

## 3. Definitions of Core Concepts

Each term below is calibrated to the **SignalRange** domain, aligning educational intent with functional structure.

### Campaign

A *Campaign* represents the **topmost logical container** for a sequence of related training activities designed to achieve a cohesive set of competencies. It encapsulates multiple **Scenarios** ordered so that complexity increases systematically.

- **Purpose:** Organize the curriculum into overarching themes or training tracks.
- **Scope:** Can span from introductory RF basics to advanced troubleshooting scenarios.
- **Temporal Structure:** Scenarios within a campaign generally unfold in a planned sequence, with prerequisite requirements controlling progression.
- **Example:** The NATS (North Atlantic Teleport Services) campaign takes learners from their first day at a satellite ground station through to independent first-light operations.

### Scenario

A *Scenario* is a **discrete, structured learning unit** within a campaign focusing on a set of **related skills** or operational tasks.

- **Function:** Break complex competencies into manageable sub-areas.
- **Character:** Centers on a real-world operational context (e.g., performing a health check, executing a weather handover, or troubleshooting equipment failures).
- **Sequencing:** Scenarios are ordered to scaffold knowledge, introducing foundational skills before advanced ones.
- **Prerequisites:** Each scenario may require completion of prior scenarios before becoming available.
- **Properties:** Includes difficulty rating, duration estimate, equipment list, and learning objectives.

### Objective

An *Objective* forms the **specific, measurable competency or outcome** that a Scenario is designed to achieve.

- **Granularity:** Targets a focused skill or concept (e.g., verify GPSDO lock status, configure LNB local oscillator frequency).
- **Assessment Ready:** Each objective is evaluated against defined success criteria through one or more Conditions.
- **Scoring:** Objectives award points upon completion, with optional time penalties for slow completion.
- **Time Limits:** Individual objectives may have countdown timers that trigger failure if exceeded.
- **Prerequisites:** Objectives may require prior objectives to be completed before becoming active.

### Condition

A *Condition* is a **verifiable requirement** within an Objective that the learner must satisfy.

- **Nature:** Equipment state checks, quiz questions, or custom evaluations.
- **Verification:** System automatically evaluates conditions in real-time based on simulation state.
- **Maintenance:** Some conditions must be held for a duration or maintained until all conditions in the objective are complete.
- **Logic:** Multiple conditions within an objective can be combined with AND (all required) or OR (any one sufficient) logic.

## 4. How the Structure Supports Learning

Rather than fragmenting content into isolated tasks, this hierarchical structure:

- **Frames learning as narrative progress**, where campaigns tell a story of increasing sophistication through character-driven dialog and realistic operational contexts.
- **Enables clear mapping between pedagogical goals (objectives)** and the activities learners engage with.
- **Supports adaptive pacing**, letting learners work through objectives and conditions at their own rhythm but within an ordered context.
- **Facilitates assessment**, as each layer can be evaluated: conditions for procedural fluency, objectives for competency, scenarios for operational mastery, and campaigns for holistic expertise.
- **Provides immediate feedback** through real-time condition evaluation and scoring.

## 5. Example (NATS Campaign)

**Campaign:** *North Atlantic Teleport Services (NATS)*

> **Scenario 1:** *First Day - TIDEMARK-1 Health Check*
>
> Your first day at NATS. Charlie Brooks walks you through a routine health check on TIDEMARK-1, already online at 53°W. Learn what each equipment panel shows and what "normal" looks like.

**Objective:** *Phase 1: GPSDO Status Check*

Click on the GPSDO panel and verify all status indicators show normal operation.

**Conditions:**

- `status-check`: Quiz asking "What does the GPSDO Lock indicator show?"
- Correct answer: "Locked (green) - stable frequency reference"

**Scoring:**

- Points awarded: 20
- Point penalty per wrong quiz answer: 5
- Time limit: 100 seconds

This model directly reflects the implemented scenario structure, where quiz-based conditions verify comprehension while equipment state conditions verify operational competency.

## 6. Equipment Simulation

SignalRange simulates a complete satellite ground station RF chain. Each piece of equipment has realistic state, controls, and interdependencies.

### 6.1 Simulated Equipment

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

### 6.2 Equipment Interdependencies

- **GPSDO** provides 10 MHz reference to LNB, BUC, and modems
- **LNB** requires GPSDO lock before achieving reference lock
- **BUC** requires GPSDO lock and proper mute sequencing for safety
- **HPA** has dual-action enable switch (ARM then ENABLE) to prevent accidental activation
- **Antenna** beacon tracking requires LNB to be locked and signal to be present

### 6.3 Ground Stations

Scenarios can include multiple ground stations. Each ground station has its own complete equipment complement. The NATS campaign includes:

- **VT-01** (Vermont): Primary ground station
- **ME-02** (Maine): Backup ground station for weather failover

## 7. Condition Types

The objectives system supports numerous condition types for evaluating learner progress.

### 7.1 GPSDO Conditions

| Condition | Description |
|-----------|-------------|
| `gpsdo-locked` | GPSDO has achieved stable lock |
| `gpsdo-warmed-up` | GPSDO is at operating temperature |
| `gpsdo-gnss-locked` | GPS antenna has satellite lock (>=4 satellites) |
| `gpsdo-stability` | Frequency accuracy meets threshold |
| `gpsdo-not-in-holdover` | Not operating in holdover mode |

### 7.2 Antenna Conditions

| Condition | Description |
|-----------|-------------|
| `antenna-locked` | Antenna is locked on a specific satellite |
| `antenna-position` | Antenna at specific azimuth/elevation |
| `antenna-beacon-frequency-set` | Beacon frequency configured |
| `antenna-tracking-mode-set` | Tracking mode set (stow, step-track, etc.) |
| `antenna-beacon-locked` | Beacon signal locked |

### 7.3 RF Front End Conditions

| Condition | Description |
|-----------|-------------|
| `lnb-reference-locked` | LNB locked to 10 MHz reference |
| `lnb-lo-set` | LNB local oscillator frequency set |
| `lnb-gain-set` | LNB gain set to specific value |
| `lnb-thermally-stable` | Thermal stabilization complete |
| `lnb-noise-performance` | Noise temperature within spec |
| `buc-locked` | BUC locked to external reference |
| `buc-muted` | BUC RF output is muted |
| `buc-unmuted` | BUC RF output is enabled |
| `buc-current-normal` | Current draw within normal range |
| `hpa-enabled` | HPA output enabled |
| `hpa-disabled` | HPA output disabled |
| `hpa-back-off-set` | HPA back-off level configured |
| `hpa-output-power-set` | Output power above threshold |
| `filter-bandwidth-set` | IF filter bandwidth configured |

### 7.4 Spectrum Analyzer Conditions

| Condition | Description |
|-----------|-------------|
| `signal-detected` | Signal detected (optional: specific signal ID and minimum power) |
| `signal-level-correct` | Signal at or above minimum power level |
| `frequency-set` | Equipment tuned to specific frequency |
| `speca-span-set` | Span set to specific value |
| `speca-rbw-set` | RBW set to specific value |
| `speca-reference-level-set` | Reference level set |
| `speca-noise-floor-visible` | Shows clean baseline |

### 7.5 Modem Conditions

| Condition | Description |
|-----------|-------------|
| `receiver-signal-locked` | Receiver modem has demodulation lock |
| `receiver-snr-threshold` | C/N ratio meets threshold |

### 7.6 Interactive Conditions

| Condition | Description |
|-----------|-------------|
| `status-check` | Quiz to verify learner found correct information |
| `custom` | Custom condition with evaluator function |

## 8. NATS Campaign Overview

The **North Atlantic Teleport Services (NATS)** campaign is the primary learning track in SignalRange.

### 8.1 Setting

- **Location:** Vermont Ground Station (VT-01), with Maine backup site (ME-02)
- **Satellite Constellation:** TIDEMARK (maritime communications GEO constellation operated by SeaLink Global Communications)
- **Character:** Charlie Brooks - senior engineer training new operators

### 8.2 Learning Progression

| Phase | Levels | Focus |
|-------|--------|-------|
| **Tutorial** | 1-3 | Introduce all UI elements and basic operations without pressure |
| **Mastery** | 4-5 | Test player calculations and understanding without support |
| **Pressure** | 6-8 | Introduce time limits and perform under pressure |

### 8.3 Scenarios

1. **First Day** - Equipment familiarization and health checks
2. **Scheduled Maintenance** - Safe power-down/power-up sequences
3. **Weather Handover** - Multi-site operations and service handover
4. **New Bird, No Handbook** - Independent RF calculations for new satellite
5. **Inclined Orbit Operations** - Tracking satellites with orbital inclination
6. **Interference Hunt** - Troubleshooting under time pressure
7. **Equipment Cascade** - Multiple simultaneous fault management
8. **First Light Solo** - Complete first-light procedure independently

### 8.4 TIDEMARK Constellation

| Satellite | Position | Status |
|-----------|----------|--------|
| TIDEMARK-1 | 53°W | Operational (8 years old, inclined orbit) |
| TIDEMARK-2 | 45°W | Newly operational |
| TIDEMARK-3 | 37°W | Operational |
| TIDEMARK-4 | 29°W | Commissioning phase |

## 9. Dialog and Quiz System

### 9.1 Character Dialog

Scenarios include character-driven dialog to provide context, instructions, and feedback.

**Dialog Components:**
- **Intro clips:** Play at scenario start
- **Objective clips:** Play when objectives are completed
- **Character:** Identified speaker (e.g., Charlie Brooks, Catherine Vega)
- **Emotion:** Emotional context for voice/avatar display

### 9.2 Quiz System (Status Checks)

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

## 10. Scoring and Progression

### 10.1 Scoring

- Each objective awards points upon completion
- Time penalties can deduct points if objectives take too long
- Wrong quiz answers deduct points (configurable per question)

### 10.2 Time Limits

- **Scenario time limit:** Overall limit for completing all objectives
- **Objective time limit:** Individual countdown per objective
- Timer starts either on objective activation or scenario load (configurable)

### 10.3 Progression

- Scenarios unlock when prerequisites are completed
- Progress is saved via checkpoint system
- Learners can replay completed scenarios

---

## Appendix A: Scenario Heads-Up Display Widget (Planned)

> **Note:** This appendix describes a planned feature that is not yet implemented. The specification is retained for future development reference.

### A.1 Purpose and Design Rationale

The Scenario Heads-Up Display (HUD) widget is a planned compact guidance surface that would support scenario flow without displacing the primary simulation interface. Designed as a collapsible modal, it would balance instructional scaffolding with screen economy, keeping the learner's attention anchored in the simulation while offering time-based pacing, contextual hints, and motivational support.

### A.2 UX Requirements

#### A.2.1 Container Behavior

- **Form:** Collapsible modal (overlay panel) anchored to a screen edge (recommended: bottom-right).
- **Default state:** Expanded at scenario start; may auto-collapse after a short grace period unless pinned.
- **Collapsed state:** Minimal bar showing:
  - Scenario name (truncated)
  - Current objective index (e.g., 2/6)
  - Remaining time for active objective
- **Expanded state:** Heading + timeline + timer + hint area.
- **Footprint constraints:**
  - Desktop: ≤ 30% viewport width, ≤ 40% viewport height
  - Mobile: ≤ 90% width, ≤ 50% height; internal scrolling enabled

#### A.2.2 Heading

- Scenario name as primary heading.
- Secondary metadata optional: difficulty tag, scenario elapsed time, or scenario type label.

### A.3 Functional Requirements

#### A.3.1 Objective Timeline

- Render objectives as a vertical timeline (or compact stepper).
- **Objective states:** Pending, Active, Completed, Overtime
- Each objective entry shows:
  - Title (short)
  - Optional one-line description (truncated)
  - Time allocation
  - Status indicator

#### A.3.2 Countdown Timer per Objective

- Maintain a countdown for the active objective.
- Each objective has `timeAllocatedSec`.
- On objective completion, advance and reset timer to the next objective allocation.
- Timer accuracy must hold under visibility changes and collapse/expand.

#### A.3.3 Overtime Detection and Hinting

- At `timeRemainingSec == 0` and objective incomplete:
  - Mark objective Overtime
  - Display overtime hint
- **Hint cadence:**
  - Immediate on overtime
  - Optional additional hints on schedule (+30s, +90s), with caps

#### A.3.4 Struggle Detection and Motivational Hints

- **Struggle signals** may include:
  - Repeated failed validations
  - Repeated control toggling without progress
  - Extended dwell time relative to allocation (pre-overtime)
  - High hint request frequency (if supported)
- Motivational hints must be brief, supportive, and task-adjacent, with cooldowns to avoid noise.

### A.4 Non-Functional Requirements

- **Accessibility:** Keyboard navigable; ARIA for dialog and expandable regions; timer announcements limited to state transitions.
- **Performance:** Timer updates should avoid heavy layout reflow; update once per second.
- **Control:** Learner can collapse/expand anytime, pin open, and mute motivational hints.

### A.5 Data Model

#### A.5.1 Scenario Definition Inputs

```typescript
scenarioId: string
scenarioName: string
objectives: Objective[]
  objectiveId: string
  title: string
  description?: string
  timeAllocatedSec: number
  hintPolicy?: {
    overtimeHintIds?: string[]
    motivationHintIds?: string[]
  }
```

#### A.5.2 Runtime State

```typescript
activeObjectiveIndex: number
objectiveStatusMap: Record<objectiveId, Status>
timeRemainingSec: number
overtimeSec: number
hintEvents: HintEvent[]
struggleScore: number
hudState: {
  expanded: boolean
  pinned: boolean
  motivationMuted: boolean
}
```

### A.6 Logic and Policies

- **Timer policy:** start on objective activation; pause only if platform enters an explicit paused state.
- **Hint policy:** overtime hints at threshold; motivational hints based on struggle score + cooldown.
- **Guardrails:**
  - 45–90s minimum interval between hints
  - Max hints per objective: 3 overtime, 2 motivational
  - Progress signals reduce struggle score and apply suppression window

### A.7 UI Content Rules

- **Hints:** presented in a compact callout region; "Show more" expands inline (not a second modal).
- **Tone:** coaching language, no shaming; suggestions should remain actionable.

### A.8 Event Interfaces

- **Consumes:** MISSION_STARTED, OBJECTIVE_ACTIVATED, OBJECTIVE_COMPLETED, optional pause/resume, optional learner action events.
- **Emits:** HUD_COLLAPSED/EXPANDED, HINT_SHOWN, OVERTIME_ENTERED, STRUGGLE_DETECTED.

### A.9 Acceptance Criteria

- Collapsible modal with scenario heading works on desktop and mobile within footprint limits.
- Timeline shows correct objective state transitions.
- Timer allocates per-objective time and advances correctly.
- Overtime state triggers an overtime hint.
- Struggle detection triggers motivational hints with cooldown and caps.
- Keyboard accessibility and low performance overhead are maintained.

### A.10: UI Wireframe Specification

#### A.10.1 Layout Regions

**Expanded HUD modal (recommended bottom-right):**

- **Region 1: Header Bar (fixed)**
  - Scenario name (left)
  - Controls (right): Pin, Collapse/Expand, Close (optional "X" if HUD is not mandatory)

- **Region 2: Timer Strip (fixed)**
  - Active objective label (e.g., "Objective 2: Acquire Signal Lock")
  - Countdown timer (large, legible)
  - Secondary text: "Allocated: 06:00" and state badge (Active / Overtime)

- **Region 3: Timeline Panel (scrollable)**
  - Vertical list of objectives with state indicators
  - Active objective visually emphasized

- **Region 4: Hint + Encouragement Tray (collapsible within modal)**
  - Shows the most recent hint
  - Optional "Need another hint?" action
  - Motivational hint (if triggered) should appear as a small secondary callout, not competing with the primary hint

**Collapsed HUD pill:**

- Scenario short name (left)
- Objective progress (middle, e.g., "2/6")
- Time remaining (right, e.g., "03:21")
- Tap/click expands

#### A.10.2 Text Wireframes

**Expanded (Desktop)**

```
┌──────────────────────────────────────────────┐
│ Scenario: <Scenario Name>               [📌][▾]│  Header Bar
├──────────────────────────────────────────────┤
│ Objective 2/6: <Objective Title>             │
│  TIME LEFT:   03:21                          │  Timer Strip
│  Allocated: 06:00   Status: ACTIVE           │
├──────────────────────────────────────────────┤
│ TIMELINE (scroll)                            │
│  ○ 1. <Objective 1>              ✓ Completed │
│  ● 2. <Objective 2>          →   Active      │
│  ○ 3. <Objective 3>              Pending     │
│  ○ 4. <Objective 4>              Pending     │
│  …                                           │
├──────────────────────────────────────────────┤
│ HINT                                          │
│  "Check receiver bandwidth and confirm peak." │
│  [Show more]                    [Another hint]│
│                                               │
│ MOTIVATION (if triggered, subtle)             │
│  "You're close. Verify one setting at a time."│
└──────────────────────────────────────────────┘
```

**Expanded (Mobile)**

```
┌──────────────────────────────┐
│ <Scenario Name>        [▾]    │
├──────────────────────────────┤
│ Obj 2/6: <Title>              │
│ TIME LEFT: 03:21              │
│ ACTIVE / OVERTIME badge        │
├──────────────────────────────┤
│ Timeline (scroll)              │
│ 1 ✓ <Obj 1>                    │
│ 2 ● <Obj 2>                    │
│ 3 ○ <Obj 3>                    │
├──────────────────────────────┤
│ Hint: <short hint>             │
│ [More] [Another hint]          │
│ Motivation: <short msg>        │
└──────────────────────────────┘
```

**Collapsed Pill**

```
┌────────────────────────────────┐
│ <Scenario…>  2/6     03:21  ▸   │
└────────────────────────────────┘
```

#### A.10.3 Size, Spacing, and Visual Constraints

- **Desktop max size:**
  - Width: min(360px, 30vw)
  - Height: min(520px, 40vh)
- **Mobile max size:**
  - Width: 90vw
  - Height: 50vh (internal scroll for timeline)
- **Header height:** ~44–56px
- **Timer strip height:** ~72–96px (timer text is the visual anchor)
- **Timeline panel:** takes remaining height; internal scroll
- **Hint tray:** collapsible; default expanded only when a hint exists

#### A.10.4 Interaction Specs

- **Collapse/Expand:**
  - Clicking the chevron toggles expanded/collapsed.
  - Collapsed pill click expands.
- **Pin:**
  - When pinned, HUD does not auto-collapse.
- **Overtime transition:**
  - Status badge switches to Overtime.
  - Timer changes to "00:00" with an overtime indicator (or optionally begins counting up as overtime).
  - Hint tray expands automatically to show the overtime hint.
- **Hint controls:**
  - "Another hint" disabled if hint cap reached or cooldown active.
  - "Show more" expands inline details (one level only, avoid nested complexity).

#### A.10.5 States and Visual Priority

- **Primary attention** goes to: Active objective name + countdown timer.
- **Secondary:** timeline state cues (progress and what's next).
- **Tertiary:** hints and motivational prompts, which should remain visually quiet unless overtime or struggle conditions are met.
