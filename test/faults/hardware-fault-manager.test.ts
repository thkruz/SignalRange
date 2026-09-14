/**
 * HardwareFaultManager: scenario-staged equipment faults on the mission clock
 * (phase 16, E3). Headless: mocked clock, simulation and crypto module; each
 * target is checked for trip time, fire-once, timed clear and station scoping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clock = vi.hoisted(() => ({ nowMs: 0 }));
const sim = vi.hoisted(() => ({ groundStations: [] as unknown[] }));
const scenarioSettings = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
const crypto = vi.hoisted(() => ({ injectKeyMismatch: vi.fn() }));
const opsLog = vi.hoisted(() => ({ initialized: false, log: vi.fn() }));

vi.mock('@app/simulation/mission-clock', () => ({
  missionNowMs: () => clock.nowMs,
  addSkippedTime: () => undefined,
  getSkippedMs: () => 0,
}));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ groundStations: sim.groundStations, satellites: [] }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

vi.mock('@app/scenario-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/scenario-manager')>();
  return { ...actual, ScenarioManager: { getInstance: () => ({ settings: scenarioSettings.settings }) } };
});

vi.mock('@app/equipment/crypto', () => ({
  CryptoModule: { getInstance: () => crypto },
}));

vi.mock('@app/ops-log/ops-log-manager', () => ({
  OpsLogManager: {
    isInitialized: () => opsLog.initialized,
    getInstance: () => ({ log: opsLog.log }),
  },
}));

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { type HardwareFaultEventConfig, HardwareFaultManager } from '@app/faults/hardware-fault-manager';
import type { Milliseconds } from 'ootk';

const tick = () => EventBus.getInstance().emit(Events.UPDATE, 16 as Milliseconds);
const at = (seconds: number) => {
  clock.nowMs = seconds * 1000;
  tick();
};

function station(id: string) {
  const modems = [
    { modem_number: 1, isPowered: true, isFaulted: false, isTransmitting: true, isTransmittingSwitchUp: true },
    { modem_number: 2, isPowered: true, isFaulted: false, isTransmitting: false, isTransmittingSwitchUp: false },
  ];
  const buc = { state: { temperature: 41 }, setThermalOffset: vi.fn() };
  const gpsdo = { setGnssSignalPresent: vi.fn() };
  return {
    state: { id },
    transmitters: [{ state: { activeModem: 1, modems } }],
    rfFrontEnds: [{ bucModule: buc, gpsdoModule: gpsdo }],
    modems,
    buc,
    gpsdo,
  };
}

function boot(events: HardwareFaultEventConfig[]) {
  const gw = station('GW-01');
  const sh = station('SH-02');
  sim.groundStations = [gw, sh];
  scenarioSettings.settings = { hardwareFaultEvents: events };
  clock.nowMs = 0;
  const manager = HardwareFaultManager.getInstance();
  return { manager, gw, sh };
}

describe('HardwareFaultManager', () => {
  beforeEach(() => {
    crypto.injectKeyMismatch.mockClear();
    opsLog.log.mockClear();
    opsLog.initialized = false;
  });

  afterEach(() => {
    HardwareFaultManager.destroy();
    EventBus.destroy();
    sim.groundStations = [];
  });

  it('defaults to the Campaign 4 tx-modem trip and fires once', () => {
    const { manager, gw } = boot([{ id: 'primary', groundStationId: 'GW-01', modemNumber: 1, startTime: 120 }]);

    at(119);
    expect(manager.isTripped('primary')).toBe(false);
    expect(gw.modems[0].isFaulted).toBe(false);

    at(120);
    expect(manager.isTripped('primary')).toBe(true);
    expect(gw.modems[0]).toMatchObject({ isFaulted: true, isTransmitting: false, isTransmittingSwitchUp: false });
    expect(gw.modems[1].isFaulted).toBe(false);

    gw.modems[0].isFaulted = false;
    at(500);
    expect(gw.modems[0].isFaulted).toBe(false);
  });

  it('stages a BUC cooling fault on the named station only, jumps the reading, and clears it after the duration', () => {
    const { manager, gw, sh } = boot([
      { id: 'sh-buc', groundStationId: 'SH-02', target: 'buc-overtemp', startTime: 60, duration: 300, params: { deltaC: 35, startTemperatureC: 68 } },
    ]);

    at(59);
    expect(sh.buc.setThermalOffset).not.toHaveBeenCalled();

    at(60);
    expect(manager.isTripped('sh-buc')).toBe(true);
    expect(sh.buc.setThermalOffset).toHaveBeenCalledWith(35);
    expect(sh.buc.state.temperature).toBe(68);
    expect(gw.buc.setThermalOffset).not.toHaveBeenCalled();
    expect(manager.isCleared('sh-buc')).toBe(false);

    at(359);
    expect(manager.isCleared('sh-buc')).toBe(false);

    at(360);
    expect(manager.isCleared('sh-buc')).toBe(true);
    expect(sh.buc.setThermalOffset).toHaveBeenLastCalledWith(0);
    expect(sh.buc.setThermalOffset).toHaveBeenCalledTimes(2);

    at(1000);
    expect(sh.buc.setThermalOffset).toHaveBeenCalledTimes(2);
  });

  it('uses the default 40 degC cooling fault and never clears without a duration', () => {
    const { manager, gw } = boot([{ id: 'gw-buc', groundStationId: 'GW-01', target: 'buc-overtemp', startTime: 10 }]);

    at(10);
    expect(gw.buc.setThermalOffset).toHaveBeenCalledWith(40);
    at(100_000);
    expect(manager.isCleared('gw-buc')).toBe(false);
    expect(gw.buc.setThermalOffset).toHaveBeenCalledTimes(1);
  });

  it('drops the GNSS signal and restores it when the outage ends', () => {
    const { manager, gw } = boot([{ id: 'gnss', groundStationId: 'GW-01', target: 'gpsdo-gnss-loss', startTime: 30, duration: 600 }]);

    at(30);
    expect(gw.gpsdo.setGnssSignalPresent).toHaveBeenCalledWith(false);

    at(629);
    expect(manager.isCleared('gnss')).toBe(false);

    at(630);
    expect(gw.gpsdo.setGnssSignalPresent).toHaveBeenLastCalledWith(true);
    expect(manager.isCleared('gnss')).toBe(true);
  });

  it('puts the crypto key into Mismatch once', () => {
    boot([{ id: 'key', groundStationId: 'GW-01', target: 'crypto-key-mismatch', startTime: 45 }]);

    at(44);
    expect(crypto.injectKeyMismatch).not.toHaveBeenCalled();
    at(45);
    at(46);
    expect(crypto.injectKeyMismatch).toHaveBeenCalledTimes(1);
  });

  it('writes a labelled trip to the ops log as an alert, and stays silent without a label', () => {
    opsLog.initialized = true;
    boot([
      { id: 'loud', groundStationId: 'SH-02', target: 'buc-overtemp', startTime: 5, label: 'SH-02 BUC over-temperature' },
      { id: 'quiet', groundStationId: 'GW-01', target: 'gpsdo-gnss-loss', startTime: 5 },
    ]);

    at(5);
    expect(opsLog.log).toHaveBeenCalledTimes(1);
    expect(opsLog.log).toHaveBeenCalledWith('SH-02 BUC over-temperature', 'alert', 'SH-02');
  });

  it('waits for equipment that does not exist yet instead of marking the fault tripped', () => {
    const { manager } = boot([{ id: 'late', groundStationId: 'NOPE-01', target: 'buc-overtemp', startTime: 1 }]);

    at(1);
    expect(manager.isTripped('late')).toBe(false);
  });
});
