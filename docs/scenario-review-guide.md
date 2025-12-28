# Scenario Review Guide

This guide covers key areas to review when creating or modifying scenario files, based on lessons learned from scenario4 development.

## File Structure

Scenario files are located in `src/campaigns/<campaign>/scenario<N>.ts` and export a `ScenarioData` object containing:

- Metadata (id, title, description, difficulty)
- Settings (ground stations, satellites, equipment layout)
- Objectives array
- Dialog clips

## Review Checklist

### 1. Frequency Calculations

Verify all RF-to-IF conversions are correct. Common formulas:

| Signal Type | Conversion | Example |
|-------------|------------|---------|
| Downlink (high-side LNB) | IF = LO - RF | LO 5250 MHz, RF 4180 MHz → IF 1070 MHz |
| Uplink (low-side BUC) | RF = IF + LO | IF 1020 MHz, LO 7000 MHz → RF 8020 MHz |

**Check these match across:**

- Objective condition params (e.g., `frequency: 1070e6`)
- Objective descriptions (e.g., "Set to 1070 MHz")
- Dialog text (e.g., "1,070 megahertz")
- Equipment initial state in settings

### 2. Objective Sequencing

Review the prerequisite chain:

```typescript
prerequisiteObjectiveIds: ['previous-objective-id']
```

- Each objective should reference the correct predecessor
- First objective should have empty prerequisites: `[]`
- Verify the logical flow makes sense operationally

### 3. Timer Configuration

Per-objective timers require two fields:

```typescript
timeLimitSeconds: 3 * 60,        // Duration in seconds
timerStartTrigger: 'on-activate' // When timer starts
```

Guidelines:

- Simple tasks (quizzes, toggles): 2 minutes
- Configuration tasks (frequency, modulation): 2-3 minutes
- Multi-step tasks (antenna slew + verify): 3 minutes
- Mission brief review: No timer (omit both fields)

### 4. Condition Parameters

Verify condition params match expected types from `objectives-manager.ts`:

```typescript
// Frequencies should be in Hz
{ type: 'speca-center-frequency', params: { centerFrequency: 1070e6, ... } }

// Angles need type casting
{ type: 'antenna-position', params: { azimuth: 219.7 as Degrees, ... } }

// Power levels in dBm
{ type: 'signal-detected', params: { minPower: -95 as dBm, ... } }
```

Common mistakes:

- Using MHz instead of Hz for frequency params
- Missing tolerance values
- Forgetting `as Degrees` or `as dBm` casts

### 5. Maintain Flags

Choose the appropriate maintain behavior:

| Flag | Use Case |
|------|----------|
| `mustMaintain: false` | One-time actions (open brief, answer quiz) |
| `mustMaintain: true` | Continuous conditions during objective |
| `maintainUntilObjectiveComplete: true` | Settings that must persist across multi-step objectives |
| `maintainDuration: 30` | Stability check (hold for N seconds) |

### 6. Dialog Consistency

**Character voice:**

- Each character has a defined role and speech pattern
- Check `character-enum.ts` for character descriptions
- Instructors give commands; observers report status

**Technical accuracy:**

- Dialog should match what the player actually did
- Don't reference information the character wouldn't have
- Example: A remote operator can't see local telemetry unless transmitted

**Frequency mentions:**

- Spell out frequencies: "1,070 megahertz" not "1070MHz"
- Must match the objective's actual parameters

### 7. Equipment Initial State

Review the `settings.groundStations` overrides:

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

Verify:

- Initial state matches scenario premise (e.g., safe state before switchover)
- Player has something to do (don't pre-configure everything)
- State is achievable from objectives (e.g., if objective requires beacon lock, antenna must be pointable at satellite)

### 8. Ground Station Assignment

Every objective needs `groundStation` set:

```typescript
{
  id: 'configure-antenna',
  groundStation: 'VT-01',  // Must match a configured station ID
  ...
}
```

### 9. Points Distribution

Review point allocation makes sense:

- Simple tasks: 5-10 points
- Configuration tasks: 10-15 points
- Verification/lock tasks: 15-25 points
- Quiz penalties: typically 5 points per wrong answer

### 10. TypeScript Compilation

After changes, verify no type errors:

```bash
npx tsc --noEmit src/campaigns/<campaign>/scenario<N>.ts
```

Common issues:

- Unused imports after refactoring
- Missing type casts on branded types
- Incorrect condition type names

## Quick Reference: Satellite Frequencies

| Satellite | Beacon RF | Downlink RF | Uplink RF |
|-----------|-----------|-------------|-----------|
| TIDEMARK-1 | 4175.5 MHz | 3718 MHz | 5943 MHz |
| TIDEMARK-2 | 4180 MHz | 3792 MHz | 6017 MHz |
| SES-10 | 4178 MHz | 3644 MHz | 5869 MHz |

## Quick Reference: VT-01 IF Frequencies (LNB LO = 5250 MHz)

| Satellite | Beacon IF | Downlink IF |
|-----------|-----------|-------------|
| TIDEMARK-1 | 1074.5 MHz | 1532 MHz |
| TIDEMARK-2 | 1070 MHz | 1458 MHz |
| SES-10 | 1072 MHz | 1606 MHz |
