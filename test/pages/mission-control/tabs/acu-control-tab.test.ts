import { Mock, Mocked, vi } from 'vitest';
import { GroundStation } from '../../../../src/assets/ground-station/ground-station';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
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
    })),
  },
}));
vi.mock('../../../../src/weather/weather-manager', () => ({
  WeatherManager: {
    getInstance: vi.fn(() => ({
      isPrecipitationActive: vi.fn(() => false),
    })),
  },
}));

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
          handleTargetSatelliteChange: vi.fn(),
          moveToTargetSatellite: vi.fn(),
          stageBeaconFrequencyChange: vi.fn(),
          stageBeaconSearchBwChange: vi.fn(),
          startStepTrack: vi.fn(),
          stopStepTrack: vi.fn(),
          handleStepTrackToggle: vi.fn(),
          handleHeaterToggle: vi.fn(),
          handleRainBlowerToggle: vi.fn(),
        },
      ],
      rfFrontEnds: [
        {
          omtModule: { state: {} },
        },
      ],
      initializeEquipment: vi.fn(),
    } as unknown as Mocked<GroundStation>;

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'acu-control-container';
    document.body.appendChild(containerEl);

    tab = new ACUControlTab(mockGroundStation, 'acu-control-container');
  });

  afterEach(() => {
    tab.dispose();
    document.body.innerHTML = '';
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
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });

    it('should register for DRAW events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.DRAW,
        expect.any(Function)
      );
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
    it('should call handleTrackingModeChange when mode button is clicked', () => {
      const antenna = mockGroundStation.antennas[0];
      const stowBtn = document.querySelector('[data-mode="stow"]') as HTMLButtonElement;
      stowBtn.click();

      expect(antenna.handleTrackingModeChange).toHaveBeenCalledWith('stow');
    });

    it('should clear active target when leaving program-track mode', () => {
      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';

      const manualBtn = document.querySelector('[data-mode="manual"]') as HTMLButtonElement;
      manualBtn.click();

      expect(antenna.handleTrackingModeChange).toHaveBeenCalledWith('manual');
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
  });

  describe('satellite dropdown interactions', () => {
    it('should call handleTargetSatelliteChange when satellite is selected', () => {
      SimulationManager.getInstance.mockReturnValue({
        satellites: [
          { noradId: 12345, name: 'Test Satellite 1' },
          { noradId: 67890, name: 'Test Satellite 2' },
        ],
        getSatByNoradId: vi.fn(() => null),
      });

      // Recreate tab to get updated dropdown
      tab.dispose();
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'acu-control-container-sat';
      document.body.appendChild(containerEl2);
      const tab2 = new ACUControlTab(mockGroundStation, 'acu-control-container-sat');

      const antenna = mockGroundStation.antennas[0];
      const select = document.querySelector(`#${PREFIX}satellite-select`) as HTMLSelectElement;
      select.value = '12345';
      select.dispatchEvent(new Event('change'));

      expect(antenna.handleTargetSatelliteChange).toHaveBeenCalledWith(12345);
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
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];
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

    it('should update beacon metrics on throttled UPDATE', () => {
      // Find ALL UPDATE handlers (there are two: antennaStateHandler_ and updateHandler_)
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 15.5;
      antenna.state.trackingMode = 'manual';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconCnEl = document.querySelector(`#${PREFIX}beacon-cn-value`);
      expect(beaconCnEl?.textContent).toBe('15.5 dB');
    });
  });

  describe('DRAW event handler', () => {
    it('should update RF metrics when DRAW event fires', () => {
      const drawHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.DRAW
      )?.[1];
      expect(drawHandler).toBeDefined();

      // Modify RF metrics
      const antenna = mockGroundStation.antennas[0];
      antenna.state.rfMetrics.frequency_GHz = 14.5;

      drawHandler();

      const freqEl = document.querySelector(`#${PREFIX}rf-metric-freq`);
      expect(freqEl?.textContent).toBe('14.500 GHz');
    });
  });

  describe('UI sync with antenna state', () => {
    it('should show fault message when antenna has fault', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

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
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const toggle = document.querySelector(`#${PREFIX}step-track-toggle`) as HTMLInputElement;
      expect(toggle?.checked).toBe(true);
    });

    it('should update context panel title for program-track mode', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const contextTitle = document.querySelector(`#${PREFIX}context-panel-title`);
      expect(contextTitle?.textContent).toBe('Program Track');
    });

    it('should update context panel title for program-track with step-track enabled', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const contextTitle = document.querySelector(`#${PREFIX}context-panel-title`);
      expect(contextTitle?.textContent).toBe('Program + Step Track');
    });

    it('should show warning ACU status LED when not operational', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const statusLed = document.querySelector(`#${PREFIX}status-led`);
      expect(statusLed?.className).toContain('card-alarm-led warning');
    });

    it('should show off ACU status LED when not powered', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.isPowered = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const statusLed = document.querySelector(`#${PREFIX}status-led`);
      expect(statusLed?.className).toContain('card-alarm-led off');
    });

    it('should update ice accumulation display', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.iceAccumulation_dB = 3.5;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const iceDisplay = document.querySelector(`#${PREFIX}ice-accumulation-display`);
      expect(iceDisplay?.textContent).toBe('3.5 dB');
      expect(iceDisplay?.classList.contains('text-warning')).toBe(true);
    });

    it('should show danger color for high ice accumulation', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

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
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

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
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 15.0;
      antenna.state.trackingMode = 'manual';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconFillEl = document.querySelector(`#${PREFIX}beacon-strength-fill`) as HTMLElement;
      expect(beaconFillEl?.classList.contains('cn-green')).toBe(true);
    });

    it('should show amber fill for medium beacon C/N', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 7.0;
      antenna.state.trackingMode = 'manual';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconFillEl = document.querySelector(`#${PREFIX}beacon-strength-fill`) as HTMLElement;
      expect(beaconFillEl?.classList.contains('cn-amber')).toBe(true);
    });

    it('should show red fill for low beacon C/N', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 3.0;
      antenna.state.trackingMode = 'manual';

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconFillEl = document.querySelector(`#${PREFIX}beacon-strength-fill`) as HTMLElement;
      expect(beaconFillEl?.classList.contains('cn-red')).toBe(true);
    });

    it('should show IDLE status for step-track when enabled but not auto-tracking', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;
      antenna.state.isAutoTrackEnabled = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconLockEl = document.querySelector(`#${PREFIX}beacon-lock-status`);
      expect(beaconLockEl?.textContent).toBe('IDLE');
    });

    it('should show SEARCHING status for step-track when auto-tracking but not locked', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.isBeaconLocked = false;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconLockEl = document.querySelector(`#${PREFIX}beacon-lock-status`);
      expect(beaconLockEl?.textContent).toBe('SEARCHING');
    });

    it('should show LOCKED status for step-track when beacon locked', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';
      antenna.state.isStepTrackEnabled = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.isBeaconLocked = true;

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconLockEl = document.querySelector(`#${PREFIX}beacon-lock-status`);
      expect(beaconLockEl?.textContent).toBe('LOCKED');
    });
  });

  describe('precipitation status', () => {
    it('should update precipitation status from weather manager', () => {
      WeatherManager.getInstance.mockReturnValue({
        isPrecipitationActive: vi.fn(() => true),
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const precipStatus = document.querySelector(`#${PREFIX}precip-status`);
      const led = precipStatus?.querySelector('.card-alarm-led');
      expect(led?.className).toContain('card-alarm-led warning');
    });
  });

  describe('current target display', () => {
    it('should display satellite name when target is active', () => {

      SimulationManager.getInstance.mockReturnValue({
        satellites: [
          { noradId: 12345, name: 'Test Satellite 1' },
        ],
        getSatByNoradId: vi.fn(() => null),
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

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const currentTargetDisplay = document.querySelector(`#${PREFIX}current-target-display`) as HTMLInputElement;
      expect(currentTargetDisplay?.value).toBe('Test Satellite 1');
      tab2.dispose();
    });
  });
});
