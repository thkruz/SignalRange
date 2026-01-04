import { sandboxData } from '../../src/scenarios/sandbox';
import { SignalOrigin } from '../../src/signal-origin';
import type { ScenarioData } from '../../src/ScenarioData';

describe('sandbox scenario', () => {
  describe('sandboxData structure', () => {
    it('should have required scenario properties', () => {
      expect(sandboxData.id).toBe('sandbox');
      expect(sandboxData.title).toBe('Free Play');
      expect(sandboxData.subtitle).toBe('Sandbox Environment');
      expect(sandboxData.url).toBe('sandbox');
    });

    it('should be marked as disabled', () => {
      expect(sandboxData.isDisabled).toBe(true);
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
      expect(sandboxData.equipment).toContain('RF Front End');
      expect(sandboxData.equipment).toContain('Spectrum Analyzer');
      expect(sandboxData.equipment).toContain('Transmitter');
      expect(sandboxData.equipment).toContain('Receiver');
    });
  });

  describe('settings configuration', () => {
    it('should have isSync enabled', () => {
      expect(sandboxData.settings.isSync).toBe(true);
    });

    it('should have empty ground stations array', () => {
      expect(sandboxData.settings.groundStations).toEqual([]);
    });

    it('should have antenna configuration', () => {
      expect(sandboxData.settings.antennas).toBeDefined();
      expect(sandboxData.settings.antennas.length).toBeGreaterThan(0);
    });

    it('should have RF front-end configuration', () => {
      expect(sandboxData.settings.rfFrontEnds).toBeDefined();
      expect(sandboxData.settings.rfFrontEnds!.length).toBe(1);

      const rfFe = sandboxData.settings.rfFrontEnds![0];
      expect(rfFe.omt).toBeDefined();
      expect(rfFe.buc).toBeDefined();
      expect(rfFe.hpa).toBeDefined();
      expect(rfFe.filter).toBeDefined();
      expect(rfFe.lnb).toBeDefined();
      expect(rfFe.coupler).toBeDefined();
      expect(rfFe.gpsdo).toBeDefined();
    });

    it('should have two spectrum analyzers', () => {
      expect(sandboxData.settings.spectrumAnalyzers).toBeDefined();
      expect(sandboxData.settings.spectrumAnalyzers!.length).toBe(2);
    });

    it('should have transmitter configuration', () => {
      expect(sandboxData.settings.transmitters).toBeDefined();
      expect(sandboxData.settings.transmitters!.length).toBe(1);
    });

    it('should have receiver configuration', () => {
      expect(sandboxData.settings.receivers).toBeDefined();
      expect(sandboxData.settings.receivers!.length).toBe(1);
    });

    it('should have layout HTML', () => {
      expect(sandboxData.settings.layout).toBeDefined();
      expect(sandboxData.settings.layout).toContain('student-equipment');
    });
  });

  describe('satellites configuration', () => {
    it('should have three satellites', () => {
      expect(sandboxData.settings.satellites).toBeDefined();
      expect(sandboxData.settings.satellites.length).toBe(3);
    });

    describe('first satellite (Fake Sat 1)', () => {
      const satellite = () => sandboxData.settings.satellites[0];

      it('should have correct NORAD ID', () => {
        expect(satellite().noradId).toBe(1);
      });

      it('should have correct position', () => {
        expect(satellite().az).toBe(247.3);
        expect(satellite().el).toBe(78.2);
      });

      it('should have two external signals (uplinks)', () => {
        // The Satellite class stores rxSignal constructor param as externalSignal
        expect(satellite().externalSignal.length).toBe(2);
      });

      it('should have signals with SATELLITE_RX origin', () => {
        satellite().externalSignal.forEach(signal => {
          expect(signal.origin).toBe(SignalOrigin.SATELLITE_RX);
        });
      });

      it('should have first signal at 5935 MHz', () => {
        expect(satellite().externalSignal[0].frequency).toBe(5935e6);
      });

      it('should have second signal at 5945 MHz', () => {
        expect(satellite().externalSignal[1].frequency).toBe(5945e6);
      });
    });

    describe('second satellite (Fake Sat 2)', () => {
      const satellite = () => sandboxData.settings.satellites[1];

      it('should have correct NORAD ID', () => {
        expect(satellite().noradId).toBe(2);
      });

      it('should have slightly different azimuth', () => {
        expect(satellite().az).toBe(247.6);
      });

      it('should have one external signal (uplink)', () => {
        expect(satellite().externalSignal.length).toBe(1);
      });

      it('should have signal at 5925 MHz', () => {
        expect(satellite().externalSignal[0].frequency).toBe(5925e6);
      });
    });

    describe('third satellite (Fake Sat 3)', () => {
      const satellite = () => sandboxData.settings.satellites[2];

      it('should have correct NORAD ID', () => {
        expect(satellite().noradId).toBe(3);
      });

      it('should have one external signal (uplink)', () => {
        expect(satellite().externalSignal.length).toBe(1);
      });

      it('should have higher power signal (20W)', () => {
        expect(satellite().externalSignal[0].power).toBe(43); // 43 dBm = ~20W
      });

      it('should have signal at 5915 MHz', () => {
        expect(satellite().externalSignal[0].frequency).toBe(5915e6);
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

    it('should use 8QAM modulation', () => {
      sandboxData.settings.satellites.forEach(sat => {
        sat.externalSignal.forEach(signal => {
          expect(signal.modulation).toBe('8QAM');
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
