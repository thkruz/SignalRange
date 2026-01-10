# Signal Chain Architecture Implementation Retrospective

## Overview

Implemented dynamic FEC simulation, CryptoModule, FaultInjector, and objective condition evaluators for the RX/TX payload chains. The existing RxPayloadAdapter and TxPayloadAdapter had static state - this work made them dynamic and scenario-aware.

## What Was Built

### New Modules
1. **FECSimulator** (`src/equipment/receiver/fec-simulator.ts`)
   - Calculates BER from C/N ratio using erfc approximation
   - Computes Viterbi path metric via sigmoid function
   - Tracks Reed-Solomon corrections and uncorrectable blocks
   - Supports fault injection overrides

2. **CryptoModule** (`src/equipment/crypto/`)
   - Singleton managing shared TX/RX encryption state
   - Key lifecycle: expiration countdown, rotation, zeroize
   - Fault injection: key mismatch, pending rotation, expired keys

3. **FaultInjector** (`src/faults/`)
   - Centralized fault injection service
   - Priority-based fault stacking
   - Template-based faults for common scenarios
   - Auto-expiration and scenario cleanup

4. **Objective Conditions** (`src/objectives/objectives-manager.ts`)
   - 10 new condition types for FEC/Crypto/Fault evaluation
   - Enables scenario-driven training objectives

### Integration Points
- RxPayloadAdapter now queries FECSimulator, CryptoModule, FaultInjector
- TxPayloadAdapter now queries CryptoModule, FaultInjector
- New events: CRYPTO_STATE_CHANGED, CRYPTO_KEY_ROTATED, CRYPTO_KEY_EXPIRED, CRYPTO_ZEROIZED, FAULT_CHANGED

## What Worked

1. **Plan-first approach**: The detailed plan file helped track all the moving pieces and dependencies between modules.

2. **Singleton patterns**: CryptoModule and FaultInjector as singletons made integration straightforward - adapters just call `getInstance()`.

3. **Separation of concerns**: Keeping FECSimulator pure (input -> output) made it easy to test and debug calculations independently.

4. **Type-safe fault injection**: The FaultDefinition interface with typed targets prevented runtime errors from mismatched fault/adapter combinations.

## What Didn't Work

1. **Cumulative counters for status determination**: Initially used cumulative `rsUncorrectableBlocks_` for channel status, which meant status stayed "Critical" forever after any errors occurred. Had to add a separate "recent" counter with decay.

2. **Smoothed metrics for status**: Used smoothed BER/Viterbi values for status determination, which caused status to lag behind actual signal improvement by many seconds. Fixed by using raw metrics for status while keeping smoothed for display.

3. **Overly strict thresholds**: Initial thresholds (BER > 1e-6 for Degraded, Viterbi < 0.7) were too strict for realistic SATCOM training. Required ~13 dB C/N to show "Good". Relaxed to BER > 1e-5 and Viterbi < 0.6.

4. **Property name mismatches**: Hit errors for `GroundStation.id` vs `GroundStation.uuid`, `receiver` vs `receivers`, `hasFault` vs `isActive`. These could have been caught earlier with better exploration of existing types.

## What To Change Next Time

1. **Read existing interfaces first**: Before writing new code that interacts with existing classes, thoroughly read their type definitions. Would have avoided the `id`/`uuid` and `receiver`/`receivers` errors.

2. **Test threshold values empirically**: Instead of picking theoretical thresholds, should have tested with actual signal scenarios to find values that feel right for training.

3. **Separate "recent" vs "total" from the start**: The distinction between cumulative totals (for statistics) and recent values (for status) should have been designed upfront, not retrofitted.

4. **Use raw values for real-time status**: Smoothing is for display aesthetics, not operational decisions. Status determination should always use instantaneous values.

5. **Document threshold rationale**: The status thresholds encode operational knowledge (what C/N is "good enough"). Should document the reasoning so future changes don't break training scenarios.

## Metrics

- **Files created**: 7 (fec-simulator.ts, crypto-types.ts, crypto-module-core.ts, crypto/index.ts, fault-types.ts, fault-injector.ts, faults/index.ts)
- **Files modified**: 6 (events.ts, rx-payload-adapter.ts, tx-payload-adapter.ts, rx-analysis-tab.ts, tx-chain-tab.ts, objectives-manager.ts, objective-types.ts)
- **Bug fixes during implementation**: 4 (cumulative counters, smoothed status, strict thresholds, property name mismatches)
- **New objective condition types**: 10

## Key Lessons

1. **Status indicators need instant response**: Users expect status to reflect current reality, not a smoothed historical average.

2. **Cumulative counters are for statistics, not status**: Never use "total errors ever" to determine current health.

3. **Threshold tuning is UX work**: The difference between "Degraded at 10 dB" vs "Degraded at 8 dB" significantly affects training experience.
