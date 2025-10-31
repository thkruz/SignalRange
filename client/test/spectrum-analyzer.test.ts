/**
 * SpectrumAnalyzer.test.ts
 * Example test file for the new TypeScript class-based architecture
 */

import { SpectrumAnalyzer } from '../src/equipment/spectrum-analyzer/spectrum-analyzer';
import { eventBus, Events } from '../src/events/event-bus';

describe('SpectrumAnalyzer', () => {
  let container: HTMLElement;
  let specA: SpectrumAnalyzer;

  beforeEach(() => {
    // Create a test container
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    // Create spectrum analyzer instance
    specA = new SpectrumAnalyzer('test-container', 1, 1, 1);
  });

  afterEach(() => {
    // Cleanup
    specA.destroy();
    document.body.removeChild(container);
  });

  describe('Initialization', () => {
    it('should create a spectrum analyzer', () => {
      expect(specA).toBeDefined();
    });

    it('should render canvas element', () => {
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();
      expect(canvas?.id).toBe('specA1');
    });

    it('should have correct initial config', () => {
      const config = specA.getConfig();
      expect(config.unit).toBe(1);
      expect(config.team_id).toBe(1);
      expect(config.antenna_id).toBe(1);
      expect(config.rf).toBe(false); // Starts in IF mode
    });

    it('should render control buttons', () => {
      const configBtn = container.querySelector('[data-action="config"]');
      const modeBtn = container.querySelector('[data-action="mode"]');
      const pauseBtn = container.querySelector('[data-action="pause"]');

      expect(configBtn).toBeTruthy();
      expect(modeBtn).toBeTruthy();
      expect(pauseBtn).toBeTruthy();
    });
  });

  describe('Frequency Control', () => {
    it('should change center frequency', () => {
      const newFreq = 5000e6; // 5 GHz in Hz
      specA.changeCenterFreq(newFreq);

      const config = specA.getConfig();
      expect(config.frequency).toBe(newFreq / 1e6); // Config stores in MHz
    });

    it('should change bandwidth', () => {
      const newBw = 50e6; // 50 MHz in Hz
      specA.changeBandwidth(newBw);

      const config = specA.getConfig();
      expect(config.span).toBe(newBw / 1e6); // Config stores in MHz
    });

    it('should update display when frequency changes', () => {
      specA.changeCenterFreq(4800e6);

      const infoDiv = container.querySelector('.spec-a-info');
      expect(infoDiv?.textContent).toContain('4800');
    });
  });

  describe('Mode Control', () => {
    it('should toggle RF/IF mode on button click', () => {
      const modeBtn = container.querySelector('[data-action="mode"]') as HTMLElement;
      const initialMode = specA.getConfig().rf;

      modeBtn.click();

      expect(specA.getConfig().rf).toBe(!initialMode);
    });

    it('should emit mode changed event', (done) => {
      const unsubscribe = eventBus.on(Events.SPEC_A_MODE_CHANGED, (data) => {
        expect(data.unit).toBe(1);
        expect(data.mode).toBe('RF');
        unsubscribe();
        done();
      });

      const modeBtn = container.querySelector('[data-action="mode"]') as HTMLElement;
      modeBtn.click(); // Toggles to RF mode
    });

    it('should update button text when mode changes', () => {
      const modeBtn = container.querySelector('[data-action="mode"]') as HTMLElement;

      expect(modeBtn.textContent?.trim()).toBe('IF');

      modeBtn.click();

      expect(modeBtn.textContent?.trim()).toBe('RF');
    });
  });

  describe('Pause Control', () => {
    it('should pause animation on button click', () => {
      const pauseBtn = container.querySelector('[data-action="pause"]') as HTMLElement;

      pauseBtn.click();

      expect(pauseBtn.classList.contains('active')).toBe(true);
    });

    it('should resume animation on second click', () => {
      const pauseBtn = container.querySelector('[data-action="pause"]') as HTMLElement;

      pauseBtn.click(); // Pause
      pauseBtn.click(); // Resume

      expect(pauseBtn.classList.contains('active')).toBe(false);
    });
  });

  describe('Signal Processing', () => {
    it('should update with new signal data', () => {
      const signalData = {
        signals: [
          { freq: 4700e6, bw: 10e6, amp: -50, target_id: 1 }
        ],
        target_id: 1,
        locked: true,
        operational: true
      };

      specA.update(signalData);

      // Verify update was applied (implementation-dependent)
      // This is just an example of how you might test state changes
    });

    it('should reset hold data', () => {
      specA.resetHoldData();
      // Verify max hold array was reset
      // (You might need to expose a getter for testing)
    });
  });

  describe('Frequency Bands', () => {
    it('should set C-band frequencies', () => {
      specA.setBand('c');
      const config = specA.getConfig();

      // C-band is 4-8 GHz
      expect(config.frequency).toBeGreaterThanOrEqual(4000);
      expect(config.frequency).toBeLessThanOrEqual(8000);
    });

    it('should set Ku-band frequencies', () => {
      specA.setBand('ku');
      const config = specA.getConfig();

      // Ku-band is 12-18 GHz
      expect(config.frequency).toBeGreaterThanOrEqual(12000);
      expect(config.frequency).toBeLessThanOrEqual(18000);
    });

    it('should throw error for invalid band', () => {
      expect(() => {
        specA.setBand('invalid');
      }).toThrow();
    });
  });

  describe('Static Utilities', () => {
    it('should get frequency band info', () => {
      const cBand = SpectrumAnalyzer.getFreqBandInfo('c');
      expect(cBand.minFreq).toBe(4e9);
      expect(cBand.maxFreq).toBe(8e9);
    });

    it('should convert RGB to hex', () => {
      const hex = SpectrumAnalyzer.rgb2hex([255, 0, 0]);
      expect(hex).toBe('#ff0000');
    });

    it('should generate random RGB colors', () => {
      const color1 = SpectrumAnalyzer.getRandomRgb();
      const color2 = SpectrumAnalyzer.getRandomRgb();

      expect(color1).toMatch(/#[0-9a-f]{6}/);
      expect(color2).toMatch(/#[0-9a-f]{6}/);
    });

    it('should generate consistent colors with seed', () => {
      const color1 = SpectrumAnalyzer.getRandomRgb(5);
      const color2 = SpectrumAnalyzer.getRandomRgb(5);

      expect(color1).toBe(color2);
    });
  });

  describe('Event Bus Integration', () => {
    it('should listen to antenna frequency changes', (done) => {
      const newFreq = 5000;

      // Simulate antenna frequency change event
      setTimeout(() => {
        eventBus.emit(Events.ANTENNA_FREQUENCY_CHANGED, {
          antennaId: 1,
          frequency: newFreq
        });
      }, 10);

      // Verify config was updated
      setTimeout(() => {
        const config = specA.getConfig();
        expect(config.frequency).toBe(newFreq);
        done();
      }, 50);
    });

    it('should emit config changed event on config button click', (done) => {
      const unsubscribe = eventBus.on(Events.SPEC_A_CONFIG_CHANGED, (data) => {
        expect(data.unit).toBe(1);
        unsubscribe();
        done();
      });

      const configBtn = container.querySelector('[data-action="config"]') as HTMLElement;
      configBtn.click();
    });
  });

  describe('Canvas Operations', () => {
    it('should have canvas context', () => {
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');

      expect(ctx).toBeTruthy();
    });

    it('should resize canvas on window resize', () => {
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      const initialWidth = canvas.width;

      // Simulate window resize
      container.style.width = '800px';
      window.dispatchEvent(new Event('resize'));

      // Allow time for resize handler
      setTimeout(() => {
        expect(canvas.width).not.toBe(initialWidth);
      }, 100);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup properly on destroy', () => {
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();

      specA.destroy();

      // Container should be cleared
      expect(container.innerHTML).toBe('');
    });

    it('should stop animation on destroy', () => {
      // Spy on cancelAnimationFrame (implementation-dependent)
      // This is just an example structure
      const spy = jest.spyOn(window, 'cancelAnimationFrame');

      specA.destroy();

      // Verify animation was cancelled (if it was running)
      // expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  describe('Multiple Instances', () => {
    it('should create multiple independent analyzers', () => {
      const container2 = document.createElement('div');
      container2.id = 'test-container-2';
      document.body.appendChild(container2);

      const specA2 = new SpectrumAnalyzer('test-container-2', 2, 1, 2);

      expect(specA.getConfig().unit).toBe(1);
      expect(specA2.getConfig().unit).toBe(2);
      expect(specA.getConfig().antenna_id).toBe(1);
      expect(specA2.getConfig().antenna_id).toBe(2);

      specA2.destroy();
      document.body.removeChild(container2);
    });

    it('should handle different teams', () => {
      const specA1 = new SpectrumAnalyzer('test-container', 1, 1, 1);
      const specA2 = new SpectrumAnalyzer('test-container', 1, 2, 1);

      expect(specA1.getConfig().team_id).toBe(1);
      expect(specA2.getConfig().team_id).toBe(2);

      specA1.destroy();
      specA2.destroy();
    });
  });
});

/**
 * Integration test example with StudentEquipment
 */
describe('StudentEquipment Integration', () => {
  let container: HTMLElement;
  let equipment: any; // Replace with actual StudentEquipment import

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'equipment-container';
    document.body.appendChild(container);

    // equipment = new StudentEquipment('equipment-container');
  });

  afterEach(() => {
    // equipment.destroy();
    document.body.removeChild(container);
  });

  it('should create all 4 spectrum analyzers', () => {
    // const configs = equipment.getAllConfigs();
    // expect(configs.spectrumAnalyzers).toHaveLength(4);
  });

  it('should update all analyzers with new data', () => {
    // const signalData = { signals: [...], target_id: 1 };
    // equipment.updateEquipment(signalData);
    // Verify all analyzers were updated
  });
});