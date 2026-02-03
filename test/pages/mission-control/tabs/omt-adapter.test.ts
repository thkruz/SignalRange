import { Mock, Mocked, vi } from 'vitest';
import { OMTModule, OMTState } from '../../../../src/equipment/rf-front-end/omt-module/omt-module';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { OMTAdapter } from '../../../../src/pages/mission-control/tabs/omt-adapter';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');

describe('OMTAdapter', () => {
  let mockOmtModule: Mocked<OMTModule>;
  let containerEl: HTMLElement;
  let adapter: OMTAdapter;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockState: OMTState = {
    effectiveTxPol: 'RHCP',
    effectiveRxPol: 'LHCP',
    crossPolIsolation: 30.5,
    isFaulted: false,
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

    // Setup mock OMTModule
    mockOmtModule = {
      state: { ...mockState },
    } as unknown as Mocked<OMTModule>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <span id="omt-tx-pol"></span>
      <span id="omt-rx-pol"></span>
      <span id="omt-isolation"></span>
      <span id="omt-status" class="status-badge status-badge-green">OK</span>
    `;
    document.body.appendChild(containerEl);

    adapter = new OMTAdapter(mockOmtModule, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(OMTAdapter);
    });

    it('should register for RF_FE_OMT_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.RF_FE_OMT_CHANGED,
        expect.any(Function)
      );
    });
  });

  describe('syncDomWithState', () => {
    it('should update TX polarization display', () => {
      adapter.update();

      const display = containerEl.querySelector('#omt-tx-pol') as HTMLElement;
      expect(display.textContent).toBe('RHCP');
    });

    it('should update RX polarization display', () => {
      adapter.update();

      const display = containerEl.querySelector('#omt-rx-pol') as HTMLElement;
      expect(display.textContent).toBe('LHCP');
    });

    it('should update cross-pol isolation display', () => {
      adapter.update();

      const display = containerEl.querySelector('#omt-isolation') as HTMLElement;
      expect(display.textContent).toBe('30.5 dB');
    });

    it('should update status badge when not faulted', () => {
      adapter.update();

      const badge = containerEl.querySelector('#omt-status') as HTMLElement;
      expect(badge.className).toBe('status-badge status-badge-green');
    });

    it('should update status badge when faulted', () => {
      mockOmtModule.state.isFaulted = true;
      adapter.update();

      const badge = containerEl.querySelector('#omt-status') as HTMLElement;
      expect(badge.className).toBe('status-badge status-badge-red');
    });

    it('should show None when polarization is empty', () => {
      mockOmtModule.state.effectiveTxPol = '';
      adapter.update();

      const display = containerEl.querySelector('#omt-tx-pol') as HTMLElement;
      expect(display.textContent).toBe('None');
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.RF_FE_OMT_CHANGED,
        expect.any(Function)
      );
    });
  });
});
