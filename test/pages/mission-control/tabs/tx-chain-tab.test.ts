import { Mock, Mocked, vi } from 'vitest';
import { GroundStation } from '../../../../src/assets/ground-station/ground-station';
import { EventBus } from '../../../../src/events/event-bus';
import { TxChainTab } from '../../../../src/pages/mission-control/tabs/tx-chain-tab';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');
vi.mock('../../../../src/assets/ground-station/ground-station');
vi.mock('../../../../src/pages/mission-control/tabs/buc-adapter');
vi.mock('../../../../src/pages/mission-control/tabs/hpa-adapter');
vi.mock('../../../../src/pages/mission-control/tabs/transmitter-adapter');

describe('TxChainTab', () => {
  let mockGroundStation: Mocked<GroundStation>;
  let containerEl: HTMLElement;
  let tab: TxChainTab;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

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
      antennas: [{}],
      rfFrontEnds: [
        {
          bucModule: {
            state: { isPowered: true },
          },
          hpaModule: {
            state: { isPowered: true },
          },
        },
      ],
      transmitters: [
        {
          state: {
            activeModem: 1,
            modems: [
              { modem_number: 1, isPowered: true },
            ],
          },
        },
      ],
      initializeEquipment: vi.fn(),
    } as unknown as Mocked<GroundStation>;

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'tx-chain-container';
    document.body.appendChild(containerEl);

    tab = new TxChainTab(mockGroundStation, 'tx-chain-container');
  });

  afterEach(() => {
    tab.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(tab).toBeInstanceOf(TxChainTab);
    });

    it('should initialize equipment if not already done', () => {
      const emptyGs = {
        ...mockGroundStation,
        antennas: [],
      } as unknown as Mocked<GroundStation>;

      const containerEl2 = document.createElement('div');
      containerEl2.id = 'tx-chain-container-2';
      document.body.appendChild(containerEl2);

      new TxChainTab(emptyGs, 'tx-chain-container-2');
      expect(emptyGs.initializeEquipment).toHaveBeenCalled();
    });
  });

  describe('HTML rendering', () => {
    it('should render BUC control card', () => {
      const bucCard = document.body.innerHTML;
      expect(bucCard).toContain('BUC');
      expect(bucCard).toContain('Block Up Converter');
    });

    it('should render HPA control card', () => {
      const hpaCard = document.body.innerHTML;
      expect(hpaCard).toContain('HPA');
      expect(hpaCard).toContain('High Power Amplifier');
    });

    it('should render Transmitter Modems card', () => {
      const txCard = document.body.innerHTML;
      expect(txCard).toContain('Transmitter Modems');
    });

    it('should render modem selection buttons', () => {
      const modemBtns = document.querySelectorAll('[data-modem]');
      expect(modemBtns.length).toBe(4);
    });
  });

  describe('BUC controls', () => {
    it('should render LO frequency control', () => {
      const loFreqInput = document.querySelector('#buc-lo-frequency');
      expect(loFreqInput).not.toBeNull();
    });

    it('should render gain control', () => {
      const gainInput = document.querySelector('#buc-gain');
      expect(gainInput).not.toBeNull();
    });

    it('should render power switch', () => {
      const powerSwitch = document.querySelector('#buc-power');
      expect(powerSwitch).not.toBeNull();
    });

    it('should render mute switch', () => {
      const muteSwitch = document.querySelector('#buc-mute');
      expect(muteSwitch).not.toBeNull();
    });
  });

  describe('HPA controls', () => {
    it('should render backoff control', () => {
      const backoffInput = document.querySelector('#hpa-backoff');
      expect(backoffInput).not.toBeNull();
    });

    it('should render power switch', () => {
      const powerSwitch = document.querySelector('#hpa-power');
      expect(powerSwitch).not.toBeNull();
    });

    it('should render HPA enable switch', () => {
      const enableSwitch = document.querySelector('#hpa-enable');
      expect(enableSwitch).not.toBeNull();
    });
  });

  describe('transmitter controls', () => {
    it('should render frequency input', () => {
      const freqInput = document.querySelector('#tx-frequency-input');
      expect(freqInput).not.toBeNull();
    });

    it('should render bandwidth input', () => {
      const bwInput = document.querySelector('#tx-bandwidth-input');
      expect(bwInput).not.toBeNull();
    });

    it('should render power input', () => {
      const powerInput = document.querySelector('#tx-power-input');
      expect(powerInput).not.toBeNull();
    });

    it('should render modulation select', () => {
      const modSelect = document.querySelector('#tx-modulation-select');
      expect(modSelect).not.toBeNull();
    });

    it('should render FEC select', () => {
      const fecSelect = document.querySelector('#tx-fec-select');
      expect(fecSelect).not.toBeNull();
    });

    it('should render transmit switch', () => {
      const txSwitch = document.querySelector('#tx-transmit-switch');
      expect(txSwitch).not.toBeNull();
    });
  });

  describe('activate/deactivate', () => {
    it('should show tab on activate', () => {
      tab.activate();
      const tabEl = document.querySelector('.tx-chain-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('block');
    });

    it('should hide tab on deactivate', () => {
      tab.deactivate();
      const tabEl = document.querySelector('.tx-chain-tab') as HTMLElement;
      expect(tabEl?.style.display).toBe('none');
    });
  });

  describe('dispose', () => {
    it('should remove DOM element', () => {
      tab.dispose();
      const tabEl = document.querySelector('.tx-chain-tab');
      expect(tabEl).toBeNull();
    });
  });
});
