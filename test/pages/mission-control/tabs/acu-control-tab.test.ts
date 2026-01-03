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
});
