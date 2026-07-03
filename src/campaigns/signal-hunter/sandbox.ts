import type { ScenarioData } from '@app/ScenarioData';
import { Character } from '@app/modal/character-enum';
import type { dBm } from '@app/types';
import { petersonGroundStation } from './ground-stations';
import { sentry7Satellite, sentry9Satellite } from './satellites';

/**
 * Campaign 5 (Signal Hunter) - Geolocation Sandbox
 *
 * Validation level for the interference-geolocation feature set:
 * - terrestrial jammer with hidden emitter ground truth (West Texas),
 * - two-satellite TDOA/FDOA correlation console + geographic map,
 * - the geolocation-measurements-collected / geolocation-fix-accuracy
 *   objective conditions.
 *
 * The RF chain is pre-configured and tracking SENTRY-7; the operator detects
 * the intermittent hostile carrier, characterizes its duty cycle, then works
 * the geolocation console to cross-fix the emitter.
 *
 * Scenario clock starts 2027-09-01 06:00:00 UTC so the authored SENTRY TLEs
 * place both birds ~45 deg elevation over Peterson Annex.
 */
export const signalHunterSandboxData: ScenarioData = {
  id: 'signal-hunter-sandbox',
  url: 'signal-hunter/scenarios/signal-hunter-sandbox',
  imageUrl: 'nats/21/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'advanced',
  title: 'Signal Hunter Sandbox',
  subtitle: 'Interference Geolocation Trainer',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: `An allied SENTRY satellite is being jammed by an intermittent uplink carrier. Your dish at Peterson Annex is already tracking the victim bird and its neighbor SENTRY-9.
  <br/><br/>Detect the hostile carrier on the spectrum analyzer, characterize its duty cycle, then use the Geolocation console to cross-fix the emitter: tune the correlator to the interferer's uplink, capture TDOA/FDOA measurements while it is transmitting, and compute a position fix. Your job is to put an error ellipse over the jammer.`,
  equipment: [
    '9-meter C-band Antenna (program-track)',
    'C-band RF Front End (5150 MHz LNB LO)',
    'Spectrum Analyzer',
    'Two-Satellite Geolocation Console',
  ],
  settings: {
    isSync: true,
    groundStations: [petersonGroundStation],
    satellites: [sentry7Satellite, sentry9Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-09-01',
    scenarioStartWallTime: '06:00:00',
    interferenceEvents: [
      {
        id: 'pa22-hostile',
        satelliteNoradId: 71001,
        frequency: 6013e6, // Uplink, inside SENTRY-7 TP-1 passband (5990-6030), H-pol
        bandwidth: 5e6,
        power: 6, // dBm at transponder input; ~C/I 14 dB against the 20 dBm service carrier
        polarization: 'H',
        startTime: 15,
        duration: 7200, // Persists across the session
        periodSeconds: 105, // 60 s on / 45 s off - a deliberate cadence
        onSeconds: 60,
        // Hidden ground truth: a clandestine site in West Texas
        emitter: {
          latitude: 31.30,
          longitude: -103.50,
          altitudeKm: 0.8,
        },
      },
    ],
    geolocation: {
      primaryNoradId: 71001,
      adjacentNoradIds: [71002],
      tdoaSigmaS: 1.5e-6, // 1.5 us timing noise
      fdoaSigmaHz: 3,
      areaOfInterest: { latMin: 28, latMax: 40, lonMin: -110, lonMax: -98 },
      captureWindowS: 10,
    },
  },
  objectives: [
    {
      id: 'detect-interference',
      title: 'Detect the Hostile Carrier',
      description: 'Watch the RX Analysis spectrum. An intermittent carrier appears a few MHz from the SENTRY-7 service carrier - the max-hold trace will catch it between duty cycles.',
      groundStation: 'PA-22',
      nice: ['K0926'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Hostile Carrier Observed',
          params: {
            signalId: 'INTERFERER-pa22-hostile',
            minPower: -110 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'characterize-duty-cycle',
      title: 'Characterize the Interferer',
      description: 'Time the on/off windows. A regular duty cycle is the signature of deliberate interference, not an accidental spur.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['detect-interference'],
      conditions: [
        {
          type: 'status-check',
          description: 'Duty Cycle Assessment',
          params: {
            question: 'The carrier transmits ~60 s then goes quiet ~45 s, repeating. What does this regular cadence most strongly indicate?',
            options: [
              'Deliberate, duty-cycled interference (jamming)',
              'A failing power supply on the satellite',
              'Rain fade cycling on the downlink',
              'Normal traffic on an allied carrier',
            ],
            correctIndex: 0,
            explanation: 'A stable on/off cadence is a hallmark of intentional interference - accidents are continuous or random, not periodic.',
            character: Character.CHARLIE_BROOKS,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'open-geolocation-console',
      title: 'Open the Geolocation Console',
      description: 'Switch to the Geolocation tab to begin the two-satellite cross-fix.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['characterize-duty-cycle'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Geolocation Tab Open',
          params: { tab: 'geolocation' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'collect-measurements',
      title: 'Capture Correlation Measurements',
      description: 'Tune the correlator to the interferer uplink (6013 MHz, ~5 MHz bandwidth), select SENTRY-9 as the adjacent collector, and CAPTURE at least three times while the jammer is transmitting.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['open-geolocation-console'],
      nice: ['K0926', 'K0108'],
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 3 TDOA/FDOA captures',
          params: { minCount: 3, interferenceEventId: 'pa22-hostile' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'compute-fix',
      title: 'Fix the Emitter',
      description: 'Run COMPUTE FIX and refine until the fix falls within 40 km of the true emitter. Spreading captures across several duty cycles gives the satellites time to move, which tightens the error ellipse and resolves the geometry.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['collect-measurements'],
      nice: ['K0108'],
      conditions: [
        {
          type: 'geolocation-fix-accuracy',
          description: 'Fix within 40 km of truth',
          params: { maxErrorKm: 40 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'report-location',
      title: 'Report the Fix',
      description: 'Confirm the emitter region for the incident report.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['compute-fix'],
      conditions: [
        {
          type: 'status-check',
          description: 'Emitter Region',
          params: {
            question: 'Your fix places the jammer near 31°N, 103.5°W. Which region does that correspond to?',
            options: [
              'West Texas',
              'Central Colorado',
              'Baja California',
              'The Gulf of Mexico',
            ],
            correctIndex: 0,
            explanation: 'The cross-fix localizes the emitter to West Texas - hand the coordinates and error ellipse to the incident response cell.',
            character: Character.CHARLIE_BROOKS,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
  ],
};
