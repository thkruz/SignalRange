import { ACUControlTab } from '../../../../src/pages/mission-control/tabs/acu-control-tab';
import { GroundStation } from '../../../../src/assets/ground-station/ground-station';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';

// Mock dependencies
jest.mock('../../../../src/events/event-bus');
jest.mock('../../../../src/assets/ground-station/ground-station');
jest.mock('../../../../src/pages/mission-control/tabs/antenna-adapter');
jest.mock('../../../../src/pages/mission-control/tabs/omt-adapter');
jest.mock('../../../../src/components/fine-adjust-control/fine-adjust-control', () => ({
  FineAdjustControl: {
    create: jest.fn(() => ({
      html: '<div class="mock-fine-adjust"></div>',
      addEventListeners: jest.fn(),
      sync: jest.fn(),
      setEnabled: jest.fn(),
    })),
  },
}));
jest.mock('../../../../src/components/polar-plot/polar-plot', () => ({
  PolarPlot: {
    create: jest.fn(() => ({
      html: '<div class="mock-polar-plot"></div>',
      onDomReady: jest.fn(),
      draw: jest.fn(),
    })),
  },
}));
jest.mock('../../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      satellites: [],
    })),
  },
}));
jest.mock('../../../../src/weather/weather-manager', () => ({
  WeatherManager: {
    getInstance: jest.fn(() => ({
      isPrecipitationActive: jest.fn(() => false),
    })),
  },
}));

describe('ACUControlTab', () => {
  let mockGroundStation: jest.Mocked<GroundStation>;
  let containerEl: HTMLElement;
  let tab: ACUControlTab;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

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
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup mock GroundStation
    mockGroundStation = {
      uuid: 'test-uuid',
      state: { id: 'GS-001' },
      antennas: [
        {
          state: mockAntennaState,
          stageAzimuthChange: jest.fn(),
          stageElevationChange: jest.fn(),
          stagePolarizationChange: jest.fn(),
          applyChanges: jest.fn(),
          discardChanges: jest.fn(),
          handleTrackingModeChange: jest.fn(),
          handleTargetSatelliteChange: jest.fn(),
          moveToTargetSatellite: jest.fn(),
          stageBeaconFrequencyChange: jest.fn(),
          stageBeaconSearchBwChange: jest.fn(),
          startStepTrack: jest.fn(),
          stopStepTrack: jest.fn(),
          handleHeaterToggle: jest.fn(),
          handleRainBlowerToggle: jest.fn(),
        },
      ],
      rfFrontEnds: [
        {
          omtModule: { state: {} },
        },
      ],
      initializeEquipment: jest.fn(),
    } as unknown as jest.Mocked<GroundStation>;

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
      } as unknown as jest.Mocked<GroundStation>;

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
      const modelEl = document.querySelector('#acu-model');
      expect(modelEl?.textContent).toContain('Kratos');
    });

    it('should render tracking mode selector', () => {
      const trackingBtns = document.querySelectorAll('.btn-tracking');
      expect(trackingBtns.length).toBe(5);
    });

    it('should render power switch', () => {
      const powerSwitch = document.querySelector('#power-switch');
      expect(powerSwitch).not.toBeNull();
    });

    it('should render loopback switch', () => {
      const loopbackSwitch = document.querySelector('#loopback-switch');
      expect(loopbackSwitch).not.toBeNull();
    });

    it('should render polar plot container', () => {
      const polarPlotContainer = document.querySelector('#polar-plot-container');
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

    it('should render STEP button', () => {
      const stepBtn = document.querySelector('[data-mode="step-track"]');
      expect(stepBtn).not.toBeNull();
    });
  });

  describe('environmental controls', () => {
    it('should render heater switch', () => {
      const heaterSwitch = document.querySelector('#heater-switch');
      expect(heaterSwitch).not.toBeNull();
    });

    it('should render blower switch', () => {
      const blowerSwitch = document.querySelector('#blower-switch');
      expect(blowerSwitch).not.toBeNull();
    });

    it('should render ice accumulation display', () => {
      const iceDisplay = document.querySelector('#ice-accumulation-display');
      expect(iceDisplay).not.toBeNull();
    });
  });

  describe('RF metrics display', () => {
    it('should render frequency metric', () => {
      const freqMetric = document.querySelector('#rf-metric-freq');
      expect(freqMetric).not.toBeNull();
    });

    it('should render gain metric', () => {
      const gainMetric = document.querySelector('#rf-metric-gain');
      expect(gainMetric).not.toBeNull();
    });

    it('should render beamwidth metric', () => {
      const bwMetric = document.querySelector('#rf-metric-beamwidth');
      expect(bwMetric).not.toBeNull();
    });

    it('should render G/T metric', () => {
      const gtMetric = document.querySelector('#rf-metric-gt');
      expect(gtMetric).not.toBeNull();
    });
  });

  describe('apply/cancel buttons', () => {
    it('should render apply button', () => {
      const applyBtn = document.querySelector('#apply-changes-btn');
      expect(applyBtn).not.toBeNull();
    });

    it('should render cancel button', () => {
      const cancelBtn = document.querySelector('#discard-changes-btn');
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
      const applyBtn = document.querySelector('#apply-changes-btn') as HTMLButtonElement;
      applyBtn.disabled = false;
      applyBtn.click();

      expect(antenna.applyChanges).toHaveBeenCalled();
    });

    it('should call discardChanges when cancel button is clicked', () => {
      const antenna = mockGroundStation.antennas[0];
      const cancelBtn = document.querySelector('#discard-changes-btn') as HTMLButtonElement;
      cancelBtn.disabled = false;
      cancelBtn.click();

      expect(antenna.discardChanges).toHaveBeenCalled();
    });
  });

  describe('environmental control interactions', () => {
    it('should call handleHeaterToggle when heater switch is changed', () => {
      const antenna = mockGroundStation.antennas[0];
      const heaterSwitch = document.querySelector('#heater-switch') as HTMLInputElement;
      heaterSwitch.checked = true;
      heaterSwitch.dispatchEvent(new Event('change'));

      expect(antenna.handleHeaterToggle).toHaveBeenCalledWith(true);
    });

    it('should call handleRainBlowerToggle when blower switch is changed', () => {
      const antenna = mockGroundStation.antennas[0];
      const blowerSwitch = document.querySelector('#blower-switch') as HTMLInputElement;
      blowerSwitch.checked = true;
      blowerSwitch.dispatchEvent(new Event('change'));

      expect(antenna.handleRainBlowerToggle).toHaveBeenCalledWith(true);
    });
  });

  describe('satellite dropdown interactions', () => {
    it('should call handleTargetSatelliteChange when satellite is selected', () => {
      const { SimulationManager } = require('../../../../src/simulation/simulation-manager');
      SimulationManager.getInstance.mockReturnValue({
        satellites: [
          { noradId: 12345, name: 'Test Satellite 1' },
          { noradId: 67890, name: 'Test Satellite 2' },
        ],
      });

      // Recreate tab to get updated dropdown
      tab.dispose();
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'acu-control-container-sat';
      document.body.appendChild(containerEl2);
      const tab2 = new ACUControlTab(mockGroundStation, 'acu-control-container-sat');

      const antenna = mockGroundStation.antennas[0];
      const select = document.querySelector('#satellite-select') as HTMLSelectElement;
      select.value = '12345';
      select.dispatchEvent(new Event('change'));

      expect(antenna.handleTargetSatelliteChange).toHaveBeenCalledWith(12345);
      tab2.dispose();
    });

    it('should call moveToTargetSatellite when move button is clicked', () => {
      const antenna = mockGroundStation.antennas[0];
      const moveBtn = document.querySelector('#move-to-target-btn') as HTMLButtonElement;
      moveBtn.disabled = false;
      moveBtn.click();

      expect(antenna.moveToTargetSatellite).toHaveBeenCalled();
    });
  });

  describe('beacon controls interactions', () => {
    it('should call stageBeaconFrequencyChange when frequency is changed', () => {
      const antenna = mockGroundStation.antennas[0];
      const freqInput = document.querySelector('#beacon-freq') as HTMLInputElement;
      freqInput.value = '4000';
      freqInput.dispatchEvent(new Event('change'));

      expect(antenna.stageBeaconFrequencyChange).toHaveBeenCalledWith(4000e6);
    });

    it('should call stageBeaconSearchBwChange when bandwidth is changed', () => {
      const antenna = mockGroundStation.antennas[0];
      const bwInput = document.querySelector('#beacon-search-bw') as HTMLInputElement;
      bwInput.value = '600';
      bwInput.dispatchEvent(new Event('change'));

      expect(antenna.stageBeaconSearchBwChange).toHaveBeenCalledWith(600e3);
    });

    it('should call startStepTrack when step track button is clicked and not tracking', () => {
      const antenna = mockGroundStation.antennas[0];
      antenna.state.isAutoTrackEnabled = false;
      const toggleBtn = document.querySelector('#step-track-toggle-btn') as HTMLButtonElement;
      toggleBtn.click();

      expect(antenna.startStepTrack).toHaveBeenCalled();
    });

    it('should call stopStepTrack when step track button is clicked and tracking', () => {
      const antenna = mockGroundStation.antennas[0];
      antenna.state.isAutoTrackEnabled = true;
      const toggleBtn = document.querySelector('#step-track-toggle-btn') as HTMLButtonElement;
      toggleBtn.click();

      expect(antenna.stopStepTrack).toHaveBeenCalled();
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
      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const programSection = document.querySelector('#program-track-section') as HTMLElement;
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

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconCnEl = document.querySelector('#beacon-cn-value');
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

      const freqEl = document.querySelector('#rf-metric-freq');
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

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const faultEl = document.querySelector('#fault-message') as HTMLElement;
      expect(faultEl?.style.display).toBe('block');
      expect(faultEl?.textContent).toBe('Motor failure');
    });

    it('should update step track button to STOP when auto track is enabled', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.trackingMode = 'step-track';

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const toggleBtn = document.querySelector('#step-track-toggle-btn') as HTMLButtonElement;
      expect(toggleBtn?.textContent).toBe('STOP TRACKING');
      expect(toggleBtn?.classList.contains('btn-danger')).toBe(true);
    });

    it('should update context panel title for program-track mode', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'program-track';

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const contextTitle = document.querySelector('#context-panel-title');
      expect(contextTitle?.textContent).toBe('Program Track');
    });

    it('should update context panel title for step-track mode', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'step-track';

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const contextTitle = document.querySelector('#context-panel-title');
      expect(contextTitle?.textContent).toBe('Step Track');
    });

    it('should show amber ACU status LED when not operational', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const statusLed = document.querySelector('#acu-status-led');
      expect(statusLed?.className).toContain('led-amber');
    });

    it('should show off ACU status LED when not powered', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.isPowered = false;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const statusLed = document.querySelector('#acu-status-led');
      expect(statusLed?.className).toContain('led-off');
    });

    it('should update ice accumulation display', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.iceAccumulation_dB = 3.5;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const iceDisplay = document.querySelector('#ice-accumulation-display');
      expect(iceDisplay?.textContent).toBe('3.5 dB');
      expect(iceDisplay?.classList.contains('text-warning')).toBe(true);
    });

    it('should show danger color for high ice accumulation', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      const antenna = mockGroundStation.antennas[0];
      antenna.state.iceAccumulation_dB = 6.0;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const iceDisplay = document.querySelector('#ice-accumulation-display');
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

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const beaconCnEl = document.querySelector('#beacon-cn-value');
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

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconFillEl = document.querySelector('#beacon-strength-fill') as HTMLElement;
      expect(beaconFillEl?.classList.contains('cn-green')).toBe(true);
    });

    it('should show amber fill for medium beacon C/N', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 7.0;
      antenna.state.trackingMode = 'manual';

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconFillEl = document.querySelector('#beacon-strength-fill') as HTMLElement;
      expect(beaconFillEl?.classList.contains('cn-amber')).toBe(true);
    });

    it('should show red fill for low beacon C/N', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.beaconCN = 3.0;
      antenna.state.trackingMode = 'manual';

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconFillEl = document.querySelector('#beacon-strength-fill') as HTMLElement;
      expect(beaconFillEl?.classList.contains('cn-red')).toBe(true);
    });

    it('should show IDLE status for step-track when not auto-tracking', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'step-track';
      antenna.state.isAutoTrackEnabled = false;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconLockEl = document.querySelector('#beacon-lock-status');
      expect(beaconLockEl?.textContent).toBe('IDLE');
    });

    it('should show SEARCHING status for step-track when auto-tracking but not locked', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'step-track';
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.isBeaconLocked = false;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconLockEl = document.querySelector('#beacon-lock-status');
      expect(beaconLockEl?.textContent).toBe('SEARCHING');
    });

    it('should show LOCKED status for step-track when beacon locked', () => {
      const updateHandlers = mockEventBus.on.mock.calls
        .filter((call: unknown[]) => call[0] === Events.UPDATE)
        .map((call: unknown[]) => call[1]);

      const antenna = mockGroundStation.antennas[0];
      antenna.state.trackingMode = 'step-track';
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.isBeaconLocked = true;

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandlers.forEach(handler => handler());

      const beaconLockEl = document.querySelector('#beacon-lock-status');
      expect(beaconLockEl?.textContent).toBe('LOCKED');
    });
  });

  describe('precipitation status', () => {
    it('should update precipitation status from weather manager', () => {
      const { WeatherManager } = require('../../../../src/weather/weather-manager');
      WeatherManager.getInstance.mockReturnValue({
        isPrecipitationActive: jest.fn(() => true),
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const precipStatus = document.querySelector('#precip-status');
      const led = precipStatus?.querySelector('.led');
      expect(led?.className).toContain('led-amber');
    });
  });

  describe('current target display', () => {
    it('should display satellite name when target is active', () => {
      const { SimulationManager } = require('../../../../src/simulation/simulation-manager');
      SimulationManager.getInstance.mockReturnValue({
        satellites: [
          { noradId: 12345, name: 'Test Satellite 1' },
        ],
      });

      const antenna = mockGroundStation.antennas[0];
      antenna.state.targetSatelliteId = 12345;

      // Simulate setting active target and clicking move button
      tab.dispose();
      const containerEl2 = document.createElement('div');
      containerEl2.id = 'acu-control-container-target';
      document.body.appendChild(containerEl2);
      const tab2 = new ACUControlTab(mockGroundStation, 'acu-control-container-target');

      const moveBtn = document.querySelector('#move-to-target-btn') as HTMLButtonElement;
      moveBtn.disabled = false;
      moveBtn.click();

      const updateHandler = mockEventBus.on.mock.calls.find(
        (call: unknown[]) => call[0] === Events.UPDATE
      )?.[1];

      jest.spyOn(Date, 'now').mockReturnValue(2000);
      updateHandler();

      const currentTargetDisplay = document.querySelector('#current-target-display') as HTMLInputElement;
      expect(currentTargetDisplay?.value).toBe('Test Satellite 1');
      tab2.dispose();
    });
  });
});
