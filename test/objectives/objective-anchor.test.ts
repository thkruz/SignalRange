/**
 * Objective-anchored event schedules (phase 19.0a). Every schedule-owning
 * manager takes startAfterObjectiveId: the event stays dormant however late
 * the player is, then runs its authored offset after the anchor objective is
 * live. Headless: mocked clock, objectives and scenario settings.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clock = vi.hoisted(() => ({ nowMs: 0 }));
const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));
const scenarioSettings = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
const crypto = vi.hoisted(() => ({ injectKeyMismatch: vi.fn() }));

vi.mock('@app/simulation/mission-clock', () => ({
  missionNowMs: () => clock.nowMs,
  getSkippedMs: () => 0,
}));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      groundStations: [],
      satellites: [],
      objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) },
    }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

vi.mock('@app/scenario-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/scenario-manager')>();
  return { ...actual, ScenarioManager: { getInstance: () => ({ settings: scenarioSettings.settings, data: { id: 'test' } }) } };
});

vi.mock('@app/equipment/crypto', () => ({
  CryptoModule: { getInstance: () => crypto },
}));

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { HardwareFaultManager } from '@app/faults/hardware-fault-manager';
import { GnssThreatManager } from '@app/gnss-threat/gnss-threat-manager';
import { InterferenceManager } from '@app/interference/interference-manager';
import { ObjectiveAnchors } from '@app/objectives/objective-anchor';
import { SecurityConsoleCore } from '@app/security-console/security-console-core';
import { TelemetryManager } from '@app/telemetry/telemetry-manager';
import type { Milliseconds } from 'ootk';

const at = (seconds: number) => {
  clock.nowMs = seconds * 1000;
  EventBus.getInstance().emit(Events.UPDATE, 16 as Milliseconds);
};
const setObjective = (id: string, isActive: boolean, isCompleted = false) => objectives.states.set(id, { isActive, isCompleted });

beforeEach(() => {
  clock.nowMs = 0;
  objectives.states.clear();
  scenarioSettings.settings = {};
  crypto.injectKeyMismatch.mockClear();
});

afterEach(() => {
  InterferenceManager.destroy();
  HardwareFaultManager.destroy();
  GnssThreatManager.destroy();
  TelemetryManager.destroy();
  SecurityConsoleCore.destroy();
});

describe('ObjectiveAnchors', () => {
  it('reads unanchored offsets as mission-start times', () => {
    const anchors = new ObjectiveAnchors([undefined]);
    expect(anchors.hasAnchors).toBe(false);
    expect(anchors.atS(300)).toBe(300);
  });

  it('holds an anchored start at Infinity until the objective is live, then counts from the poll that saw it', () => {
    const anchors = new ObjectiveAnchors(['observe']);
    setObjective('observe', false);
    anchors.poll(500);
    expect(anchors.atS(20, 'observe')).toBe(Number.POSITIVE_INFINITY);

    setObjective('observe', true);
    anchors.poll(1800);
    expect(anchors.atS(20, 'observe')).toBe(1820);

    // Stamped once: later polls and the objective completing do not move it
    setObjective('observe', false, true);
    anchors.poll(2500);
    expect(anchors.atS(20, 'observe')).toBe(1820);
  });

  it('counts a restored-complete anchor, so a refresh past it still gets the event', () => {
    const anchors = new ObjectiveAnchors(['observe']);
    setObjective('observe', false, true);
    anchors.poll(3);
    expect(anchors.atS(20, 'observe')).toBe(23);
  });
});

describe('anchored managers', () => {
  it('InterferenceManager: the envelope opens after the anchor and keeps its duration', () => {
    scenarioSettings.settings = {
      interferenceEvents: [
        {
          id: 'jam',
          frequency: 1e9,
          bandwidth: 1e6,
          power: -60,
          polarization: 'H',
          path: 'terrestrial',
          emitter: { latitude: 0, longitude: 0 },
          startAfterObjectiveId: 'command',
          startTime: 30,
          duration: 120,
          periodSeconds: 60,
          onSeconds: 60,
        },
      ],
    };
    setObjective('command', false);
    const manager = InterferenceManager.getInstance();

    for (const s of [0, 200, 900]) {
      at(s);
      expect(manager.isEventInEnvelope('jam')).toBe(false);
      expect(manager.hasEventEnded('jam')).toBe(false);
    }

    setObjective('command', true);
    at(1000); // window 1030..1150
    at(1029);
    expect(manager.isEventInEnvelope('jam')).toBe(false);
    at(1030);
    expect(manager.isEventInEnvelope('jam')).toBe(true);
    expect(manager.getActiveTerrestrialEmissions()).toHaveLength(1);
    at(1150);
    expect(manager.isEventInEnvelope('jam')).toBe(false);
    expect(manager.hasEventEnded('jam')).toBe(true);
  });

  it('HardwareFaultManager: trips after the anchor, however late', () => {
    scenarioSettings.settings = {
      hardwareFaultEvents: [{ id: 'key', groundStationId: 'GW-01', target: 'crypto-key-mismatch', startAfterObjectiveId: 'rekey', startTime: 15 }],
    };
    setObjective('rekey', false);
    const manager = HardwareFaultManager.getInstance();

    at(14_400);
    expect(manager.isTripped('key')).toBe(false);
    setObjective('rekey', true);
    at(20_000);
    at(20_014);
    expect(manager.isTripped('key')).toBe(false);
    at(20_015);
    expect(manager.isTripped('key')).toBe(true);
    expect(crypto.injectKeyMismatch).toHaveBeenCalledTimes(1);
  });

  it('GnssThreatManager: start and end both count from the anchor, keeping the spoof length', () => {
    scenarioSettings.settings = { gnssThreat: { spoofStartS: 480, spoofEndS: 2160, startAfterObjectiveId: 'probe' } };
    setObjective('probe', false);
    const manager = GnssThreatManager.getInstance();

    at(1000);
    expect(manager.state.spoofActive).toBe(false);
    setObjective('probe', true);
    at(1700); // spoof 2180..3860
    at(2179);
    expect(manager.state.spoofActive).toBe(false);
    at(2180);
    expect(manager.state.spoofActive).toBe(true);
    at(3859);
    expect(manager.state.spoofActive).toBe(true);
    at(3860);
    expect(manager.state.spoofActive).toBe(false);
  });

  it('TelemetryManager: an excursion ramps from the anchored start', () => {
    scenarioSettings.settings = {
      telemetry: {
        groundStationId: 'GW-01',
        satelliteNoradId: 1,
        channels: [{ id: 'rpm', label: 'Wheel', unit: 'rpm', subsystem: 'ADCS', nominal: 2000 }],
        excursions: [{ id: 'transient', channelId: 'rpm', startAfterObjectiveId: 'watch', startTime: 60, duration: 60, rampToValue: 5000, rampSeconds: 0 }],
      },
    };
    setObjective('watch', false);
    const manager = TelemetryManager.getInstance();
    const rpm = scenarioSettings.settings.telemetry as { channels: Parameters<TelemetryManager['valueAt']>[0][] };

    at(300);
    expect(manager.valueAt(rpm.channels[0], 300)).toBe(2000);
    setObjective('watch', true);
    at(900); // excursion 960..1020
    expect(manager.valueAt(rpm.channels[0], 959)).toBe(2000);
    expect(manager.valueAt(rpm.channels[0], 960)).toBe(5000);
    expect(manager.valueAt(rpm.channels[0], 1020)).toBe(2000);
  });

  it('SecurityConsoleCore: an anchored entry appears timeS after its objective, others keep mission time', () => {
    scenarioSettings.settings = {
      security: {
        accounts: [],
        events: [
          { id: 'routine', timeS: 60, actor: 'ops', action: 'login', category: 'auth', severity: 'info' },
          { id: 'export', timeS: 30, startAfterObjectiveId: 'flag', actor: 'x', action: 'export', category: 'config', severity: 'critical', isAnomaly: true },
        ],
      },
    };
    setObjective('flag', false);
    const core = SecurityConsoleCore.getInstance();

    at(1980);
    expect(core.getVisibleLog().map((e) => e.id)).toEqual(['routine']);
    setObjective('flag', true);
    at(2400); // export visible from 2430
    expect(core.hasUnacknowledgedAnomaly()).toBe(false);
    at(2430);
    expect(core.getVisibleLog().map((e) => e.id)).toEqual(['routine', 'export']);
    expect(core.hasUnacknowledgedAnomaly()).toBe(true);
  });
});

describe('end anchors', () => {
  it('InterferenceManager: an end-anchored carrier stays up until its objective, then runs endOffsetS more', () => {
    scenarioSettings.settings = {
      interferenceEvents: [
        {
          id: 'carrier',
          frequency: 1e9,
          bandwidth: 1e6,
          power: -60,
          polarization: 'H',
          path: 'terrestrial',
          emitter: { latitude: 0, longitude: 0 },
          startTime: 20,
          duration: 1500,
          endAfterObjectiveId: 'trail-cold',
          endOffsetS: 90,
          periodSeconds: 60,
          onSeconds: 60,
        },
      ],
    };
    setObjective('trail-cold', false);
    const manager = InterferenceManager.getInstance();

    at(20);
    expect(manager.isEventInEnvelope('carrier')).toBe(true);
    at(5000); // well past the authored 1520 end
    expect(manager.isEventInEnvelope('carrier')).toBe(true);
    setObjective('trail-cold', true);
    at(6000); // ends 6090
    at(6089);
    expect(manager.isEventInEnvelope('carrier')).toBe(true);
    at(6090);
    expect(manager.isEventInEnvelope('carrier')).toBe(false);
    expect(manager.hasEventEnded('carrier')).toBe(true);
  });

  it('HardwareFaultManager: an end-anchored fault clears after its objective, however late', () => {
    scenarioSettings.settings = {
      hardwareFaultEvents: [
        { id: 'key', groundStationId: 'GW-01', target: 'crypto-key-mismatch', startTime: 100, duration: 500, endAfterObjectiveId: 'recovered', endOffsetS: 45 },
      ],
    };
    setObjective('recovered', false);
    const manager = HardwareFaultManager.getInstance();

    at(100);
    expect(manager.isTripped('key')).toBe(true);
    at(700); // the authored end (600) has passed; the anchor has not come up
    expect(manager.isCleared('key')).toBe(false);
    setObjective('recovered', true);
    at(1400); // clears 1445
    at(1444);
    expect(manager.isCleared('key')).toBe(false);
    at(1445);
    expect(manager.isCleared('key')).toBe(true);
  });

  it('GnssThreatManager: an end anchor can end the spoof before its authored end', () => {
    scenarioSettings.settings = { gnssThreat: { spoofStartS: 480, spoofEndS: 2160, endAfterObjectiveId: 'all-clear', endOffsetS: 150 } };
    setObjective('all-clear', false);
    const manager = GnssThreatManager.getInstance();

    at(480);
    expect(manager.state.spoofActive).toBe(true);
    setObjective('all-clear', true);
    at(1600); // ends 1750, before the authored 2160
    at(1749);
    expect(manager.state.spoofActive).toBe(true);
    at(1750);
    expect(manager.state.spoofActive).toBe(false);
  });
});
