import { Mock, Mocked, vi } from 'vitest';
import { IfFilterBankModuleCore, IfFilterBankState } from '../../../../src/equipment/rf-front-end/filter-module/filter-module-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { FilterAdapter } from '../../../../src/pages/mission-control/tabs/filter-adapter';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');
vi.mock('../../../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn().mockReturnValue({
      data: { difficulty: 'beginner' },
    }),
  },
}));
vi.mock('../../../../src/equipment/rf-front-end/filter-module/filter-module-core', () => ({
  IfFilterBankModuleCore: vi.fn(),
  FILTER_BANDWIDTH_CONFIGS: [
    { label: '1 MHz', bandwidth: 1e6 },
    { label: '6 MHz', bandwidth: 6e6 },
    { label: '18 MHz', bandwidth: 18e6 },
    { label: '36 MHz', bandwidth: 36e6 },
    { label: '72 MHz', bandwidth: 72e6 },
  ],
}));

describe('FilterAdapter', () => {
  let mockFilterModule: Mocked<IfFilterBankModuleCore>;
  let containerEl: HTMLElement;
  let adapter: FilterAdapter;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockState: IfFilterBankState = {
    bandwidthIndex: 2,
    bandwidth: 18e6,
    insertionLoss: 1.5,
    noiseFloor: -120,
  } as IfFilterBankState;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup mock IfFilterBankModuleCore
    mockFilterModule = {
      state: { ...mockState },
      handleBandwidthChange: vi.fn(),
    } as unknown as Mocked<IfFilterBankModuleCore>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <select id="filter-bandwidth">
        <option value="0">1 MHz</option>
        <option value="1">6 MHz</option>
        <option value="2">18 MHz</option>
        <option value="3">36 MHz</option>
        <option value="4">72 MHz</option>
      </select>
      <span id="filter-bandwidth-display"></span>
      <span id="filter-insertion-loss-display"></span>
      <span id="filter-noise-floor-display"></span>
    `;
    document.body.appendChild(containerEl);

    adapter = new FilterAdapter(mockFilterModule, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(FilterAdapter);
    });

    it('should register for RF_FE_FILTER_CHANGED events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.RF_FE_FILTER_CHANGED,
        expect.any(Function)
      );
    });
  });

  describe('bandwidth selector', () => {
    it('should call handleBandwidthChange when selector changes', () => {
      const select = containerEl.querySelector('#filter-bandwidth') as HTMLSelectElement;
      select.value = '3';
      select.dispatchEvent(new Event('change'));

      expect(mockFilterModule.handleBandwidthChange).toHaveBeenCalledWith(3);
    });

    it('should update selector to match state', () => {
      adapter.update();

      const select = containerEl.querySelector('#filter-bandwidth') as HTMLSelectElement;
      expect(select.value).toBe('2');
    });
  });

  describe('syncDomWithState', () => {
    it('should update bandwidth display', () => {
      adapter.update();

      const display = containerEl.querySelector('#filter-bandwidth-display') as HTMLElement;
      expect(display.textContent).toBe('18 MHz');
    });

    it('should update insertion loss display', () => {
      adapter.update();

      const display = containerEl.querySelector('#filter-insertion-loss-display') as HTMLElement;
      expect(display.textContent).toBe('1.5 dB');
    });

    it('should update noise floor display', () => {
      adapter.update();

      const display = containerEl.querySelector('#filter-noise-floor-display') as HTMLElement;
      expect(display.textContent).toBe('-120 dBm');
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.RF_FE_FILTER_CHANGED,
        expect.any(Function)
      );
    });
  });
});
