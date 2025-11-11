import { Antenna } from "../../src/equipment/antenna/antenna";
import { BUCState } from "../../src/equipment/rf-front-end/buc-module/buc-module";
import { IfFilterBankState } from "../../src/equipment/rf-front-end/filter-module/filter-module";
import { HPAState } from "../../src/equipment/rf-front-end/hpa-module/hpa-module";
import { LNBState } from "../../src/equipment/rf-front-end/lnb/lnb-module";
import { OMTState } from "../../src/equipment/rf-front-end/omt-module/omt-module";
import { RFFrontEnd } from "../../src/equipment/rf-front-end/rf-front-end";
import { Transmitter } from "../../src/equipment/transmitter/transmitter";
import { EventBus } from "../../src/events/event-bus";
import { Events } from "../../src/events/events";

// Tests for RFFrontEnd class

describe('RFFrontEnd class', () => {
  let rfFrontEnd: RFFrontEnd;
  let parentElement: HTMLElement;

  beforeEach(() => {
    jest.resetModules();

    // Create a clean DOM root for BaseElement.init_ calls
    document.body.innerHTML = '<div id="test-root"></div>';
    parentElement = document.getElementById('test-root')!;

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('should create RF Front-End with default state', () => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);

      expect(rfFrontEnd).toBeDefined();
      expect(rfFrontEnd.state.teamId).toBe(1);
      expect(rfFrontEnd.state.serverId).toBe(1);
    });

    it('should initialize all modules', () => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);

      expect(rfFrontEnd.omtModule).toBeDefined();
      expect(rfFrontEnd.bucModule).toBeDefined();
      expect(rfFrontEnd.hpaModule).toBeDefined();
      expect(rfFrontEnd.filterModule).toBeDefined();
      expect(rfFrontEnd.lnbModule).toBeDefined();
      expect(rfFrontEnd.couplerModule).toBeDefined();
      expect(rfFrontEnd.gpsdoModule).toBeDefined();
    });

    it('should set up default module states', () => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);

      // Check OMT state
      expect(rfFrontEnd.state.omt.isPowered).toBe(true);
      expect(rfFrontEnd.state.omt.txPolarization).toBe('H');
      expect(rfFrontEnd.state.omt.rxPolarization).toBe('V');

      // Check BUC state
      expect(rfFrontEnd.state.buc.isPowered).toBe(true);
      expect(rfFrontEnd.state.buc.gain).toBe(58);
      expect(rfFrontEnd.state.buc.loFrequency).toBe(4200);

      // Check LNB state
      expect(rfFrontEnd.state.lnb.isPowered).toBe(true);
      expect(rfFrontEnd.state.lnb.gain).toBe(55);
      expect(rfFrontEnd.state.lnb.lnaNoiseFigure).toBe(0.6);

      // Check HPA state
      expect(rfFrontEnd.state.hpa.isPowered).toBe(true);
      expect(rfFrontEnd.state.hpa.backOff).toBe(6);
      expect(rfFrontEnd.state.hpa.isHpaEnabled).toBe(false);
    });

    it('should subscribe to UPDATE and SYNC events', () => {
      const onSpy = jest.spyOn(EventBus.getInstance(), 'on');

      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);

      expect(onSpy).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith(Events.SYNC, expect.any(Function));

      onSpy.mockRestore();
    });
  });

  describe('Noise Figure Calculations', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should calculate LNB noise temperature from noise figure', () => {
      rfFrontEnd.state.lnb.lnaNoiseFigure = 0.6;
      rfFrontEnd.update();

      const nfLinear = Math.pow(10, 0.6 / 10);
      const expectedTemp = 290 * (nfLinear - 1);

      expect(rfFrontEnd.state.lnb.noiseTemperature).toBeCloseTo(expectedTemp, 1);
    });
  });

  describe('Gain Calculations', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should calculate total RX gain correctly', () => {
      rfFrontEnd.state.lnb.gain = 55;
      rfFrontEnd.state.filter.insertionLoss = 2.0;

      const totalGain = rfFrontEnd.getTotalRxGain();

      expect(totalGain).toBe(53); // 55 - 2
    });

    it('should reduce RX gain with higher filter loss', () => {
      rfFrontEnd.state.lnb.gain = 55;
      rfFrontEnd.state.filter.insertionLoss = 1.0;

      const gain1 = rfFrontEnd.getTotalRxGain();

      rfFrontEnd.state.filter.insertionLoss = 3.0;
      const gain2 = rfFrontEnd.getTotalRxGain();

      expect(gain2).toBeLessThan(gain1);
      expect(gain1 - gain2).toBe(2);
    });
  });

  describe('Component State Updates', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should disable HPA if BUC is not powered', () => {
      rfFrontEnd.state.buc.isPowered = false;
      rfFrontEnd.state.hpa.isPowered = true;

      rfFrontEnd.update();

      expect(rfFrontEnd.state.hpa.isPowered).toBe(false);
    });

    it('should calculate HPA temperature based on output power', () => {
      rfFrontEnd.state.hpa.isPowered = true;
      rfFrontEnd.state.hpa.outputPower = 50; // 100W

      rfFrontEnd.update();

      expect(rfFrontEnd.state.hpa.temperature).toBeGreaterThan(25);
    });

    it('should reset HPA temperature to ambient when powered off', () => {
      rfFrontEnd.state.hpa.isPowered = false;

      rfFrontEnd.update();

      expect(rfFrontEnd.state.hpa.temperature).toBe(25);
    });

    it('should calculate BUC output power when powered and not muted', () => {
      rfFrontEnd.state.buc.isPowered = true;
      rfFrontEnd.state.buc.isMuted = false;
      rfFrontEnd.state.buc.gain = 60;

      rfFrontEnd.update();

      expect(rfFrontEnd.state.buc.outputPower).toBe(50); // -10 + 60
    });

    it('should set BUC output power to minimum when muted', () => {
      rfFrontEnd.state.buc.isPowered = true;
      rfFrontEnd.state.buc.isMuted = true;

      rfFrontEnd.update();

      expect(rfFrontEnd.state.buc.outputPower).toBe(-120);
    });

    it('should detect HPA overdrive when backoff < 3 dB', () => {
      rfFrontEnd.state.hpa.backOff = 2;

      rfFrontEnd.update();

      expect(rfFrontEnd.state.hpa.isOverdriven).toBe(true);
    });

    it('should not detect overdrive when backoff >= 3 dB', () => {
      rfFrontEnd.state.hpa.backOff = 6;

      rfFrontEnd.update();

      expect(rfFrontEnd.state.hpa.isOverdriven).toBe(false);
    });

    it('should calculate HPA IMD level based on backoff', () => {
      rfFrontEnd.state.hpa.isPowered = true;
      rfFrontEnd.state.hpa.backOff = 4;

      rfFrontEnd.update();

      // IMD = -30 - (backOff * 2)
      expect(rfFrontEnd.state.hpa.imdLevel).toBe(-38);
    });
  });

  describe('Module Synchronization', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should sync OMT state', () => {
      const newOmtState = {
        txPolarization: 'V' as const,
        rxPolarization: 'H' as const
      };

      rfFrontEnd.sync({ omt: newOmtState as OMTState });

      expect(rfFrontEnd.state.omt.txPolarization).toBe('V');
      expect(rfFrontEnd.state.omt.rxPolarization).toBe('H');
    });

    it('should sync BUC state', () => {
      const newBucState = {
        gain: 60,
        loFrequency: 4500 as any
      };

      rfFrontEnd.sync({ buc: newBucState as BUCState });

      expect(rfFrontEnd.state.buc.gain).toBe(60);
      expect(rfFrontEnd.state.buc.loFrequency).toBe(4500);
    });

    it('should sync LNB state', () => {
      const newLnbState = {
        gain: 60,
        lnaNoiseFigure: 0.8
      };

      rfFrontEnd.sync({ lnb: newLnbState as LNBState });

      expect(rfFrontEnd.state.lnb.gain).toBe(60);
      expect(rfFrontEnd.state.lnb.lnaNoiseFigure).toBe(0.8);
    });

    it('should sync HPA state', () => {
      const newHpaState = {
        backOff: 3,
        isPowered: false
      };

      rfFrontEnd.sync({ hpa: newHpaState as HPAState });

      expect(rfFrontEnd.state.hpa.backOff).toBe(3);
      expect(rfFrontEnd.state.hpa.isPowered).toBe(false);
    });

    it('should sync filter state', () => {
      const newFilterState = {
        bandwidth: 40 as any,
        insertionLoss: 3.0
      };

      rfFrontEnd.sync({ filter: newFilterState as IfFilterBankState });

      expect(rfFrontEnd.state.filter.bandwidth).toBe(40);
      expect(rfFrontEnd.state.filter.insertionLoss).toBe(3.0);
    });
  });

  describe('Alarm Checking', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should detect HPA overdrive alarm', () => {
      rfFrontEnd.state.hpa.backOff = 2;

      rfFrontEnd.update();

      expect(rfFrontEnd.state.hpa.isOverdriven).toBe(true);
    });

    it('should not alarm when HPA is within safe limits', () => {
      rfFrontEnd.state.hpa.backOff = 6;

      rfFrontEnd.update();

      expect(rfFrontEnd.state.hpa.isOverdriven).toBe(false);
    });
  });

  describe('API Methods', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should get coupler output A', () => {
      const output = rfFrontEnd.getCouplerOutputA();

      expect(output).toHaveProperty('frequency');
      expect(output).toHaveProperty('power');
    });

    it('should get coupler output B', () => {
      const output = rfFrontEnd.getCouplerOutputB();

      expect(output).toHaveProperty('frequency');
      expect(output).toHaveProperty('power');
    });

    it('should get noise floor', () => {
      const result = rfFrontEnd.getNoiseFloor('RX IF');

      expect(result).toHaveProperty('isInternalNoiseGreater');
      expect(result).toHaveProperty('noiseFloor');
      expect(typeof result.noiseFloor).toBe('number');
    });
  });

  describe('Equipment Connections', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should connect to antenna', () => {
      const antenna = new Antenna('test-root', 1, 1);

      rfFrontEnd.connectAntenna(antenna);

      expect(rfFrontEnd.antenna).toBe(antenna);
    });

    it('should connect to transmitter', () => {
      const transmitter = new Transmitter('test-root', 1, 1);

      rfFrontEnd.connectTransmitter(transmitter);

      expect(rfFrontEnd.transmitters).toContain(transmitter);
    });

    it('should connect to multiple transmitters', () => {
      const tx1 = new Transmitter('test-root', 1, 1);
      const tx2 = new Transmitter('test-root', 1, 2);

      rfFrontEnd.connectTransmitter(tx1);
      rfFrontEnd.connectTransmitter(tx2);

      expect(rfFrontEnd.transmitters).toHaveLength(2);
      expect(rfFrontEnd.transmitters).toContain(tx1);
      expect(rfFrontEnd.transmitters).toContain(tx2);
    });
  });

  describe('Update Cycle', () => {
    beforeEach(() => {
      rfFrontEnd = new RFFrontEnd('test-root', 1, 1);
    });

    it('should update all modules on update()', () => {
      const omtUpdateSpy = jest.spyOn(rfFrontEnd.omtModule, 'update');
      const bucUpdateSpy = jest.spyOn(rfFrontEnd.bucModule, 'update');
      const hpaUpdateSpy = jest.spyOn(rfFrontEnd.hpaModule, 'update');
      const lnbUpdateSpy = jest.spyOn(rfFrontEnd.lnbModule, 'update');

      rfFrontEnd.update();

      expect(omtUpdateSpy).toHaveBeenCalled();
      expect(bucUpdateSpy).toHaveBeenCalled();
      expect(hpaUpdateSpy).toHaveBeenCalled();
      expect(lnbUpdateSpy).toHaveBeenCalled();

      omtUpdateSpy.mockRestore();
      bucUpdateSpy.mockRestore();
      hpaUpdateSpy.mockRestore();
      lnbUpdateSpy.mockRestore();
    });
  });
});
