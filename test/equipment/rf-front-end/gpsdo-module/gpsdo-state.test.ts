import { defaultGpsdoState, GPSDOState } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-state';

describe('GPSDOState', () => {
  describe('defaultGpsdoState', () => {
    describe('Power & Operational State', () => {
      it('should be powered on by default', () => {
        expect(defaultGpsdoState.isPowered).toBe(true);
      });

      it('should have no warmup time remaining by default', () => {
        expect(defaultGpsdoState.warmupTimeRemaining).toBe(0);
      });

      it('should have OCXO temperature at 70°C (oven-controlled)', () => {
        expect(defaultGpsdoState.temperature).toBe(70);
      });
    });

    describe('GNSS Receiver State', () => {
      it('should have GNSS signal present by default', () => {
        expect(defaultGpsdoState.gnssSignalPresent).toBe(true);
      });

      it('should have GNSS switch up by default', () => {
        expect(defaultGpsdoState.isGnssSwitchUp).toBe(true);
      });

      it('should not be acquiring lock by default', () => {
        expect(defaultGpsdoState.isGnssAcquiringLock).toBe(false);
      });

      it('should have 9 satellites tracked by default', () => {
        expect(defaultGpsdoState.satelliteCount).toBe(9);
      });

      it('should have UTC accuracy at 0 by default', () => {
        expect(defaultGpsdoState.utcAccuracy).toBe(0);
      });

      it('should use GPS constellation by default', () => {
        expect(defaultGpsdoState.constellation).toBe('GPS');
      });
    });

    describe('Lock & Stability', () => {
      it('should be locked by default', () => {
        expect(defaultGpsdoState.isLocked).toBe(true);
      });

      it('should have lock duration at 0 by default', () => {
        expect(defaultGpsdoState.lockDuration).toBe(0);
      });

      it('should have frequency accuracy at 0 by default', () => {
        expect(defaultGpsdoState.frequencyAccuracy).toBe(0);
      });

      it('should have Allan deviation at 0 by default', () => {
        expect(defaultGpsdoState.allanDeviation).toBe(0);
      });

      it('should have phase noise at 0 by default', () => {
        expect(defaultGpsdoState.phaseNoise).toBe(0);
      });
    });

    describe('Holdover Performance', () => {
      it('should not be in holdover by default', () => {
        expect(defaultGpsdoState.isInHoldover).toBe(false);
      });

      it('should have holdover duration at 0 by default', () => {
        expect(defaultGpsdoState.holdoverDuration).toBe(0);
      });

      it('should have holdover error at 0 by default', () => {
        expect(defaultGpsdoState.holdoverError).toBe(0);
      });
    });

    describe('Distribution Outputs', () => {
      it('should have 2 active 10 MHz outputs by default', () => {
        expect(defaultGpsdoState.active10MHzOutputs).toBe(2);
      });

      it('should have max 5 10 MHz outputs', () => {
        expect(defaultGpsdoState.max10MHzOutputs).toBe(5);
      });

      it('should have output level at 0 dBm by default', () => {
        expect(defaultGpsdoState.output10MHzLevel).toBe(0);
      });

      it('should have PPS outputs disabled by default', () => {
        expect(defaultGpsdoState.ppsOutputsEnabled).toBe(false);
      });
    });

    describe('Health Monitoring', () => {
      it('should have 6 operating hours by default', () => {
        expect(defaultGpsdoState.operatingHours).toBe(6);
      });

      it('should have passed self-test by default', () => {
        expect(defaultGpsdoState.selfTestPassed).toBe(true);
      });

      it('should have aging rate at 0 by default', () => {
        expect(defaultGpsdoState.agingRate).toBe(0);
      });
    });

    describe('Interface type compliance', () => {
      it('should satisfy GPSDOState interface', () => {
        const state: GPSDOState = defaultGpsdoState;
        expect(state).toBeDefined();
      });

      it('should have all required properties', () => {
        const requiredKeys: (keyof GPSDOState)[] = [
          'isPowered',
          'warmupTimeRemaining',
          'temperature',
          'gnssSignalPresent',
          'isGnssSwitchUp',
          'isGnssAcquiringLock',
          'satelliteCount',
          'utcAccuracy',
          'constellation',
          'isLocked',
          'lockDuration',
          'frequencyAccuracy',
          'allanDeviation',
          'phaseNoise',
          'isInHoldover',
          'holdoverDuration',
          'holdoverError',
          'active10MHzOutputs',
          'max10MHzOutputs',
          'output10MHzLevel',
          'ppsOutputsEnabled',
          'operatingHours',
          'selfTestPassed',
          'agingRate',
        ];

        for (const key of requiredKeys) {
          expect(defaultGpsdoState).toHaveProperty(key);
        }
      });
    });

    describe('Constellation type', () => {
      it('should only allow valid constellation values', () => {
        const validConstellations = ['GPS', 'GLONASS', 'BEIDOU', 'GALILEO', 'MULTI'] as const;

        expect(validConstellations).toContain(defaultGpsdoState.constellation);
      });
    });

    describe('State immutability', () => {
      it('should be usable as a base for new states', () => {
        const customState: GPSDOState = {
          ...defaultGpsdoState,
          temperature: 65,
          satelliteCount: 12,
        };

        expect(customState.temperature).toBe(65);
        expect(customState.satelliteCount).toBe(12);
        // Original should be unchanged
        expect(defaultGpsdoState.temperature).toBe(70);
        expect(defaultGpsdoState.satelliteCount).toBe(9);
      });
    });
  });
});
