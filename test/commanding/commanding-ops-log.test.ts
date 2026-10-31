import { beforeEach, describe, expect, it, vi } from 'vitest';

/** CommandingManager Ops Log lines and key id (Phase 35 s03-F2, s21-F3). */
const commandingConfig: Record<string, unknown> = {};
vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: { getInstance: () => ({ settings: { commanding: commandingConfig } }) },
}));
vi.mock('../../src/simulation/mission-clock', () => ({ missionNowMs: () => 0 }));
vi.mock('../../src/interference/interference-manager', () => ({ InterferenceManager: { isInitialized: () => false } }));
vi.mock('../../src/simulation/simulation-manager', () => ({ SimulationManager: { hasInstance: () => false } }));
vi.mock('../../src/equipment/satellite/orbital-satellite', () => ({ OrbitalSatellite: class {}, observerFromLocation: () => ({}) }));
vi.mock('../../src/transec/transec-manager', () => ({ TransecManager: { isInitialized: () => false } }));

const logged: Array<{ message: string; category: string }> = [];
vi.mock('../../src/ops-log/ops-log-manager', () => ({
  OpsLogManager: {
    isInitialized: () => true,
    getInstance: () => ({ log: (message: string, category: string) => logged.push({ message, category }) }),
  },
}));

const { CommandingManager } = await import('../../src/commanding/commanding-manager');

describe('CommandingManager Ops Log', () => {
  beforeEach(() => {
    CommandingManager.destroy();
    logged.length = 0;
    for (const k of Object.keys(commandingConfig)) delete commandingConfig[k];
    Object.assign(commandingConfig, { keyId: 'KEY-2027-Q2', rotatedKeyId: 'KEY-2027-Q2b' });
  });

  it('logs Doppler comp engage and the command send and ACK', () => {
    const mgr = CommandingManager.getInstance();
    mgr.setDopplerComp(true);
    mgr.sendCommand('REC-PLAYBACK', 0);
    expect(logged.map((l) => l.message)).toEqual(['Uplink Doppler compensation engaged', 'Command REC-PLAYBACK sent, ACK received']);
  });

  it('logs a rejection as an alert', () => {
    CommandingManager.getInstance().sendCommand('HK-DUMP', 0);
    expect(logged[0]).toEqual({ message: 'Command HK-DUMP sent, rejected: Doppler compensation off', category: 'alert' });
  });

  it('shows the key id and swaps it on confirmed rotation', () => {
    const mgr = CommandingManager.getInstance();
    expect(mgr.state.keyId).toBe('KEY-2027-Q2');
    mgr.beginKeyRotation();
    mgr.completeKeyRotation();
    expect(mgr.state.keyId).toBe('KEY-2027-Q2b');
    expect(logged.at(-1)?.message).toContain('KEY-2027-Q2 retired, KEY-2027-Q2b in use');
  });
});
