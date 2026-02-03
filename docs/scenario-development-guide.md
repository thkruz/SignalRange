# Scenario Development Guide

**Document Type:** Development Standards  
**Audience:** Scenario developers  
**Last Updated:** January 2026

This guide establishes standards for creating educational satellite ground station training scenarios. Scenarios should teach concepts, not just test button-clicking.

---

## 1. Quality Metrics

A well-developed scenario should have:

- **Depth ratio**: ~50-100 lines of code per objective (including dialog)
- **Quiz ratio**: At least one verification quiz for every 2-3 action objectives
- **Dialog density**: Every objective should have a meaningful dialog clip (150+ words for key moments)
- **Character voice**: Consistent personality with teaching moments, not just task direction

---

## 2. Scenario File Structure

Scenario files are located in `src/campaigns/<campaign>/scenario<N>.ts` and export a `ScenarioData` object containing:

- Metadata (id, title, description, difficulty)
- Settings (ground stations, satellites, equipment layout)
- Objectives array
- Dialog clips

```typescript
export const scenario1Data: ScenarioData = {
  id: 'nats-scenario1',
  url: 'nats/scenarios/nats-scenario1',
  prerequisiteScenarioIds: [],
  imageUrl: 'nats/1/card.png',
  number: 1,
  title: 'First Day',
  subtitle: 'TIDEMARK-1 Health Check',
  duration: '25-35 min',
  difficulty: 'beginner',
  missionType: 'Routine Operations',
  description: `...`,
  equipment: [...],
  settings: {
    isSync: true,
    groundStations: [...],
    satellites: [...],
  },
  timeLimitSeconds: 35 * 60,
  objectives: [...],
  dialogClips: {...},
};
```

---

## 3. Objective Patterns

### 3.1 Mission Preparation Phase

Every scenario MUST begin with a mission brief objective:

```typescript
{
  id: 'review-mission-brief',
  nice: ['K0645'],
  title: 'Review Mission Brief',
  description: 'Open and read the mission brief, then acknowledge you are ready to proceed.',
  groundStation: 'VT-01',
  freezesScenarioTimer: true,
  prerequisiteObjectiveIds: [],
  conditions: [
    {
      type: 'mission-brief-opened',
      description: 'Mission Brief Document Opened',
      params: { boxId: 'mission-brief' },
      mustMaintain: false,
    },
    {
      type: 'status-check',
      description: 'Ready to Proceed',
      params: {
        question: 'Have you reviewed the mission brief and are you ready to begin?',
        options: ['Yes, I have read the mission brief and I am ready to proceed.'],
        correctIndex: 0,
        explanation: 'The mission timer has started. Good luck!',
        pointPenalty: 0,
      },
      mustMaintain: false,
    },
  ],
  conditionLogic: 'AND',
  points: 5,
}
```

### 3.2 Navigation Objectives

Before any equipment configuration, include an explicit navigation objective:

```typescript
// BAD: Jump straight to configuration
{
  id: 'configure-lnb',
  title: 'Configure LNB',
  // ...
}

// GOOD: Navigate first, then configure
{
  id: 'navigate-rx-analysis',
  nice: ['S0421'],
  title: 'Open RX Analysis Tab',
  description: 'Click the RX Analysis tab to access the receive chain equipment.',
  conditions: [
    {
      type: 'ground-station-selected',
      description: 'Vermont Station Active',
      params: { groundStationId: 'VT-01' },
      mustMaintain: true,
    },
    {
      type: 'tab-active',
      description: 'RX Analysis Tab Open',
      params: { tab: 'rx-analysis' },
      mustMaintain: true,
    },
  ],
  points: 5,
},
{
  id: 'configure-lnb',
  prerequisiteObjectiveIds: ['navigate-rx-analysis'],
  // ...
}
```

### 3.3 Verify-Before-Modify Pattern

Before changing equipment state, verify current state first:

```typescript
// Sequence: Verify → Modify → Confirm
{
  id: 'verify-hpa-initial-state',
  title: 'Verify Current HPA State',
  description: 'Confirm the HPA is currently transmitting before beginning shutdown.',
  conditions: [
    {
      type: 'status-check',
      params: {
        question: 'Before we shut down, confirm the current HPA state. What does the HPA panel show?',
        options: [
          'HPA is enabled and transmitting with 10 dB backoff',
          'HPA is powered on but output is disabled',
          'HPA is powered off completely',
          'HPA shows fault condition - red alarm',
        ],
        correctIndex: 0,
        explanation: 'The HPA is currently enabled and transmitting...',
        pointPenalty: 10,
      },
      mustMaintain: false,
    },
  ],
},
{
  id: 'disable-hpa-output',
  prerequisiteObjectiveIds: ['verify-hpa-initial-state'],
  title: 'Disable HPA Output',
  // ... action objective
},
{
  id: 'verify-hpa-disabled-quiz',
  prerequisiteObjectiveIds: ['disable-hpa-output'],
  title: 'Confirm HPA Output Disabled',
  // ... verification quiz
}
```

### 3.4 Phase Organization

Organize objectives into clear phases with comments:

```typescript
// ============================================================
// PHASE 1: MISSION PREPARATION
// ============================================================

// ============================================================
// PHASE 2: VERIFY CURRENT STATE
// ============================================================

// ============================================================
// PHASE 3: EQUIPMENT CONFIGURATION
// ============================================================

// ============================================================
// PHASE 4: VERIFICATION AND VALIDATION
// ============================================================
```

---

## 4. Educational Quiz Types

### 4.1 Understanding Quizzes (Why)

Test comprehension of principles, not just observation:

```typescript
{
  type: 'status-check',
  params: {
    question: 'Why must Maine\'s LNB LO frequency match Vermont\'s exactly?',
    options: [
      'Same LO frequency produces the same IF frequency, so downstream equipment configuration is identical',
      'Different LO frequencies would cause interference between the two sites',
      'The satellite requires all ground stations to use the same LO frequency',
      'It\'s just company policy for consistency',
    ],
    correctIndex: 0,
    explanation: 'With the same LO frequency (5,250 MHz), the TIDEMARK-1 beacon at 4,175.5 MHz RF produces the same 1,074.5 MHz IF at both sites...',
  },
}
```

### 4.2 Calculation Verification Quizzes

Ensure operators understand the math:

```typescript
{
  type: 'status-check',
  params: {
    question: 'You see the TIDEMARK-1 beacon at 1,074.5 MHz IF. The RF beacon frequency is 4,175.5 MHz. Which calculation confirms the LNB is set correctly?',
    options: [
      'LO (5,250 MHz) - RF (4,175.5 MHz) = IF (1,074.5 MHz)',
      'RF (4,175.5 MHz) + IF (1,074.5 MHz) = LO (5,250 MHz)',
      'IF (1,074.5 MHz) × 4 = RF (4,298 MHz)',
      'The frequencies are coincidentally correct',
    ],
    correctIndex: 0,
    explanation: 'The LNB performs downconversion by mixing the incoming RF signal with its Local Oscillator...',
  },
}
```

### 4.3 Consequence Quizzes

Help operators understand what happens when things go wrong:

```typescript
{
  type: 'status-check',
  params: {
    question: 'The AGC is compensating for the weather degradation. Why do we still need to hand over to Maine?',
    options: [
      'AGC has a maximum gain limit - once reached, further signal loss cannot be compensated',
      'AGC uses too much power during heavy compensation',
      'AGC introduces phase errors that corrupt the data',
      'Maine has a bigger antenna with more gain',
    ],
    correctIndex: 0,
    explanation: 'AGC can only compensate within its gain range...',
  },
}
```

---

## 5. Dialog Standards

### 5.1 Minimum Length Guidelines

- **Intro clip**: 150-250 words - Set the scene, establish urgency, provide context
- **Objective completion clips**: 75-150 words - Explain what just happened and what's next
- **Key learning moment clips**: 150-200 words - Deeper explanations of concepts

### 5.2 Character Voice Requirements

Each character should have:
- Consistent personality traits
- Unique speech patterns
- Teaching style that matches their role

**Charlie Brooks (Senior Operator)**:
- Direct, efficient, no-nonsense
- Uses technical terms correctly but explains them
- References past experiences ("I've seen guys...")
- Won't repeat himself but acknowledges good work

```typescript
// GOOD Charlie dialog
text: `
<p>
  Right. HPA is enabled and transmitting. That's several hundred watts of RF power going through the feed assembly where the maintenance crew needs to work.
</p>
<p>
  First step: disable the HPA output. Find the HPA panel and toggle the enable switch to OFF. Don't power it off completely yet - just disable the output.
</p>
`,
```

**Catherine Vega (Maine Operator)**:
- Professional, helpful
- Provides sanity checks
- Collaborative approach

### 5.3 Dialog Should NOT

- Be generic instructions that could apply anywhere
- Lack personality or teaching moments
- Skip explanation of "why"
- Be under 50 words for significant objectives

### 5.4 Frequency Mentions in Dialog

- Spell out frequencies: "1,070 megahertz" not "1070MHz"
- Must match the objective's actual parameters

---

## 6. NICE Framework Integration

Every objective MUST have appropriate NICE codes with inline comments explaining the alignment:

```typescript
{
  id: 'verify-beacon-acquisition',
  // K1032: Knowledge of satellite-based communication systems - understanding that
  // beacon acquisition confirms both antenna pointing and LNB frequency configuration
  // K0773: Knowledge of telecommunications principles and practices - comprehending
  // how RF-to-IF conversion must be correct to observe the beacon at expected frequency
  nice: ['K1032', 'K0773'],
  title: 'Verify Beacon Acquisition',
  // ...
}
```

See `nice-framework-guide.md` for complete code reference and mapping rules.

---

## 7. Time Limits and Penalties

### 7.1 Timer Configuration

Per-objective timers require two fields:

```typescript
timeLimitSeconds: 3 * 60,        // Duration in seconds
timerStartTrigger: 'on-activate' // When timer starts
```

### 7.2 Guidelines by Scenario Phase

```typescript
// Tutorial scenarios (1-3): Generous time, few penalties
timeLimitSeconds: 3 * 60,
timerStartTrigger: 'on-activate',

// Intermediate scenarios (4-6): Moderate pressure
timeLimitSeconds: 2 * 60,
timerStartTrigger: 'on-activate',
timePenalty: {
  elapsedTimeThreshold: 15 * 60,
  pointsDeducted: 30,
  message: "Vermont's link has degraded significantly.",
},

// Advanced scenarios (7+): Real pressure with consequences
timeLimitSeconds: 90,
timerStartTrigger: 'on-activate',
timePenalty: {
  elapsedTimeThreshold: 10 * 60,
  pointsDeducted: 50,
  message: "We just violated the SLA!",
},
```

### 7.3 Timer Guidelines by Task Type

| Task Type | Suggested Time |
|-----------|----------------|
| Simple tasks (quizzes, toggles) | 2 minutes |
| Configuration tasks (frequency, modulation) | 2-3 minutes |
| Multi-step tasks (antenna slew + verify) | 3 minutes |
| Mission brief review | No timer (`freezesScenarioTimer: true`) |

---

## 8. Points Distribution

| Task Type | Points |
|-----------|--------|
| Simple navigation | 5 |
| Simple tasks | 5-10 |
| Configuration tasks | 10-15 |
| Verification/lock tasks | 15-25 |
| Quiz penalties | 5-10 per wrong answer |

---

## 9. Condition Types Reference

### 9.1 UI Interaction Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `ground-station-selected` | Ground station selected in UI | `groundStationId` |
| `tab-active` | Specific tab is active | `tab` (prefix match) |
| `mission-brief-opened` | Mission brief document opened | `boxId` |

### 9.2 GPSDO Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `gpsdo-locked` | GPSDO has achieved stable lock | - |
| `gpsdo-warmed-up` | GPSDO at operating temperature | - |
| `gpsdo-gnss-locked` | GPS antenna has satellite lock (≥4) | - |
| `gpsdo-stability` | Frequency accuracy meets threshold | `maxFrequencyAccuracy` |
| `gpsdo-not-in-holdover` | Not in holdover mode | - |

### 9.3 Antenna Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `antenna-locked` | Antenna locked on satellite | `satelliteId` |
| `antenna-position` | At specific az/el | `azimuth`, `elevation`, `tolerance` |
| `antenna-beacon-frequency-set` | Beacon frequency configured | `beaconFrequency` |
| `antenna-tracking-mode-set` | Tracking mode set | `trackingMode` |
| `antenna-beacon-locked` | Beacon signal locked | - |
| `feed-heater-enabled` | Feed heater is enabled | - |

### 9.4 LNB Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `lnb-reference-locked` | Locked to 10 MHz reference | - |
| `lnb-lo-set` | LO frequency set | `loFrequency`, `loFrequencyTolerance` |
| `lnb-gain-set` | Gain set | `gain`, `gainTolerance` |
| `lnb-thermally-stable` | Thermal stabilization complete | - |
| `lnb-noise-performance` | Noise temp within spec | `maxNoiseTemperature` |
| `equipment-powered` | LNB powered on | `equipment: 'lnb'` |

### 9.5 BUC Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `buc-locked` | Locked to external reference | - |
| `buc-reference-locked` | Locked to 10 MHz reference | - |
| `buc-muted` | RF output muted | - |
| `buc-unmuted` | RF output enabled | - |
| `buc-loopback-enabled` | Loopback mode enabled | - |
| `buc-loopback-disabled` | Loopback mode disabled | - |
| `buc-temperature-normal` | Temperature within range | `maxTemperature` |
| `buc-current-normal` | Current draw normal | `maxCurrentDraw` |
| `buc-not-saturated` | Output not in compression | - |

### 9.6 HPA Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `hpa-enabled` | HPA output enabled | - |
| `hpa-disabled` | HPA output disabled | - |
| `hpa-back-off-set` | Back-off level configured | `backOff`, `backOffTolerance` |
| `hpa-output-power-set` | Output power above threshold | `minOutputPower` |
| `hpa-not-overdriven` | Not in overdrive | `maxImdLevel` |

### 9.7 Spectrum Analyzer Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `signal-detected` | Signal detected | `signalId`, `minPower` |
| `signal-level-correct` | Signal at/above min power | `signalId`, `minPower` |
| `speca-center-frequency` | Center frequency set | `centerFrequency`, `centerFrequencyTolerance` |
| `speca-span-set` | Span set | `span` |
| `speca-rbw-set` | RBW set | `rbw` |
| `speca-reference-level-set` | Reference level set | `referenceLevel`, `referenceLevelTolerance` |
| `speca-noise-floor-visible` | Shows clean baseline | `maxSignalStrength` |
| `filter-bandwidth-set` | IF filter bandwidth set | `bandwidthIndex` |
| `notch-filter-configured` | Notch filter configured | `notchCenterFrequency`, `notchBandwidth`, `notchDepth` |

### 9.8 Modem Conditions

**Receiver:**

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `receiver-signal-locked` | Demodulation lock | `modemNumber` |
| `receiver-snr-threshold` | C/N ratio meets threshold | `minCNRatio`, `modemNumber` |
| `rx-modem-frequency-set` | Center frequency set | `frequency`, `frequencyTolerance` |
| `rx-modem-bandwidth-set` | Bandwidth set | `bandwidth`, `bandwidthTolerance` |
| `rx-modem-modulation-set` | Modulation type set | `modulation` |
| `rx-modem-fec-set` | FEC rate set | `fec` |
| `rx-frame-sync-locked` | Frame sync locked | `locked` |
| `rx-ber-threshold` | BER below/above threshold | `berThreshold`, `berComparison` |

**Transmitter:**

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `tx-modem-frequency-set` | Center frequency set | `frequency`, `frequencyTolerance` |
| `tx-modem-power-set` | Power set | `power`, `powerTolerance` |
| `tx-modem-bandwidth-set` | Bandwidth set | `bandwidth`, `bandwidthTolerance` |
| `tx-modem-modulation-set` | Modulation type set | `modulation` |
| `tx-modem-fec-set` | FEC rate set | `fec` |
| `tx-modem-transmitting` | Actively transmitting | - |
| `tx-modem-not-transmitting` | Not transmitting | - |

### 9.9 Crypto Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `rx-crypto-status` | RX decryption mode | `cryptoMode` |
| `rx-key-status` | RX key status | `keyStatus` |
| `tx-crypto-status` | TX encryption mode | `cryptoMode` |
| `tx-key-status` | TX key status | `keyStatus` |

### 9.10 Traffic/Handover Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `handover-complete` | Handover completed | `targetGroundStationId` |
| `traffic-owner` | Station owns traffic | `targetGroundStationId` |
| `traffic-transferred` | Traffic transferred | `sourceStation`, `targetStation` |

### 9.11 Interactive Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `status-check` | Quiz question | `question`, `options`, `correctIndex`, `explanation`, `pointPenalty`, `character` |
| `custom` | Custom evaluator | `evaluator` function |

### 9.12 Fault Conditions

| Condition | Description | Key Params |
|-----------|-------------|------------|
| `fault-active` | Fault is injected | `faultId` |
| `fault-cleared` | Fault has been cleared | `faultId` |

---

## 10. Condition Maintenance Flags

| Flag | Use Case |
|------|----------|
| `mustMaintain: false` | One-time actions (open brief, answer quiz) |
| `mustMaintain: true` | Continuous conditions during objective |
| `maintainUntilObjectiveComplete: true` | Settings that must persist across multi-step objectives |
| `maintainDuration: 30` | Stability check (hold for N seconds) |

---

## 11. Parameter Type Conventions

```typescript
// Frequencies should be in Hz
{ type: 'speca-center-frequency', params: { centerFrequency: 1070e6 } }

// Angles need type casting
{ type: 'antenna-position', params: { azimuth: 219.7 as Degrees } }

// Power levels in dBm
{ type: 'signal-detected', params: { minPower: -95 as dBm } }

// LO frequencies in MHz (exception - check param name)
{ type: 'lnb-lo-set', params: { loFrequency: 5250, loFrequencyTolerance: 0 } }
```

**Common mistakes:**
- Using MHz instead of Hz for frequency params
- Missing tolerance values
- Forgetting `as Degrees` or `as dBm` casts

---

## 12. Equipment Initial State

Configure initial equipment state in `settings.groundStations`:

```typescript
settings: {
  groundStations: [
    {
      ...vermontGroundStation,
      rfFrontEnds: [
        createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
          buc: { isMuted: true },
          hpa: { isHpaEnabled: false },
        }),
      ],
    },
  ],
}
```

**Verify:**
- Initial state matches scenario premise
- Player has something to do (don't pre-configure everything)
- State is achievable from objectives

---

## 13. Anti-Patterns to Avoid

### Shallow Objectives

```typescript
// BAD: No depth, no verification
{
  id: 'set-frequency',
  title: 'Set Frequency',
  description: 'Set the frequency to 1532 MHz.',
  conditions: [{ type: 'rx-modem-frequency-set', params: { frequency: 1532e6 } }],
  points: 10,
}
```

### Missing Navigation

```typescript
// BAD: Assumes user knows where to go
{
  id: 'configure-antenna',
  title: 'Configure Antenna',
  prerequisiteObjectiveIds: ['power-up-lnb'],  // Was just on RX tab!
}
```

### Generic Dialog

```typescript
// BAD: No personality, no teaching
dialogClips: {
  'configure-antenna': {
    text: '<p>Configure the antenna now.</p>',
  },
}
```

### Missing "Why" Explanations

```typescript
// BAD: Just instructions, no understanding
explanation: 'The frequency is now set correctly.',

// GOOD: Teaches the concept
explanation: 'The LNB performs downconversion by mixing the incoming RF signal with its Local Oscillator. LO (5,250 MHz) minus RF (4,175.5 MHz) equals IF (1,074.5 MHz). This confirms the LO is set correctly and the receive path is working.',
```

---

## 14. Review Checklist

Before submitting a scenario for review, verify:

### Structure
- [ ] Mission brief objective with `freezesScenarioTimer: true`
- [ ] Clear phase organization with comments
- [ ] Navigation objectives before configuration objectives
- [ ] Verify-before-modify pattern for state changes
- [ ] Verification quizzes after significant actions
- [ ] Every objective has `groundStation` set
- [ ] Prerequisite chain is correct (first objective has `[]`)

### Educational Depth
- [ ] At least one "why" quiz per phase
- [ ] Calculations explained, not just performed
- [ ] Consequences of errors explained
- [ ] NICE codes with inline comments
- [ ] ~50-100 lines per objective including dialog
- [ ] Quiz:action ratio of at least 1:3

### Dialog Quality
- [ ] Intro clip sets scene and urgency (150+ words)
- [ ] Character voice consistent throughout
- [ ] Teaching moments, not just instructions
- [ ] No generic or shallow dialog clips
- [ ] Frequencies spelled out ("1,070 megahertz")

### Technical Accuracy
- [ ] Correct frequency calculations (see `nats-technical-reference.md`)
- [ ] Frequency values match across: condition params, descriptions, dialog
- [ ] Realistic equipment behavior
- [ ] Proper sequencing (e.g., safety procedures)
- [ ] Accurate NICE framework alignment
- [ ] Equipment initial state matches scenario premise

### Timing and Scoring
- [ ] Appropriate time limits with `timerStartTrigger: 'on-activate'`
- [ ] Point values reflect complexity (5-25 range)
- [ ] Quiz penalties appropriate (typically 5-10)

### TypeScript
- [ ] No type errors: `npx tsc --noEmit src/campaigns/<campaign>/scenario<N>.ts`
- [ ] Correct type casts (`as Degrees`, `as dBm`, `as MHz`)
- [ ] No unused imports

---

## 15. Related Documentation

| Document | Content |
|----------|---------|
| `signalrange-platform-guide.md` | Platform architecture and concepts |
| `nice-framework-guide.md` | NICE code mapping rules |
| `nats-campaign-plan.md` | Campaign structure and progression |
| `nats-character-guide.md` | Character dialog writing guide |
| `nats-technical-reference.md` | Frequencies, ground stations, equipment specs |
