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

  it('CUBEHOP-1: scenario 2 window (T0 16:14) has AOS ~T+4 min at 48 deg', () => {
    const s2StartMs = Date.UTC(2027, 5, 19, 16, 14, 0);
    const passes = planner.getPasses(cubehop, s2StartMs, { horizonHours: 1 });

    expect(passes.length).toBeGreaterThanOrEqual(1);
    expect(passes[0].aosMs).toBeGreaterThan(s2StartMs + 3 * MINUTE_MS);
    expect(passes[0].aosMs).toBeLessThan(s2StartMs + 5 * MINUTE_MS);
    expect(passes[0].losMs).toBeGreaterThan(s2StartMs + 15 * MINUTE_MS);
    expect(passes[0].losMs).toBeLessThan(s2StartMs + 18 * MINUTE_MS);
    expect(passes[0].maxEl).toBeGreaterThan(40);
  });

  it('CUBEHOP-1: scenario 3 window (June 20 16:24) has AOS ~T+4.3 min at 63 deg', () => {
    const s3StartMs = Date.UTC(2027, 5, 20, 16, 24, 0);
    const passes = planner.getPasses(cubehop, s3StartMs, { horizonHours: 1 });

    expect(passes.length).toBeGreaterThanOrEqual(1);
    expect(passes[0].aosMs).toBeGreaterThan(s3StartMs + 3 * MINUTE_MS);
    expect(passes[0].aosMs).toBeLessThan(s3StartMs + 5.5 * MINUTE_MS);
    expect(passes[0].maxEl).toBeGreaterThan(55);
  });

  it('CUBEHOP-1: scenario 4 window (June 21 16:34) has AOS ~T+4.8 min nearly overhead', () => {
    const s4StartMs = Date.UTC(2027, 5, 21, 16, 34, 0);
    const passes = planner.getPasses(cubehop, s4StartMs, { horizonHours: 1 });

    expect(passes.length).toBeGreaterThanOrEqual(1);
    expect(passes[0].aosMs).toBeGreaterThan(s4StartMs + 3.5 * MINUTE_MS);
    expect(passes[0].aosMs).toBeLessThan(s4StartMs + 6 * MINUTE_MS);
    expect(passes[0].losMs).toBeGreaterThan(s4StartMs + 16 * MINUTE_MS);
    expect(passes[0].maxEl).toBeGreaterThan(75);
  });

  it('CUBEHOP-1: scenario 6 truth TLE has the briefed 16:59 pass; the tampered TLE has empty sky', () => {
    const s6StartMs = Date.UTC(2027, 5, 23, 14, 40, 0);
    const windowEndMs = Date.UTC(2027, 5, 23, 17, 30, 0);

    // Truth (roster) elements: the network's promised high pass exists
    const truthPasses = planner.getPasses(cubehop, s6StartMs, { horizonHours: 3 })
      .filter((p) => p.aosMs < windowEndMs && p.maxEl > 25);
    expect(truthPasses.length).toBeGreaterThanOrEqual(1);
    expect(truthPasses[0].aosMs).toBeGreaterThan(Date.UTC(2027, 5, 23, 16, 50, 0));
    expect(truthPasses[0].aosMs).toBeLessThan(Date.UTC(2027, 5, 23, 17, 10, 0));
    expect(truthPasses[0].maxEl).toBeGreaterThan(50);

    // Tampered mirror elements (RAAN +60 deg): no usable pass all afternoon
    const tampered = new OrbitalSatellite('CUBEHOP-1', 63002, [], [], {
      tle1: '1 63002U 27042A   27170.66666667  .00001000  00000-0  10000-3 0  9997' as TleLine1,
      tle2: '2 63002  97.5000 154.0000 0010000  90.0000 226.0000 14.90000000123456' as TleLine2,
      observer: OBSERVER,
    });
    const tamperedPasses = planner.getPasses(tampered, s6StartMs, { horizonHours: 3 })
      .filter((p) => p.aosMs < windowEndMs && p.maxEl > 5);
    expect(tamperedPasses).toHaveLength(0);
  });

  it('CUBEHOP-1: scenario 8 windows (June 26): pirate pass ~15:55 and TX pass ~17:31', () => {
    const s8StartMs = Date.UTC(2027, 5, 26, 15, 30, 0);
    const passes = planner.getPasses(cubehop, s8StartMs, { horizonHours: 3 });

    expect(passes.length).toBeGreaterThanOrEqual(2);
    // Pirate act: AOS 15:55:47, max el 28.9
    expect(passes[0].aosMs).toBeGreaterThan(Date.UTC(2027, 5, 26, 15, 54, 0));
    expect(passes[0].aosMs).toBeLessThan(Date.UTC(2027, 5, 26, 15, 57, 0));
    expect(passes[0].maxEl).toBeGreaterThan(25);
    // First TX: AOS 17:31:29, max el 25.7
    expect(passes[1].aosMs).toBeGreaterThan(Date.UTC(2027, 5, 26, 17, 30, 0));
    expect(passes[1].aosMs).toBeLessThan(Date.UTC(2027, 5, 26, 17, 33, 0));
    expect(passes[1].maxEl).toBeGreaterThan(22);
  });

  it('WXSAT-19: the sky is provably empty during the scenario 8 fake-beacon window', () => {
    const s8StartMs = Date.UTC(2027, 5, 26, 15, 30, 0);
    const passes = planner.getPasses(wxsat, s8StartMs, { horizonHours: 9 });

    // The last real pass before the epilogue ends by 17:29; nothing usable
    // rises again until a ~2 deg graze at 23:46 - the fake beacon at ~17:47
    // has no orbital alibi
    const fakeBeaconOnMs = s8StartMs + 8200 * 1000;
    const during = passes.filter((p) => p.aosMs < fakeBeaconOnMs + 30 * MINUTE_MS && p.losMs > fakeBeaconOnMs);
    expect(during).toHaveLength(0);
  });

  it('CUBEHOP-1: scenario 7 window (June 24 15:15) has the marginal ~18 deg pass', () => {
    const s7StartMs = Date.UTC(2027, 5, 24, 15, 15, 0);
    const passes = planner.getPasses(cubehop, s7StartMs, { horizonHours: 1 });

    expect(passes.length).toBeGreaterThanOrEqual(1);
    expect(passes[0].aosMs).toBeGreaterThan(s7StartMs + 15 * MINUTE_MS);
    expect(passes[0].aosMs).toBeLessThan(s7StartMs + 25 * MINUTE_MS);
    // The margin call: low, but real
    expect(passes[0].maxEl).toBeGreaterThan(12);
    expect(passes[0].maxEl).toBeLessThan(22);
  });

  it('NAVSTAR-77 (MEO): high for the scenario 5 window (June 22 16:00)', () => {
    const s5StartMs = Date.UTC(2027, 5, 22, 16, 0, 0);
    const elAtStart = navstar.ootkSatellite.rae(navstar.groundObserver, new Date(s5StartMs)).el;
    const elAtSpoofEnd = navstar.ootkSatellite.rae(navstar.groundObserver, new Date(s5StartMs + 15 * MINUTE_MS)).el;

    expect(elAtStart).toBeGreaterThan(40);
    expect(elAtSpoofEnd).toBeGreaterThan(40);
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

  it('registers scenarios 1-4 in the campaign, the flat list, and a prerequisite chain', async () => {
    const { hamSdrCampaignData } = await import('../../src/campaigns/nats/campaign-data');
    const { SCENARIOS } = await import('../../src/scenario-manager');

    const ids = [
      'ham-sdr-scenario1', 'ham-sdr-scenario2', 'ham-sdr-scenario3',
      'ham-sdr-scenario4', 'ham-sdr-scenario5', 'ham-sdr-scenario6',
      'ham-sdr-scenario7', 'ham-sdr-scenario8',
    ];
    const campaignIds = hamSdrCampaignData.scenarios.map((s) => s.id);
    const flatIds = SCENARIOS.map((s) => s.id);

    for (const id of ids) {
      expect(campaignIds).toContain(id);
      expect(flatIds).toContain(id);
    }
    // Global namespace stays collision-free
    expect(new Set(flatIds).size).toBe(flatIds.length);

    // Prerequisite chain s1 <- s2 <- s3 <- s4; every scenario has a brief URL
    // (without missionBriefUrl the objectives checklist never renders)
    const byId = new Map(hamSdrCampaignData.scenarios.map((s) => [s.id, s]));
    expect(byId.get('ham-sdr-scenario1')!.prerequisiteScenarioIds ?? []).toEqual([]);
    expect(byId.get('ham-sdr-scenario2')!.prerequisiteScenarioIds).toEqual(['ham-sdr-scenario1']);
    expect(byId.get('ham-sdr-scenario3')!.prerequisiteScenarioIds).toEqual(['ham-sdr-scenario2']);
    expect(byId.get('ham-sdr-scenario4')!.prerequisiteScenarioIds).toEqual(['ham-sdr-scenario3']);
    expect(byId.get('ham-sdr-scenario5')!.prerequisiteScenarioIds).toEqual(['ham-sdr-scenario4']);
    expect(byId.get('ham-sdr-scenario6')!.prerequisiteScenarioIds).toEqual(['ham-sdr-scenario5']);
    expect(byId.get('ham-sdr-scenario7')!.prerequisiteScenarioIds).toEqual(['ham-sdr-scenario6']);
    expect(byId.get('ham-sdr-scenario8')!.prerequisiteScenarioIds).toEqual(['ham-sdr-scenario7']);
    for (const id of ids) {
      expect(byId.get(id)!.settings.missionBriefUrl).toBeTruthy();
      // Discovery-not-procedure: no isOptional anywhere (it still gates completion)
      for (const obj of byId.get(id)!.objectives) {
        expect(obj.isOptional).toBeUndefined();
      }
    }
  });

  it('scenario 1 boots the rig off-frequency on a voice channel (click-to-tune + bandwidth lessons)', async () => {
    const { hamSdrScenario1Data } = await import('../../src/campaigns/ham-sdr/scenario1');

    const modem = hamSdrScenario1Data.settings.groundStations[0].receivers?.[0]?.modems?.[0];
    // VFO parked 70 kHz above the APT downlink, still inside the 200 kHz view
    expect(modem?.frequency).toBe(137.17);
    // 15 kHz voice channel: the 34 kHz APT signal cannot fit until widened
    expect(modem?.bandwidth).toBe(0.015);

    // The sandbox's shared station must stay on-frequency (S1 overrides a copy)
    const { hamSdrSandboxData } = await import('../../src/campaigns/ham-sdr/sandbox');
    const sandboxQfh = hamSdrSandboxData.settings.groundStations.find((gs) => gs.id === 'BKYD-QFH');
    expect(sandboxQfh?.receivers?.[0]?.modems?.[0]?.frequency).toBe(137.1);
    expect(sandboxQfh?.receivers?.[0]?.modems?.[0]?.bandwidth).toBe(0.05);
  });

  it('scenario 7 authors a terrestrial RFI due east and the marginal-pass gates (E1)', async () => {
    const { hamSdrScenario7Data } = await import('../../src/campaigns/ham-sdr/scenario7');

    const rfi = hamSdrScenario7Data.settings.interferenceEvents?.[0];
    expect(rfi?.path).toBe('terrestrial');
    // Continuous, not duty-cycled - accidents run until unplugged
    expect(rfi?.onSeconds).toBe(rfi?.periodSeconds);
    // Emitter due east of the backyard (DF objective expects az 90 +/-12)
    expect(rfi?.emitter?.latitude).toBeCloseTo(44.48, 3);
    expect((rfi?.emitter?.longitude ?? 0) > -73.21).toBe(true);

    // The margin objective demands the 100 kHz IF filter (index 5)
    const narrowCatch = hamSdrScenario7Data.objectives.find((o) => o.id === 'narrow-and-catch');
    const filterCond = narrowCatch?.conditions.find((c) => c.type === 'filter-bandwidth-set');
    expect(filterCond?.params?.bandwidthIndex).toBe(5);
  });

  it('scenario 6 boots CUBEHOP tampered on a scenario-local instance (E3)', async () => {
    const { hamSdrScenario6Data } = await import('../../src/campaigns/ham-sdr/scenario6');
    const { cubehop1Satellite } = await import('../../src/campaigns/ham-sdr/satellites');

    const event = hamSdrScenario6Data.settings.spaceEvents?.[0];
    expect(event?.satelliteNoradId).toBe(63002);
    // The tamper is applied at load via initialTle (replay-safe); newTle is the truth
    expect(event?.initialTle?.tle2).toContain('154.0000');
    expect(event?.newTle.tle2).toContain(' 94.0000');

    // The scenario must NOT share the roster instance S2-S4 use
    const s6Cubehop = hamSdrScenario6Data.settings.satellites.find((s) => s.noradId === 63002);
    expect(s6Cubehop).toBeDefined();
    expect(s6Cubehop).not.toBe(cubehop1Satellite);
  });

  it('scenario 5 wires the spoof window to a terrestrial L1 emitter (E1+E4)', async () => {
    const { hamSdrScenario5Data } = await import('../../src/campaigns/ham-sdr/scenario5');
    const settings = hamSdrScenario5Data.settings;

    // The gnssThreat clock walk and the spoofer's over-the-air carrier are
    // the same fiction - their windows must agree
    expect(settings.gnssThreat?.spoofStartS).toBe(420);
    expect(settings.gnssThreat?.spoofEndS).toBe(900);

    const spoofer = settings.interferenceEvents?.[0];
    expect(spoofer?.path).toBe('terrestrial');
    expect(spoofer?.emitter).toBeDefined();
    expect(spoofer?.startTime).toBe(420);
    expect((spoofer?.startTime ?? 0) + (spoofer?.duration ?? 0)).toBe(900);
    // Terrestrial = received over the air, narrow and strong vs the 2 MHz hump
    expect(spoofer?.frequency).toBe(1575.42e6);
    expect(spoofer?.bandwidth).toBeLessThan(2e6);
  });

  it('scenario 8 authors the TX rig, the pirate relay, and the fake beacon (E2 + E1)', async () => {
    const { hamSdrScenario8Data } = await import('../../src/campaigns/ham-sdr/scenario8');
    const settings = hamSdrScenario8Data.settings;

    // TX station: BUC powered AND unmuted (the HPA-without-drive insta-fail
    // checks exactly those flags), 5 W brick HPA, modem parked OFF the
    // transponder so entering 435.900 is a real objective
    const txStation = settings.groundStations.find((gs) => gs.id === 'BKYD-YAGI');
    expect(txStation?.rfFrontEnds[0].buc?.isPowered).toBe(true);
    expect(txStation?.rfFrontEnds[0].buc?.isMuted).toBe(false);
    expect(txStation?.rfFrontEnds[0].hpa?.isHpaEnabled).toBe(true);
    expect(txStation?.rfFrontEnds[0].hpa?.maxOutputPower).toBe(37);
    const txModem = txStation?.transmitters?.[0]?.modems?.[0];
    expect(txModem?.isPowered).toBe(true);
    expect(txModem?.isTransmitting).toBe(false);
    expect(txModem?.ifSignal?.frequency).not.toBe(435.90e6);

    // The weather rig rides along for the epilogue
    expect(settings.groundStations.some((gs) => gs.id === 'BKYD-QFH')).toBe(true);

    // Pirate: transponder path (satellite relay), inside the V/U passband,
    // RHCP to match, and OFF before the 17:31 first-TX pass (T+121 min)
    const pirate = settings.interferenceEvents?.find((e) => e.id === 'cq-pirate');
    expect(pirate?.path).toBeUndefined();
    expect(pirate?.satelliteNoradId).toBe(63002);
    expect(pirate?.frequency).toBeGreaterThan(435.885e6);
    expect(pirate?.frequency).toBeLessThan(435.915e6);
    expect(pirate?.polarization).toBe('RHCP');
    expect((pirate?.startTime ?? 0) + (pirate?.duration ?? 0)).toBeLessThan(121 * 60);

    // Fake beacon: terrestrial (zero Doppler by construction) on exactly 137.1
    const fake = settings.interferenceEvents?.find((e) => e.id === 'fake-wxsat');
    expect(fake?.path).toBe('terrestrial');
    expect(fake?.frequency).toBe(137.1e6);
    expect(fake?.emitter).toBeDefined();

    // The uplink transponder the whole act depends on: 435.90 up / 435.29 down
    const { cubehop1Satellite } = await import('../../src/campaigns/ham-sdr/satellites');
    const vu = cubehop1Satellite.transponders.find((tp) => tp.id === 'VU-XPD');
    expect(vu?.uplinkFrequency).toBe(435.90e6);
    expect(vu?.downlinkFrequency).toBe(435.29e6);
    expect(vu?.polarization).toBe('RHCP');
    expect(vu?.gain).toBe(132);
  });

  it('scenario 3 starts the yagi wrong-handed; scenarios 2 and 4 start clean', async () => {
    const { hamSdrScenario2Data } = await import('../../src/campaigns/ham-sdr/scenario2');
    const { hamSdrScenario3Data } = await import('../../src/campaigns/ham-sdr/scenario3');
    const { hamSdrScenario4Data } = await import('../../src/campaigns/ham-sdr/scenario4');

    expect(hamSdrScenario3Data.settings.groundStations[0].antennasState?.[0]?.circularHandedness).toBe('LHCP');
    expect(hamSdrScenario2Data.settings.groundStations[0].antennasState?.[0]?.circularHandedness).toBe('RHCP');
    expect(hamSdrScenario4Data.settings.groundStations[0].antennasState?.[0]?.circularHandedness).toBe('RHCP');
  });
});
