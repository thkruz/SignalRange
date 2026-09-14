import type { ScenarioData } from '@app/ScenarioData';
import type { Degrees } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * NATS Europe Sandbox Mode
 *
 * Free-practice environment for the Galway LEO station that also serves as the
 * live proving ground for the Campaign 2 mechanics. Unlike a scored scenario it
 * has no objectives or timer, but every opt-in mechanic block below is enabled,
 * so all of the new consoles are instantiated and interactable:
 *
 *  - linkBudget      (M1) Link-budget / EIRP planning console
 *  - commanding      (M2/M5) LEO uplink ops + command-link key ops (Doppler, TT&C, key rotation, zeroize)
 *  - contactSchedule (M3) Multi-station pass scheduling across GW-01 / SH-02
 *  - spaceEvents     (M4) SAR-2 conjunction-avoidance maneuver + ephemeris reload
 *  - security        (M6) SOC-lite audit log + access control
 *  - transec         (M7) Anti-jam frequency-hopping waveform
 *  - gnssThreat      (M8) GNSS spoofing / timing attack on the station reference
 *  - weatherEvents   (E5) Ku rain fade at Galway (phase 16)
 *  - hardwareFaultEvents (E3) timed BUC cooling fault at SH-02 and GNSS outage at GW-01 (phase 16)
 *  - two stations    (E1) select SH-02 and the sky, pass schedule and deck are Shetland's (phase 16)
 *
 * The automated proof (test/campaigns/nats-eu-mechanics.test.ts) loads these
 * exact settings and drives each manager to demonstrate every new objective
 * condition transitioning to satisfied.
 */
export const natsEuSandboxData: ScenarioData = {
  id: 'nats-eu-sandbox',
  url: 'nats-eu/sandbox',
  imageUrl: 'nats/8/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'intermediate',
  // Unlocked while Campaign 2 is under development: this sandbox is the proving
  // ground for the new mechanics/consoles. Re-gate on scenario1 when it ships.
  prerequisiteScenarioIds: [],
  title: 'Sandbox',
  subtitle: 'Free Practice Mode (Campaign 2 Mechanics)',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: `Explore the Galway LEO ground station freely without objectives or time limits. This sandbox has every Campaign 2 mechanic switched on: the link-budget planner, TT&C commanding with uplink Doppler and key operations, multi-station pass scheduling, on-orbit maneuvers with ephemeris updates, the SOC-lite security console, TRANSEC anti-jam, and GNSS spoofing recovery.
  <br/><br/>Use it to practice the new consoles at your own pace before taking on the scored scenarios.`,
  equipment: [
    '4-meter Ku-band LEO Tracking Antenna',
    'Ku-band RF Front End (13.1 GHz LNB / 12.6 GHz BUC)',
    'Pass Schedule Planner',
    'Link Analysis Console',
    'TT&C Command Console',
    'Station Security Console',
    'Spectrum Analyzer',
    'RX/TX Modems with Video Decoder',
  ],
  settings: {
    isSync: true,
    // Both sites, so per-station propagation (E1) is exercisable: select SH-02
    // and the sky, the pass schedule and the deck are Shetland's.
    groundStations: [galwayGroundStation, shetlandGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '14:00:00',

    // Contact timeline deck. A 6 h horizon in the sandbox so every mechanic can
    // be exercised against several upcoming windows.
    contactTimeline: {
      horizonHours: 6,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // M1 - Link-budget / EIRP planning console.
    // A correct worksheet for the max-el MERIDIAN-SAR-1 downlink yields ~14 dB C/N.
    linkBudget: {
      label: 'MERIDIAN-SAR-1 downlink, max-elevation pass',
      expectedCNRDb: 14,
      toleranceDb: 1.5,
      thresholdCNRDb: 8,
      requiredMarginDb: 3,
    },

    // M2/M5 - LEO uplink ops + command-link key ops.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61701,
      requireValidKey: true,
      requireDopplerComp: true,
      commands: [
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'OBC-WDT-RESET', label: 'Reset OBC watchdog' },
      ],
    },

    // M3 - Multi-station pass scheduling across Galway and Shetland.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 2,
      contacts: [
        { id: 'SAR1-P1', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 pass 1', priority: 1, windowStartS: 120, windowEndS: 870 },
        { id: 'SAR2-P1', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 pass 1', priority: 1, windowStartS: 1050, windowEndS: 1890 },
        { id: 'SAR1-P2', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 pass 2', priority: 3, windowStartS: 6000, windowEndS: 6600 },
      ],
    },

    // Phase 16 E5 - Ku rain fade at Galway (moderate rain, 12 mm/h at peak:
    // ~2 dB at 30 deg, ~4 dB at 10 deg on the 12 GHz downlink). Ramps in over
    // 3 min from T+25 and clears by T+45.
    weatherEvents: [{ id: 'gw-rain', groundStationId: 'GW-01', type: 'rain', severity: 'moderate', startTime: 1500, duration: 1200, linkMarginDegradation: 3 }],

    // Phase 16 E3 - timed equipment faults. SH-02's BUC loses cooling at T+15
    // for 10 min (mute it and it settles under the 70 degC alarm); GW-01's GNSS
    // signal drops at T+40 for 5 min (holdover with the switch still up).
    hardwareFaultEvents: [
      {
        id: 'sh-buc-cooling',
        groundStationId: 'SH-02',
        target: 'buc-overtemp',
        startTime: 900,
        duration: 600,
        params: { startTemperatureC: 66 },
        label: 'SH-02 BUC cooling fault',
      },
      { id: 'gw-gnss-outage', groundStationId: 'GW-01', target: 'gpsdo-gnss-loss', startTime: 2400, duration: 300 },
    ],

    // M4 - Space-domain events: SAR-2 performs a conjunction-avoidance burn ~9 min
    // in; its authored TLE goes stale until the operator loads the update.
    spaceEvents: [
      {
        id: 'SAR2-CAM',
        satelliteNoradId: 61702,
        maneuverAtS: 540,
        label: 'MERIDIAN-SAR-2 conjunction-avoidance maneuver',
        // Post-maneuver element set (same valid TLE format; reloaded at runtime).
        newTle: {
          tle1: '1 61702U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9997',
          tle2: '2 61702  98.1000  30.2000 0010000  90.0000 236.5000 14.60000000123456',
        },
      },
    ],

    // M6 - SOC-lite security console: audit log with two injected anomalies among
    // routine traffic, plus a contractor account to disable.
    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-guest', name: 'Contractor (temp)', role: 'Maintenance', status: 'active' },
      ],
      events: [
        { id: 'evt-login', timeS: 0, timestampLabel: '14:00 UTC', actor: 'op-charlie', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-cfg', timeS: 0, timestampLabel: '14:02 UTC', actor: 'op-charlie', action: 'Set receiver 1 frequency', category: 'config', severity: 'info' },
        {
          id: 'evt-authfail',
          timeS: 0,
          timestampLabel: '03:14 UTC',
          actor: 'op-guest',
          action: 'Repeated failed logins (off-hours)',
          category: 'auth',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-replay',
          timeS: 0,
          timestampLabel: '03:16 UTC',
          actor: 'unknown',
          action: 'Replayed TT&C command frame',
          category: 'command',
          severity: 'critical',
          isAnomaly: true,
        },
      ],
    },

    // M7 - TRANSEC anti-jam frequency-hopping waveform.
    transec: {
      groundStationId: 'GW-01',
      hopChannelsHz: [1405e6, 1410e6, 1415e6, 1420e6],
      requireKey: true,
    },

    // M8 - GNSS spoofing / timing attack on the station reference.
    gnssThreat: {
      groundStationIds: ['GW-01'],
      spoofStartS: 300,
      offsetDriftUsPerS: 5,
    },
  },
  objectives: [],
};
