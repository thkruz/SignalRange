import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { Satellite } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Scenario clock start used to author the test TLE: 2027-03-15 14:00:00 UTC */
const SCENARIO_START_MS = Date.UTC(2027, 2, 15, 14, 0, 0);

/**
 * Authored TLE: sun-synchronous LEO bird making a near-zenith pass over the
 * Galway observer: AOS T+2 min, max el 88.3 deg at T+8 min, LOS T+14.5 min.
 */
const TLE1 = '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996' as TleLine1;
const TLE2 = '2 61701  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123451' as TleLine2;

let simNowMs = SCENARIO_START_MS;

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

const KU_BEACON_FREQUENCY = 11699e6 as RfFrequency;

function createOrbitalSatellite(): OrbitalSatellite {
  return new OrbitalSatellite(
    'TEST-LEO-1',
    61701,
    [],
    [],
    {
      tle1: TLE1,
      tle2: TLE2,
      observer: { lat: 53.27 as Degrees, lon: -9.05 as Degrees, alt: 0.02 as Kilometers },
    },
    {
      ephemerisErrorAz: 0.1 as Degrees,
      ephemerisErrorEl: 0.05 as Degrees,
      // Disable random effects for deterministic assertions
      degradationConfig: {
        atmosphericEffects: false,
        randomDropout: false,
        powerVariation: false,
        interference: false,
      },
      transponderConfigs: [
        {
          id: 'TP-1',
          uplinkCenterFrequency: 14005e6 as RfFrequency,
          bandwidth: 36e6 as Hertz,
          frequencyOffset: 2.255e9 as Hertz,
          polarization: 'H',
          beacon: {
            frequency: KU_BEACON_FREQUENCY,
            signalId: 'TEST-LEO-1-Beacon',
            serverId: 1,
            noradId: 61701,
            power: 0 as dBm,
            bandwidth: 1e3 as Hertz,
            modulation: 'CW' as ModulationType,
            fec: 'null' as FECType,
            polarization: 'V',
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.TRANSMITTER,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
        },
      ],
    },
  );
}

describe('OrbitalSatellite', () => {
  beforeEach(() => {
    simNowMs = SCENARIO_START_MS;
  });

  it('propagates az/el/range from the TLE at the simulated time', () => {
    const sat = createOrbitalSatellite();

    // Max elevation point of the authored pass
    simNowMs = SCENARIO_START_MS + 8 * 60 * 1000;
    sat.update();

    expect(sat.el).toBeGreaterThan(80);
    expect(sat.rangeKm).not.toBeNull();
    expect(sat.rangeKm!).toBeGreaterThan(500);
    expect(sat.rangeKm!).toBeLessThan(800);
    expect(sat.az).toBeGreaterThanOrEqual(0);
    expect(sat.az).toBeLessThan(360);
    expect(sat.orbitType).toBe('leo');
  });

  it('moves between position updates as simulated time advances', () => {
    const sat = createOrbitalSatellite();

    simNowMs = SCENARIO_START_MS + 4 * 60 * 1000;
    sat.update();
    const el1 = sat.el as number;

    simNowMs = SCENARIO_START_MS + 6 * 60 * 1000;
    sat.update();
    const el2 = sat.el as number;

    // Rising leg of the pass: elevation increases significantly
    expect(el2).toBeGreaterThan(el1 + 5);
  });

  it('transmits nothing while below the horizon', () => {
    const sat = createOrbitalSatellite();

    // T+60 min: between passes, satellite well below horizon
    simNowMs = SCENARIO_START_MS + 60 * 60 * 1000;
    sat.update();

    expect(sat.isAboveHorizon).toBe(false);
    expect(sat.el).toBeLessThan(0);
    expect(sat.txSignal).toHaveLength(0);
    expect(sat.getTransmittedSignals()).toHaveLength(0);
  });

  it('applies Doppler shift to downlink signals (higher frequency while approaching)', () => {
    const sat = createOrbitalSatellite();

    // T+4 min: rising leg, satellite approaching the station
    simNowMs = SCENARIO_START_MS + 4 * 60 * 1000;
    sat.update();

    expect(sat.isAboveHorizon).toBe(true);
    const beacon = sat.txSignal.find((sig) => sig.signalId === 'TEST-LEO-1-Beacon');
    expect(beacon).toBeDefined();

    const shiftHz = (beacon!.frequency as number) - (KU_BEACON_FREQUENCY as number);
    // Approaching at ~7 km/s: expect a positive shift in the hundreds of kHz
    expect(shiftHz).toBeGreaterThan(50e3);
    expect(shiftHz).toBeLessThan(400e3);
  });

  it('applies ephemeris error to predicted position', () => {
    const sat = createOrbitalSatellite();

    simNowMs = SCENARIO_START_MS + 8 * 60 * 1000;
    sat.update();

    expect(sat.predictedAz - sat.az).toBeCloseTo(0.1, 5);
    expect(sat.predictedEl - sat.el).toBeCloseTo(0.05, 5);
  });

  it('does not affect legacy fixed-telemetry satellites', () => {
    const geoSat = new Satellite('GEO-TEST', 99999, [], [], {
      az: 161.8 as Degrees,
      el: 34.2 as Degrees,
      frequencyOffset: 2.225e9 as Hertz,
      degradationConfig: {
        atmosphericEffects: false,
        randomDropout: false,
        powerVariation: false,
        interference: false,
      },
    });

    geoSat.update();

    expect(geoSat.az).toBe(161.8);
    expect(geoSat.el).toBe(34.2);
    expect(geoSat.rangeKm).toBeNull();
    expect(geoSat.orbitType).toBe('geostationary');
  });
});
