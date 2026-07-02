import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { PassPlannerService } from '@app/services/pass-planner-service';
import { dB, dBm, FECType, Hertz, IfSignal, MHz, ModulationType, RfFrequency, RfSignal } from '@app/types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore, AntennaState } from '../../src/equipment/antenna/antenna-core';
import { Receiver } from '../../src/equipment/receiver/receiver';
import { SignalOrigin } from '../../src/signal-origin';

// Mock SimulationManager (antenna pulls satellites from it during update)
vi.mock('../../src/simulation/simulation-manager', () => ({
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

/** Concrete AntennaCore exposing the private RF math under test */
class TestableAntenna extends AntennaCore {
  constructor(configId: ANTENNA_CONFIG_KEYS, initialState: Partial<AntennaState> = {}) {
    super(configId, initialState, 1, 1);
  }

  protected override addListeners_(): void { /* headless */ }
  syncDomWithState(): void { /* headless */ }
  draw(): void { /* headless */ }

  gainAt(fHz: number): number {
    return (this as any).antennaGain_dBi(fHz as Hertz);
  }
  beamwidthAt(fHz: number): number {
    return (this as any).beamwidth3dB_deg_(fHz);
  }
  patternGainAt(thetaDeg: number, fHz: number): number {
    return (this as any).patternGain_dBi_(thetaDeg, fHz);
  }
  polLoss(signalPol: 'H' | 'V' | 'RHCP' | 'LHCP', mismatchDeg: number = 0): number {
    return (this as any).polMismatchLoss_dB_(signalPol, this.config.polType ?? 'linear', mismatchDeg as Degrees);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Campaign 3: fixed-gain antenna model', () => {
  it('uses configured gain/beamwidth for the QFH instead of dish math', () => {
    const qfh = new TestableAntenna(ANTENNA_CONFIG_KEYS.VHF_QFH_137);

    expect(qfh.gainAt(137.1e6)).toBe(3.0);
    expect(qfh.beamwidthAt(137.1e6)).toBe(140);
    // Boresight pattern gain equals fixed gain
    expect(qfh.patternGainAt(0, 137.1e6)).toBe(3.0);
    // 60 deg off axis is still inside the fat main lobe (drop = 12*(60/140)^2 ~ 2.2 dB)
    expect(qfh.patternGainAt(60, 137.1e6)).toBeCloseTo(3.0 - 12 * (60 / 140) ** 2, 3);
  });

  it('caps off-axis rolloff at the front-to-back ratio for the yagi', () => {
    const yagi = new TestableAntenna(ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM);

    expect(yagi.gainAt(435.25e6)).toBe(12.0);
    expect(yagi.beamwidthAt(435.25e6)).toBe(40);
    // Way off the back: capped at fixedFrontToBack_dB (18), not the dish sidelobe envelope
    expect(yagi.patternGainAt(180, 435.25e6)).toBe(12.0 - 18);
  });

  it('does not change parabolic antenna math (gainModel absent)', () => {
    const dish = new TestableAntenna(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK);

    // Same formula as before the change: eta * (pi*D/lambda)^2 with Ruze/blockage
    const gain = dish.gainAt(4e9);
    expect(gain).toBeGreaterThan(48);
    expect(gain).toBeLessThan(52);
    // HPBW = k*lambda/D
    expect(dish.beamwidthAt(4e9)).toBeCloseTo((70 * (3e8 / 4e9)) / 9.0, 6);
  });
});

describe('Campaign 3: circular polarization handedness', () => {
  it('charges the configured cross-pol loss for wrong handedness', () => {
    const yagi = new TestableAntenna(ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM, {
      circularHandedness: 'RHCP',
    });

    expect(yagi.polLoss('RHCP')).toBe(0.5);  // matched
    expect(yagi.polLoss('LHCP')).toBe(18);   // wrong handedness: circularCrossPolLoss_dB
  });

  it('switches discrimination with the handedness state', () => {
    const yagi = new TestableAntenna(ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM, {
      circularHandedness: 'RHCP',
    });

    yagi.handleCircularHandednessChange('LHCP');
    expect(yagi.state.circularHandedness).toBe('LHCP');
    expect(yagi.polLoss('LHCP')).toBe(0.5);
    expect(yagi.polLoss('RHCP')).toBe(18);
  });

  it('preserves legacy circular behavior when handedness is not set', () => {
    // X_BAND_3M_ANTESTAR_RS: circular polType, no circularCrossPolLoss_dB, no
    // handedness in state -> any circular signal is matched (0.5 dB), as before
    const legacy = new TestableAntenna(ANTENNA_CONFIG_KEYS.X_BAND_3M_ANTESTAR_RS);

    expect(legacy.polLoss('RHCP')).toBe(0.5);
    expect(legacy.polLoss('LHCP')).toBe(0.5);
  });
});

describe('Campaign 3: authored pass timing (Riley backyard, 2027-06-19 16:00 UTC)', () => {
  const SCENARIO_START_MS = Date.UTC(2027, 5, 19, 16, 0, 0);
  const MINUTE_MS = 60 * 1000;
  const OBSERVER = { lat: 44.48 as Degrees, lon: -73.21 as Degrees, alt: 0.05 as Kilometers };
  const planner = new PassPlannerService();

  const wxsat = new OrbitalSatellite('WXSAT-19', 63001, [], [], {
    tle1: '1 63001U 27042A   27170.66666667  .00001000  00000-0  10000-3 0  9996' as TleLine1,
    tle2: '2 63001  98.7000 242.0000 0010000  90.0000   6.0000 14.19000000123450' as TleLine2,
    observer: OBSERVER,
  });

  const cubehop = new OrbitalSatellite('CUBEHOP-1', 63002, [], [], {
    tle1: '1 63002U 27042A   27170.66666667  .00001000  00000-0  10000-3 0  9997' as TleLine1,
    tle2: '2 63002  97.5000  94.0000 0010000  90.0000 226.0000 14.90000000123456' as TleLine2,
    observer: OBSERVER,
  });

  const navstar = new OrbitalSatellite('NAVSTAR-77', 63003, [], [], {
    tle1: '1 63003U 27042A   27170.66666667  .00001000  00000-0  10000-3 0  9998' as TleLine1,
    tle2: '2 63003  55.0000  32.0000 0010000  90.0000 328.0000  2.00565000123455' as TleLine2,
    observer: OBSERVER,
  });

  it('WXSAT-19: AOS ~T+3.0 min with a high pass for the QFH', () => {
    const passes = planner.getPasses(wxsat, SCENARIO_START_MS, { horizonHours: 1 });

    expect(passes.length).toBeGreaterThanOrEqual(1);
    expect(passes[0].aosMs).toBeGreaterThan(SCENARIO_START_MS + 2 * MINUTE_MS);
    expect(passes[0].aosMs).toBeLessThan(SCENARIO_START_MS + 4 * MINUTE_MS);
    expect(passes[0].losMs).toBeGreaterThan(SCENARIO_START_MS + 17 * MINUTE_MS);
    expect(passes[0].losMs).toBeLessThan(SCENARIO_START_MS + 19.5 * MINUTE_MS);
    expect(passes[0].maxEl).toBeGreaterThan(50);
  });

  it('CUBEHOP-1: AOS ~T+18 min for the yagi second act', () => {
    const passes = planner.getPasses(cubehop, SCENARIO_START_MS, { horizonHours: 1 });

    expect(passes.length).toBeGreaterThanOrEqual(1);
    expect(passes[0].aosMs).toBeGreaterThan(SCENARIO_START_MS + 17 * MINUTE_MS);
    expect(passes[0].aosMs).toBeLessThan(SCENARIO_START_MS + 19 * MINUTE_MS);
    expect(passes[0].maxEl).toBeGreaterThan(40);
  });

  it('NAVSTAR-77 (MEO): already high overhead at scenario start and stays up for hours', () => {
    const elAtStart = navstar.ootkSatellite.rae(navstar.groundObserver, new Date(SCENARIO_START_MS)).el;
    const elAtHour = navstar.ootkSatellite.rae(navstar.groundObserver, new Date(SCENARIO_START_MS + 60 * MINUTE_MS)).el;

    expect(elAtStart).toBeGreaterThan(80);
    expect(elAtHour).toBeGreaterThan(45);
  });
});

describe('Campaign 3: receiver AFC', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
  });

  function createReceiver(): Receiver {
    return new Receiver('test-root', [], {
      modems: [{
        modemNumber: 1,
        antenna_id: 1,
        frequency: 435.25 as MHz,
        bandwidth: 0.03 as MHz,
        modulation: 'QPSK' as ModulationType,
        fec: '1/2' as FECType,
        isPowered: true,
        isAfcEnabled: true,
      }],
    } as any);
  }

  function mockSignalInfo(receiver: Receiver, offsetHz: number, hasCarrier = true): void {
    vi.spyOn(receiver, 'getSignalsInBandwidth').mockReturnValue({
      hasCarrier,
      hasLock: hasCarrier,
      actualModulation: 'QPSK' as ModulationType,
      configuredModulation: 'QPSK' as ModulationType,
      cnRatio_dB: 20,
      frequencyOffset_Hz: offsetHz,
      modulationMismatch: false,
      fecMismatch: false,
    });
  }

  it('slews the modem toward the carrier, rate-limited to 200 Hz per tick', () => {
    const receiver = createReceiver();
    mockSignalInfo(receiver, 5000); // carrier 5 kHz above the VFO

    receiver.update();
    expect(receiver.state.modems[0].frequency).toBeCloseTo(435.25 + 200 / 1e6, 9);

    receiver.update();
    expect(receiver.state.modems[0].frequency).toBeCloseTo(435.25 + 400 / 1e6, 9);
  });

  it('takes the final sub-step and holds inside the deadband', () => {
    const receiver = createReceiver();
    mockSignalInfo(receiver, -150); // 150 Hz low: single partial step

    receiver.update();
    expect(receiver.state.modems[0].frequency).toBeCloseTo(435.25 - 150 / 1e6, 9);

    mockSignalInfo(receiver, -5); // inside the 10 Hz deadband: hold
    receiver.update();
    expect(receiver.state.modems[0].frequency).toBeCloseTo(435.25 - 150 / 1e6, 9);
  });

  it('applies modem config changes (mode/FEC/bandwidth) via the SDR console handler', () => {
    const receiver = createReceiver();

    receiver.handleModemConfigChange(1, { modulation: 'BPSK' as ModulationType, fec: '3/4' as FECType, bandwidthMHz: 0.05 });

    const modem = receiver.state.modems[0];
    expect(modem.modulation).toBe('BPSK');
    expect(modem.fec).toBe('3/4');
    expect(modem.bandwidth).toBeCloseTo(0.05, 9);

    // Invalid bandwidth is ignored, partial updates leave other fields alone
    receiver.handleModemConfigChange(1, { bandwidthMHz: -1 });
    expect(modem.bandwidth).toBeCloseTo(0.05, 9);
    receiver.handleModemConfigChange(1, { fec: '1/2' as FECType });
    expect(modem.modulation).toBe('BPSK');
    expect(modem.fec).toBe('1/2');
  });

  it('does nothing without a carrier or when AFC is off', () => {
    const receiver = createReceiver();
    mockSignalInfo(receiver, 5000, false); // no carrier
    receiver.update();
    expect(receiver.state.modems[0].frequency).toBe(435.25);

    receiver.handleAfcToggle(1, false);
    mockSignalInfo(receiver, 5000, true);
    receiver.update();
    expect(receiver.state.modems[0].frequency).toBe(435.25);
  });
});

describe('Campaign 3: LNB direct sampling', () => {
  // Minimal fake front end: LNBModuleCore only touches omt/buc/gpsdo via getters
  // we stub, so exercise the core class directly through a tiny subclass.
  it('passes RF through unmixed with the wide SDR passband', async () => {
    const { LNBModuleCore } = await import('../../src/equipment/rf-front-end/lnb-module/lnb-module-core');

    class TestableLNB extends LNBModuleCore {
      initializeDom(): HTMLElement { return document.createElement('div'); }
      protected addListeners_(): void { /* headless */ }
      syncDomWithState_(): void { /* headless */ }
      draw(): void { /* headless */ }
      syncDomWithState(): void { /* headless */ }
      get rxSignalsIn(): RfSignal[] {
        return [{
          signalId: 'WXSAT-19-APT',
          serverId: 1,
          noradId: 63001,
          frequency: 137.1e6 as RfFrequency,
          bandwidth: 34e3 as Hertz,
          power: -95 as dBm,
          modulation: 'BPSK' as ModulationType,
          fec: '1/2' as FECType,
          polarization: 'RHCP',
          feed: '',
          isDegraded: false,
          origin: SignalOrigin.OMT_RX,
          noiseFloor: null,
          gainInPath: 0 as any,
        }];
      }
      isExtRefPresent(): boolean { return true; }
    }

    const mockFrontEnd = {
      gpsdoModule: { get10MhzOutput: () => ({ isWarmedUp: true }) },
      omtModule: { rxSignalsOut: [] },
      bucModule: { state: { isLoopback: false }, outputSignals: [] },
    } as any;

    const lnb = new TestableLNB({
      ...LNBModuleCore.getDefaultState(),
      isDirectSampling: true,
      gain: 0 as dB,
    }, mockFrontEnd, 1);

    lnb.update();

    expect(lnb.ifSignals).toHaveLength(1);
    // RF frequency preserved (no mixing), no bandpass attenuation at 137 MHz
    expect(lnb.ifSignals[0].frequency).toBe(137.1e6);
    expect(lnb.ifSignals[0].power).toBe(-95);
    // Legacy path unchanged: same input without the flag mixes with the LO
    // and lands outside the 950-2150 MHz IF filter
    const legacy = new TestableLNB({
      ...LNBModuleCore.getDefaultState(),
      loFrequency: 6080 as MHz,
      gain: 0 as dB,
    }, mockFrontEnd, 1);
    legacy.update();
    expect(legacy.ifSignals[0].frequency).toBe(6080e6 - 137.1e6);
    expect(legacy.ifSignals[0].power).toBeLessThan(-95); // filtered (outside IF passband)
  });
});

describe('Campaign 3: scenario registration', () => {
  it('registers the sandbox with unique prefixed ids and backyard stations', async () => {
    const { hamSdrSandboxData } = await import('../../src/campaigns/ham-sdr/sandbox');
    const { hamSdrCampaignData } = await import('../../src/campaigns/nats/campaign-data');

    expect(hamSdrSandboxData.id).toBe('ham-sdr-sandbox');
    expect(hamSdrSandboxData.missionType).toBe('Sandbox');
    expect(hamSdrCampaignData.isDisabled).toBe(false);
    expect(hamSdrCampaignData.scenarios.map((s) => s.id)).toContain('ham-sdr-sandbox');

    for (const gs of hamSdrSandboxData.settings.groundStations) {
      expect(gs.stationClass).toBe('backyard');
      expect(gs.rfFrontEnds[0].lnb?.isDirectSampling).toBe(true);
    }
  });
});
