import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 35 F-A: settings.commanding seeds the COMSEC unit (key id, status, life)
 * so the TX Chain and RX payload panels show the scenario's key, and a confirmed
 * rotation moves both to the rotated id.
 */
const commandingConfig: Record<string, unknown> = {};
vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: { getInstance: () => ({ settings: { commanding: commandingConfig } }) },
}));

const { CommandingManager } = await import('../../src/commanding/commanding-manager');
const { CryptoModule } = await import('../../src/equipment/crypto/crypto-module-core');

describe('commanding key seeding', () => {
  afterEach(() => {
    for (const k of Object.keys(commandingConfig)) delete commandingConfig[k];
    (CommandingManager as unknown as { instance_: unknown }).instance_ = null;
    CryptoModule.resetInstance();
  });

  it('seeds the crypto key id, status and life from settings.commanding', () => {
    Object.assign(commandingConfig, { keyId: 'KILO-2027-0113', initialKeyStatus: 'Pending Rotation', keyExpiresInDays: 4 });
    const mgr = CommandingManager.getInstance();
    const s = CryptoModule.getInstance().state;
    expect(s.keyId).toBe('KILO-2027-0113');
    expect(s.keyStatus).toBe('Pending Rotation');
    expect(s.keyExpiresInDays).toBe(4);
    expect(mgr.state.keyStatus).toBe('Pending Rotation');
  });

  it('leaves the default key alone when nothing is authored', () => {
    CommandingManager.getInstance();
    expect(CryptoModule.hasInstance()).toBe(false);
  });

  it('loads the authored post-rotation key life', () => {
    Object.assign(commandingConfig, { keyId: 'K1', rotatedKeyId: 'K2', initialKeyStatus: 'Pending Rotation', keyExpiresInDays: 4, rotatedKeyValidDays: 63 });
    CommandingManager.getInstance().completeKeyRotation();
    expect(CryptoModule.getInstance().state.keyExpiresInDays).toBe(63);
  });

  it('moves the crypto unit to the rotated id when the rotation completes', () => {
    Object.assign(commandingConfig, { keyId: 'KILO-2027-0113', rotatedKeyId: 'KILO-2027-0114', initialKeyStatus: 'Pending Rotation', keyExpiresInDays: 4 });
    const mgr = CommandingManager.getInstance();
    mgr.completeKeyRotation();
    const s = CryptoModule.getInstance().state;
    expect(s.keyId).toBe('KILO-2027-0114');
    expect(s.keyStatus).toBe('Valid');
    expect(s.keyExpiresInDays).toBe(90);
  });
});
