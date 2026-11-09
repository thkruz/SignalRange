import { Mock, Mocked, vi } from 'vitest';
import { GroundStation } from '../../../../src/assets/ground-station/ground-station';
import { FineAdjustControl } from '../../../../src/components/fine-adjust-control/fine-adjust-control';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { EventAutoLogger } from '../../../../src/ops-log/event-auto-logger';
import { ACUControlTab } from '../../../../src/pages/mission-control/tabs/acu-control-tab';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');
vi.mock('../../../../src/assets/ground-station/ground-station');
vi.mock('../../../../src/pages/mission-control/tabs/antenna-adapter');
vi.mock('../../../../src/pages/mission-control/tabs/omt-adapter');
vi.mock('../../../../src/components/fine-adjust-control/fine-adjust-control', () => ({
  FineAdjustControl: {
    create: vi.fn(() => ({
      html: '<div class="mock-fine-adjust"></div>',
      addEventListeners: vi.fn(),
      sync: vi.fn(),
      setEnabled: vi.fn(),
    })),
  },
}));
vi.mock('../../../../src/components/polar-plot/polar-plot', () => ({
  PolarPlot: {
    create: vi.fn(() => ({
      html: '<div class="mock-polar-plot"></div>',
      onDomReady: vi.fn(),
      draw: vi.fn(),
    })),
  },
}));
vi.mock('../../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      satellites: [],
      getSatByNoradId: vi.fn(() => null),
      registry: { get: (n: number) => ([] as Array<{ noradId: number }>).find((s) => s.noradId === n) },
    })),
  },
}));
vi.mock('../../../../src/weather/weather-manager', () => ({
  WeatherManager: {
    getInstance: vi.fn(() => ({
      isPrecipitationActive: vi.fn(() => false),
      getActiveWeatherEvents: vi.fn(() => []),
    })),
  },
}));
vi.mock('../../../../src/services/alarm-service', () => ({
  AlarmService: {
    getAlarms: vi.fn(() => []),
  },
}));

import { AlarmService } from '../../../../src/services/alarm-service';
import { SimClock } from '../../../../src/simulation/sim-clock';
import { SimulationManager } from '../../../../src/simulation/simulation-manager';
import { WeatherManager } from '../../../../src/weather/weather-manager';

describe('ACUControlTab', () => {
  let mockGroundStation: Mocked<GroundStation>;
  let containerEl: HTMLElement;
  let tab: ACUControlTab;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  // The unique prefix is: acu-${groundStation.uuid}-ant${antennaIndex}-
  // With uuid='test-uuid' and antennaIndex=0, prefix = 'acu-test-uuid-ant0-'
  const PREFIX = 'acu-test-uuid-ant0-';

  const mockAntennaState = {
    acuModel: 'Kratos NGC-2200',
    acuSerialNumber: 'ACU-001',
    azimuth: 180,
    elevation: 45,
    polarization: 0,
    trackingMode: 'manual',
    isLocked: false,
    isBeaconLocked: false,
    isPowered: true,
    isOperational: true,
    isLoopback: false,
    isHeaterEnabled: false,
    isRainBlowerEnabled: false,
    hasFault: false,
    faultMessage: null,
    hasStagedChanges: false,
    stagedTargetAzimuth: 180,
    stagedTargetElevation: 45,
    stagedTargetPolarization: 0,
    beaconFrequencyHz: 3948e6,
    beaconTrackingBwHz: 1_000,
    beaconSearchBwHz: 500e3,
    beaconCN: null,
    rxSignalsIn: [],
    iceAccumulation_dB: 0,
    rfMetrics: {
      frequency_GHz: 12.0,
      gain_dBi: 45.0,
      beamwidth_deg: 0.5,
      gOverT_dBK: 30.0,
      polLoss_dB: 0.1,
      skyTemp_K: 290,
    },
    targetSatelliteId: null,
    isAutoTrackEnabled: false,
    stagedBeaconFrequencyHz: null,
    stagedBeaconSearchBwHz: null,
    isStepTrackEnabled: false,
    stepTrackAzOffset: 0,
    stepTrackElOffset: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup mock GroundStation
    mockGroundStation = {
      uuid: 'test-uuid',
      state: { id: 'GS-001' },
      antennas: [
        {
          state: mockAntennaState,
          stageAzimuthChange: vi.fn(),
          stageElevationChange: vi.fn(),
          stagePolarizationChange: vi.fn(),
          applyChanges: vi.fn(),
          discardChanges: vi.fn(),
          handleTrackingModeChange: vi.fn(),
          stageTrackingModeChange: vi.fn(),
          handleTargetSatelliteChange: vi.fn(),
          moveToTargetSatellite: vi.fn(),
          stageBeaconFrequencyChange: vi.fn(),
          stageBeaconSearchBwChange: vi.fn(),
          startStepTrack: vi.fn(),
          stopStepTrack: vi.fn(),
          handleStepTrackToggle: vi.fn(),
          handleHeaterToggle: vi.fn(),
          handleRainBlowerToggle: vi.fn(),
          handlePowerToggle: vi.fn(),
        },
      ],
      rfFrontEnds: [
        {
          omtModule: { state: {} },
          lnbModule: { state: { loFrequency: 5150 } },
        },
      ],
      initializeEquipment: vi.fn(),
    } as unknown as Mocked<GroundStation>;

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'acu-control-container';
    document.body.appendChild(containerEl);

    // The alarm-facing readouts refresh once per scenario second (Phase 33
    // D7); the tests move that second with the Date.now they already mock
    (AlarmService.getAlarms as Mock).mockReturnValue([]);
    vi.spyOn(SimClock, 'nowMs').mockImplementation(() => Date.now());

    tab = new ACUControlTab(mockGroundStation, 'acu-control-container');
  });

  afterEach(() => {
    tab.dispose();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(tab).toBeInstanceOf(ACUControlTab);
    });

    it('should initialize equipment if not already done', () => {
      const emptyGs = {
        ...mockGroundStation,
        antennas: [],
        rfFrontEnds: [],
      } as unknown as Mocked<GroundStation>;

      const containerEl2 = document.createElement('div');
      containerEl2.id = 'acu-control-container-2';
      document.body.appendChild(containerEl2);

      new ACUControlTab(emptyGs, 'acu-control-container-2');
      expect(emptyGs.initializeEquipment).toHaveBeenCalled();
    });

    it('should register for UPDATE events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    });

    it('should register for DRAW events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.DRAW, expect.any(Function));
    });
  });

  describe('HTML rendering', () => {
    it('should render ACU identification', () => {
      const modelEl = document.querySelector(`#${PREFIX}model`);
      expect(modelEl?.textContent).toContain('Kratos');
    });

    it('should render tracking mode selector', () => {
      const trackingBtns = document.querySelectorAll('.btn-tracking');
      // STOW, MAINT, MANUAL, PROGRAM (step-track is now a toggle within program-track)
      expect(trackingBtns.length).toBe(4);
    });

    it('should render power switch', () => {
      const powerSwitch = document.querySelector(`#${PREFIX}power-switch`);
      expect(powerSwitch).not.toBeNull();
    });

    it('should render loopback switch', () => {
      const loopbackSwitch = document.querySelector(`#${PREFIX}loopback-switch`);
      expect(loopbackSwitch).not.toBeNull();
    });

    it('should render polar plot container', () => {
      const polarPlotContainer = document.querySelector(`#${PREFIX}polar-plot-container`);
      expect(polarPlotContainer).not.toBeNull();
    });

    it('should render OMT/Duplexer card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('OMT');
      expect(html).toContain('Duplexer');
    });

    it('should render Environmental card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Environmental');
    });

    it('should render RF Metrics card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('RF Metrics');
    });
  });

  describe('tracking mode controls', () => {
    it('should render STOW button', () => {
      const stowBtn = document.querySelector('[data-mode="stow"]');
      expect(stowBtn).not.toBeNull();
    });

    it('should render MANUAL button', () => {
      const manualBtn = document.querySelector('[data-mode="manual"]');
      expect(manualBtn).not.toBeNull();
    });

    it('should render PROGRAM button', () => {
      const programBtn = document.querySelector('[data-mode="program-track"]');
      expect(programBtn).not.toBeNull();
    });

    it('should render step-track toggle', () => {
      const stepTrackToggle = document.querySelector(`#${PREFIX}step-track-toggle`);
      expect(stepTrackToggle).not.toBeNull();
    });
  });

  describe('environmental controls', () => {
    it('should render heater switch', () => {
      const heaterSwitch = document.querySelector(`#${PREFIX}heater-switch`);
      expect(heaterSwitch).not.toBeNull();
    });

    it('should render blower switch', () => {
      const blowerSwitch = document.querySelector(`#${PREFIX}blower-switch`);
      expect(blowerSwitch).not.toBeNull();
    });

    it('should render ice accumulation display', () => {
      const iceDisplay = document.querySelector(`#${PREFIX}ice-accumulation-display`);
      expect(iceDisplay).not.toBeNull();
    });
  });

  describe('RF metrics display', () => {
    it('should render frequency metric', () => {
      const freqMetric = document.querySelector(`#${PREFIX}rf-metric-freq`);
      expect(freqMetric).not.toBeNull();
    });

    it('should render gain metric', () => {
      const gainMetric = document.querySelector(`#${PREFIX}rf-metric-gain`);
      expect(gainMetric).not.toBeNull();
    });

    it('should render beamwidth metric', () => {
      const bwMetric = document.querySelector(`#${PREFIX}rf-metric-beamwidth`);
      expect(bwMetric).not.toBeNull();
    });

    it('should render G/T metric', () => {
      const gtMetric = document.querySelector(`#${PREFIX}rf-metric-gt`);
      expect(gtMetric).not.toBeNull();
    });
  });

  describe('apply/cancel buttons', () => {
    it('should render apply button', () => {
      const applyBtn = document.querySelector(`#${PREFIX}apply-changes-btn`);
      expect(applyBtn).not.toBeNull();
    });

    it('should render cancel button', () => {
      const cancelBtn = document.querySelector(`#${PREFIX}discard-changes-btn`);
      expect(cancelBtn).not.toBeNull();
    });
  });

  describe('activate/deactivate', () => {
    it('should show tab on activate', () => {
      tab.activate();
      const tabEl = document.querySelector('.acu-control-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('block');
    });

    it('should hide tab on deactivate', () => {
      tab.deactivate();
      const tabEl = document.querySelector('.acu-control-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('none');
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      tab.dispose();
      expect(mockEventBus.off).toHaveBeenCalled();
    });

    it('should remove DOM element', () => {
      tab.dispose();
      const tabEl = document.querySelector('.acu-control-tab');
      expect(tabEl).toBeNull();
    });
  });

  describe('tracking mode buttons', () => {
    it('stages the clicked mode (STOW/MAINT wait for APPLY, phase 29 D4)', () => {
      const antenna = mockGroundStation.antennas[0];
      const stowBtn = document.querySelector('[data-mode="stow"]') as HTMLButtonElement;
      stowBtn.click();

      expect(antenna.stageTrackingModeChange).toHaveBeenCalledWith('stow');
    });

    it('should clear active target when leaving program-track mode', () => {
      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';

      const manualBtn = document.querySelector('[data-mode="manual"]') as HTMLButtonElement;
      manualBtn.click();

      expect(antenna.stageTrackingModeChange).toHaveBeenCalledWith('manual');
    });
  });

  describe('apply/cancel button interactions', () => {
    it('should call applyChanges when apply button is clicked', () => {
      const antenna = mockGroundStation.antennas[0];
      const applyBtn = document.querySelector(`#${PREFIX}apply-changes-btn`) as HTMLButtonElement;
      applyBtn.disabled = false;
      applyBtn.click();

      expect(antenna.applyChanges).toHaveBeenCalled();
    });

    it('should call discardChanges when cancel button is clicked', () => {
      const antenna = mockGroundStation.antennas[0];
      const cancelBtn = document.querySelector(`#${PREFIX}discard-changes-btn`) as HTMLButtonElement;
      cancelBtn.disabled = false;
      cancelBtn.click();

      expect(antenna.discardChanges).toHaveBeenCalled();
    });
  });

  describe('environmental control interactions', () => {
    it('should call handleHeaterToggle when heater switch is changed', () => {
      const antenna = mockGroundStation.antennas[0];
      const heaterSwitch = document.querySelector(`#${PREFIX}heater-switch`) as HTMLInputElement;
      heaterSwitch.checked = true;
      heaterSwitch.dispatchEvent(new Event('change'));

      expect(antenna.handleHeaterToggle).toHaveBeenCalledWith(true);
    });

    it('should call handleRainBlowerToggle when blower switch is changed', () => {
      const antenna = mockGroundStation.antennas[0];
      const blowerSwitch = document.querySelector(`#${PREFIX}blower-switch`) as HTMLInputElement;
      blowerSwitch.checked = true;
      blowerSwitch.dispatchEvent(new Event('change'));

      expect(antenna.handleRainBlowerToggle).toHaveBeenCalledWith(true);
    });

    it('logs the feed heater switch, and nothing when the antenna refuses it (nats-r5-s08-F2)', () => {
      const antenna = mockGroundStation.antennas[0];
      const logSpy = vi.spyOn(EventAutoLogger.getInstance(), 'logAction').mockImplementation(() => undefined);
      const heaterSwitch = document.querySelector(`#${PREFIX}heater-switch`) as HTMLInputElement;

      // Refused (antenna unpowered): state unchanged, no line
      heaterSwitch.checked = true;
      heaterSwitch.dispatchEvent(new Event('change'));
      expect(logSpy).not.toHaveBeenCalled();

      (antenna.handleHeaterToggle as Mock).mockImplementation((on: boolean) => {
        antenna.state.isHeaterEnabled = on;
      });
      heaterSwitch.dispatchEvent(new Event('change'));
      expect(logSpy).toHaveBeenCalledWith('Feed heater ON', 'ANT', undefined);

      antenna.state.isHeaterEnabled = false;
      logSpy.mockRestore();
    });
  });

  describe('tab open (nats-r5-s07-F2)', () => {
    it('re-applies a configured target with logging off', () => {
      tab.dispose();
      document.body.innerHTML = '';
      const antenna = mockGroundStation.antennas[0];
      antenna.state.targetSatelliteId = 12345;
      const silentSpy = vi.spyOn(EventAutoLogger.getInstance(), 'runWithoutLogging');

      containerEl = document.createElement('div');
      containerEl.id = 'acu-control-container';
      document.body.appendChild(containerEl);
      tab = new ACUControlTab(mockGroundStation, 'acu-control-container');

      expect(silentSpy).toHaveBeenCalledTimes(1);
      expect(antenna.handleTargetSatelliteChange).toHaveBeenCalledWith(12345);
      antenna.state.targetSatelliteId = null;
      silentSpy.mockRestore();
    });
  });

  describe('satellite dropdown interactions', () => {
    it('stages a satellite pick and commits it only on Move to Target (nats-r3-s12-F3)', () => {
      SimulationManager.getInstance.mockReturnValue({
        satellites: [
          { noradId: 12345, name: 'Test Satellite 1' },
          { noradId: 67890, name: 'Test Satellite 2' },
        ],
        getSatByNoradId: vi.fn(() => null),
        registry: {
          get: (n: number) =>
            (
              [
                { noradId: 12345, name: 'Test Satellite 1' },
                { noradId: 67890, name: 'Test Satellite 2' },
              ] as Array<{ noradId: number }>
            ).find((s) => s.noradId === n),
        },
      });

      // Recreate tab to get updated dropdown
      tab.dispose();
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'acu-control-container-sat';
      document.body.appendChild(containerEl2);
      const tab2 = new ACUControlTab(mockGroundStation, 'acu-control-container-sat');

      const antenna = mockGroundStation.antennas[0];
      const select = document.querySelector(`#${PREFIX}satellite-select`) as HTMLSelectElement;
      antenna.state.trackingMode = 'program-track';
      select.value = '12345';
      select.dispatchEvent(new Event('change'));

      // The pick alone commands nothing
      expect(antenna.handleTargetSatelliteChange).not.toHaveBeenCalled();
      const moveBtn = document.querySelector(`#${PREFIX}move-to-target-btn`) as HTMLButtonElement;
      expect(moveBtn.disabled).toBe(false);
      const hint = document.querySelector(`#${PREFIX}target-staged-hint`) as HTMLElement;
      expect(hint.textContent).toContain('Test Satellite 1 staged');

      moveBtn.click();

      expect(antenna.handleTargetSatelliteChange).toHaveBeenCalledWith(12345);
      expect(antenna.moveToTargetSatellite).toHaveBeenCalled();
      antenna.state.trackingMode = 'manual';
      tab2.dispose();
    });

    it('should call moveToTargetSatellite when move button is clicked', () => {
      const antenna = mockGroundStation.antennas[0];
      const moveBtn = document.querySelector(`#${PREFIX}move-to-target-btn`) as HTMLButtonElement;
      moveBtn.disabled = false;
      moveBtn.click();

      expect(antenna.moveToTargetSatellite).toHaveBeenCalled();
    });
  });

  describe('beacon controls interactions', () => {
    it('should call stageBeaconFrequencyChange when frequency is changed', () => {
      const antenna = mockGroundStation.antennas[0];
      const freqInput = document.querySelector(`#${PREFIX}beacon-freq`) as HTMLInputElement;
      freqInput.value = '4000';
      freqInput.dispatchEvent(new Event('change'));

      expect(antenna.stageBeaconFrequencyChange).toHaveBeenCalledWith(4000e6);
    });

    it('should call stageBeaconSearchBwChange when bandwidth is changed', () => {
      const antenna = mockGroundStation.antennas[0];
      const bwInput = document.querySelector(`#${PREFIX}beacon-search-bw`) as HTMLInputElement;
      bwInput.value = '600';
      bwInput.dispatchEvent(new Event('change'));

      expect(antenna.stageBeaconSearchBwChange).toHaveBeenCalledWith(600e3);
    });

    it('should call handleStepTrackToggle when step track toggle is enabled', () => {
      const antenna = mockGroundStation.antennas[0];
      antenna.state.isStepTrackEnabled = false;
      const toggle = document.querySelector(`#${PREFIX}step-track-toggle`) as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(antenna.handleStepTrackToggle).toHaveBeenCalledWith(true);
    });

    it('should call handleStepTrackToggle when step track toggle is disabled', () => {
      const antenna = mockGroundStation.antennas[0];
      antenna.state.isStepTrackEnabled = true;
      const toggle = document.querySelector(`#${PREFIX}step-track-toggle`) as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));

      expect(antenna.handleStepTrackToggle).toHaveBeenCalledWith(false);
    });
  });

  describe('UPDATE event handler', () => {
    it('should sync UI with antenna state when UPDATE event fires', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      expect(updateHandler).toBeDefined();

      // Modify antenna state
      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';

      // Trigger update (bypass throttle)
      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const programSection = document.querySelector(`#${PREFIX}program-track-section`) as HTMLElement;
      expect(programSection?.style.display).toBe('block');
    });

    it('does nothing once the tab DOM has been replaced (stale instance after a station switch)', () => {
      // The canvas replaces the content when the operator selects another
      // station and only disposes this instance when the tab is next rendered;
      // meanwhile every tick still reaches its handlers. A throw here would
      // escape the game loop and freeze the simulation (phase 16, S9).
      const handlers = mockEventBus.on.mock.calls.filter((call: unknown[]) => call[0] === Events.UPDATE || call[0] === Events.DRAW).map((call: unknown[]) => call[1]);
      const azFineControl = (FineAdjustControl.create as Mock).mock.results[0].value as { sync: Mock };
      const syncCallsBefore = azFineControl.sync.mock.calls.length;

      containerEl.innerHTML = '';
      const antenna = mockGroundStation.antennas[0];
      antenna.state.azimuth = 143;
      antenna.state.trackingMode = 'program-track';
      vi.spyOn(Date, 'now').mockReturnValue(5000);

      expect(() => handlers.forEach((handler) => handler())).not.toThrow();
      expect(azFineControl.sync.mock.calls).toHaveLength(syncCallsBefore);
    });

    it('should update beacon metrics on throttled UPDATE', () => {
      // Find ALL UPDATE handlers (there are two: antennaStateHandler_ and updateHandler_)
      const updateHandlers = mockEventBus.on.mock.calls.filter((call: unknown[]) => call[0] === Events.UPDATE).map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 15.5;
      antenna.state.trackingMode = 'manual';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach((handler) => handler());

      const beaconCnEl = document.querySelector(`#${PREFIX}beacon-cn-value`);
      expect(beaconCnEl?.textContent).toBe('15.5 dB');
    });
  });

  describe('DRAW event handler', () => {
    it('should update RF metrics when DRAW event fires', () => {
      const drawHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.DRAW)?.[1];
      expect(drawHandler).toBeDefined();

      // Modify RF metrics
      const antenna = mockGroundStation.antennas[0];
      antenna.state.rfMetrics.frequency_GHz = 14.5;

      drawHandler();

      const freqEl = document.querySelector(`#${PREFIX}rf-metric-freq`);
      expect(freqEl?.textContent).toBe('14.500 GHz');
    });
  });

  describe('readouts agree (phase 29 D4)', () => {
    const resync = (now: number) => {
      vi.spyOn(Date, 'now').mockReturnValue(now);
      for (const call of mockEventBus.on.mock.calls.filter((c: unknown[]) => c[0] === Events.UPDATE || c[0] === Events.DRAW)) {
        (call[1] as () => void)();
      }
    };

    it('shows the APPLIED mode and a pending badge for a staged MAINT (nats-r3-s11-F2)', () => {
      const state = mockGroundStation.antennas[0].state as Record<string, unknown>;
      try {
        state.trackingMode = 'program-track';
        state.stagedTrackingMode = 'maintenance';
        state.hasStagedChanges = true;
        resync(100_000);
        const badge = document.querySelector(`#${PREFIX}staged-mode-badge`) as HTMLElement;
        expect(badge.textContent).toBe('MAINTENANCE pending APPLY');
        expect(badge.style.display).toBe('');
        expect(document.querySelector('[data-mode="program-track"]')?.classList.contains('active')).toBe(true);
        expect(document.querySelector('[data-mode="maintenance"]')?.classList.contains('active')).toBe(false);
        expect(document.querySelector('[data-mode="maintenance"]')?.classList.contains('pending')).toBe(true);

        state.stagedTrackingMode = null;
        resync(200_000);
        expect(badge.style.display).toBe('none');
      } finally {
        state.trackingMode = 'manual';
        state.stagedTrackingMode = null;
        state.hasStagedChanges = false;
      }
    });

    it('reads no beacon frequency with no target outside MANUAL (nats-r4-s12-F1)', () => {
      const state = mockGroundStation.antennas[0].state as Record<string, unknown>;
      try {
        state.trackingMode = 'stow';
        state.targetSatelliteId = null;
        resync(300_000);
        expect(document.querySelector(`#${PREFIX}rf-metric-freq`)?.textContent).toBe('-- GHz');
      } finally {
        state.trackingMode = 'manual';
      }
    });

    it('labels the ACU signal count as what it counts: RF carriers in view, not locked carriers (nats-r4-s23-F2)', () => {
      const label = document.querySelector(`#${PREFIX}signals-count-display`)?.previousElementSibling;
      expect(label?.textContent).toBe('RF signals in view:');
    });

    it('counts only carriers from satellites inside the main beam; parked off the satellite it reads 0 (nats-r5-s11-F1)', () => {
      const signal = (signalId: string) => ({ signalId, frequency: 3.7e9 });
      const heard = [signal('a'), signal('b')];
      const antenna = {
        state: { rxSignalsIn: heard },
        rxSignals: heard.map((s, i) => ({ signal: s, view: { az: 150 + i * 30, el: 35 } })),
        pointingLossDb: vi.fn((az: number) => (az === 150 ? 0.4 : 25)),
      };
      expect(ACUControlTab.signalsInBeam(antenna as any)).toBe(1);
      antenna.pointingLossDb.mockReturnValue(30);
      expect(ACUControlTab.signalsInBeam(antenna as any)).toBe(0);
    });
  });

  describe('UI sync with antenna state', () => {
    it('should show fault message when antenna has fault', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.hasFault = true;
      antenna.state.faultMessage = 'Motor failure';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const faultEl = document.querySelector(`#${PREFIX}fault-message`) as HTMLElement;
      expect(faultEl?.style.display).toBe('block');
      expect(faultEl?.textContent).toBe('Motor failure');
    });

    it('should update step track toggle when step-track is enabled', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const toggle = document.querySelector(`#${PREFIX}step-track-toggle`) as HTMLInputElement;
      expect(toggle?.checked).toBe(true);
    });

    it('should update context panel title for program-track mode', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const contextTitle = document.querySelector(`#${PREFIX}context-panel-title`);
      expect(contextTitle?.textContent).toBe('Program Track');
    });

    it('should update context panel title for program-track with step-track enabled', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const contextTitle = document.querySelector(`#${PREFIX}context-panel-title`);
      expect(contextTitle?.textContent).toBe('Program + Step Track');
    });

    it('should show a red ACU status LED titled with the ANTENNA NOT OPERATIONAL alarm', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;
      (AlarmService.getAlarms as Mock).mockReturnValue([{ severity: 'error', message: 'ANTENNA NOT OPERATIONAL', assetId: 'GS-001', equipmentType: 'ANT', equipmentIndex: 0 }]);

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const statusLed = document.querySelector(`#${PREFIX}status-led`) as HTMLElement;
      expect(statusLed.className).toBe('card-alarm-led ms-2 error');
      expect(statusLed.title).toBe('ANTENNA NOT OPERATIONAL');
      antenna.state.isOperational = true;
    });

    it('should show off ACU status LED when not powered', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.isPowered = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const statusLed = document.querySelector(`#${PREFIX}status-led`) as HTMLElement;
      expect(statusLed.classList.contains('off')).toBe(true);
      expect(statusLed.classList.contains('ms-2')).toBe(true);
      expect(statusLed.title).toBe('Antenna off');
      antenna.state.isPowered = true;
    });

    describe('ACU status LED from AlarmService (Phase 33 D2, nats-r8-s23-F1)', () => {
      const led = () => document.querySelector(`#${PREFIX}status-led`) as HTMLElement;
      const sync = (now: number) => {
        const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
        vi.spyOn(Date, 'now').mockReturnValue(now);
        updateHandler();
      };
      const antAlarm = (severity: string, message: string, equipmentIndex = 0) => ({ severity, message, assetId: 'GS-001', equipmentType: 'ANT', equipmentIndex });

      beforeEach(() => {
        const state = mockGroundStation.antennas[0].state;
        state.isPowered = true;
        state.isOperational = true;
        state.hasFault = false;
        state.faultMessage = null;
      });

      it('reads ACU AUTOMATION FAULT red, titled with the alarm, and keeps the id and ms-2', () => {
        (AlarmService.getAlarms as Mock).mockReturnValue([antAlarm('error', 'ACU AUTOMATION FAULT - MANUAL CONTROL ONLY')]);
        sync(3000);
        expect(led().id).toBe(`${PREFIX}status-led`);
        expect(led().className).toBe('card-alarm-led ms-2 error');
        expect(led().title).toBe('ACU AUTOMATION FAULT - MANUAL CONTROL ONLY');
        expect(AlarmService.getAlarms).toHaveBeenCalledWith(mockGroundStation);
      });

      it('shows the worst ANT alarm and ignores other equipment and other antennas', () => {
        (AlarmService.getAlarms as Mock).mockReturnValue([
          { severity: 'error', message: 'HPA over-temperature', assetId: 'GS-001', equipmentType: 'RF', equipmentIndex: 0 },
          antAlarm('error', 'SUN TRANSIT', 1),
          antAlarm('warning', 'ICE ON FEED (2.4 dB)'),
        ]);
        sync(3000);
        expect(led().classList.contains('warning')).toBe(true);
        expect(led().title).toBe('ICE ON FEED (2.4 dB)');
      });

      it('lights the module fault as an error, then reads green No alarms once clear', () => {
        const state = mockGroundStation.antennas[0].state;
        state.hasFault = true;
        state.faultMessage = 'Servo amplifier fault';
        sync(3000);
        expect(led().classList.contains('error')).toBe(true);
        expect(led().title).toBe('Servo amplifier fault');

        state.faultMessage = null;
        sync(4000);
        expect(led().title).toBe('Antenna fault');

        state.hasFault = false;
        sync(5000);
        expect(led().className).toBe('card-alarm-led ms-2 success');
        expect(led().title).toBe('No alarms');
      });

      it('goes grey at once when the power switch turns the antenna off', () => {
        sync(3000);
        expect(led().classList.contains('success')).toBe(true);
        const powerSwitch = document.querySelector(`#${PREFIX}power-switch`) as HTMLInputElement;
        mockGroundStation.antennas[0].state.isPowered = false;
        powerSwitch.checked = false;
        powerSwitch.dispatchEvent(new Event('change'));
        expect(led().classList.contains('off')).toBe(true);
        expect(led().title).toBe('Antenna off');
        mockGroundStation.antennas[0].state.isPowered = true;
      });
    });

    it('should update ice accumulation display', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.iceAccumulation_dB = 3.5;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const iceDisplay = document.querySelector(`#${PREFIX}ice-accumulation-display`);
      expect(iceDisplay?.textContent).toBe('3.5 dB');
      expect(iceDisplay?.classList.contains('text-warning')).toBe(true);
    });

    it('should show danger color for high ice accumulation', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.iceAccumulation_dB = 6.0;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const iceDisplay = document.querySelector(`#${PREFIX}ice-accumulation-display`);
      expect(iceDisplay?.classList.contains('text-danger')).toBe(true);
    });
  });

  describe('beacon C/N display', () => {
    it('should display null beacon C/N as --', () => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = null;
      antenna.state.trackingMode = 'manual';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const beaconCnEl = document.querySelector(`#${PREFIX}beacon-cn-value`);
      expect(beaconCnEl?.textContent).toBe('-- dB');
    });

    it('should show green fill for good beacon C/N', () => {
      // Find ALL UPDATE handlers (there are two: antennaStateHandler_ and updateHandler_)
      const updateHandlers = mockEventBus.on.mock.calls.filter((call: unknown[]) => call[0] === Events.UPDATE).map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 15.0;
      antenna.state.trackingMode = 'manual';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach((handler) => handler());

      const beaconFillEl = document.querySelector(`#${PREFIX}beacon-strength-fill`) as HTMLElement;
      expect(beaconFillEl?.classList.contains('cn-green')).toBe(true);
    });

    it('should show amber fill for medium beacon C/N', () => {
      const updateHandlers = mockEventBus.on.mock.calls.filter((call: unknown[]) => call[0] === Events.UPDATE).map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 7.0;
      antenna.state.trackingMode = 'manual';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach((handler) => handler());

      const beaconFillEl = document.querySelector(`#${PREFIX}beacon-strength-fill`) as HTMLElement;
      expect(beaconFillEl?.classList.contains('cn-amber')).toBe(true);
    });

    it('should show red fill for low beacon C/N', () => {
      const updateHandlers = mockEventBus.on.mock.calls.filter((call: unknown[]) => call[0] === Events.UPDATE).map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 3.0;
      antenna.state.trackingMode = 'manual';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach((handler) => handler());

      const beaconFillEl = document.querySelector(`#${PREFIX}beacon-strength-fill`) as HTMLElement;
      expect(beaconFillEl?.classList.contains('cn-red')).toBe(true);
    });

    it('should show IDLE status for step-track when enabled but not auto-tracking', () => {
      const updateHandlers = mockEventBus.on.mock.calls.filter((call: unknown[]) => call[0] === Events.UPDATE).map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;
      antenna.state.isAutoTrackEnabled = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach((handler) => handler());

      const beaconLockEl = document.querySelector(`#${PREFIX}beacon-lock-status`);
      expect(beaconLockEl?.textContent).toBe('IDLE');
    });

    it('should show SEARCHING status for step-track when auto-tracking but not locked', () => {
      const updateHandlers = mockEventBus.on.mock.calls.filter((call: unknown[]) => call[0] === Events.UPDATE).map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.isBeaconLocked = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach((handler) => handler());

      const beaconLockEl = document.querySelector(`#${PREFIX}beacon-lock-status`);
      expect(beaconLockEl?.textContent).toBe('SEARCHING');
    });

    it('should show LOCKED status for step-track when beacon locked', () => {
      const updateHandlers = mockEventBus.on.mock.calls.filter((call: unknown[]) => call[0] === Events.UPDATE).map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.isBeaconLocked = true;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach((handler) => handler());

      const beaconLockEl = document.querySelector(`#${PREFIX}beacon-lock-status`);
      expect(beaconLockEl?.textContent).toBe('LOCKED');
    });
  });

  describe('heater and Environmental LEDs (Phase 32 D14, nats-r7-s20-F1)', () => {
    const sync = (now: number) => {
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      vi.spyOn(Date, 'now').mockReturnValue(now);
      updateHandler();
    };
    const setWeather = (events: { type: string }[]) => {
      WeatherManager.getInstance.mockReturnValue({
        isPrecipitationActive: vi.fn(() => events.some((e) => ['snow', 'rain', 'hail', 'ice'].includes(e.type))),
        getActiveWeatherEvents: vi.fn(() => events.map((e) => ({ ...e, groundStationId: 'GS-001', isActive: true }))),
      });
    };
    const envLed = () => document.querySelector(`#${PREFIX}env-led`) as HTMLElement;

    beforeEach(() => {
      const state = mockGroundStation.antennas[0].state;
      state.isHeaterEnabled = false;
      state.isRainBlowerEnabled = false;
      state.iceAccumulation_dB = 0;
    });
    afterEach(() => {
      setWeather([]);
    });

    it('lights the heater LED green while on, titled Heater ON / OFF', () => {
      const antenna = mockGroundStation.antennas[0];
      const led = () => document.querySelector(`#${PREFIX}heater-led`) as HTMLElement;
      antenna.state.isHeaterEnabled = true;
      sync(3000);
      expect(led().className).toBe('card-alarm-led success');
      expect(led().title).toBe('Heater ON');

      antenna.state.isHeaterEnabled = false;
      sync(5000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('Heater OFF');
    });

    it('titles the rain blower LED Rain blower ON / OFF with its class, as the heater (Phase 34 D4, nats-r9-s01-F1)', () => {
      const antenna = mockGroundStation.antennas[0];
      const led = () => document.querySelector(`#${PREFIX}blower-led`) as HTMLElement;
      expect(led().title).toBe('Rain blower OFF');

      antenna.state.isRainBlowerEnabled = true;
      sync(3000);
      expect(led().className).toBe('card-alarm-led success');
      expect(led().title).toBe('Rain blower ON');

      antenna.state.isRainBlowerEnabled = false;
      sync(5000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('Rain blower OFF');
    });

    it('turns the Environmental header amber with ice at the ICE ON FEED warning level, titled with the depth', () => {
      setWeather([]);
      const antenna = mockGroundStation.antennas[0];
      const led = envLed;

      antenna.state.iceAccumulation_dB = 3.1;
      sync(3000);
      expect(led().className).toBe('card-alarm-led warning');
      expect(led().title).toBe('Ice on feed 3.1 dB');

      antenna.state.iceAccumulation_dB = 6;
      sync(5000);
      expect(led().className).toBe('card-alarm-led error');

      // Melted below the warning level, no precipitation: clear, whatever the heater does
      antenna.state.iceAccumulation_dB = 0.3;
      antenna.state.isHeaterEnabled = true;
      sync(7000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('Clear - ice 0.3 dB, no precipitation');
    });

    it('reads snow amber with the heater off and green with it on (Phase 33 D3, nats-r7-s20-F1)', () => {
      setWeather([{ type: 'snow' }]);
      const state = mockGroundStation.antennas[0].state;

      sync(3000);
      expect(envLed().className).toBe('card-alarm-led warning');
      expect(envLed().title).toBe('Snow falling - feed heater OFF, ice 0.0 dB');

      state.isHeaterEnabled = true;
      state.iceAccumulation_dB = 1.2;
      sync(4000);
      expect(envLed().className).toBe('card-alarm-led success');
      expect(envLed().title).toBe('Snow falling - feed heater ON, ice 1.2 dB');

      // The heater does not excuse ice at the alarm levels
      state.iceAccumulation_dB = 2.4;
      sync(5000);
      expect(envLed().className).toBe('card-alarm-led warning');
      expect(envLed().title).toBe('Ice on feed 2.4 dB');
      state.iceAccumulation_dB = 5.1;
      sync(6000);
      expect(envLed().className).toBe('card-alarm-led error');
      expect(envLed().title).toBe('Ice on feed 5.1 dB');
    });

    it('names hail and freezing rain by type and leaves the blower out of frozen precipitation', () => {
      const state = mockGroundStation.antennas[0].state;
      state.isRainBlowerEnabled = true;
      setWeather([{ type: 'hail' }]);
      sync(3000);
      expect(envLed().className).toBe('card-alarm-led warning');
      expect(envLed().title).toBe('Hail falling - feed heater OFF, ice 0.0 dB');

      setWeather([{ type: 'ice' }]);
      state.isHeaterEnabled = true;
      sync(4000);
      expect(envLed().className).toBe('card-alarm-led success');
      expect(envLed().title).toBe('Freezing rain falling - feed heater ON, ice 0.0 dB');
    });

    it('reads rain amber with the heater and blower both off, green with either on', () => {
      setWeather([{ type: 'rain' }]);
      const state = mockGroundStation.antennas[0].state;

      sync(3000);
      expect(envLed().className).toBe('card-alarm-led warning');
      expect(envLed().title).toBe('Rain falling - feed heater and rain blower OFF, ice 0.0 dB');

      state.isRainBlowerEnabled = true;
      sync(4000);
      expect(envLed().className).toBe('card-alarm-led success');
      expect(envLed().title).toBe('Rain falling - rain blower ON, ice 0.0 dB');

      state.isRainBlowerEnabled = false;
      state.isHeaterEnabled = true;
      sync(5000);
      expect(envLed().className).toBe('card-alarm-led success');
      expect(envLed().title).toBe('Rain falling - feed heater ON, ice 0.0 dB');
    });

    it('reports the unmitigated event when two fall at once, and ignores wind and fog', () => {
      setWeather([{ type: 'wind' }, { type: 'rain' }, { type: 'snow' }]);
      const state = mockGroundStation.antennas[0].state;
      state.isRainBlowerEnabled = true;
      sync(3000);
      expect(envLed().className).toBe('card-alarm-led warning');
      expect(envLed().title).toBe('Snow falling - feed heater OFF, ice 0.0 dB');

      setWeather([{ type: 'fog' }, { type: 'wind' }]);
      sync(4000);
      expect(envLed().className).toBe('card-alarm-led off');
    });

    it('refreshes the ice readout and Environmental LED once per scenario second (Phase 33 D7, nats-r8-s20-F1)', () => {
      const state = mockGroundStation.antennas[0].state;
      const ice = () => document.querySelector(`#${PREFIX}ice-accumulation-display`) as HTMLElement;
      state.iceAccumulation_dB = 1;
      sync(3000);
      expect(ice().textContent).toBe('1.0 dB');

      // Later ticks in the same scenario second keep the sampled value
      state.iceAccumulation_dB = 2.2;
      sync(3500);
      sync(3999);
      expect(ice().textContent).toBe('1.0 dB');
      expect(envLed().className).toBe('card-alarm-led off');

      sync(4000);
      expect(ice().textContent).toBe('2.2 dB');
      expect(envLed().className).toBe('card-alarm-led warning');
    });

    it('refreshes at once when the operator switches the heater, mid-second', () => {
      setWeather([{ type: 'snow' }]);
      const state = mockGroundStation.antennas[0].state;
      sync(3000);
      expect(envLed().className).toBe('card-alarm-led warning');

      vi.spyOn(Date, 'now').mockReturnValue(3400);
      state.isHeaterEnabled = true;
      const heaterSwitch = document.querySelector(`#${PREFIX}heater-switch`) as HTMLInputElement;
      heaterSwitch.checked = true;
      heaterSwitch.dispatchEvent(new Event('change'));
      expect(envLed().className).toBe('card-alarm-led success');
      expect(envLed().title).toBe('Snow falling - feed heater ON, ice 0.0 dB');
    });
  });

  describe('precipitation status', () => {
    it('should update precipitation status from weather manager', () => {
      WeatherManager.getInstance.mockReturnValue({
        isPrecipitationActive: vi.fn(() => true),
        getActiveWeatherEvents: vi.fn(() => [{ type: 'snow', groundStationId: 'GS-001', isActive: true }]),
      });

      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const precipStatus = document.querySelector(`#${PREFIX}precip-status`);
      const led = precipStatus?.querySelector('.card-alarm-led');
      expect(led?.className).toContain('card-alarm-led warning');
    });

    it('titles the precipitation dot ACTIVE / CLEAR with its class, and keeps the text (Phase 34 D4, nats-r9-s01-F1)', () => {
      const precipStatus = () => document.querySelector(`#${PREFIX}precip-status`) as HTMLElement;
      const led = () => precipStatus().querySelector('.card-alarm-led') as HTMLElement;
      // Every sync sets the title, from whatever weather the constructor's sync saw
      expect(led().title).not.toBe('');

      WeatherManager.getInstance.mockReturnValue({
        isPrecipitationActive: vi.fn(() => true),
        getActiveWeatherEvents: vi.fn(() => [{ type: 'rain', groundStationId: 'GS-001', isActive: true }]),
      });
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();
      expect(led().className).toBe('card-alarm-led warning me-1');
      expect(led().title).toBe('Precipitation ACTIVE');
      expect(precipStatus().textContent?.trim()).toBe('ACTIVE');

      WeatherManager.getInstance.mockReturnValue({
        isPrecipitationActive: vi.fn(() => false),
        getActiveWeatherEvents: vi.fn(() => []),
      });
      vi.spyOn(Date, 'now').mockReturnValue(4000);
      updateHandler();
      expect(led().className).toBe('card-alarm-led off me-1');
      expect(led().title).toBe('Precipitation CLEAR');
      expect(precipStatus().textContent?.trim()).toBe('CLEAR');
    });
  });

  describe('current target display', () => {
    it('should display satellite name when target is active', () => {
      SimulationManager.getInstance.mockReturnValue({
        satellites: [{ noradId: 12345, name: 'Test Satellite 1' }],
        getSatByNoradId: vi.fn(() => null),
        registry: { get: (n: number) => ([{ noradId: 12345, name: 'Test Satellite 1' }] as Array<{ noradId: number }>).find((s) => s.noradId === n) },
      });

      const antenna = mockGroundStation.antennas[0];
      antenna.state.targetSatelliteId = 12345;

      // Simulate setting active target and clicking move button
      tab.dispose();
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'acu-control-container-target';
      document.body.appendChild(containerEl2);
      const tab2 = new ACUControlTab(mockGroundStation, 'acu-control-container-target');

      const moveBtn = document.querySelector(`#${PREFIX}move-to-target-btn`) as HTMLButtonElement;
      moveBtn.disabled = false;
      moveBtn.click();

      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const currentTargetDisplay = document.querySelector(`#${PREFIX}current-target-display`) as HTMLInputElement;
      expect(currentTargetDisplay?.value).toBe('Test Satellite 1');
      tab2.dispose();
    });

    describe('reads the antenna target, not a tab-local copy (s06-F4, s10-F4, s11-F4)', () => {
      const runUpdates = () => {
        vi.spyOn(Date, 'now').mockReturnValue(5000);
        for (const call of mockEventBus.on.mock.calls.filter((c: unknown[]) => c[0] === Events.UPDATE)) {
          (call[1] as () => void)();
        }
      };

      afterEach(() => {
        mockGroundStation.antennas[0].state.targetSatelliteId = null;
      });

      it('shows a target set elsewhere (scenario, another tab) without Move to Target', () => {
        SimulationManager.getInstance.mockReturnValue({
          satellites: [{ noradId: 12345, name: 'TIDEMARK-1' }],
          getSatByNoradId: vi.fn(() => null),
          registry: { get: (n: number) => ([{ noradId: 12345, name: 'TIDEMARK-1' }] as Array<{ noradId: number }>).find((s) => s.noradId === n) },
        });
        const display = document.querySelector(`#${PREFIX}current-target-display`) as HTMLInputElement;

        mockGroundStation.antennas[0].state.targetSatelliteId = 12345;
        runUpdates();
        expect(display.value).toBe('TIDEMARK-1');

        mockGroundStation.antennas[0].state.targetSatelliteId = null;
        runUpdates();
        expect(display.value).toBe('No Target');
      });

      it('rebuilds the target dropdown when the satellite list changes', () => {
        const select = document.querySelector(`#${PREFIX}satellite-select`) as HTMLSelectElement;
        SimulationManager.getInstance.mockReturnValue({
          satellites: [
            { noradId: 111, name: 'SAT-A' },
            { noradId: 222, name: 'SAT-B' },
          ],
          getSatByNoradId: vi.fn(() => null),
          registry: {
            get: (n: number) =>
              (
                [
                  { noradId: 111, name: 'SAT-A' },
                  { noradId: 222, name: 'SAT-B' },
                ] as Array<{ noradId: number }>
              ).find((s) => s.noradId === n),
          },
        });
        mockGroundStation.antennas[0].state.targetSatelliteId = 222;

        runUpdates();

        expect([...select.options].map((o) => o.textContent)).toEqual(['-- Select Satellite --', 'SAT-A', 'SAT-B']);
        expect(select.value).toBe('222');
      });

      it('names an unknown target by NORAD id rather than going blank', () => {
        SimulationManager.getInstance.mockReturnValue({
          satellites: [],
          getSatByNoradId: vi.fn(() => null),
          registry: { get: (n: number) => ([] as Array<{ noradId: number }>).find((s) => s.noradId === n) },
        });
        mockGroundStation.antennas[0].state.targetSatelliteId = 99999;
        runUpdates();
        expect((document.querySelector(`#${PREFIX}current-target-display`) as HTMLInputElement).value).toBe('NORAD 99999');
      });
    });
  });

  describe('status labels', () => {
    it('distinguishes pointing lock from beacon lock (s24-F4)', () => {
      const pointingRow = document.querySelector(`#${PREFIX}lock-status-display`)?.parentElement;
      const beaconRow = document.querySelector(`#${PREFIX}beacon-lock-status`)?.parentElement;
      expect(pointingRow?.textContent).toContain('Pointing:');
      expect(beaconRow?.textContent).toContain('Beacon Lock:');
    });

    it('lets the Step-Track, Feed Heater and Rain Blower labels toggle their switches (s19-F3, s02-F8)', () => {
      for (const id of ['step-track-toggle', 'heater-switch', 'blower-switch']) {
        expect(document.querySelector(`label[for="${PREFIX}${id}"]`)).not.toBeNull();
      }
    });
  });
  describe('beacon readouts (phase 27)', () => {
    it("shows the beacon's IF through the station LNB and labels C/N with its measurement bandwidth", () => {
      const ifText = document.querySelector('[id$="beacon-if"]')?.textContent ?? '';
      expect(ifText).toContain('1202.0 MHz');
      expect(ifText).toContain('LNB LO 5150');
      expect(document.querySelector('[id$="beacon-cn-label"]')?.textContent).toBe('Beacon C/N (1 kHz)');
    });

    it('formats bandwidths and IFs', () => {
      expect(ACUControlTab.formatBandwidth(1_000)).toBe('1 kHz');
      expect(ACUControlTab.formatBandwidth(300)).toBe('300 Hz');
      expect(ACUControlTab.beaconIfMHz(4175.5, 5250)).toBeCloseTo(1074.5, 6);
    });
  });
});
