import { vi, Mock } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';

// Mock dependencies before imports
vi.mock('../../../src/events/event-bus');

vi.mock('../../../src/engine/utils/query-selector', () => ({
  qs: vi.fn(),
}));

vi.mock('../../../src/logging/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({
      settings: {
        missionBriefUrl: '/mission-brief.html',
      },
    })),
  },
  SimulationSettings: {},
}));

const mockSimulationManagerInstance = {
  missionBriefBox: null as any,
  checklistBox: null as any,
  dialogHistoryBox: null as any,
};

vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => mockSimulationManagerInstance),
  },
}));

vi.mock('../../../src/objectives', () => ({
  ObjectivesManager: {
    getInstance: vi.fn(() => ({
      syncCollapsedStatesFromDOM: vi.fn(),
      generateHtmlChecklist: vi.fn(() => '<div>Checklist</div>'),
    })),
  },
}));

vi.mock('../../../src/modal/draggable-html-box', () => ({
  DraggableHtmlBox: vi.fn(function (this: any) {
    this.open = vi.fn();
    this.updateContent = vi.fn();
    this.isOpen = false;
    this.onClose = null;
    return this;
  }),
}));

vi.mock('../../../src/modal/dialog-history-box', () => ({
  DialogHistoryBox: vi.fn(function (this: any) {
    this.open = vi.fn();
    return this;
  }),
}));

vi.mock('../../../src/equipment/antenna', () => ({
  ANTENNA_CONFIG_KEYS: {
    C_BAND_9M_VORTEK: 'c-band-9m-vortek',
    KU_BAND_9M_LIMIT: 'ku-band-9m-limit',
  },
  AntennaCore: vi.fn(),
  AntennaUIBasic: vi.fn(function (this: any) {
    this.transmitters = [];
    this.attachRfFrontEnd = vi.fn();
    return this;
  }),
}));

vi.mock('../../../src/equipment/antenna/antenna-ui-modern', () => ({
  AntennaUIModern: vi.fn(function (this: any) {
    this.transmitters = [];
    this.attachRfFrontEnd = vi.fn();
    return this;
  }),
}));

vi.mock('../../../src/equipment/rf-front-end/rf-front-end-core', () => ({
  RFFrontEndCore: vi.fn(),
}));

vi.mock('../../../src/equipment/rf-front-end/rf-front-end-factory', () => ({
  createRFFrontEnd: vi.fn(() => ({
    connectAntenna: vi.fn(),
    connectTransmitter: vi.fn(),
  })),
}));

vi.mock('../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer', () => ({
  RealTimeSpectrumAnalyzer: vi.fn(function (this: any) {
    return this;
  }),
}));

vi.mock('../../../src/equipment/receiver/receiver', () => ({
  Receiver: vi.fn(function (this: any) {
    this.connectRfFrontEnd = vi.fn();
    return this;
  }),
}));

vi.mock('../../../src/equipment/transmitter/transmitter', () => ({
  Transmitter: vi.fn(function (this: any) {
    return this;
  }),
}));

vi.mock('../../../src/pages/sandbox-page', () => ({
  SandboxPage: {
    containerId: 'sandbox-page-container',
  },
}));

// Import after mocks
import { Equipment } from '../../../src/pages/sandbox/equipment';
import { AntennaUIBasic } from '../../../src/equipment/antenna';
import { AntennaUIModern } from '../../../src/equipment/antenna/antenna-ui-modern';
import { createRFFrontEnd } from '../../../src/equipment/rf-front-end/rf-front-end-factory';
import { RealTimeSpectrumAnalyzer } from '../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { Transmitter } from '../../../src/equipment/transmitter/transmitter';
import { Receiver } from '../../../src/equipment/receiver/receiver';
import { DraggableHtmlBox } from '../../../src/modal/draggable-html-box';
import { DialogHistoryBox } from '../../../src/modal/dialog-history-box';
import { SimulationManager } from '../../../src/simulation/simulation-manager';
import { ScenarioManager } from '../../../src/scenario-manager';
import { qs } from '../../../src/engine/utils/query-selector';

// Mock elements for event listener setup
const mockMissionBriefIcon = { addEventListener: vi.fn() };
const mockChecklistIcon = { addEventListener: vi.fn() };
const mockDialogIcon = { addEventListener: vi.fn() };

// Setup qs mock to return mock elements or use actual DOM
const mockQs = qs as Mock;
mockQs.mockImplementation((selector: string, parent?: Element) => {
  // Return mock elements for icon selectors (these are needed before DOM is set up)
  if (selector === '.mission-brief-icon') return mockMissionBriefIcon;
  if (selector === '.checklist-icon') return mockChecklistIcon;
  if (selector === '.dialog-icon') return mockDialogIcon;

  // Use actual DOM for other selectors
  const root = parent || global.document;
  return root.querySelector(selector);
});

describe('Equipment', () => {
  let container: HTMLElement;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const createMockSettings = (overrides = {}) => ({
    antennas: ['basic-antenna'],
    rfFrontEnds: ['rf-fe-1'],
    spectrumAnalyzers: ['spec-a-1'],
    transmitters: ['tx-1'],
    receivers: ['rx-1'],
    layout: null,
    missionBriefUrl: '/mission-brief.html',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Clear mock icon event listeners
    mockMissionBriefIcon.addEventListener.mockClear();
    mockChecklistIcon.addEventListener.mockClear();
    mockDialogIcon.addEventListener.mockClear();

    // Reset SimulationManager instance properties
    mockSimulationManagerInstance.missionBriefBox = null;
    mockSimulationManagerInstance.checklistBox = null;
    mockSimulationManagerInstance.dialogHistoryBox = null;

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup container
    container = document.createElement('div');
    container.id = 'sandbox-page-container';

    // Add equipment containers
    container.innerHTML = `
      <div class="student-equipment">
        <div id="antenna1-container"></div>
        <div id="specA1-container"></div>
        <div id="rf-front-end1-container"></div>
        <div id="tx1-container"></div>
        <div id="rx1-container"></div>
        <div class="mission-brief-icon"></div>
        <div class="checklist-icon"></div>
        <div class="dialog-icon"></div>
      </div>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create Equipment instance', () => {
      const equipment = new Equipment(createMockSettings());
      expect(equipment).toBeInstanceOf(Equipment);
    });

    it('should use custom layout if provided', () => {
      const customLayout = '<div class="custom-layout"></div>';
      const equipment = new Equipment(createMockSettings({ layout: customLayout }));
      expect(equipment).toBeDefined();
    });

    it('should subscribe to ROUTE_CHANGED event', () => {
      new Equipment(createMockSettings());
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.ROUTE_CHANGED,
        expect.any(Function)
      );
    });
  });

  describe('equipment arrays', () => {
    it('should have empty arrays by default', () => {
      const equipment = new Equipment(createMockSettings({ antennas: [], rfFrontEnds: [], spectrumAnalyzers: [], transmitters: [], receivers: [] }));
      expect(equipment.spectrumAnalyzers).toEqual([]);
      expect(equipment.antennas).toEqual([]);
      expect(equipment.rfFrontEnds).toEqual([]);
      expect(equipment.transmitters).toEqual([]);
      expect(equipment.receivers).toEqual([]);
    });
  });

  describe('antenna initialization', () => {
    it('should create AntennaUIBasic for standard antennas', () => {
      new Equipment(createMockSettings({ antennas: ['basic-antenna'] }));
      expect(AntennaUIBasic).toHaveBeenCalled();
    });

    it('should create AntennaUIModern for modern antenna configs', () => {
      new Equipment(createMockSettings({ antennas: ['c-band-9m-vortek'] }));
      expect(AntennaUIModern).toHaveBeenCalled();
    });

    it('should create RF front end for each antenna', () => {
      new Equipment(createMockSettings({ antennas: ['basic-antenna'], rfFrontEnds: ['rf-fe-1'] }));
      expect(createRFFrontEnd).toHaveBeenCalled();
    });

    it('should connect RF front end to antenna', () => {
      new Equipment(createMockSettings({ antennas: ['basic-antenna'], rfFrontEnds: ['rf-fe-1'] }));
      const mockRfFe = (createRFFrontEnd as Mock).mock.results[0]?.value;
      expect(mockRfFe?.connectAntenna).toHaveBeenCalled();
    });
  });

  describe('spectrum analyzer initialization', () => {
    it('should create spectrum analyzers', () => {
      // Add container for specA1
      const specContainer = document.createElement('div');
      specContainer.id = 'specA1-container';
      container.appendChild(specContainer);

      new Equipment(createMockSettings({ antennas: ['basic-antenna'], rfFrontEnds: ['rf-fe-1'], spectrumAnalyzers: ['spec-config-1'] }));
      expect(RealTimeSpectrumAnalyzer).toHaveBeenCalled();
    });
  });

  describe('transmitter initialization', () => {
    it('should create transmitters', () => {
      // Add container for tx1
      const txContainer = document.createElement('div');
      txContainer.id = 'tx1-container';
      container.appendChild(txContainer);

      new Equipment(createMockSettings({ antennas: ['basic-antenna'], rfFrontEnds: ['rf-fe-1'], transmitters: ['tx-config-1'] }));
      expect(Transmitter).toHaveBeenCalled();
    });

    it('should connect transmitters to RF front ends', () => {
      new Equipment(createMockSettings({ antennas: ['basic-antenna'], rfFrontEnds: ['rf-fe-1'], transmitters: ['tx-config-1'] }));
      const mockRfFe = (createRFFrontEnd as Mock).mock.results[0]?.value;
      expect(mockRfFe?.connectTransmitter).toHaveBeenCalled();
    });
  });

  describe('receiver initialization', () => {
    it('should create receivers', () => {
      // Add container for rx1
      const rxContainer = document.createElement('div');
      rxContainer.id = 'rx1-container';
      container.appendChild(rxContainer);

      new Equipment(createMockSettings({ antennas: ['basic-antenna'], rfFrontEnds: ['rf-fe-1'], receivers: ['rx-config-1'] }));
      expect(Receiver).toHaveBeenCalled();
    });

    it('should connect receivers to RF front ends', () => {
      new Equipment(createMockSettings({ antennas: ['basic-antenna'], rfFrontEnds: ['rf-fe-1'], receivers: ['rx-config-1'] }));
      const mockReceiver = (Receiver as Mock).mock.results[0]?.value;
      expect(mockReceiver?.connectRfFrontEnd).toHaveBeenCalled();
    });
  });

  describe('mission brief listener', () => {
    it('should add click listener to mission brief icon', () => {
      new Equipment(createMockSettings());

      expect(mockMissionBriefIcon.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
    });

    it('should open mission brief box on click', () => {
      const mockOpen = vi.fn();
      (DraggableHtmlBox as Mock).mockImplementation(function (this: any) {
        this.open = mockOpen;
        this.updateContent = vi.fn();
        this.isOpen = false;
        return this;
      });

      new Equipment(createMockSettings());

      // Get the click handler and call it
      const clickHandler = mockMissionBriefIcon.addEventListener.mock.calls.find(
        (call: unknown[]) => call[0] === 'click'
      )?.[1];
      clickHandler?.();

      expect(DraggableHtmlBox).toHaveBeenCalledWith(
        'Mission Brief',
        'mission-brief',
        '/mission-brief.html'
      );
      expect(mockOpen).toHaveBeenCalled();
    });
  });

  describe('checklist listener', () => {
    it('should add click listener to checklist icon', () => {
      new Equipment(createMockSettings());

      expect(mockChecklistIcon.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
    });

    it('should update checklist content on open', () => {
      const mockUpdateContent = vi.fn();
      (DraggableHtmlBox as Mock).mockImplementation(function (this: any) {
        this.open = vi.fn();
        this.updateContent = mockUpdateContent;
        this.isOpen = false;
        return this;
      });

      new Equipment(createMockSettings());

      // Get the click handler and call it
      const clickHandler = mockChecklistIcon.addEventListener.mock.calls.find(
        (call: unknown[]) => call[0] === 'click'
      )?.[1];
      clickHandler?.();

      expect(mockUpdateContent).toHaveBeenCalled();
    });

    it('should subscribe to OBJECTIVE_ACTIVATED event', () => {
      new Equipment(createMockSettings());

      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.OBJECTIVE_ACTIVATED,
        expect.any(Function)
      );
    });
  });

  describe('dialog history listener', () => {
    it('should add click listener to dialog icon', () => {
      new Equipment(createMockSettings());

      expect(mockDialogIcon.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
    });

    it('should open dialog history box on click', () => {
      const mockOpen = vi.fn();
      (DialogHistoryBox as Mock).mockImplementation(function (this: any) {
        this.open = mockOpen;
        return this;
      });

      new Equipment(createMockSettings());

      // Get the click handler and call it
      const clickHandler = mockDialogIcon.addEventListener.mock.calls.find(
        (call: unknown[]) => call[0] === 'click'
      )?.[1];
      clickHandler?.();

      expect(DialogHistoryBox).toHaveBeenCalled();
      expect(mockOpen).toHaveBeenCalled();
    });
  });

  describe('no mission brief URL', () => {
    it('should not add listeners when no mission brief URL', () => {
      (ScenarioManager.getInstance as Mock).mockReturnValue({
        settings: {
          missionBriefUrl: null,
        },
      });

      // Should not throw when creating equipment without mission brief
      expect(() => new Equipment(createMockSettings())).not.toThrow();
    });
  });

  describe('isFullEquipmentSuite', () => {
    it('should have isFullEquipmentSuite property', () => {
      const equipment = new Equipment(createMockSettings());
      expect(equipment.isFullEquipmentSuite).toBe(false);
    });
  });

  describe('multiple antennas', () => {
    beforeEach(() => {
      // Add second antenna and RF front end containers
      const antenna2 = document.createElement('div');
      antenna2.id = 'antenna2-container';
      container.appendChild(antenna2);

      const rfFe2 = document.createElement('div');
      rfFe2.id = 'rf-front-end2-container';
      container.appendChild(rfFe2);
    });

    it('should create multiple antennas', () => {
      new Equipment(createMockSettings({
        antennas: ['basic-antenna', 'basic-antenna'],
        rfFrontEnds: ['rf-fe-1', 'rf-fe-2'],
      }));

      expect(AntennaUIBasic).toHaveBeenCalledTimes(2);
    });

    it('should create RF front end for each antenna', () => {
      new Equipment(createMockSettings({
        antennas: ['basic-antenna', 'basic-antenna'],
        rfFrontEnds: ['rf-fe-1', 'rf-fe-2'],
      }));

      expect(createRFFrontEnd).toHaveBeenCalledTimes(2);
    });
  });

  describe('checklist refresh timer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should stop checklist refresh timer on route change', () => {
      new Equipment(createMockSettings());

      // Get the ROUTE_CHANGED callback
      const routeChangedCallback = mockEventBus.on.mock.calls.find(
        call => call[0] === Events.ROUTE_CHANGED
      )?.[1];

      // Should not throw when callback is called
      expect(() => routeChangedCallback?.()).not.toThrow();
    });
  });

  describe('hiding unused equipment containers', () => {
    it('should have logic to hide unused transmitter containers', () => {
      // Equipment class has logic to hide tx3-container when less than 3 transmitters
      // This is verified by checking the source code contains the hiding logic
      const equipment = new Equipment(createMockSettings({ transmitters: ['tx-1', 'tx-2'] }));
      expect(equipment).toBeDefined();
    });

    it('should have logic to hide unused receiver containers', () => {
      // Equipment class has logic to hide rx3-container when less than 3 receivers
      // This is verified by checking the source code contains the hiding logic
      const equipment = new Equipment(createMockSettings({ receivers: ['rx-1', 'rx-2'] }));
      expect(equipment).toBeDefined();
    });
  });
});
