/**
 * Proof that every nats-eu (Campaign 2) mechanic wires up and its objective
 * condition evaluates correctly. Each manager is constructed from the REAL
 * natsEuSandboxData.settings (the sandbox that turns them all on), then driven
 * through the operator actions; each assertion checks the exact predicate the
 * ObjectivesManager condition evaluator reads (noted per block), so a green test
 * proves the condition will latch satisfied in-scenario.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { ScenarioManager } from '../../src/scenario-manager';
import { natsEuSandboxData } from '../../src/campaigns/nats-eu/sandbox';
import { LinkBudgetManager } from '../../src/link-budget/link-budget-manager';
import { CommandingManager } from '../../src/commanding/commanding-manager';
import { ContactScheduleManager } from '../../src/contact-schedule/contact-schedule-manager';
import { SpaceEventManager } from '../../src/space-events/space-event-manager';
import { SecurityConsoleCore } from '../../src/security-console/security-console-core';
import { TransecManager } from '../../src/transec/transec-manager';
import { GnssThreatManager } from '../../src/gnss-threat/gnss-threat-manager';

beforeEach(() => {
  // Load the sandbox settings so every manager reads its real opt-in block.
  ScenarioManager.getInstance().settings = natsEuSandboxData.settings;
});

afterEach(() => {
  LinkBudgetManager.destroy();
  CommandingManager.destroy();
  ContactScheduleManager.destroy();
  SpaceEventManager.destroy();
  SecurityConsoleCore.destroy();
  TransecManager.destroy();
  GnssThreatManager.destroy();
  EventBus.destroy();
});

describe('nats-eu M1 - Link-budget / EIRP console', () => {
  it('link-budget-computed latches when the worksheet matches truth; link-margin-met after commit', () => {
    const mgr = LinkBudgetManager.getInstance();

    // condition link-budget-computed reads isBudgetComputedCorrectly()
    expect(mgr.isBudgetComputedCorrectly()).toBe(false);

    // A wrong worksheet (undersized EIRP) must NOT satisfy it.
    mgr.computeCNR({ eirpDbm: 20, fsplDb: 160, rxGainDbi: 44, systemNoiseTempK: 120, bandwidthHz: 36e6 });
    expect(mgr.isBudgetComputedCorrectly()).toBe(false);

    // A correct worksheet yields ~14 dB C/N (sandbox expectedCNRDb: 14, tol 1.5).
    // Noise floor at T=120K, B=36MHz is ~-102.2 dBm; rx power ~-88.2 dBm -> ~14 dB.
    const cnr = mgr.computeCNR({ eirpDbm: 50, fsplDb: 180.7, rxGainDbi: 44.5, systemNoiseTempK: 120, bandwidthHz: 36e6, miscLossDb: 2 });
    expect(cnr).toBeGreaterThan(12.5);
    expect(cnr).toBeLessThan(15.5);
    expect(mgr.isBudgetComputedCorrectly()).toBe(true);

    // condition link-margin-met reads isMarginMet()
    expect(mgr.isMarginMet()).toBe(false);
    mgr.commitLink(12); // achieved C/N 12 dB vs threshold 8 -> 4 dB margin >= 3 required
    expect(mgr.isMarginMet()).toBe(true);
    // Under-margin commit fails.
    mgr.commitLink(9); // 1 dB margin < 3
    expect(mgr.isMarginMet()).toBe(false);
  });
});

describe('nats-eu M2/M5 - LEO uplink ops + command-link key ops', () => {
  it('a command only ACKs with Doppler comp + valid key; rotation and zeroize track', () => {
    const mgr = CommandingManager.getInstance();

    // condition uplink-doppler-comp-enabled reads state.dopplerCompEnabled
    expect(mgr.state.dopplerCompEnabled).toBe(false);

    // Command without Doppler comp is rejected -> command-acknowledged stays false.
    expect(mgr.sendCommand('CMD-1').status).toBe('rejected');
    expect(mgr.isCommandAcknowledged()).toBe(false);

    mgr.setDopplerComp(true);
    expect(mgr.state.dopplerCompEnabled).toBe(true);

    // condition command-acknowledged reads isCommandAcknowledged()
    expect(mgr.sendCommand('CMD-2').status).toBe('acked');
    expect(mgr.isCommandAcknowledged('CMD-2')).toBe(true);
    expect(mgr.isCommandAcknowledged()).toBe(true);

    // condition key-rotation-completed reads state.keyRotationCompleted
    expect(mgr.state.keyRotationCompleted).toBe(false);
    mgr.beginKeyRotation();
    expect(mgr.sendCommand('CMD-3').reason).toBe('key-invalid'); // pending rotation -> reject
    mgr.completeKeyRotation();
    expect(mgr.state.keyRotationCompleted).toBe(true);
    expect(mgr.sendCommand('CMD-4').status).toBe('acked');

    // condition zeroize-executed reads state.zeroized
    expect(mgr.state.zeroized).toBe(false);
    mgr.zeroizeKey();
    expect(mgr.state.zeroized).toBe(true);
    expect(mgr.sendCommand('CMD-5').reason).toBe('key-invalid'); // zeroized -> no more commands
  });

  it('rejects a command sent outside the pass window', () => {
    ScenarioManager.getInstance().settings = {
      ...natsEuSandboxData.settings,
      commanding: { windowStartS: 100, windowEndS: 200, requireDopplerComp: false, requireValidKey: false },
    };
    const mgr = CommandingManager.getInstance();
    expect(mgr.sendCommand('EARLY', 50).reason).toBe('out-of-window');
    expect(mgr.sendCommand('IN', 150).status).toBe('acked');
    expect(mgr.sendCommand('LATE', 250).reason).toBe('out-of-window');

    // isWindowOpen (the console UI's window badge) tracks the same bounds.
    expect(mgr.isWindowOpen(50)).toBe(false);
    expect(mgr.isWindowOpen(150)).toBe(true);
    expect(mgr.isWindowOpen(250)).toBe(false);
  });

  it('exposes the sandbox canned command list to the console UI', () => {
    const mgr = CommandingManager.getInstance();
    const commands = mgr.getConfig().commands ?? [];
    expect(commands.map((c) => c.id)).toEqual(['PLD-SAFE', 'REC-PLAYBACK', 'OBC-WDT-RESET']);
  });
});

describe('nats-eu M3 - Multi-station pass scheduling', () => {
  it('contact-assigned / contact-plan-valid track allocations and conflicts', () => {
    const mgr = ContactScheduleManager.getInstance();

    // condition contact-plan-valid reads isPlanValid() - required P1 contacts unassigned
    expect(mgr.isPlanValid()).toBe(false);

    // condition contact-assigned reads isContactAssigned()
    expect(mgr.isContactAssigned('SAR1-P1')).toBe(false);
    mgr.assign('SAR1-P1', 'GW-01');
    expect(mgr.isContactAssigned('SAR1-P1')).toBe(true);
    expect(mgr.isContactAssigned('SAR1-P1', 'GW-01')).toBe(true);
    expect(mgr.isContactAssigned('SAR1-P1', 'SH-02')).toBe(false);

    // Assign the other required (priority<=2) contact -> plan valid (P3 not required).
    mgr.assign('SAR2-P1', 'SH-02');
    expect(mgr.isPlanValid()).toBe(true);

    // Force a same-station overlapping-window conflict -> plan invalid.
    // SAR1-P1 (120-870) and a re-assigned SAR2-P1 both on GW-01 do NOT overlap,
    // so instead assign SAR1-P2 window is disjoint; craft an overlap explicitly:
    mgr.assign('SAR2-P1', 'GW-01'); // GW-01 now has SAR1-P1 (120-870) and SAR2-P1 (1050-1890): disjoint, still valid
    expect(mgr.isPlanValid()).toBe(true);
  });

  it('detects a real same-station window conflict', () => {
    ScenarioManager.getInstance().settings = {
      ...natsEuSandboxData.settings,
      contactSchedule: {
        stationIds: ['GW-01'],
        requiredPriorityAtOrAbove: 1,
        contacts: [
          { id: 'A', satelliteNoradId: 61701, priority: 1, windowStartS: 0, windowEndS: 300 },
          { id: 'B', satelliteNoradId: 61702, priority: 1, windowStartS: 200, windowEndS: 500 },
        ],
      },
    };
    const mgr = ContactScheduleManager.getInstance();
    mgr.assign('A', 'GW-01');
    mgr.assign('B', 'GW-01');
    expect(mgr.getConflicts().length).toBe(1);
    expect(mgr.isPlanValid()).toBe(false);
  });
});

describe('nats-eu M4 - Space-domain events / ephemeris update', () => {
  it('ephemeris-updated latches only after a maneuver goes stale and is applied', () => {
    const mgr = SpaceEventManager.getInstance();

    // condition ephemeris-updated reads isEphemerisUpdated()
    expect(mgr.isEphemerisUpdated('SAR2-CAM')).toBe(false);

    // Applying before the maneuver fires is a no-op (nothing stale yet).
    mgr.applyEphemerisUpdate('SAR2-CAM');
    expect(mgr.getPhase('SAR2-CAM')).toBe('nominal');

    // Maneuver fires -> ephemeris stale (notice shown), still not updated.
    mgr.triggerManeuver('SAR2-CAM');
    expect(mgr.getPhase('SAR2-CAM')).toBe('stale');
    expect(mgr.getStaleEvents().map((e) => e.id)).toContain('SAR2-CAM');
    expect(mgr.isEphemerisUpdated('SAR2-CAM')).toBe(false);

    // Operator loads the updated ephemeris.
    mgr.applyEphemerisUpdate('SAR2-CAM');
    expect(mgr.getPhase('SAR2-CAM')).toBe('updated');
    expect(mgr.isEphemerisUpdated('SAR2-CAM')).toBe(true);
    expect(mgr.isEphemerisUpdated()).toBe(true); // no stale events remain
  });
});

describe('nats-eu M6 - SOC-lite security console', () => {
  it('audit-log-reviewed / security-event-acknowledged / access-control-set track operator actions', () => {
    const mgr = SecurityConsoleCore.getInstance();

    // condition audit-log-reviewed reads isReviewed
    expect(mgr.isReviewed).toBe(false);
    mgr.markReviewed();
    expect(mgr.isReviewed).toBe(true);

    // Two injected anomalies are present in the (t=0) visible log.
    const anomalies = mgr.getVisibleAnomalies(0).map((e) => e.id);
    expect(anomalies).toEqual(expect.arrayContaining(['evt-authfail', 'evt-replay']));

    // condition security-event-acknowledged reads isEventAcknowledged()
    expect(mgr.isEventAcknowledged('evt-replay')).toBe(false);
    mgr.acknowledge('evt-replay', 0);
    expect(mgr.isEventAcknowledged('evt-replay')).toBe(true);

    // condition access-control-set reads getAccountStatus() === target
    expect(mgr.getAccountStatus('op-guest')).toBe('active');
    mgr.setAccountStatus('op-guest', 'disabled');
    expect(mgr.getAccountStatus('op-guest')).toBe('disabled');
  });
});

describe('nats-eu M7 - TRANSEC anti-jam waveform', () => {
  it('transec-mode-set / transec-sync-locked require hopping mode + a loaded key', () => {
    const mgr = TransecManager.getInstance();

    // condition transec-mode-set reads isModeSet(); starts in fixed
    expect(mgr.isModeSet('fixed')).toBe(true);
    expect(mgr.isModeSet('hopping')).toBe(false);

    // condition transec-sync-locked reads isSyncLocked()
    mgr.setMode('hopping');
    expect(mgr.isModeSet('hopping')).toBe(true);
    expect(mgr.isSyncLocked()).toBe(false); // key not loaded yet (requireKey: true)

    mgr.loadKey();
    expect(mgr.isSyncLocked()).toBe(true);

    // Dropping back to fixed drops sync.
    mgr.setMode('fixed');
    expect(mgr.isSyncLocked()).toBe(false);
  });
});

describe('nats-eu M8 - GNSS spoofing / timing attack', () => {
  it('gpsdo-reference-mode-set clears spoof exposure; timing offset only drifts while trusting GNSS', () => {
    const mgr = GnssThreatManager.getInstance();

    // Before spoof: not exposed.
    expect(mgr.isExposedToSpoof).toBe(false);

    // Spoof begins while still trusting GNSS -> exposed, timing offset walks off.
    mgr.setSpoofActive(true);
    expect(mgr.isExposedToSpoof).toBe(true);
    mgr.advance(10);
    expect(mgr.state.timeOffsetUs).toBeGreaterThan(0); // the diagnostic tell

    // condition gpsdo-reference-mode-set reads isReferenceModeSet()
    expect(mgr.isReferenceModeSet('holdover')).toBe(false);
    mgr.setReferenceMode('holdover');
    expect(mgr.isReferenceModeSet('holdover')).toBe(true);

    // Now defended: no longer exposed and the offset stops accumulating.
    expect(mgr.isExposedToSpoof).toBe(false);
    const frozen = mgr.state.timeOffsetUs;
    mgr.advance(60);
    expect(mgr.state.timeOffsetUs).toBe(frozen);
  });
});
