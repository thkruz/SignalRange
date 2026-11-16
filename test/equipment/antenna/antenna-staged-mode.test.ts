/**
 * Phase 29 D4 (nats-r3-s11-F2): STOW/MAINT picked on the ACU stage with their
 * park elevation; the applied mode keeps running until APPLY commits both.
 */
import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore, AntennaState } from '../../../src/equipment/antenna/antenna-core';

vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      update: vi.fn(),
      draw: vi.fn(),
      sync: vi.fn(),
      getSatByNoradId: vi.fn(),
      getSatsByAzEl: () => [],
      satellites: [],
      isDeveloperMode: false,
    })),
    destroy: vi.fn(),
  },
}));

vi.mock('../../../src/events/event-bus', () => ({
  EventBus: {
    getInstance: vi.fn(() => ({
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    })),
  },
}));

class HeadlessAntenna extends AntennaCore {
  constructor(initialState: Partial<AntennaState> = {}) {
    super(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, initialState, 1, 1);
  }

  protected override addListeners_(): void {
    // headless
  }

  syncDomWithState(): void {
    // headless
  }

  draw(): void {
    // headless
  }
}

describe('AntennaCore staged STOW/MAINT (phase 29 D4)', () => {
  let antenna: HeadlessAntenna;

  beforeEach(() => {
    antenna = new HeadlessAntenna({ trackingMode: 'program-track', elevation: 34 as never, targetElevation: 34 as never, isLocked: true });
  });

  it('MAINT stages the mode and El 5 while the applied mode keeps running', () => {
    antenna.stageTrackingModeChange('maintenance');

    expect(antenna.state.trackingMode).toBe('program-track');
    expect(antenna.state.isLocked).toBe(true);
    expect(antenna.state.stagedTrackingMode).toBe('maintenance');
    expect(antenna.state.stagedTargetElevation).toBe(5);
    expect(antenna.state.hasStagedChanges).toBe(true);
    expect(antenna.state.targetElevation).toBe(34);
  });

  it('APPLY commits the staged mode and the park elevation together', () => {
    antenna.stageTrackingModeChange('maintenance');
    antenna.applyChanges();

    expect(antenna.state.trackingMode).toBe('maintenance');
    expect(antenna.state.stagedTrackingMode).toBeNull();
    expect(antenna.state.isLocked).toBe(false);
    expect(antenna.state.targetElevation).toBe(5);
    expect(antenna.state.stagedTargetElevation).toBeNull();
    expect(antenna.state.hasStagedChanges).toBe(false);
  });

  it('STOW stages El 90; discard drops it and the applied mode stays', () => {
    antenna.stageTrackingModeChange('stow');
    expect(antenna.state.stagedTargetElevation).toBe(90);

    antenna.discardChanges();
    expect(antenna.state.trackingMode).toBe('program-track');
    expect(antenna.state.stagedTrackingMode).toBeNull();
    expect(antenna.state.hasStagedChanges).toBe(false);
  });

  it('MANUAL and PROGRAM switch at once and drop a staged park mode', () => {
    antenna.stageTrackingModeChange('maintenance');
    antenna.stageTrackingModeChange('manual');

    expect(antenna.state.trackingMode).toBe('manual');
    expect(antenna.state.stagedTrackingMode).toBeNull();
    expect(antenna.state.stagedTargetElevation).toBeNull();
  });

  it('does nothing while unpowered', () => {
    antenna.state.isPowered = false;
    antenna.stageTrackingModeChange('stow');

    expect(antenna.state.stagedTrackingMode ?? null).toBeNull();
    expect(antenna.state.trackingMode).toBe('program-track');
  });
});
