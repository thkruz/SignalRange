import { RxAnalysisTab } from '../../../../src/pages/mission-control/tabs/rx-analysis-tab';
import { GroundStation } from '../../../../src/assets/ground-station/ground-station';
import { EventBus } from '../../../../src/events/event-bus';

// Mock dependencies
jest.mock('../../../../src/events/event-bus');
jest.mock('../../../../src/assets/ground-station/ground-station');
jest.mock('../../../../src/pages/mission-control/tabs/lnb-adapter');
jest.mock('../../../../src/pages/mission-control/tabs/agc-adapter');
jest.mock('../../../../src/pages/mission-control/tabs/filter-adapter');
jest.mock('../../../../src/pages/mission-control/tabs/notch-filter-adapter');
jest.mock('../../../../src/pages/mission-control/tabs/spectrum-analyzer-adapter');
jest.mock('../../../../src/pages/mission-control/tabs/spectrum-analyzer-advanced-adapter');
jest.mock('../../../../src/pages/mission-control/tabs/receiver-adapter');
jest.mock('../../../../src/pages/mission-control/tabs/iq-constellation-adapter');

describe('RxAnalysisTab', () => {
  let mockGroundStation: jest.Mocked<GroundStation>;
  let containerEl: HTMLElement;
  let tab: RxAnalysisTab;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup mock GroundStation with full equipment
    mockGroundStation = {
      antennas: [{ state: {} }],
      rfFrontEnds: [
        {
          lnbModule: { state: { isPowered: true } },
          agcModule: { state: { isPowered: true } },
          filterModule: { state: { bandwidth: 36 } },
          notchFilterModule: { state: { isPowered: true } },
        },
      ],
      spectrumAnalyzers: [
        {
          state: {},
          getCanvas: jest.fn().mockReturnValue(document.createElement('canvas')),
          getSpectralCanvas: jest.fn().mockReturnValue(document.createElement('canvas')),
          getWaterfallCanvas: jest.fn().mockReturnValue(document.createElement('canvas')),
        },
      ],
      receivers: [
        {
          state: {
            activeModem: 1,
            modems: [{ modemNumber: 1, isPowered: true }],
          },
        },
      ],
      initializeEquipment: jest.fn(),
    } as unknown as jest.Mocked<GroundStation>;

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'rx-analysis-container';
    document.body.appendChild(containerEl);

    tab = new RxAnalysisTab(mockGroundStation, 'rx-analysis-container');
  });

  afterEach(() => {
    tab.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(tab).toBeInstanceOf(RxAnalysisTab);
    });

    it('should initialize equipment if not already done', () => {
      const emptyGs = {
        ...mockGroundStation,
        antennas: [],
      } as unknown as jest.Mocked<GroundStation>;

      const containerEl2 = document.createElement('div');
      containerEl2.id = 'rx-analysis-container-2';
      document.body.appendChild(containerEl2);

      new RxAnalysisTab(emptyGs, 'rx-analysis-container-2');
      expect(emptyGs.initializeEquipment).toHaveBeenCalled();
    });
  });

  describe('HTML rendering', () => {
    it('should render LNB control card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('LNB');
      expect(html).toContain('Low Noise Block');
    });

    it('should render AGC control card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('AGC');
    });

    it('should render IF Filter card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('IF Filter');
    });

    it('should render Notch Filter card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Notch Filter');
    });

    it('should render Spectrum Analyzer card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Spectrum Analyzer');
    });

    it('should render Receiver Modems card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('Receiver Modems');
    });

    it('should render I&Q Constellation card', () => {
      const html = document.body.innerHTML;
      expect(html).toContain('I&amp;Q Constellation');
    });
  });

  describe('LNB controls', () => {
    it('should render LO frequency control', () => {
      const loInput = document.querySelector('#lnb-lo-frequency');
      expect(loInput).not.toBeNull();
    });

    it('should render gain control', () => {
      const gainInput = document.querySelector('#lnb-gain');
      expect(gainInput).not.toBeNull();
    });

    it('should render power switch', () => {
      const powerSwitch = document.querySelector('#lnb-power');
      expect(powerSwitch).not.toBeNull();
    });
  });

  describe('AGC controls', () => {
    it('should render bypass toggle', () => {
      const bypassToggle = document.querySelector('#agc-bypass');
      expect(bypassToggle).not.toBeNull();
    });
  });

  describe('filter controls', () => {
    it('should render bandwidth selector', () => {
      const bwSelect = document.querySelector('#filter-bandwidth');
      expect(bwSelect).not.toBeNull();
    });
  });

  describe('notch filter controls', () => {
    it('should render notch power switch', () => {
      const powerSwitch = document.querySelector('#notch-power');
      expect(powerSwitch).not.toBeNull();
    });

    it('should render notch slot controls', () => {
      const notch0Enabled = document.querySelector('#notch-0-enabled');
      const notch1Enabled = document.querySelector('#notch-1-enabled');
      const notch2Enabled = document.querySelector('#notch-2-enabled');
      expect(notch0Enabled).not.toBeNull();
      expect(notch1Enabled).not.toBeNull();
      expect(notch2Enabled).not.toBeNull();
    });

    it('should render apply button', () => {
      const applyBtn = document.querySelector('#notch-apply-btn');
      expect(applyBtn).not.toBeNull();
    });
  });

  describe('receiver controls', () => {
    it('should render modem selection buttons', () => {
      const modemBtns = document.querySelectorAll('[data-modem]');
      expect(modemBtns.length).toBe(4);
    });

    it('should render frequency input', () => {
      const freqInput = document.querySelector('#frequency-input');
      expect(freqInput).not.toBeNull();
    });

    it('should render bandwidth input', () => {
      const bwInput = document.querySelector('#bandwidth-input');
      expect(bwInput).not.toBeNull();
    });

    it('should render modulation select', () => {
      const modSelect = document.querySelector('#modulation-select');
      expect(modSelect).not.toBeNull();
    });

    it('should render FEC select', () => {
      const fecSelect = document.querySelector('#fec-select');
      expect(fecSelect).not.toBeNull();
    });
  });

  describe('activate/deactivate', () => {
    it('should show tab on activate', () => {
      tab.activate();
      const tabEl = document.querySelector('.rx-analysis-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('block');
    });

    it('should hide tab on deactivate', () => {
      tab.deactivate();
      const tabEl = document.querySelector('.rx-analysis-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('none');
    });
  });

  describe('dispose', () => {
    it('should remove DOM element', () => {
      tab.dispose();
      const tabEl = document.querySelector('.rx-analysis-tab');
      expect(tabEl).toBeNull();
    });
  });
});
