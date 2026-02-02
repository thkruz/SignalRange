import { vi } from 'vitest';
import { GPSDOModuleCore } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-module-core';
import { GPSDOModuleUIStandard } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-module-ui-standard';
import { defaultGpsdoState, GPSDOState } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-state';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';

// Mock SimulationManager
vi.mock('../../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      isDeveloperMode: false,
    })),
  },
}));

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

// Mock RFFrontEndCore
function createMockRfFrontEnd(): RFFrontEndCore {
  return {
    gpsdoModule: {
      get10MhzOutput: () => ({ isPresent: true, isWarmedUp: true }),
    },
    state: {
      teamId: 1,
      serverId: 1,
      uuid: 'test-uuid',
    },
  } as unknown as RFFrontEndCore;
}

describe('GPSDOModuleUIStandard', () => {
  let gpsdoModule: GPSDOModuleUIStandard;
  let mockRfFrontEnd: RFFrontEndCore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    document.body.innerHTML = '<div id="test-root"></div>';

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.DRAW);
    EventBus.getInstance().clear(Events.SYNC);

    mockRfFrontEnd = createMockRfFrontEnd();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance extending GPSDOModuleCore', () => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      expect(gpsdoModule).toBeInstanceOf(GPSDOModuleCore);
      expect(gpsdoModule).toBeInstanceOf(GPSDOModuleUIStandard);
    });

    it('should create power switch component', () => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      const components = gpsdoModule.getComponents();
      expect(components.powerSwitch).toBeDefined();
    });

    it('should create GNSS switch component', () => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      const components = gpsdoModule.getComponents();
      expect(components.gnssSwitch).toBeDefined();
    });

    it('should create help button component', () => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      const components = gpsdoModule.getComponents();
      expect(components.helpBtn).toBeDefined();
    });

    it('should inject HTML into parent when parentId provided', () => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      const parent = document.getElementById('test-root');
      expect(parent?.innerHTML).toContain('gpsdo-module');
      expect(parent?.innerHTML).toContain('GPS Disciplined Oscillator');
    });

    it('should generate HTML without injecting when parentId is empty', () => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        ''
      );

      expect(gpsdoModule.html).toContain('gpsdo-module');
      // Parent should remain empty
      const parent = document.getElementById('test-root');
      expect(parent?.innerHTML).toBe('');
    });

    it('should register for SYNC events', () => {
      const onSpy = vi.spyOn(EventBus.getInstance(), 'on');

      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      expect(onSpy).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));

      onSpy.mockRestore();
    });
  });

  describe('HTML generation', () => {
    beforeEach(() => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );
    });

    it('should include module label', () => {
      expect(gpsdoModule.html).toContain('GPS Disciplined Oscillator');
    });

    it('should include LED indicators', () => {
      expect(gpsdoModule.html).toContain('lock-led');
      expect(gpsdoModule.html).toContain('gnss-led');
      expect(gpsdoModule.html).toContain('warm-led');
    });

    it('should include all status displays', () => {
      expect(gpsdoModule.html).toContain('gpsdo-freq-accuracy');
      expect(gpsdoModule.html).toContain('gpsdo-stability');
      expect(gpsdoModule.html).toContain('gpsdo-phase-noise');
      expect(gpsdoModule.html).toContain('gpsdo-sats');
      expect(gpsdoModule.html).toContain('gpsdo-utc');
      expect(gpsdoModule.html).toContain('gpsdo-temp');
      expect(gpsdoModule.html).toContain('gpsdo-warmup');
      expect(gpsdoModule.html).toContain('gpsdo-outputs');
      expect(gpsdoModule.html).toContain('gpsdo-holdover');
    });

    it('should include GNSS switch', () => {
      expect(gpsdoModule.html).toContain('GNSS');
    });

    it('should include power switch', () => {
      expect(gpsdoModule.html).toContain('power-switch');
    });

    it('should include unique ID based on unit number', () => {
      expect(gpsdoModule.html).toContain('rf-fe-gpsdo-1');
    });

    it('should render initial state values', () => {
      const customState: GPSDOState = {
        ...defaultGpsdoState,
        frequencyAccuracy: 2.5,
        satelliteCount: 7,
      };

      const module = new GPSDOModuleUIStandard(customState, mockRfFrontEnd, 2, '');

      expect(module.html).toContain('2.500'); // frequencyAccuracy
      expect(module.html).toContain('7'); // satelliteCount
      expect(module.html).toContain('rf-fe-gpsdo-2');
    });
  });

  describe('initializeDom', () => {
    it('should throw error when parent element not found', () => {
      expect(() => {
        new GPSDOModuleUIStandard(
          { ...defaultGpsdoState },
          mockRfFrontEnd,
          1,
          'non-existent-parent'
        );
      }).toThrow('Parent element non-existent-parent not found');
    });

    it('should create DOM element with correct ID', () => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      const element = document.getElementById('rf-fe-gpsdo-1');
      expect(element).not.toBeNull();
    });
  });

  describe('getComponents()', () => {
    beforeEach(() => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );
    });

    it('should return power switch', () => {
      const components = gpsdoModule.getComponents();
      expect(components.powerSwitch).toBeDefined();
      expect(components.powerSwitch.html).toBeDefined();
    });

    it('should return GNSS switch', () => {
      const components = gpsdoModule.getComponents();
      expect(components.gnssSwitch).toBeDefined();
      expect(components.gnssSwitch.html).toBeDefined();
    });

    it('should return help button', () => {
      const components = gpsdoModule.getComponents();
      expect(components.helpBtn).toBeDefined();
      expect(components.helpBtn.html).toBeDefined();
    });
  });

  describe('getDisplays()', () => {
    beforeEach(() => {
      gpsdoModule = new GPSDOModuleUIStandard(
        {
          ...defaultGpsdoState,
          frequencyAccuracy: 2.5,
          allanDeviation: 1.8,
          phaseNoise: -127.5,
          satelliteCount: 9,
          utcAccuracy: 45,
          temperature: 70.2,
          warmupTimeRemaining: 0,
          active10MHzOutputs: 3,
          max10MHzOutputs: 5,
          holdoverError: 0.5,
        },
        mockRfFrontEnd,
        1,
        'test-root'
      );
    });

    it('should return frequency accuracy formatter', () => {
      const displays = gpsdoModule.getDisplays();
      expect(displays.frequencyAccuracy()).toBe('2.500');
    });

    it('should return Allan deviation formatter', () => {
      const displays = gpsdoModule.getDisplays();
      expect(displays.allanDeviation()).toBe('1.800');
    });

    it('should return phase noise formatter', () => {
      const displays = gpsdoModule.getDisplays();
      expect(displays.phaseNoise()).toBe('-127.5');
    });

    it('should return satellite count formatter', () => {
      const displays = gpsdoModule.getDisplays();
      expect(displays.satelliteCount()).toBe('9');
    });

    it('should return UTC accuracy formatter', () => {
      const displays = gpsdoModule.getDisplays();
      expect(displays.utcAccuracy()).toBe('45');
    });

    it('should return temperature formatter', () => {
      const displays = gpsdoModule.getDisplays();
      expect(displays.temperature()).toBe('70.2');
    });

    it('should return warmup time formatter', () => {
      const displays = gpsdoModule.getDisplays();
      expect(displays.warmupTime()).toBe('READY');
    });

    it('should return outputs formatter', () => {
      const displays = gpsdoModule.getDisplays();
      expect(displays.outputs()).toBe('3/5');
    });

    it('should return holdover error formatter', () => {
      const displays = gpsdoModule.getDisplays();
      expect(displays.holdoverError()).toBe('0.5');
    });

    it('should return updated values when state changes', () => {
      const displays = gpsdoModule.getDisplays();

      gpsdoModule.state.frequencyAccuracy = 5.123;
      expect(displays.frequencyAccuracy()).toBe('5.123');

      gpsdoModule.state.satelliteCount = 12;
      expect(displays.satelliteCount()).toBe('12');
    });
  });

  describe('getLEDs()', () => {
    beforeEach(() => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );
    });

    it('should return lock LED status function', () => {
      const leds = gpsdoModule.getLEDs();
      expect(leds.lock).toBeDefined();
      expect(typeof leds.lock()).toBe('string');
    });

    it('should return GNSS LED status function', () => {
      const leds = gpsdoModule.getLEDs();
      expect(leds.gnss).toBeDefined();
      expect(typeof leds.gnss()).toBe('string');
    });

    it('should return warm LED status function', () => {
      const leds = gpsdoModule.getLEDs();
      expect(leds.warm).toBeDefined();
      expect(typeof leds.warm()).toBe('string');
    });

    it('should return green lock LED when locked', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.isGnssAcquiringLock = false;

      const leds = gpsdoModule.getLEDs();
      expect(leds.lock()).toBe('led-green');
    });

    it('should return amber lock LED when acquiring', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isGnssAcquiringLock = true;

      const leds = gpsdoModule.getLEDs();
      expect(leds.lock()).toBe('led-amber');
    });

    it('should return green GNSS LED with good satellite count', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.gnssSignalPresent = true;
      gpsdoModule.state.satelliteCount = 8;

      const leds = gpsdoModule.getLEDs();
      expect(leds.gnss()).toBe('led-green');
    });

    it('should return green warm LED when warmed up', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.warmupTimeRemaining = 0;

      const leds = gpsdoModule.getLEDs();
      expect(leds.warm()).toBe('led-green');
    });
  });

  describe('sync()', () => {
    beforeEach(() => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );
    });

    it('should update state from partial state', () => {
      gpsdoModule.sync({ temperature: 65, satelliteCount: 10 });

      expect(gpsdoModule.state.temperature).toBe(65);
      expect(gpsdoModule.state.satelliteCount).toBe(10);
    });

    it('should sync power switch when isPowered changes', () => {
      const components = gpsdoModule.getComponents();
      const syncSpy = vi.spyOn(components.powerSwitch, 'sync');

      gpsdoModule.sync({ isPowered: false });

      expect(syncSpy).toHaveBeenCalledWith(false);
    });

    it('should sync GNSS switch when gnssSignalPresent changes', () => {
      const components = gpsdoModule.getComponents();
      const syncSpy = vi.spyOn(components.gnssSwitch, 'sync');

      gpsdoModule.sync({ gnssSignalPresent: false });

      expect(syncSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('syncDomWithState_', () => {
    beforeEach(() => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState, isPowered: true },
        mockRfFrontEnd,
        1,
        'test-root'
      );
    });

    it('should update LED classes', () => {
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.gnssSignalPresent = true;
      gpsdoModule.state.satelliteCount = 8;
      gpsdoModule.state.warmupTimeRemaining = 0;

      // Trigger sync by changing state
      gpsdoModule.sync({ temperature: 71 });

      const lockLed = document.querySelector('#lock-led .led');
      const gnssLed = document.querySelector('#gnss-led .led');
      const warmLed = document.querySelector('#warm-led .led');

      expect(lockLed?.className).toContain('led-green');
      expect(gnssLed?.className).toContain('led-green');
      expect(warmLed?.className).toContain('led-green');
    });

    it('should show placeholder values when powered off', () => {
      gpsdoModule.state.isPowered = false;
      gpsdoModule.sync({ isPowered: false });

      const freqAccuracy = document.querySelector('.gpsdo-freq-accuracy');
      const sats = document.querySelector('.gpsdo-sats');
      const temp = document.querySelector('.gpsdo-temp');

      expect(freqAccuracy?.textContent).toBe('---.--');
      expect(sats?.textContent).toBe('--');
      expect(temp?.textContent).toBe('--.-');
    });

    it('should show actual values when powered on', () => {
      gpsdoModule.state.frequencyAccuracy = 2.5;
      gpsdoModule.state.satelliteCount = 9;
      gpsdoModule.state.temperature = 70.5;
      gpsdoModule.sync({ frequencyAccuracy: 2.5 });

      const freqAccuracy = document.querySelector('.gpsdo-freq-accuracy');
      const sats = document.querySelector('.gpsdo-sats');
      const temp = document.querySelector('.gpsdo-temp');

      expect(freqAccuracy?.textContent).toBe('2.500');
      expect(sats?.textContent).toBe('9');
      expect(temp?.textContent).toBe('70.5');
    });

    it('should add status-displays-off class when powered off', () => {
      gpsdoModule.state.isPowered = false;
      gpsdoModule.sync({ isPowered: false });

      const statusDisplays = document.querySelector('.status-displays');
      expect(statusDisplays?.classList.contains('status-displays-off')).toBe(true);
    });

    it('should remove status-displays-off class when powered on', () => {
      // First power off
      gpsdoModule.state.isPowered = false;
      gpsdoModule.sync({ isPowered: false });

      // Then power on
      gpsdoModule.state.isPowered = true;
      gpsdoModule.sync({ isPowered: true });

      const statusDisplays = document.querySelector('.status-displays');
      expect(statusDisplays?.classList.contains('status-displays-off')).toBe(false);
    });

    it('should start stability monitor when powered on', () => {
      gpsdoModule.state.isPowered = true;
      gpsdoModule.sync({ temperature: 71 });

      // Check if stability monitor started by advancing time
      vi.advanceTimersByTime(5000);

      // Lock duration should have increased if monitor is running
      expect(gpsdoModule.state.lockDuration).toBeGreaterThan(0);
    });
  });

  describe('event handlers', () => {
    beforeEach(() => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );
    });

    it('should call handlePowerToggle when power changes', () => {
      const handlePowerToggleSpy = vi.spyOn(gpsdoModule, 'handlePowerToggle');

      // Simulate calling the handler directly as if triggered by switch
      gpsdoModule.handlePowerToggle(false);

      expect(handlePowerToggleSpy).toHaveBeenCalledWith(false);
      expect(gpsdoModule.state.isPowered).toBe(false);
    });

    it('should call handleGnssToggle when GNSS switch changes', () => {
      const handleGnssToggleSpy = vi.spyOn(gpsdoModule, 'handleGnssToggle');
      gpsdoModule.state.isPowered = true;
      gpsdoModule.state.isLocked = true;

      const callback = vi.fn();
      gpsdoModule.handleGnssToggle(false, callback);

      expect(handleGnssToggleSpy).toHaveBeenCalledWith(false, callback);
      expect(gpsdoModule.state.isGnssSwitchUp).toBe(false);
    });

    it('should have power switch with addEventListeners method', () => {
      const components = gpsdoModule.getComponents();
      expect(typeof components.powerSwitch.addEventListeners).toBe('function');
    });

    it('should have GNSS switch with addEventListeners method', () => {
      const components = gpsdoModule.getComponents();
      expect(typeof components.gnssSwitch.addEventListeners).toBe('function');
    });
  });

  describe('tick hooks', () => {
    beforeEach(() => {
      gpsdoModule = new GPSDOModuleUIStandard(
        {
          ...defaultGpsdoState,
          isPowered: true,
          warmupTimeRemaining: 5,
          isLocked: false,
        },
        mockRfFrontEnd,
        1,
        'test-root'
      );
    });

    it('should update DOM on warmup tick', () => {
      const warmupDisplay = document.querySelector('.gpsdo-warmup');
      const initialText = warmupDisplay?.textContent;

      // Advance warmup timer
      vi.advanceTimersByTime(1000);

      expect(warmupDisplay?.textContent).not.toBe(initialText);
    });

    it('should update DOM on stability tick', () => {
      gpsdoModule.state.warmupTimeRemaining = 0;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.gnssSignalPresent = true;

      // Trigger stability monitor start
      gpsdoModule.sync({ temperature: 70.1 });

      const freqAccuracyBefore = gpsdoModule.state.frequencyAccuracy;

      // Advance stability monitor
      vi.advanceTimersByTime(5000);

      // State should have been updated (lock duration increases)
      expect(gpsdoModule.state.lockDuration).toBeGreaterThan(0);
    });

    it('should update DOM on holdover tick', () => {
      gpsdoModule.state.warmupTimeRemaining = 0;
      gpsdoModule.state.isLocked = true;
      gpsdoModule.state.isGnssSwitchUp = true;
      gpsdoModule.state.gnssSignalPresent = true;

      // Trigger GNSS off to enter holdover
      gpsdoModule.handleGnssToggle(false, () => { });

      const holdoverDisplay = document.querySelector('.gpsdo-holdover');

      // Advance holdover monitor
      vi.advanceTimersByTime(2000);

      // Holdover error should have increased
      expect(gpsdoModule.state.holdoverDuration).toBeGreaterThan(0);
    });
  });

  describe('warmup time formatting', () => {
    it('should display READY when warmed up', () => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState, warmupTimeRemaining: 0 },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      const displays = gpsdoModule.getDisplays();
      expect(displays.warmupTime()).toBe('READY');
    });

    it('should display formatted time when warming up', () => {
      gpsdoModule = new GPSDOModuleUIStandard(
        { ...defaultGpsdoState, warmupTimeRemaining: 125 },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      const displays = gpsdoModule.getDisplays();
      expect(displays.warmupTime()).toBe('2:05');
    });
  });
});
