import { vi } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';
import { OpsLogManager } from '../../../src/ops-log/ops-log-manager';
import { assetSelectionState } from '../../../src/pages/mission-control/asset-selection-state';
import { resetMissionClock } from '../../../src/simulation/mission-clock';
import { getSimulatedNowMs } from '../../../src/simulation/sim-time';
import { TimeSkipController } from '../../../src/simulation/time-skip-controller';

const mockSatellites: unknown[] = [];
let mockSettings: Record<string, unknown> = {};

vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    hasInstance: () => true,
    getInstance: () => ({
      satellites: mockSatellites,
      registry: { get: (n: number) => (mockSatellites as Array<{ noradId: number }>).find((s) => s.noradId === n) },
      groundStations: [],
    }),
  },
}));
vi.mock('../../../src/scenario-manager', () => ({ ScenarioManager: { getInstance: () => ({ settings: mockSettings }) } }));

import { hamTechS11Data } from '../../../src/campaigns/ham-sdr/tech/s11-a-contact-through-space';
import type { OrbitalSatellite } from '../../../src/equipment/satellite/orbital-satellite';

/**
 * S11 missed pass: the first CUBEHOP-UV pass is 5 to 17.5 minutes after start. If the player is not ready,
 * the next real pass is about 100 minutes away, so the scenario offers the skip control to reach it.
 */
describe('C3 S11 missed pass recovery', () => {
  const sat = hamTechS11Data.settings.satellites[0] as OrbitalSatellite;
  const s = hamTechS11Data.settings;
  const startMs = Date.parse(`${s.scenarioStartDate}T${s.scenarioStartWallTime}Z`);

  beforeEach(() => {
    EventBus.destroy();
    OpsLogManager.destroy();
    TimeSkipController.destroy();
    resetMissionClock();
    mockSatellites.length = 0;
    mockSatellites.push(sat);
    assetSelectionState.groundStationId = null;
    mockSettings = { ...s };
    EventBus.getInstance();
    OpsLogManager.initialize(s.scenarioStartWallTime ?? '16:13:00', s.scenarioStartDate ?? '2027-06-19');
    OpsLogManager.getInstance().resume();
  });

  afterEach(() => {
    TimeSkipController.destroy();
    OpsLogManager.destroy();
    EventBus.destroy();
    resetMissionClock();
  });

  it('declares the skip block and offers nothing while the first pass is still coming', () => {
    expect(s.timeSkip).toBeDefined();
    expect(TimeSkipController.getInstance().findTarget()).toBeNull();
  });

  it('offers the next pass after LOS, and that pass is workable', () => {
    const controller = TimeSkipController.getInstance();
    // 1100 s after start: the first pass (300 to 1050 s) has set without the player completing anything
    OpsLogManager.getInstance().advanceClock(1100_000);
    const target = controller.findTarget();
    expect(target).not.toBeNull();
    const aosS = (target!.aosMs - startMs) / 1000;
    expect(aosS).toBeGreaterThan(6000);
    expect(aosS).toBeLessThan(6200);
    expect(target!.targetMs).toBe(target!.aosMs - 180_000);
    expect(controller.start(target!)).toBe(true);
    controller.step(controller.animationMs);
    expect(Math.abs(getSimulatedNowMs() - target!.targetMs)).toBeLessThan(1000);
    // the pass the skip stops before peaks well above the horizon
    const peak = Math.max(
      ...Array.from({ length: 70 }, (_, i) => {
        const rae = sat.ootkSatellite.rae(sat.groundObserver, new Date(target!.aosMs + i * 10_000));

        return rae ? (rae.el as number) : -90;
      })
    );
    expect(peak).toBeGreaterThan(10);
  });
});
