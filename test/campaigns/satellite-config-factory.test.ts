import {
  configureGroundStationForSatellite,
  applyConfigToGroundStation,
  SatelliteConfigOptions,
  SatelliteConfigResult,
} from '../../src/campaigns/satellite-config-factory';
import type { Satellite, Transponder } from '../../src/equipment/satellite/satellite';
import type { GroundStationConfig } from '../../src/assets/ground-station/ground-station-state';
import type { Hertz, MHz, dBm, RfFrequency, dBi } from '../../src/types';
import type { Degrees } from 'ootk';

describe('satellite-config-factory', () => {
  // Mock satellite factory
  const createMockSatellite = (
    transponders: Partial<Transponder>[] = [],
    config: Partial<Satellite> = {}
  ): Satellite => ({
    noradId: 12345,
    name: 'Test Satellite',
    az: 180 as Degrees,
    el: 45 as Degrees,
    rotation: 0 as Degrees,
    transponders: transponders.map((tp, idx) => ({
      id: tp.id ?? `TP-${idx + 1}`,
      uplinkFrequency: (tp.uplinkFrequency ?? 5943e6) as RfFrequency,
      downlinkFrequency: (tp.downlinkFrequency ?? 3718e6) as RfFrequency,
      bandwidth: (tp.bandwidth ?? 36e6) as Hertz,
      beacon: tp.beacon,
      maxPower: (tp.maxPower ?? 50) as dBm,
      gain: (tp.gain ?? 36.5) as dBi,
      noiseFigure: (tp.noiseFigure ?? 3.5) as dBi,
      saturationPower: (tp.saturationPower ?? 47) as dBm,
      isActive: tp.isActive ?? true,
      uplinkLowEdge: (tp.uplinkLowEdge ?? 5925e6) as RfFrequency,
      uplinkHighEdge: (tp.uplinkHighEdge ?? 5961e6) as RfFrequency,
      polarization: tp.polarization ?? 'V',
      frequencyOffset: (tp.frequencyOffset ?? 2.225e9) as Hertz,
    })),
    ...config,
  } as Satellite);

  // Mock ground station factory
  const createMockGroundStation = (): GroundStationConfig => ({
    id: 'gs-1',
    name: 'Test Ground Station',
    antennasState: [{
      targetSatelliteId: 0,
      targetAzimuth: 0 as Degrees,
      targetElevation: 0 as Degrees,
      targetPolarization: 0 as Degrees,
      azimuth: 0 as Degrees,
      elevation: 0 as Degrees,
      polarization: 0 as Degrees,
      beaconFrequencyHz: 0 as Hertz,
    }],
    rfFrontEnds: [{
      buc: { loFrequency: 7000 as MHz },
      lnb: { loFrequency: 5250 as MHz },
    }],
    spectrumAnalyzers: [{
      centerFrequency: 1000e6 as Hertz,
    }],
    transmitters: [{
      activeModem: 1,
      modems: [{
        isPowered: false,
        isTransmitting: false,
        isTransmittingSwitchUp: false,
      }],
    }],
    receivers: [{
      activeModem: 1,
      modems: [],
    }],
  } as unknown as GroundStationConfig);

  describe('configureGroundStationForSatellite', () => {
    describe('with default options', () => {
      it('should return antenna configuration', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.antenna.targetSatelliteId).toBe(12345);
        expect(result.antenna.targetAzimuth).toBe(180);
        expect(result.antenna.targetElevation).toBe(45);
        expect(result.antenna.targetPolarization).toBe(0);
      });

      it('should calculate BUC LO frequency', () => {
        // Uplink center at 5943 MHz, target IF around 1100 MHz
        // BUC LO = uplink + targetIF = 5943 + 1100 = 7043 MHz
        const satellite = createMockSatellite([{
          id: 'TP-1',
          uplinkFrequency: 5943e6 as RfFrequency,
        }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.bucLoFrequency).toBe(7043);
      });

      it('should use default LNB LO frequency', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.lnbLoFrequency).toBe(5250);
      });

      it('should calculate TX modem IF frequency', () => {
        // TX IF = BUC_LO - uplink_center
        // BUC_LO = 7043 MHz, uplink = 5943 MHz
        // TX IF = 7043 - 5943 = 1100 MHz = 1.1e9 Hz
        const satellite = createMockSatellite([{
          id: 'TP-1',
          uplinkFrequency: 5943e6 as RfFrequency,
        }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.txModem.frequency).toBe(1100e6);
      });

      it('should calculate RX modem IF frequency', () => {
        // RX IF = LNB_LO - downlink_center
        // LNB_LO = 5250 MHz, downlink = 3718 MHz
        // RX IF = 5250 - 3718 = 1532 MHz
        const satellite = createMockSatellite([{
          id: 'TP-1',
          downlinkFrequency: 3718e6 as RfFrequency,
        }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.rxModem.frequency).toBe(1532);
      });

      it('should use default signal parameters', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.txModem.modulation).toBe('QPSK');
        expect(result.txModem.fec).toBe('3/4');
        expect(result.txModem.power).toBe(-7);
        expect(result.rxModem.modulation).toBe('QPSK');
        expect(result.rxModem.fec).toBe('3/4');
      });

      it('should include transponder bandwidth', () => {
        const satellite = createMockSatellite([{
          id: 'TP-1',
          bandwidth: 36e6 as Hertz,
        }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.txModem.bandwidth).toBe(36e6);
        expect(result.rxModem.bandwidth).toBe(36);
      });

      it('should include calculated frequencies', () => {
        const satellite = createMockSatellite([{
          id: 'TP-1',
          uplinkFrequency: 5943e6 as RfFrequency,
          downlinkFrequency: 3718e6 as RfFrequency,
        }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.calculated.uplinkCenterFrequency).toBe(5943e6);
        expect(result.calculated.downlinkCenterFrequency).toBe(3718e6);
      });
    });

    describe('with beacon', () => {
      it('should include beacon frequency in antenna config', () => {
        const satellite = createMockSatellite([{
          id: 'TP-1',
          beacon: {
            signalId: 'beacon-1',
            frequency: 3700e6 as RfFrequency,
          } as any,
        }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.antenna.beaconFrequencyHz).toBe(3700e6);
      });

      it('should calculate spectrum analyzer center frequency from beacon', () => {
        // Beacon IF = LNB_LO - beacon_frequency
        // LNB_LO = 5250 MHz, beacon = 3700 MHz
        // Beacon IF = 5250 - 3700 = 1550 MHz = 1.55e9 Hz
        const satellite = createMockSatellite([{
          id: 'TP-1',
          beacon: {
            signalId: 'beacon-1',
            frequency: 3700e6 as RfFrequency,
          } as any,
        }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.spectrumAnalyzer.centerFrequency).toBe(1550e6);
      });

      it('should set beacon frequency in calculated results', () => {
        const satellite = createMockSatellite([{
          id: 'TP-1',
          beacon: {
            signalId: 'beacon-1',
            frequency: 3700e6 as RfFrequency,
          } as any,
        }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.calculated.beaconFrequency).toBe(3700e6);
      });
    });

    describe('without beacon', () => {
      it('should set beacon frequency to 0', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.antenna.beaconFrequencyHz).toBe(0);
      });

      it('should set spectrum analyzer to 0', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.spectrumAnalyzer.centerFrequency).toBe(0);
      });

      it('should set calculated beacon to null', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite);

        expect(result.calculated.beaconFrequency).toBeNull();
      });
    });

    describe('with custom options', () => {
      it('should use specified transponder ID', () => {
        const satellite = createMockSatellite([
          { id: 'TP-1', uplinkFrequency: 5900e6 as RfFrequency },
          { id: 'TP-2', uplinkFrequency: 5950e6 as RfFrequency },
        ]);

        const result = configureGroundStationForSatellite(satellite, {
          transponderId: 'TP-2',
        });

        // Should use TP-2's uplink frequency
        expect(result.calculated.uplinkCenterFrequency).toBe(5950e6);
      });

      it('should use custom LNB LO frequency', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite, {
          lnbLoFrequency: 5300 as MHz,
        });

        expect(result.lnbLoFrequency).toBe(5300);
      });

      it('should override TX signal parameters', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite, {
          txSignal: {
            modulation: '8PSK',
            fec: '2/3',
            power: -10 as dBm,
          },
        });

        expect(result.txModem.modulation).toBe('8PSK');
        expect(result.txModem.fec).toBe('2/3');
        expect(result.txModem.power).toBe(-10);
      });

      it('should override RX signal parameters', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite, {
          rxSignal: {
            modulation: '16APSK',
            fec: '5/6',
          },
        });

        expect(result.rxModem.modulation).toBe('16APSK');
        expect(result.rxModem.fec).toBe('5/6');
      });

      it('should partially override signal parameters', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        const result = configureGroundStationForSatellite(satellite, {
          txSignal: { power: -5 as dBm },
        });

        expect(result.txModem.power).toBe(-5);
        expect(result.txModem.modulation).toBe('QPSK'); // Default preserved
        expect(result.txModem.fec).toBe('3/4'); // Default preserved
      });
    });

    describe('error handling', () => {
      it('should throw for non-existent transponder', () => {
        const satellite = createMockSatellite([{ id: 'TP-1' }]);

        expect(() => {
          configureGroundStationForSatellite(satellite, {
            transponderId: 'TP-99',
          });
        }).toThrow(/Transponder 'TP-99' not found/);
      });

      it('should include available transponders in error message', () => {
        const satellite = createMockSatellite([
          { id: 'TP-1' },
          { id: 'TP-2' },
        ]);

        expect(() => {
          configureGroundStationForSatellite(satellite, {
            transponderId: 'TP-99',
          });
        }).toThrow(/Available transponders: TP-1, TP-2/);
      });
    });
  });

  describe('applyConfigToGroundStation', () => {
    const createSatConfig = (): SatelliteConfigResult => ({
      antenna: {
        targetSatelliteId: 12345,
        targetAzimuth: 180 as Degrees,
        targetElevation: 45 as Degrees,
        targetPolarization: 10 as Degrees,
        beaconFrequencyHz: 1550e6 as Hertz,
      },
      bucLoFrequency: 7043 as MHz,
      lnbLoFrequency: 5250 as MHz,
      txModem: {
        frequency: 1100e6 as any,
        bandwidth: 36e6 as Hertz,
        modulation: 'QPSK',
        fec: '3/4',
        power: -7 as dBm,
        noradId: 12345,
      },
      rxModem: {
        frequency: 1532 as MHz,
        bandwidth: 36 as MHz,
        modulation: 'QPSK',
        fec: '3/4',
      },
      spectrumAnalyzer: {
        centerFrequency: 1550e6 as Hertz,
      },
      calculated: {
        uplinkCenterFrequency: 5943e6 as any,
        downlinkCenterFrequency: 3718e6 as any,
        beaconFrequency: 3700e6 as any,
      },
    });

    it('should update antenna state', () => {
      const gs = createMockGroundStation();
      const satConfig = createSatConfig();

      const result = applyConfigToGroundStation(gs, satConfig);

      expect(result.antennasState![0].targetSatelliteId).toBe(12345);
      expect(result.antennasState![0].targetAzimuth).toBe(180);
      expect(result.antennasState![0].targetElevation).toBe(45);
      expect(result.antennasState![0].azimuth).toBe(180);
      expect(result.antennasState![0].elevation).toBe(45);
      expect(result.antennasState![0].beaconFrequencyHz).toBe(1550e6);
    });

    it('should update RF front-end BUC/LNB LO frequencies', () => {
      const gs = createMockGroundStation();
      const satConfig = createSatConfig();

      const result = applyConfigToGroundStation(gs, satConfig);

      expect(result.rfFrontEnds![0].buc.loFrequency).toBe(7043);
      expect(result.rfFrontEnds![0].lnb.loFrequency).toBe(5250);
    });

    it('should update spectrum analyzer center frequency', () => {
      const gs = createMockGroundStation();
      const satConfig = createSatConfig();

      const result = applyConfigToGroundStation(gs, satConfig);

      expect(result.spectrumAnalyzers![0].centerFrequency).toBe(1550e6);
    });

    it('should create transmitter configuration', () => {
      const gs = createMockGroundStation();
      const satConfig = createSatConfig();

      const result = applyConfigToGroundStation(gs, satConfig);

      expect(result.transmitters![0].modems[0].ifSignal.frequency).toBe(1100e6);
      expect(result.transmitters![0].modems[0].ifSignal.bandwidth).toBe(36e6);
      expect(result.transmitters![0].modems[0].ifSignal.modulation).toBe('QPSK');
      expect(result.transmitters![0].modems[0].ifSignal.fec).toBe('3/4');
      expect(result.transmitters![0].modems[0].ifSignal.power).toBe(-7);
    });

    it('should create receiver configuration', () => {
      const gs = createMockGroundStation();
      const satConfig = createSatConfig();

      const result = applyConfigToGroundStation(gs, satConfig);

      expect(result.receivers![0].modems[0].frequency).toBe(1532);
      expect(result.receivers![0].modems[0].bandwidth).toBe(36);
      expect(result.receivers![0].modems[0].modulation).toBe('QPSK');
      expect(result.receivers![0].modems[0].fec).toBe('3/4');
    });

    it('should not mutate original ground station', () => {
      const gs = createMockGroundStation();
      const originalAntennaId = gs.antennasState![0].targetSatelliteId;
      const satConfig = createSatConfig();

      applyConfigToGroundStation(gs, satConfig);

      expect(gs.antennasState![0].targetSatelliteId).toBe(originalAntennaId);
    });

    describe('with custom options', () => {
      it('should use specified antenna index', () => {
        const gs = createMockGroundStation();
        gs.antennasState = [
          { ...gs.antennasState![0] },
          { ...gs.antennasState![0], targetSatelliteId: 99 },
        ];
        const satConfig = createSatConfig();

        const result = applyConfigToGroundStation(gs, satConfig, {
          antennaIndex: 1,
        });

        expect(result.antennasState![0].targetSatelliteId).toBe(0); // Unchanged
        expect(result.antennasState![1].targetSatelliteId).toBe(12345); // Updated
      });

      it('should use specified RF front-end index', () => {
        const gs = createMockGroundStation();
        gs.rfFrontEnds = [
          { ...gs.rfFrontEnds![0] },
          { buc: { loFrequency: 6000 as MHz }, lnb: { loFrequency: 4000 as MHz } },
        ];
        const satConfig = createSatConfig();

        const result = applyConfigToGroundStation(gs, satConfig, {
          rfFrontEndIndex: 1,
        });

        expect(result.rfFrontEnds![0].buc.loFrequency).toBe(7000); // Unchanged
        expect(result.rfFrontEnds![1].buc.loFrequency).toBe(7043); // Updated
      });

      it('should skip transmitter creation when disabled', () => {
        const gs = createMockGroundStation();
        const satConfig = createSatConfig();

        const result = applyConfigToGroundStation(gs, satConfig, {
          createTransmitter: false,
        });

        // Should preserve original transmitters
        expect(result.transmitters).toEqual(gs.transmitters);
      });

      it('should skip receiver creation when disabled', () => {
        const gs = createMockGroundStation();
        const satConfig = createSatConfig();

        const result = applyConfigToGroundStation(gs, satConfig, {
          createReceiver: false,
        });

        // Should preserve original receivers
        expect(result.receivers).toEqual(gs.receivers);
      });
    });

    describe('edge cases', () => {
      it('should handle missing antenna state', () => {
        const gs = createMockGroundStation();
        gs.antennasState = undefined;
        const satConfig = createSatConfig();

        const result = applyConfigToGroundStation(gs, satConfig);

        expect(result.antennasState).toBeUndefined();
      });

      it('should handle missing RF front-ends', () => {
        const gs = createMockGroundStation();
        gs.rfFrontEnds = undefined;
        const satConfig = createSatConfig();

        const result = applyConfigToGroundStation(gs, satConfig);

        expect(result.rfFrontEnds).toBeUndefined();
      });

      it('should handle missing spectrum analyzers', () => {
        const gs = createMockGroundStation();
        gs.spectrumAnalyzers = undefined;
        const satConfig = createSatConfig();

        const result = applyConfigToGroundStation(gs, satConfig);

        expect(result.spectrumAnalyzers).toBeUndefined();
      });

      it('should handle zero spectrum analyzer frequency', () => {
        const gs = createMockGroundStation();
        const satConfig = createSatConfig();
        satConfig.spectrumAnalyzer.centerFrequency = 0 as Hertz;

        const result = applyConfigToGroundStation(gs, satConfig);

        // Should not update when frequency is 0
        expect(result.spectrumAnalyzers![0].centerFrequency).toBe(gs.spectrumAnalyzers![0].centerFrequency);
      });
    });
  });
});
