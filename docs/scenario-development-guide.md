# Scenario Development Guide

This guide establishes standards for creating educational satellite ground station training scenarios. Scenarios should teach concepts, not just test button-clicking.

## Quality Metrics

A well-developed scenario should have:
- **Depth ratio**: ~50-100 lines of code per objective (including dialog)
- **Quiz ratio**: At least one verification quiz for every 2-3 action objectives
- **Dialog density**: Every objective should have a meaningful dialog clip (150+ words for key moments)
- **Character voice**: Consistent personality with teaching moments, not just task direction

## Scenario Structure

### 1. Mission Preparation Phase

Every scenario MUST begin with:

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

### 2. Navigation Objectives

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
      params: { groundStationId: 'VT-01' },
      mustMaintain: true,
    },
    {
      type: 'tab-active',
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

### 3. Verify-Before-Modify Pattern

Before changing equipment state, verify current state first:

```typescript
// BAD: Just tell them to disable something
{
  id: 'disable-hpa',
  title: 'Disable HPA Output',
  // ...
}

// GOOD: Verify current state, then modify, then confirm
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
  description: 'Verify the HPA output indicator shows disabled state.',
  conditions: [
    {
      type: 'status-check',
      params: {
        question: 'The HPA output is now disabled. What should you observe on the HPA panel?',
        // ... quiz options
      },
    },
  ],
}
```

### 4. Educational Quiz Types

#### Understanding Quizzes (Why)
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

#### Calculation Verification Quizzes
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

#### Consequence Quizzes
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
    explanation: 'AGC can only compensate within its gain range. The forecast predicts 8+ dB of degradation...',
  },
}
```

### 5. Dialog Clip Standards

#### Minimum Length Guidelines
- **Intro clip**: 150-250 words - Set the scene, establish urgency, provide context
- **Objective completion clips**: 75-150 words - Explain what just happened and what's next
- **Key learning moment clips**: 150-200 words - Deeper explanations of concepts

#### Character Voice Requirements

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

```typescript
// GOOD Catherine dialog
text: `
<p>
  Hey, it's Catherine. Just got to the station - roads are fine up here, clear skies. I saw the antenna moving when I pulled in.
</p>
<p>
  I did a quick sanity check that you weren't inputting the same az/el for ME-02 that you were using at VT-01. We had a new guy mess that up a few months ago...
</p>
`,
```

#### Dialog Should NOT:
- Be generic instructions that could apply anywhere
- Lack personality or teaching moments
- Skip explanation of "why"
- Be under 50 words for significant objectives

### 6. NICE Framework Integration

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

### 7. Time Pressure and Penalties

Use time limits to create appropriate urgency without frustration:

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
  message: "Vermont's link has degraded significantly. The handover should have been complete by now.",
},

// Advanced scenarios (7-8): Real pressure with consequences
timeLimitSeconds: 90,
timerStartTrigger: 'on-activate',
timePenalty: {
  elapsedTimeThreshold: 10 * 60,
  pointsDeducted: 50,
  message: "We just violated the SLA! This is going to cost us a lot of money.",
},
```

### 8. Phase Organization

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

// ============================================================
// PHASE 5: FINAL CONFIRMATION
// ============================================================
```

### 9. Objective Checklist

Before finalizing a scenario, verify each objective has:

- [ ] Clear, specific title (action verb + equipment/concept)
- [ ] Detailed description (what to do AND context)
- [ ] Appropriate NICE codes with inline comments
- [ ] Reasonable time limit with `timerStartTrigger: 'on-activate'`
- [ ] Prerequisite objectives defined
- [ ] Corresponding dialog clip in `dialogClips.objectives`
- [ ] For action objectives: verification quiz afterward
- [ ] For quiz objectives: educational explanation in the answer
- [ ] Appropriate point value (5-20 based on complexity)

### 10. Anti-Patterns to Avoid

#### Shallow Objectives
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

#### Missing Navigation
```typescript
// BAD: Assumes user knows where to go
{
  id: 'configure-antenna',
  title: 'Configure Antenna',
  prerequisiteObjectiveIds: ['power-up-lnb'],  // Was just on RX tab!
  // ...
}
```

#### Generic Dialog
```typescript
// BAD: No personality, no teaching
dialogClips: {
  'configure-antenna': {
    text: '<p>Configure the antenna now.</p>',
  },
}
```

#### Missing "Why" Explanations
```typescript
// BAD: Just instructions, no understanding
explanation: 'The frequency is now set correctly.',

// GOOD: Teaches the concept
explanation: 'The LNB performs downconversion by mixing the incoming RF signal with its Local Oscillator. LO (5,250 MHz) minus RF (4,175.5 MHz) equals IF (1,074.5 MHz). This confirms the LO is set correctly and the receive path is working.',
```

## Example: Well-Structured Objective Sequence

Here's a complete example showing proper depth for configuring an LNB:

```typescript
// ============================================================
// LNB CONFIGURATION
// ============================================================
{
  id: 'navigate-rx-analysis',
  // S0421: Skill in operating network equipment - navigating to the receive
  // chain panel within the ground station control interface
  nice: ['S0421'],
  title: 'Open RX Analysis Tab',
  description: 'Click the RX Analysis tab to access the receive chain equipment.',
  groundStation: 'ME-02',
  prerequisiteObjectiveIds: ['previous-objective'],
  timeLimitSeconds: 2 * 60,
  timerStartTrigger: 'on-activate',
  conditions: [
    {
      type: 'ground-station-selected',
      description: 'Maine Station Active',
      params: { groundStationId: 'ME-02' },
      mustMaintain: true,
    },
    {
      type: 'tab-active',
      description: 'RX Analysis Tab Open',
      params: { tab: 'rx-analysis' },
      mustMaintain: true,
    },
  ],
  conditionLogic: 'AND',
  points: 5,
},
{
  id: 'verify-lnb-initial-state',
  // T0431: Check system hardware availability - verifying LNB power state
  // before attempting configuration
  nice: ['T0431'],
  title: 'Check LNB Status',
  description: 'Verify the current state of the LNB before powering it on.',
  groundStation: 'ME-02',
  prerequisiteObjectiveIds: ['navigate-rx-analysis'],
  timeLimitSeconds: 2 * 60,
  timerStartTrigger: 'on-activate',
  conditions: [
    {
      type: 'tab-active',
      description: 'RX Analysis Tab Open',
      params: { tab: 'rx-analysis' },
      mustMaintain: true,
    },
    {
      type: 'status-check',
      description: 'Verify LNB Power State',
      params: {
        question: 'What is the current state of the LNB?',
        options: [
          'Powered off - needs to be configured and powered on',
          'Powered on but not locked to reference',
          'Powered on and locked - ready for use',
          'Faulted - showing error condition',
        ],
        correctIndex: 0,
        explanation: 'The LNB is currently powered off. This is expected for a backup station that hasn\'t been activated. We\'ll need to power it on and configure the LO frequency before we can receive signals.',
        pointPenalty: 5,
      },
      mustMaintain: false,
    },
  ],
  conditionLogic: 'AND',
  points: 10,
},
{
  id: 'configure-lnb',
  // T1567: Configure system hardware - powering on and configuring LNB
  // S0421: Skill in operating network equipment - executing LNB configuration
  // K0792: Knowledge of network configurations - matching LNB settings to
  // primary site for consistent downconversion
  nice: ['T1567', 'S0421', 'K0792'],
  title: 'Power Up and Configure LNB',
  description: 'Power on the LNB and configure it to match Vermont: LO frequency 5,250 MHz, Gain 60 dB. Wait for thermal stabilization.',
  groundStation: 'ME-02',
  prerequisiteObjectiveIds: ['verify-lnb-initial-state'],
  timeLimitSeconds: 3 * 60,
  timerStartTrigger: 'on-activate',
  conditions: [
    {
      type: 'tab-active',
      description: 'RX Analysis Tab Open',
      params: { tab: 'rx-analysis' },
      mustMaintain: true,
    },
    {
      type: 'equipment-powered',
      description: 'LNB Powered On',
      params: { equipment: 'lnb' },
      maintainUntilObjectiveComplete: true,
    },
    {
      type: 'lnb-lo-set',
      description: 'LNB LO Set to 5,250 MHz',
      params: { loFrequency: 5250, loFrequencyTolerance: 0 },
      maintainUntilObjectiveComplete: true,
    },
    {
      type: 'lnb-gain-set',
      description: 'LNB Gain Set to 60 dB',
      params: { gain: 60, gainTolerance: 0 },
      maintainUntilObjectiveComplete: true,
    },
    {
      type: 'lnb-thermally-stable',
      description: 'LNB Thermally Stabilized',
      maintainUntilObjectiveComplete: true,
    },
  ],
  conditionLogic: 'AND',
  points: 15,
},
{
  id: 'verify-lnb-config-quiz',
  // K0792: Knowledge of network configurations - understanding why LNB
  // settings must match between sites
  // K0773: Knowledge of telecommunications principles - understanding
  // LO frequency and IF calculation
  nice: ['K0792', 'K0773'],
  title: 'Verify LNB Configuration Understanding',
  description: 'Confirm you understand why the LNB settings must match Vermont.',
  groundStation: 'ME-02',
  prerequisiteObjectiveIds: ['configure-lnb'],
  timeLimitSeconds: 2 * 60,
  timerStartTrigger: 'on-activate',
  conditions: [
    {
      type: 'status-check',
      description: 'Understand LNB Matching',
      params: {
        question: 'Why must Maine\'s LNB LO frequency match Vermont\'s exactly?',
        options: [
          'Same LO frequency produces the same IF frequency, so downstream equipment configuration is identical',
          'Different LO frequencies would cause interference between the two sites',
          'The satellite requires all ground stations to use the same LO frequency',
          'It\'s just company policy for consistency',
        ],
        correctIndex: 0,
        explanation: 'With the same LO frequency (5,250 MHz), the TIDEMARK-1 beacon at 4,175.5 MHz RF produces the same 1,074.5 MHz IF at both sites. This means the spectrum analyzer, receiver modem, and all downstream equipment use identical frequency settings, simplifying handover and reducing configuration errors.',
        pointPenalty: 10,
      },
      mustMaintain: false,
    },
  ],
  conditionLogic: 'AND',
  points: 10,
},
```

With corresponding dialog clips:

```typescript
dialogClips: {
  objectives: {
    'navigate-rx-analysis': {
      text: `
      <p>
        While the antenna settles, let's get the receive chain configured. The LNB is currently powered down - standard procedure for a backup station that's been on standby.
      </p>
      <p>
        We need to power it on and set the local oscillator frequency to match Vermont. Same LO means same IF frequencies downstream, which means all our other equipment settings stay identical.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-navigate-rx-analysis.mp3'),
    },
    'verify-lnb-initial-state': {
      text: `
      <p>
        Good habit - checking the state before making changes. In this case the LNB is cold, as expected. But I've seen operators assume equipment is off when it's actually in a fault state, or assume it's on when someone else powered it down.
      </p>
      <p>
        The extra few seconds to verify saves you from chasing phantom problems later.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-lnb-initial-state.mp3'),
    },
    'configure-lnb': {
      text: `
      <p>
        LNB's powered and warming up. Watch the thermal indicator - we need it stable before we can trust the receive path.
      </p>
      <p>
        Cold LNBs drift. The local oscillator frequency shifts as the components warm up, which means your IF frequency shifts too. That's why we wait for thermal stability before trying to acquire signals.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-configure-lnb.mp3'),
    },
    'verify-lnb-config-quiz': {
      text: `
      <p>
        Exactly. Same LO means same IF. Makes everything downstream identical between sites. Less to think about, fewer mistakes.
      </p>
      <p>
        Now let's verify we're actually seeing the satellite. The beacon should appear at 1,074.5 MHz IF - that's 5,250 minus 4,175.5. If the math checks out on the spectrum analyzer, we know the LNB is working correctly.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-verify-lnb-config-quiz.mp3'),
    },
  },
},
```

## Scenario Review Checklist

Before submitting a scenario for review:

### Structure
- [ ] Mission brief objective with timer freeze
- [ ] Clear phase organization with comments
- [ ] Navigation objectives before configuration objectives
- [ ] Verify-before-modify pattern for state changes
- [ ] Verification quizzes after significant actions

### Educational Depth
- [ ] At least one "why" quiz per phase
- [ ] Calculations explained, not just performed
- [ ] Consequences of errors explained
- [ ] NICE codes with inline comments

### Dialog Quality
- [ ] Intro clip sets scene and urgency (150+ words)
- [ ] Character voice consistent throughout
- [ ] Teaching moments, not just instructions
- [ ] No generic or shallow dialog clips

### Technical Accuracy
- [ ] Correct frequency calculations
- [ ] Realistic equipment behavior
- [ ] Proper sequencing (e.g., safety procedures)
- [ ] Accurate NICE framework alignment

### Balance
- [ ] ~50-100 lines per objective including dialog
- [ ] Quiz:action ratio of at least 1:3
- [ ] Appropriate time limits with penalties
- [ ] Point values reflect complexity
