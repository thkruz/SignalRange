# Signal Range v1.0 Implementation Plan: Full NATS Campaign

## Goal
Complete the NATS campaign with **5 playable scenarios**, each with objectives, dialog, and end-to-end functionality.

---

## Current State Summary

| Scenario | Objectives | Dialog | Equipment | Status |
|----------|-----------|--------|-----------|--------|
| 1 "First Light" | 5 phases | Complete | Antenna, RF FE, SpecA | Playable (minor bugs) |
| 2 "Signal Hunt" | Missing | Missing | Defined (legacy format) | Incomplete |
| 3 "Full Stack" | Missing | Missing | Defined, `isDisabled: true` | Incomplete |
| 4 (New) | N/A | N/A | N/A | Does not exist |
| 5 (New) | N/A | N/A | N/A | Does not exist |

---

## Implementation Phases

### Phase 1: Scenario 1 Bug Investigation & Fixes

**Goal:** Fix equipment behavior and UI issues in Scenario 1

**Tasks:**
1. Playtest Scenario 1 end-to-end, document specific failures
2. Check antenna lock evaluator tolerance (`objectives-manager.ts:492-507`)
3. Verify GPSDO/LNB/BUC state transitions during warmup
4. Fix any UI adapter sync issues (check `domCache_` patterns)
5. Test all 5 objective phases trigger correctly

**Files:**
- `src/objectives/objectives-manager.ts`
- `src/pages/mission-control/tabs/` (adapters)
- `src/equipment/rf-front-end/` (core modules)

---

### Phase 2: New Objective Condition Types

**Goal:** Add condition evaluators needed for Scenarios 2-5

**Receiver Conditions (for S2+):**
```typescript
| 'receiver-powered'         // Receiver modem powered
| 'receiver-frequency-set'   // Tuned to specific frequency
| 'receiver-modulation-set'  // Modulation type configured
| 'receiver-fec-set'         // FEC rate configured
| 'receiver-locked'          // Carrier lock achieved
| 'receiver-snr-threshold'   // SNR exceeds minimum
| 'video-output'             // Video feed displaying
```

**Transmitter Conditions (for S3+):**
```typescript
| 'transmitter-powered'       // TX modem powered
| 'transmitter-frequency-set' // TX frequency configured
| 'transmitter-power-set'     // TX power level set
| 'transmitter-transmitting'  // Actively transmitting
| 'hpa-enabled'               // HPA amplifier enabled
| 'buc-unmuted'               // BUC RF output enabled
| 'power-budget-check'        // Total TX power within budget
```

**Advanced Conditions (for S4-5):**
```typescript
| 'cn-threshold'              // C/N above specified dB
| 'antenna-polarization-set'  // Polarization adjusted
| 'filter-bandwidth-set'      // IF filter configured
| 'signal-power-below'        // Interferer below threshold
| 'system-stable'             // System stable for duration
```

**Files:**
- `src/objectives/objective-types.ts` - Add types
- `src/objectives/objectives-manager.ts` - Add evaluators

---

### Phase 3: Scenario 2 "Signal Hunt" Implementation

**Theme:** Receiver-focused signal acquisition (Intermediate)
**Equipment:** Antenna, RF FE, 2x SpecA, 1 Receiver
**Duration:** 35-40 min

**Objectives:**
1. **LNB Configuration** - Power, LO frequency, gain, thermal stability
2. **Signal Search** - SpecA wide span survey, locate carrier
3. **Signal Characterization** - Narrow span, measure C/N
4. **Receiver Modem Setup** - Frequency, modulation (QPSK), FEC (3/4)
5. **Video Lock** - Achieve lock, maintain 10 seconds, video output

**Narrative:** Maritime vessel MV *Nordic Spirit* reports intermittent uplink issues. Diagnose by analyzing downlink from MARINER-1.

**Tasks:**
1. Migrate scenario2.ts to `groundStations[]` format (match scenario1)
2. Set `isSync: true` for objective tracking
3. Add 5 objective phases with conditions
4. Add dialog clips (intro + per-objective)
5. Fix `prerequisiteScenarioIds` to match scenario1's ID

**Files:**
- `src/campaigns/nats/scenario2.ts`

---

### Phase 4: Scenario 3 "Full Stack" Implementation

**Theme:** Bidirectional TX+RX operation (Advanced)
**Equipment:** 2x Antenna, 2x RF FE, 4x SpecA, 1 TX, 1 RX
**Duration:** 45-60 min

**Objectives:**
1. **TX Chain Power-Up** - BUC/HPA in standby, muted
2. **Uplink Configuration** - 2 TX modems at 5925/5940 MHz
3. **HPA Activation** - Enable, set power, unmute BUC
4. **RX Chain Activation** - LNB, 2 RX modems at 775/790 MHz
5. **Full Duplex Verification** - Both TX transmitting, both RX locked, 15 seconds

**Narrative:** Government research station in Greenland needs full-duplex comms for ice core data transfer.

**Tasks:**
1. Migrate scenario3.ts to `groundStations[]` format
2. Set `isSync: true`
3. Remove `isDisabled: true`
4. Add 5 objective phases with conditions
5. Add dialog clips
6. Update prerequisite to match scenario2's ID

**Files:**
- `src/campaigns/nats/scenario3.ts`

---

### Phase 5: Scenario 4 "Crowded Skies" Creation

**Theme:** Interference mitigation (Advanced)
**Equipment:** Antenna, RF FE (with Filter focus), 3x SpecA, 1 RX
**Duration:** 40-50 min

**Objectives:**
1. **Spectrum Survey** - Wide span, identify 3+ signals
2. **Carrier Identification** - Use markers to identify MARINER-1 vs interferer
3. **Polarization Optimization** - Rotate pol to maximize C/N, reduce interferer
4. **IF Filter Configuration** - Set center 775 MHz, BW 20 MHz
5. **Service Restoration** - C/N > 14 dB, clean video, 30 seconds

**Narrative:** New satellite VEGA-2 at adjacent slot (51.5W) causing interference. Mitigate without coordination delays.

**Tasks:**
1. Create scenario4.ts following scenario1 pattern
2. Configure satellites to include interfering signal
3. Add 5 objective phases
4. Add dialog clips with James Morton (Spectrum Coordinator)
5. Add to campaign-data.ts and scenario-manager.ts

**Files:**
- `src/campaigns/nats/scenario4.ts` (new)
- `src/campaigns/nats/campaign-data.ts`
- `src/scenario-manager.ts`

---

### Phase 6: Scenario 5 "Dark Before Dawn" Creation

**Theme:** Troubleshooting under pressure (Expert)
**Equipment:** Full setup with pre-configured fault conditions
**Duration:** 50-65 min

**Objectives:**
1. **Alarm Triage** - Check GPSDO (holdover), LNB (thermal drift), BUC
2. **GPSDO Recovery** - Toggle GNSS, verify holdover stability < 10e-11
3. **LNB Thermal Management** - Compensate gain, keep noise < 120K
4. **Priority Circuit Recovery** - Restore maritime safety circuits first
5. **Shift Handoff** - Document status, all critical alarms cleared, 2 min stable

**Narrative:** 3 AM overnight shift, solar event causes cascading failures. Maintain service and document for day shift.

**Initial Fault State:**
```typescript
gpsdo: { isInHoldover: true, gnssSignalPresent: false }
lnb: { temperature: 65, noiseTemperature: 110 }
```

**Tasks:**
1. Create scenario5.ts with pre-configured fault conditions
2. Add 5 objective phases
3. Add dialog clips (rotating characters for emergency response)
4. Add to campaign-data.ts and scenario-manager.ts

**Files:**
- `src/campaigns/nats/scenario5.ts` (new)
- `src/campaigns/nats/campaign-data.ts`
- `src/scenario-manager.ts`

---

### Phase 7: Integration Testing

**Tasks:**
1. Playtest all 5 scenarios end-to-end
2. Verify prerequisite unlocking chain: S1 → S2 → S3 → S4 → S5
3. Test checkpoint save/restore for each scenario
4. Test "Play Again" functionality
5. Verify campaign progress calculation
6. Fix any objective timing issues

---

### Phase 8: Polish

**Tasks:**
1. Add mission brief URLs for scenarios 2-5 (docs.signalrange.space)
2. Record/integrate dialog audio files
3. Create scenario card images
4. Final UI/UX polish
5. Write retrospective

---

## Learning Progression Summary

| Scenario | Skills Taught | Equipment Focus |
|----------|--------------|-----------------|
| 1 "First Light" | RF chain setup, antenna lock | GPSDO, LNB, BUC, SpecA |
| 2 "Signal Hunt" | Signal acquisition, RX modem config | LNB, Filter, Receiver |
| 3 "Full Stack" | Bidirectional comms, link budget | TX + RX chains, HPA |
| 4 "Crowded Skies" | Interference mitigation, spectrum sharing | Polarization, Filtering |
| 5 "Dark Before Dawn" | Troubleshooting, degraded ops | All equipment, faults |

---

## Character Dialog Guide

| Character | Role | Scenarios |
|-----------|------|-----------|
| Catherine Vega | Director of Operations | All |
| Charlie Brooks | Field Engineer | 1, 3, 5 |
| Dr. Maya Chen | Systems Engineer | 3, 4, 5 |
| James Morton | Spectrum Coordinator | 4 |

---

## Critical File List

**Objectives System:**
- `src/objectives/objective-types.ts` - Condition type definitions
- `src/objectives/objectives-manager.ts` - Condition evaluators

**Scenarios:**
- `src/campaigns/nats/scenario1.ts` - Reference implementation
- `src/campaigns/nats/scenario2.ts` - Migration + objectives
- `src/campaigns/nats/scenario3.ts` - Migration + objectives + enable
- `src/campaigns/nats/scenario4.ts` - New file
- `src/campaigns/nats/scenario5.ts` - New file

**Campaign:**
- `src/campaigns/nats/campaign-data.ts` - Add S4, S5 imports
- `src/scenario-manager.ts` - SCENARIOS array

**UI (if needed for bugs):**
- `src/pages/mission-control/tabs/*-adapter.ts`
- `src/equipment/rf-front-end/*-core.ts`
