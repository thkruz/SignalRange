import { sandboxData } from '../../src/scenarios/sandbox';
import type { ScenarioData } from '../../src/ScenarioData';

describe('sandbox scenario', () => {
  describe('sandboxData structure', () => {
    it('should have required scenario properties', () => {
      expect(sandboxData.id).toBe('sandbox');
      expect(sandboxData.title).toBe('Free Play');
      expect(sandboxData.subtitle).toBe('Sandbox Environment');
      expect(sandboxData.url).toBe('sandbox');
    });

    it('should not be disabled', () => {
      expect(sandboxData.isDisabled).toBe(false);
    });

    it('should have beginner difficulty', () => {
      expect(sandboxData.difficulty).toBe('beginner');
    });

    it('should have unlimited duration', () => {
      expect(sandboxData.duration).toBe('Unlimited');
    });

    it('should have Sandbox mission type', () => {
      expect(sandboxData.missionType).toBe('Sandbox');
    });

    it('should have description', () => {
      expect(sandboxData.description).toBeDefined();
      expect(sandboxData.description.length).toBeGreaterThan(0);
    });

    it('should list equipment', () => {
      expect(sandboxData.equipment).toContain('9-meter C-band Antenna');
      expect(sandboxData.equipment).toContain('Complete RF Front End');
      expect(sandboxData.equipment).toContain('Spectrum Analyzer');
      expect(sandboxData.equipment).toContain('RX/TX Modems');
      expect(sandboxData.equipment).toContain('All Control Systems');
    });

    it('should have empty objectives for free play', () => {
      expect(sandboxData.objectives).toEqual([]);
    });
  });

  describe('settings configuration', () => {
    it('should have isSync enabled', () => {
      expect(sandboxData.settings.isSync).toBe(true);
    });

    it('should have one ground station', () => {
      expect(sandboxData.settings.groundStations).toBeDefined();
      expect(sandboxData.settings.groundStations!.length).toBe(1);
    });

    it('should have extra satellites visible', () => {
      expect(sandboxData.settings.isExtraSatellitesVisible).toBe(true);
    });

    describe('ground station configuration', () => {
      const groundStation = () => sandboxData.settings.groundStations![0];

      it('should have antenna state configuration', () => {
        expect(groundStation().antennasState).toBeDefined();
        expect(groundStation().antennasState!.length).toBe(1);
      });

      it('should have antenna powered on', () => {
        expect(groundStation().antennasState![0].isPowered).toBe(true);
      });

      it('should have antenna in manual tracking mode', () => {
        expect(groundStation().antennasState![0].trackingMode).toBe('manual');
      });

      it('should have RF front-end configuration', () => {
        expect(groundStation().rfFrontEnds).toBeDefined();
        expect(groundStation().rfFrontEnds!.length).toBe(1);
      });

      it('should have spectrum analyzer configuration', () => {
        expect(groundStation().spectrumAnalyzers).toBeDefined();
        expect(groundStation().spectrumAnalyzers!.length).toBe(1);
      });

      it('should have transmitter configuration', () => {
        expect(groundStation().transmitters).toBeDefined();
        expect(groundStation().transmitters!.length).toBe(1);
      });
    });

    describe('RF front-end initial state', () => {
      const rfFrontEnd = () => sandboxData.settings.groundStations![0].rfFrontEnds![0];

      it('should have LNB powered on', () => {
        expect(rfFrontEnd().lnb?.isPowered).toBe(true);
      });

      it('should have LNB LO frequency at 5250 MHz', () => {
        expect(rfFrontEnd().lnb?.loFrequency).toBe(5250);
      });

      it('should have BUC powered on', () => {
        expect(rfFrontEnd().buc?.isPowered).toBe(true);
      });

      it('should have BUC muted initially', () => {
        expect(rfFrontEnd().buc?.isMuted).toBe(true);
      });

      it('should have HPA powered but not enabled', () => {
        expect(rfFrontEnd().hpa?.isPowered).toBe(true);
        expect(rfFrontEnd().hpa?.isHpaEnabled).toBe(false);
      });

      it('should have GPSDO powered and locked', () => {
        expect(rfFrontEnd().gpsdo?.isPowered).toBe(true);
        expect(rfFrontEnd().gpsdo?.isLocked).toBe(true);
      });
    });
  });

  describe('satellites configuration', () => {
    it('should have two satellites', () => {
      expect(sandboxData.settings.satellites).toBeDefined();
      expect(sandboxData.settings.satellites.length).toBe(2);
    });

    describe('first satellite (AURORA-7)', () => {
      const satellite = () => sandboxData.settings.satellites[0];

      it('should have correct NORAD ID', () => {
        expect(satellite().noradId).toBe(28899);
      });

      it('should have correct position', () => {
        expect(satellite().az).toBe(190);
        expect(satellite().el).toBe(32);
      });

      it('should have one external signal (uplink)', () => {
        expect(satellite().externalSignal.length).toBe(1);
      });

      it('should have uplink signal at 6053 MHz', () => {
        expect(satellite().externalSignal[0].frequency).toBe(6053e6);
      });

      it('should use QPSK modulation', () => {
        expect(satellite().externalSignal[0].modulation).toBe('QPSK');
      });
    });

    describe('second satellite (TIDEMARK-1)', () => {
      const satellite = () => sandboxData.settings.satellites[1];

      it('should have correct NORAD ID', () => {
        expect(satellite().noradId).toBe(61525);
      });

      it('should have correct position', () => {
        expect(satellite().az).toBe(161.8);
        expect(satellite().el).toBe(34.2);
      });

      it('should have one external signal (uplink)', () => {
        expect(satellite().externalSignal.length).toBe(1);
      });

      it('should have uplink signal at 5943 MHz', () => {
        expect(satellite().externalSignal[0].frequency).toBe(5943e6);
      });

      it('should use QPSK modulation', () => {
        expect(satellite().externalSignal[0].modulation).toBe('QPSK');
      });
    });
  });

  describe('signal configurations', () => {
    it('should have horizontal polarization for all signals', () => {
      sandboxData.settings.satellites.forEach(sat => {
        sat.externalSignal.forEach(signal => {
          expect(signal.polarization).toBe('H');
        });
      });
    });

    it('should use QPSK modulation', () => {
      sandboxData.settings.satellites.forEach(sat => {
        sat.externalSignal.forEach(signal => {
          expect(signal.modulation).toBe('QPSK');
        });
      });
    });

    it('should use 3/4 FEC rate', () => {
      sandboxData.settings.satellites.forEach(sat => {
        sat.externalSignal.forEach(signal => {
          expect(signal.fec).toBe('3/4');
        });
      });
    });

    it('should not be degraded', () => {
      sandboxData.settings.satellites.forEach(sat => {
        sat.externalSignal.forEach(signal => {
          expect(signal.isDegraded).toBe(false);
        });
      });
    });

    it('should have zero gain in path', () => {
      sandboxData.settings.satellites.forEach(sat => {
        sat.externalSignal.forEach(signal => {
          expect(signal.gainInPath).toBe(0);
        });
      });
    });

    it('should have null noise floor', () => {
      sandboxData.settings.satellites.forEach(sat => {
        sat.externalSignal.forEach(signal => {
          expect(signal.noiseFloor).toBeNull();
        });
      });
    });
  });

  describe('type validation', () => {
    it('should conform to ScenarioData interface', () => {
      // TypeScript compile-time check - this test validates the type
      const scenario: ScenarioData = sandboxData;
      expect(scenario).toBe(sandboxData);
    });

    it('should have all required ScenarioData fields', () => {
      const requiredFields = [
        'id',
        'url',
        'imageUrl',
        'number',
        'title',
        'subtitle',
        'duration',
        'difficulty',
        'missionType',
        'description',
        'equipment',
        'settings',
      ];

      requiredFields.forEach(field => {
        expect(sandboxData).toHaveProperty(field);
      });
    });
  });
});
