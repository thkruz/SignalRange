import { Mocked, vi } from 'vitest';
import { AnalyzerControl } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control';
import { ACAmptBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-ampt-btn/ac-ampt-btn';
import { ACBWBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-bw-btn/ac-bw-btn';
import { ACGhzBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-ghz-btn/ac-ghz-btn';
import { ACHzBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-hz-btn/ac-hz-btn';
import { ACKhzBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-khz-btn/ac-khz-btn';
import { ACMhzBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-mhz-btn/ac-mhz-btn';
import { ACMkrBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-mkr-btn/ac-mkr-btn';
import { ACMkr2Btn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-mkr2-btn/ac-mkr2-btn';
import { ACModeBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-mode-btn/ac-mode-btn';
import { ACSaveBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-save-btn/ac-save-btn';
import { ACSweepBtn } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-sweep-btn/ac-sweep-btn';
import { TraceMode } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-trace-btn/ac-trace-btn';
import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from '../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { Hertz, dB } from '../../../src/types';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

// Mock SoundManager to prevent actual sound playing
vi.mock('@app/sound/sound-manager', () => ({
  __esModule: true,
  default: {
    getInstance: vi.fn().mockReturnValue({
      play: vi.fn(),
    }),
  },
}));

// Mock getEl for save button tests
vi.mock('@app/engine/utils/get-el', () => ({
  getEl: vi.fn().mockReturnValue({
    id: 'test-canvas',
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock'),
  }),
}));

describe('Analyzer Control Extended Buttons', () => {
  let mockAnalyzerControl: Mocked<Partial<AnalyzerControl>>;
  let mockSpecA: Mocked<Partial<RealTimeSpectrumAnalyzer>>;
  let mockState: RealTimeSpectrumAnalyzerState;

  // Create mock DOM cache
  const createMockDomCache = () => {
    const cache: { [key: string]: HTMLElement } = {};
    for (let i = 1; i <= 8; i++) {
      cache[`label-cell-${i}`] = document.createElement('div');
      cache[`label-select-button-${i}`] = document.createElement('button');
    }
    return cache;
  };

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = '<div id="test-root"></div>';

    // Clear event bus
    EventBus.getInstance().clear(Events.SPEC_A_CONFIG_CHANGED);

    // Create mock state
    mockState = {
      uuid: 'test-uuid',
      team_id: 1,
      rfFeUuid: 'test-rfFeUuid',
      centerFrequency: 600e6 as Hertz,
      span: 100e6 as Hertz,
      lastSpan: 100e6 as Hertz,
      minFrequency: 5e3 as Hertz,
      maxFrequency: 25.5e9 as Hertz,
      rbw: 1e6 as Hertz,
      lockedControl: 'freq',
      inputValue: '',
      inputUnit: 'MHz',
      referenceLevel: 0,
      minAmplitude: -100,
      maxAmplitude: -40,
      scaleDbPerDiv: 6 as dB,
      noiseFloorNoGain: -104,
      isSkipLnaGainDuringDraw: true,
      isPaused: false,
      hold: false,
      isMaxHold: false,
      isMinHold: false,
      isMarkerOn: false,
      isUpdateMarkers: false,
      topMarkers: [],
      markerIndex: 0,
      refreshRate: 10,
      screenMode: 'spectralDensity',
      isUseTapA: true,
      isUseTapB: true,
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' as TraceMode },
        { isVisible: true, isUpdating: true, mode: 'clearwrite' as TraceMode },
        { isVisible: true, isUpdating: true, mode: 'clearwrite' as TraceMode },
      ],
      selectedTrace: 1,
    };

    // Create mock screen objects
    const mockScreen = {
      canvas: { id: 'test-canvas' },
    };

    // Create mock spectrum analyzer
    mockSpecA = {
      state: mockState,
      syncDomWithState: vi.fn(),
      freqAutoTune: vi.fn(),
      resetMaxHoldData: vi.fn(),
      resetMinHoldData: vi.fn(),
      updateScreenVisibility: vi.fn(),
      spectralDensity: mockScreen as any,
      waterfall: mockScreen as any,
      spectralDensityBoth: mockScreen as any,
      waterfallBoth: mockScreen as any,
      screen: mockScreen as any,
    };

    // Create mock analyzer control
    mockAnalyzerControl = {
      specA: mockSpecA as any,
      domCache: createMockDomCache(),
      updateSubMenu: vi.fn(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('ACAmptBtn', () => {
    let amptBtn: ACAmptBtn;

    beforeEach(() => {
      amptBtn = new ACAmptBtn(mockAnalyzerControl as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(amptBtn.html).toContain('ac-ampt-btn-test-uuid');
      });

      it('should have Ampt label', () => {
        expect(amptBtn.html).toContain('Ampt');
      });
    });

    describe('Click handling', () => {
      it('should update sub menu on click', () => {
        amptBtn.click();

        expect(mockAnalyzerControl.updateSubMenu).toHaveBeenCalledWith('ampt', amptBtn);
      });

      it('should set all amplitude-related label cells on click', () => {
        amptBtn.click();

        expect(mockAnalyzerControl.domCache!['label-cell-1'].textContent).toBe('Reference Level');
        expect(mockAnalyzerControl.domCache!['label-cell-2'].textContent).toBe('Scale / dB per Division');
        expect(mockAnalyzerControl.domCache!['label-cell-3'].textContent).toBe('Amplitude Units');
        expect(mockAnalyzerControl.domCache!['label-cell-6'].textContent).toBe('Max Amplitude');
        expect(mockAnalyzerControl.domCache!['label-cell-7'].textContent).toBe('Min Amplitude');
      });
    });

    describe('Reference Level', () => {
      it('should update input with current reference level on submenu click', () => {
        mockState.referenceLevel = 10;

        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        expect(mockState.inputValue).toBe('10');
        expect(mockState.inputUnit).toBe('dBm');
      });

      it('should update reference level on enter', () => {
        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();
        mockState.inputValue = '5';

        amptBtn.onEnterPressed();

        expect(mockState.referenceLevel).toBe(5);
      });
    });

    describe('Scale dB per Division', () => {
      it('should update input with current scale on submenu click', () => {
        mockState.scaleDbPerDiv = 10 as dB;

        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-2'].click();

        expect(mockState.inputValue).toBe('10');
      });

      it('should update scale and adjust min amplitude on enter', () => {
        mockState.maxAmplitude = -40;

        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-2'].click();
        mockState.inputValue = '8';

        amptBtn.onEnterPressed();

        expect(mockState.scaleDbPerDiv).toBe(8);
        // Min amplitude should be max - (scale * 10) = -40 - 80 = -120
        expect(mockState.minAmplitude).toBe(-120);
      });
    });

    describe('Min/Max Amplitude', () => {
      it('should update input with current min amplitude on submenu click', () => {
        mockState.minAmplitude = -100;

        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-7'].click();

        expect(mockState.inputValue).toBe('-100');
      });

      it('should update input with current max amplitude on submenu click', () => {
        mockState.maxAmplitude = -40;

        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-6'].click();

        expect(mockState.inputValue).toBe('-40');
      });

      it('should update min amplitude and recalculate scale on enter', () => {
        mockState.maxAmplitude = -40;

        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-7'].click();
        mockState.inputValue = '-80';

        amptBtn.onEnterPressed();

        expect(mockState.minAmplitude).toBe(-80);
        // Scale should be (max - min) / 10 = (-40 - (-80)) / 10 = 4
        expect(mockState.scaleDbPerDiv).toBe(4);
      });

      it('should update max amplitude and recalculate scale on enter', () => {
        mockState.minAmplitude = -100;

        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-6'].click();
        mockState.inputValue = '-20';

        amptBtn.onEnterPressed();

        expect(mockState.maxAmplitude).toBe(-20);
        // Scale should be (max - min) / 10 = (-20 - (-100)) / 10 = 8
        expect(mockState.scaleDbPerDiv).toBe(8);
      });
    });

    describe('Tick adjustments', () => {
      it('should adjust reference level on major tick', () => {
        mockState.referenceLevel = 0;

        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();
        amptBtn.onMajorTickChange(1);

        expect(mockState.referenceLevel).toBe(1);
      });

      it('should adjust reference level by 0.1 on minor tick', () => {
        mockState.referenceLevel = 0;

        amptBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();
        amptBtn.onMinorTickChange(1);

        expect(mockState.referenceLevel).toBeCloseTo(0.1);
      });

      it('should not adjust if no submenu selected', () => {
        mockState.referenceLevel = 0;

        amptBtn.onMajorTickChange(1);

        expect(mockState.referenceLevel).toBe(0);
      });
    });
  });

  describe('ACBWBtn', () => {
    let bwBtn: ACBWBtn;

    beforeEach(() => {
      bwBtn = new ACBWBtn(mockAnalyzerControl as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(bwBtn.html).toContain('ac-bw-btn-test-uuid');
      });

      it('should have BW label', () => {
        expect(bwBtn.html).toContain('BW');
      });
    });

    describe('Click handling', () => {
      it('should update sub menu on click', () => {
        bwBtn.click();

        expect(mockAnalyzerControl.updateSubMenu).toHaveBeenCalledWith('bw', bwBtn);
      });

      it('should set RBW-related label cells on click', () => {
        bwBtn.click();

        expect(mockAnalyzerControl.domCache!['label-cell-1'].textContent).toBe('Set RBW');
        expect(mockAnalyzerControl.domCache!['label-cell-2'].textContent).toBe('Auto RBW');
      });
    });

    describe('Set RBW', () => {
      it('should update input with current RBW on submenu click', () => {
        mockState.rbw = 500000 as Hertz;

        bwBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        expect(mockState.inputValue).toBe('500000');
        expect(mockState.inputUnit).toBe('Hz');
      });

      it('should use span when RBW is null', () => {
        mockState.rbw = null;
        mockState.span = 100e6 as Hertz;

        bwBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();

        expect(mockState.inputValue).toBe('100000000');
      });

      it('should update RBW on enter with MHz unit', () => {
        bwBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();
        mockState.inputValue = '1';
        mockState.inputUnit = 'MHz';

        bwBtn.onEnterPressed();

        expect(mockState.rbw).toBe(1e6);
      });

      it('should reject RBW below 1 Hz', () => {
        vi.spyOn(window, 'alert').mockImplementation(() => { });

        bwBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();
        mockState.inputValue = '0.5';
        mockState.inputUnit = 'Hz';

        bwBtn.onEnterPressed();

        expect(window.alert).toHaveBeenCalled();
      });

      it('should reject RBW above 300 MHz', () => {
        vi.spyOn(window, 'alert').mockImplementation(() => { });

        bwBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();
        mockState.inputValue = '400';
        mockState.inputUnit = 'MHz';

        bwBtn.onEnterPressed();

        expect(window.alert).toHaveBeenCalled();
      });
    });

    describe('Auto RBW', () => {
      it('should set RBW to null on auto click', () => {
        mockState.rbw = 1e6 as Hertz;

        bwBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-2'].click();

        expect(mockState.rbw).toBeNull();
      });
    });

    describe('getRBW', () => {
      it('should return current RBW value', () => {
        mockState.rbw = 500000 as Hertz;

        expect(bwBtn.getRBW()).toBe(500000);
      });

      it('should return null when RBW is auto', () => {
        mockState.rbw = null;

        expect(bwBtn.getRBW()).toBeNull();
      });
    });

    describe('Tick adjustments', () => {
      it('should adjust RBW by 10 kHz on major tick', () => {
        mockState.rbw = 100000 as Hertz;

        bwBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();
        bwBtn.onMajorTickChange(-1);

        expect(mockState.rbw).toBe(110000);
      });

      it('should adjust RBW by 1 kHz on minor tick', () => {
        mockState.rbw = 100000 as Hertz;

        bwBtn.click();
        mockAnalyzerControl.domCache!['label-select-button-1'].click();
        bwBtn.onMinorTickChange(-1);

        expect(mockState.rbw).toBe(101000);
      });

      it('should not adjust if not in setrbw mode', () => {
        mockState.rbw = 100000 as Hertz;

        bwBtn.onMajorTickChange(-1);

        expect(mockState.rbw).toBe(100000);
      });
    });
  });

  describe('Unit Buttons (GHz, MHz, kHz, Hz)', () => {
    describe('ACGhzBtn', () => {
      let ghzBtn: ACGhzBtn;

      beforeEach(() => {
        ghzBtn = new ACGhzBtn(mockAnalyzerControl as any);
      });

      it('should create with correct unique ID', () => {
        expect(ghzBtn.html).toContain('ac-ghz-btn-test-uuid');
      });

      it('should have GHz label', () => {
        expect(ghzBtn.html).toContain('GHz');
      });

      it('should convert MHz to GHz on click', () => {
        mockState.inputUnit = 'MHz';
        mockState.inputValue = '1000';

        ghzBtn.click();

        expect(mockState.inputUnit).toBe('GHz');
        expect(mockState.inputValue).toBe('1');
      });

      it('should convert kHz to GHz on click', () => {
        mockState.inputUnit = 'kHz';
        mockState.inputValue = '1000000';

        ghzBtn.click();

        expect(mockState.inputUnit).toBe('GHz');
        // 1,000,000 kHz / 1e6 = 1 GHz
        expect(parseFloat(mockState.inputValue)).toBeCloseTo(1);
      });

      it('should convert Hz to GHz on click', () => {
        mockState.inputUnit = 'Hz';
        mockState.inputValue = '1000000000';

        ghzBtn.click();

        expect(mockState.inputUnit).toBe('GHz');
        expect(mockState.inputValue).toBe('1');
      });

      it('should not change if already in GHz', () => {
        mockState.inputUnit = 'GHz';
        mockState.inputValue = '1.5';

        ghzBtn.click();

        expect(mockState.inputValue).toBe('1.5');
      });

      it('should handle NaN input value', () => {
        mockState.inputUnit = 'MHz';
        mockState.inputValue = 'invalid';

        ghzBtn.click();

        expect(mockState.inputUnit).toBe('GHz');
        expect(mockState.inputValue).toBe('0');
      });
    });

    describe('ACMhzBtn', () => {
      let mhzBtn: ACMhzBtn;

      beforeEach(() => {
        mhzBtn = new ACMhzBtn(mockAnalyzerControl as any);
      });

      it('should create with correct unique ID', () => {
        expect(mhzBtn.html).toContain('ac-mhz-btn-test-uuid');
      });

      it('should convert GHz to MHz on click', () => {
        mockState.inputUnit = 'GHz';
        mockState.inputValue = '1';

        mhzBtn.click();

        expect(mockState.inputUnit).toBe('MHz');
        expect(mockState.inputValue).toBe('1000');
      });

      it('should convert kHz to MHz on click', () => {
        mockState.inputUnit = 'kHz';
        mockState.inputValue = '1000';

        mhzBtn.click();

        expect(mockState.inputUnit).toBe('MHz');
        expect(mockState.inputValue).toBe('1');
      });

      it('should convert Hz to MHz on click', () => {
        mockState.inputUnit = 'Hz';
        mockState.inputValue = '1000000';

        mhzBtn.click();

        expect(mockState.inputUnit).toBe('MHz');
        expect(mockState.inputValue).toBe('1');
      });
    });

    describe('ACKhzBtn', () => {
      let khzBtn: ACKhzBtn;

      beforeEach(() => {
        khzBtn = new ACKhzBtn(mockAnalyzerControl as any);
      });

      it('should create with correct unique ID', () => {
        expect(khzBtn.html).toContain('ac-khz-btn-test-uuid');
      });

      it('should convert GHz to kHz on click', () => {
        mockState.inputUnit = 'GHz';
        mockState.inputValue = '0.001';

        khzBtn.click();

        expect(mockState.inputUnit).toBe('kHz');
        expect(mockState.inputValue).toBe('1000');
      });

      it('should convert MHz to kHz on click', () => {
        mockState.inputUnit = 'MHz';
        mockState.inputValue = '1';

        khzBtn.click();

        expect(mockState.inputUnit).toBe('kHz');
        expect(mockState.inputValue).toBe('1000');
      });

      it('should convert Hz to kHz on click', () => {
        mockState.inputUnit = 'Hz';
        mockState.inputValue = '1000';

        khzBtn.click();

        expect(mockState.inputUnit).toBe('kHz');
        expect(mockState.inputValue).toBe('1');
      });
    });

    describe('ACHzBtn', () => {
      let hzBtn: ACHzBtn;

      beforeEach(() => {
        hzBtn = new ACHzBtn(mockAnalyzerControl as any);
      });

      it('should create with correct unique ID', () => {
        expect(hzBtn.html).toContain('ac-hz-btn-test-uuid');
      });

      it('should convert GHz to Hz on click', () => {
        mockState.inputUnit = 'GHz';
        mockState.inputValue = '1';

        hzBtn.click();

        expect(mockState.inputUnit).toBe('Hz');
        expect(mockState.inputValue).toBe('1000000000');
      });

      it('should convert MHz to Hz on click', () => {
        mockState.inputUnit = 'MHz';
        mockState.inputValue = '1';

        hzBtn.click();

        expect(mockState.inputUnit).toBe('Hz');
        expect(mockState.inputValue).toBe('1000000');
      });

      it('should convert kHz to Hz on click', () => {
        mockState.inputUnit = 'kHz';
        mockState.inputValue = '1';

        hzBtn.click();

        expect(mockState.inputUnit).toBe('Hz');
        expect(mockState.inputValue).toBe('1000');
      });
    });
  });

  describe('ACMkrBtn', () => {
    let mkrBtn: ACMkrBtn;

    beforeEach(() => {
      mkrBtn = new ACMkrBtn(mockAnalyzerControl as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(mkrBtn.html).toContain('ac-mkr-btn-test-uuid');
      });

      it('should have Mkr label', () => {
        expect(mkrBtn.html).toContain('Mkr');
      });
    });

    describe('Click handling', () => {
      it('should toggle marker on click', () => {
        mockState.isMarkerOn = false;

        mkrBtn.click();

        expect(mockState.isMarkerOn).toBe(true);
        expect(mockState.isUpdateMarkers).toBe(true);
      });

      it('should toggle marker off when already on', () => {
        mockState.isMarkerOn = true;

        mkrBtn.click();

        expect(mockState.isMarkerOn).toBe(false);
        expect(mockState.isUpdateMarkers).toBe(false);
      });
    });

    describe('Marker index navigation', () => {
      it('should change marker index on major tick when markers exist', () => {
        mockState.isMarkerOn = true;
        mockState.topMarkers = [
          { frequency: 100e6, amplitude: -50 },
          { frequency: 200e6, amplitude: -60 },
        ] as any;
        mockState.markerIndex = 0;

        mkrBtn.onMajorTickChange(-1);

        expect(mockState.markerIndex).toBe(1);
      });

      it('should wrap around marker index', () => {
        mockState.isMarkerOn = true;
        mockState.topMarkers = [
          { frequency: 100e6, amplitude: -50 },
          { frequency: 200e6, amplitude: -60 },
        ] as any;
        mockState.markerIndex = 1;

        mkrBtn.onMajorTickChange(-1);

        expect(mockState.markerIndex).toBe(0);
      });

      it('should not change index when no markers', () => {
        mockState.isMarkerOn = true;
        mockState.topMarkers = [];
        mockState.markerIndex = 0;

        mkrBtn.onMajorTickChange(-1);

        expect(mockState.markerIndex).toBe(0);
      });

      it('should not change index when markers disabled', () => {
        mockState.isMarkerOn = false;
        mockState.topMarkers = [{ frequency: 100e6, amplitude: -50 }] as any;
        mockState.markerIndex = 0;

        mkrBtn.onMajorTickChange(-1);

        expect(mockState.markerIndex).toBe(0);
      });
    });
  });

  describe('ACMkr2Btn', () => {
    let mkr2Btn: ACMkr2Btn;

    beforeEach(() => {
      mkr2Btn = new ACMkr2Btn(mockAnalyzerControl as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(mkr2Btn.html).toContain('ac-mkr2-btn-test-uuid');
      });
    });

    describe('Click handling', () => {
      it('should update sub menu on click', () => {
        mkr2Btn.click();

        expect(mockAnalyzerControl.updateSubMenu).toHaveBeenCalledWith('mkr2', mkr2Btn);
      });
    });
  });

  describe('ACModeBtn', () => {
    let modeBtn: ACModeBtn;

    beforeEach(() => {
      modeBtn = new ACModeBtn(mockAnalyzerControl as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(modeBtn.html).toContain('ac-mode-btn-test-uuid');
      });

      it('should have Mode label', () => {
        expect(modeBtn.html).toContain('Mode');
      });
    });

    describe('Screen mode cycling', () => {
      it('should cycle from spectralDensity to waterfall', () => {
        mockState.screenMode = 'spectralDensity';

        modeBtn.click();

        expect(mockState.screenMode).toBe('waterfall');
      });

      it('should cycle from waterfall to both', () => {
        mockState.screenMode = 'waterfall';

        modeBtn.click();

        expect(mockState.screenMode).toBe('both');
      });

      it('should cycle from both to spectralDensity', () => {
        mockState.screenMode = 'both';

        modeBtn.click();

        expect(mockState.screenMode).toBe('spectralDensity');
      });

      it('should call updateScreenVisibility', () => {
        modeBtn.click();

        expect(mockSpecA.updateScreenVisibility).toHaveBeenCalled();
      });

      it('should emit SPEC_A_CONFIG_CHANGED event', () => {
        const emitSpy = vi.spyOn(EventBus.getInstance(), 'emit');

        modeBtn.click();

        expect(emitSpy).toHaveBeenCalledWith(
          Events.SPEC_A_CONFIG_CHANGED,
          expect.objectContaining({
            uuid: 'test-uuid',
            screenMode: expect.any(String),
          })
        );
      });
    });
  });

  describe('ACSaveBtn', () => {
    let saveBtn: ACSaveBtn;

    beforeEach(() => {
      saveBtn = new ACSaveBtn(mockAnalyzerControl as any);

      // Mock document.createElement for the link
      const mockLink = {
        download: '',
        href: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(saveBtn.html).toContain('ac-save-btn-test-uuid');
      });

      it('should have Save label', () => {
        expect(saveBtn.html).toContain('Save');
      });
    });

    describe('Save by screen mode', () => {
      it('should save spectral density when in spectralDensity mode', () => {
        mockState.screenMode = 'spectralDensity';

        saveBtn.click();

        expect(document.createElement).toHaveBeenCalledWith('a');
      });

      it('should save waterfall when in waterfall mode', () => {
        mockState.screenMode = 'waterfall';

        saveBtn.click();

        expect(document.createElement).toHaveBeenCalledWith('a');
      });

      it('should save combined when in both mode', () => {
        mockState.screenMode = 'both';

        // Need to mock canvas and link for combined mode
        const mockLink = {
          download: '',
          href: '',
          click: vi.fn(),
        };
        const mockCanvas = {
          width: 800,
          height: 400,
          getContext: vi.fn().mockReturnValue({
            drawImage: vi.fn(),
          }),
          toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock'),
        };

        // Return canvas first, then link
        let callCount = 0;
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
          callCount++;
          if (tag === 'canvas') {
            return mockCanvas as any;
          }
          return mockLink as any;
        });

        saveBtn.click();

        expect(document.createElement).toHaveBeenCalledWith('canvas');
      });
    });
  });

  describe('ACSweepBtn', () => {
    let sweepBtn: ACSweepBtn;

    beforeEach(() => {
      sweepBtn = new ACSweepBtn(mockAnalyzerControl as any);
    });

    describe('Construction', () => {
      it('should create with correct unique ID', () => {
        expect(sweepBtn.html).toContain('ac-sweep-btn-test-uuid');
      });
    });

    describe('Click handling', () => {
      it('should update sub menu on click', () => {
        sweepBtn.click();

        expect(mockAnalyzerControl.updateSubMenu).toHaveBeenCalledWith('sweep', sweepBtn);
      });
    });
  });
});
