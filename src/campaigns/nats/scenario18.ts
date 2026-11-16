import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Satellite, TransponderConfig } from '@app/equipment/satellite/satellite';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import { SimClock } from '@app/simulation/sim-clock';
import type { dB, dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { vermontGroundStation } from './ground-stations';
import { c1TransponderPhysics, ses10Satellite, tidemark1Satellite, VERMONT_LOOK_ANGLE_SITE } from './satellites';

/**
 * NATS Level 18: "Satellite Anomaly"
 *
 * Phase: Crisis Operations (Phase 3, Scenario 2 of 8)
 * Time Pressure: Moderate - the drift grows while you decide
 * Calculation Required: NO
 * New Mechanic: a scenario-local DRIFTING variant of TIDEMARK-2 (same bird,
 *   same NORAD ID, same frequency plan - but with station-keeping suspended:
 *   inclined-orbit figure-8 drift and a stale ephemeris). First scenario where
 *   the satellite itself, not the ground segment, is the unknown.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T1314: Maintain network infrastructure
 *   - K0751: Knowledge of system threats
 *
 * Supporting Codes:
 *   - K0721: Knowledge of risk management principles and practices
 *   - T0153: Monitor network capacity and performance
 *   - S0593: Skill in handling incidents
 *
 * Premise (one story, nats-r3-s18-F1 / decision D9): this morning's
 * north-south station-keeping burn ran long on a stuck thruster valve and
 * left TIDEMARK-2 with about 1.3 deg of inclination; further burns are
 * suspended. The bird now swings through a daily +-1.3 deg figure-8. The
 * published ephemeris predates the burn, so program-track points at a
 * station-kept bird: the gap opens from zero at the ~0800 node through the
 * morning (~0.4 deg at 0915, opening ~0.6 deg/h in the sim: DriftingEphemerisSatellite).
 * Pointing loss ~12 (gap/HPBW)^2 dB: ~6 dB now (beacon 28 dB, carrier still
 * locked near 7 dB), carrier lock lost near 0.55-0.6 deg, about one beamwidth
 * (in about twenty minutes; nats-r4-s18-F1, Phase 30 D16).
 * MAX_GAP_DEG (0.5 deg) is a playability clamp: it holds the gap short of
 * lock loss in the sim, so the player never sees the carrier actually drop;
 * the quiz text describes what program-track would do if left alone.
 * Program-track is bleeding C/N. The operator (covering ME-02) must recognize
 * the signature, transition to step-track, hold the link, and feed the
 * spacecraft team ground-side observations - while staying inside the ground
 * role: Halifax flies the vehicle; we keep the lock.
 *
 * Tone: Crisis-phase. Marcus is the primary voice (spacecraft side), Dana
 * provides incident support. All quizzes SYSTEM. 5 clips.
 *
 * Sim notes:
 *   - The drifting TM-2 variant replaces the roster TM-2 for this scenario
 *     only (same NORAD 61526; the canonical satellite is not in the list).
 *   - ephemerisError 0.32/0.26 deg: program-track holds a degraded link
 *     (beacon ~6 dB, carrier ~5 dB down, under the 12 dB recovery line) -
 *     bad enough to read, good enough to acquire from. Step-track's
 *     hill-climb (phase 19.4) takes ~40-60 s to bring both back.
 */

/** Sky gap between the stale ephemeris and the real bird at the 0915 start, deg (0.32 / 0.26 az/el) */
const START_GAP_DEG = 0.39;
/**
 * How fast the gap opens, deg per hour of scenario time (Phase 30 D16,
 * nats-r5-s18-F1). At 0.6 deg/h the beacon under program-track loses about
 * 0.3 dB a minute, about 1.5 dB over the first five minutes, so the bleed the
 * card promises is on the ACU while the player decides.
 */
const GAP_RATE_DEG_PER_H = 0.6;
/** The gap stops opening here (beacon ~9 dB down), so a slow player still has a beacon to step-track from */
const MAX_GAP_DEG = 0.5;
const EPHEMERIS_ERROR_AZ_DEG = 0.32;
const EPHEMERIS_ERROR_EL_DEG = 0.26;

/**
 * TIDEMARK-2 with an ephemeris that goes staler as the scenario runs: the
 * az/el error grows in proportion to the sky gap, on scenario time (paused
 * with briefs and quizzes, restored with checkpoints).
 */
class DriftingEphemerisSatellite extends Satellite {
  /** Sky gap for a scenario-elapsed time, deg */
  static gapDegAt(scenarioElapsedMs: number): number {
    const hours = Math.max(0, scenarioElapsedMs) / 3_600_000;

    return Math.min(MAX_GAP_DEG, START_GAP_DEG + GAP_RATE_DEG_PER_H * hours);
  }

  override update(): void {
    const scale = DriftingEphemerisSatellite.gapDegAt(SimClock.scenarioElapsedMs()) / START_GAP_DEG;
    this.setEphemerisError((EPHEMERIS_ERROR_AZ_DEG * scale) as Degrees, (EPHEMERIS_ERROR_EL_DEG * scale) as Degrees);
    super.update();
  }
}

const tidemark2DriftingSatellite = new DriftingEphemerisSatellite(
  'TIDEMARK-2',
  61526,
  [], // No stand-in: TM-2's hub carrier is ME-02's own uplink (phase 27)
  [],
  {
    az: 143.3 as Degrees, // 45 W from VT-01 (Phase 28 D4, was 219.7 / 26.3)
    el: 31.8 as Degrees,
    // Polarization skew (rotation) is derived from geometry (Phase 29 D8): geoPolarizationSkewDeg
    frequencyOffset: 2.225e9 as Hertz,
    // Stale ephemeris: station-keeping suspended, prediction no longer matches
    // 0.32 / 0.26 deg (0.39 deg on the sky from Maine): program-track loses
    // ~6 dB of beacon and ~5 dB of carrier, under the recovery threshold;
    // step-track climbs it back (phase 19.4; test/campaigns/nats-step-track-validation.test.ts).
    // These are the 0915 values; DriftingEphemerisSatellite opens them from there.
    ephemerisErrorAz: EPHEMERIS_ERROR_AZ_DEG as Degrees,
    ephemerisErrorEl: EPHEMERIS_ERROR_EL_DEG as Degrees,
    lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
    orbitType: 'geosynchronous',
    geosyncConfig: {
      minAz: 142.0 as Degrees, // Daily figure-8 from ~1.3° of inclination: ±1.3°
      maxAz: 144.6 as Degrees,
      minEl: 30.5 as Degrees,
      maxEl: 33.1 as Degrees,
      // One figure-8 a day (Phase 32 D19, nats-r7-s18-F1): at 24 h the
      // +/-1.3 deg swing peaks at ~0.34 deg/h in elevation, so the bird
      // starts on its nominal slot (143.3 / 31.8 from VT-01, 147.0 / 32.4 from
      // ME-02, the brief's numbers) and moves a few hundredths of a degree in
      // the scenario. The legacy rate (0.1 deg per 30 s, a 41-minute 8) made
      // the look angles climb ~7 deg/h. What bleeds the link is the ephemeris
      // gap above (GAP_RATE_DEG_PER_H), not the figure-8.
      initialPhase: 0,
      periodHours: 24,
    },
    transponderConfigs: [
      {
        id: 'TP-1',
        uplinkCenterFrequency: 6017e6 as RfFrequency,
        physics: { ...c1TransponderPhysics(27), gainMode: 'alc', alcOboDb: 0.5 }, // ALC: the stale-ephemeris uplink fade is levelled (output held), only the uplink C/N suffers (phase 19.3)
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3792 MHz
        polarization: 'H',
        beacon: {
          frequency: 4180e6 as RfFrequency,
          signalId: 'TIDEMARK-2-Beacon',
          serverId: 1,
          noradId: 61526,
          power: 31 as dBm,
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
      } as TransponderConfig,
      {
        id: 'TP-2',
        uplinkCenterFrequency: 5980e6 as RfFrequency,
        physics: c1TransponderPhysics(27),
        bandwidth: 36e6 as Hertz,
        frequencyOffset: 2.225e9 as Hertz,
        polarization: 'H',
      } as TransponderConfig,
    ],
  }
);

export const scenario18Data: ScenarioData = {
  id: 'nats-scenario18',
  prerequisiteScenarioIds: ['nats-scenario17'],
  url: 'nats/scenarios/nats-scenario18',
  imageUrl: 'nats/18/card.png',
  number: 18,
  title: 'Satellite Anomaly',
  subtitle: 'TIDEMARK-2 Station-Keeping Drift',
  duration: '30-35 min',
  difficulty: 'advanced',
  missionType: 'Anomaly Response',
  description: `Halifax called at 0850. This morning's north-south station-keeping burn on TIDEMARK-2 ran long because of a stuck thruster valve, and it left the bird with about 1.3° of inclination. Further burns are suspended while the vehicle team investigates. From Maine's dish the satellite now swings through a daily figure-eight of about ±1.3°, and the published ephemeris, computed before the burn, doesn't show it.<br><br>Program-track follows the ephemeris, so it's pointing at the wrong place, and the gap is opening fast this morning. The beacon C/N on the ACU sheds a few tenths of a dB a minute, and you can watch it bleed in real time.<br><br>You've flown an inclined bird before, and AURORA-7 taught you what this needs. The difference is that the satellite is the patient and the spacecraft team is the surgeon, so the ground operator's job is to keep the monitors attached: hold the lock, feed Halifax your track data, and know where the ground role ends.`,
  equipment: ['9-meter C-band Antenna (ME-02)', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'Halifax vehicle status feed'],
  timeLimitSeconds: 35 * 60,
  settings: {
    isSync: true,
    // Brief: Tuesday 0915 local (the day after S17's Monday transit)
    scenarioStartDate: '2026-03-03',
    scenarioStartWallTime: '09:15:00',
    groundStations: [
      // VT-01: standby on TIDEMARK-1, untouched this shift
      {
        ...vermontGroundStation,
      },
      // ME-02: carrying TIDEMARK-2, program-track degrading on the stale ephemeris
      {
        id: 'ME-02',
        name: 'Maine Ground Station',
        isOperational: true,
        location: {
          latitude: 45.2538,
          longitude: -69.7657,
          elevation: 180,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            isPowered: true,
            azimuth: 146.96 as Degrees, // Maine sees TM-2 (45 W) here, not at Vermont's 143.3 / 31.8 (Phase 28 D4)
            elevation: 32.42 as Degrees,
            // polarization: derived from geometry (Phase 29 D8)
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61526,
            targetAzimuth: 146.96 as Degrees,
            targetElevation: 32.42 as Degrees,
            slewing: false,
            beaconCN: null, // measured live since 19.2: ~28 dB on the stale ephemeris, ~34 dB under step-track
            beaconFrequencyHz: 4180e6 as Hertz, // TIDEMARK-2 beacon (RF)
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // ME-02 carries TM-2: full chain hot (BUC unmuted, HPA enabled
            // inherit from VT-01 defaults), LNB LO 5250 for matching IFs
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm, // Engineering-mode field; S4 checks it stays at the beacon preset
            centerFrequency: 1070e6 as Hertz, // TM-2 beacon IF
            span: 2e3 as Hertz,
            rbw: null, // Auto (3 Hz at 2 kHz): the CW line stands ~55 dB over the floor
            // Phase 27: the TIDEMARK beacon reads -54 to -59 dBm at the RX IF tap
            // (ledger), the floor ~-114 dBm in 3 Hz: both on screen, 10 dB/div
            minAmplitude: -140 as dBm,
            maxAmplitude: -40 as dBm,
            scaleDbPerDiv: 10 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          },
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                ifSignal: {
                  ...vermontGroundStation.transmitters[0].modems[0].ifSignal,
                  signalId: 'TIDEMARK-2-Teleport',
                  noradId: 61526,
                  frequency: 983e6 as IfFrequency, // TM-2 TP-1: 7000 - 6017
                },
              },
            ],
          },
        ],
        receivers: [
          {
            activeModem: 1,
            modems: [
              {
                modemNumber: 1,
                isPowered: true,
                frequency: 1458 as MHz, // TM-2 downlink IF (5250 - 3792)
                bandwidth: 36 as MHz,
                modulation: 'QPSK',
                fec: '3/4',
                antenna_id: 1,
              },
            ],
          },
        ],
      },
    ],
    satellites: [tidemark2DriftingSatellite, tidemark1Satellite, ses10Satellite],
    trafficOwnership: [
      {
        satelliteNoradId: 61526,
        initialOwnerId: 'ME-02',
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-18?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Anomaly Brief',
      description: "Open the brief and Halifax's 0850 vehicle status report.",
      groundStation: 'ME-02',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Take the Shift',
          params: {
            character: Character.SYSTEM,
            question: "TIDEMARK-2 has a vehicle anomaly and the ground link is degrading. What's your job this shift?",
            options: [
              'Keep the link alive and feed Halifax ground observations - the vehicle is theirs, the lock is mine',
              'Diagnose the thruster fault from the ground telemetry - the beacon trace is the data, the diagnosis is mine',
              'Hand TIDEMARK-2 traffic to VT-01 before the drift grows - the vehicle is theirs, the customer is mine',
              'Work with Halifax to command the satellite back to its slot - the burn plan is theirs, the uplink is mine',
            ],
            correctIndex: 0,
            explanation:
              'Knowing your role is the first decision in a vehicle anomaly. Halifax flies the spacecraft, and the ground station keeps the antenna on it, so your job is the link and the observations. Diagnosing the fault, commanding the satellite or moving traffic belongs to Halifax or to Dana.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'select-maine-station',
      nice: ['S0421'],
      title: 'Open ME-02',
      description: 'Select the Maine Ground Station.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'ME-02 Selected',
          params: { groundStationId: 'ME-02' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 1: READ THE SIGNATURE
    // ============================================================
    {
      id: 'dashboard-baseline',
      nice: ['T0153', 'K0741'],
      title: 'Station Health vs Link Health',
      description: "Open the Dashboard and sort what's wrong from what's healthy.",
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['select-maine-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Dashboard Open',
          params: { tab: 'dashboard' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'The Split',
          params: {
            character: Character.SYSTEM,
            question: 'The Dashboard shows degraded link margin, but every equipment indicator is green. What does that combination tell you?',
            options: [
              "The ground segment is healthy - the problem is on the space side or in the geometry, matching Halifax's report",
              'A hidden equipment fault - green indicators can lag a real degradation, so sweep the ground segment first',
              'A stale dashboard - the link margin figure is minutes old, so a refresh will bring it back in line with the board',
              'Rain fade over Maine - weather degrades the link while every indicator stays green, so check the rain sensor',
            ],
            correctIndex: 0,
            explanation:
              "Healthy equipment and a sick link mean you look up, not down. The equipment is green, so the cause is above the station, which matches Halifax's report. A hidden fault, a stale dashboard or rain fade would each leave some other sign, and none of them fits a vehicle that has already been reported drifting.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'station-keeping-quiz',
      nice: ['K1032', 'K0751'],
      title: 'What Died on the Spacecraft',
      description: 'Pick what the overrunning north-south burn looks like from Maine.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['dashboard-baseline'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Orbit Mechanics',
          params: {
            character: Character.SYSTEM,
            question: "Halifax says this morning's north-south burn ran long and left TIDEMARK-2 with about 1.3° of inclination. What does that look like from Maine?",
            options: [
              'A daily figure-8 - the bird swings about 1.3° north and south of its slot, and the pre-burn ephemeris does not show it',
              'Altitude decay - the bird sinks below the GEO belt within days, and the ephemeris range figures get steadily worse',
              'Longitude drift - the bird slides along the GEO arc toward the TIDEMARK-1 slot within days, and the ephemeris azimuth goes wrong first',
              'Nothing observable from Maine - inclination only matters for collision avoidance, and the ephemeris stays valid for months',
            ],
            correctIndex: 0,
            explanation:
              "Inclination is the tilt of the orbit, and north-south burns are what control it. A burn meant to trim a few hundredths of a degree that runs long leaves the orbit tilted, so the satellite crosses the equator twice a day and swings about ±1.3° north and south of its slot. That's a daily figure-8, and the east-west part of the 8 is tiny at this inclination. The burn set its size, and only another burn changes it. AURORA-7 built up inclination slowly, only 0.8-0.9° a year with no burns at all, but TIDEMARK-2 got there in one bad burn this morning.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'read-program-track-decay',
      nice: ['T0153', 'K1032'],
      title: 'Read the Program-Track Decay',
      description: 'Open ACU Control and check what program-track is doing now that the ephemeris is stale.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['station-keeping-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Why the C/N Sags',
          params: {
            character: Character.SYSTEM,
            question: "Beacon C/N is several dB below its usual value, but program-track reports that it's exactly on target. How do you reconcile that?",
            options: [
              'Program-track IS on the ephemeris target - the satellite is elsewhere, and the gap between prediction and reality costs pattern loss',
              'The beacon transmitter is failing on the satellite - pointing is fine, and the wander is the beacon output sagging with the power bus',
              "The ACU encoder is slipping - the dish isn't where it reports, and the gap between commanded and actual pointing costs pattern loss",
              'Cross-pol interference from SES-10 - pointing is fine, and the wander is the SES-10 carrier beating against our beacon C/N',
            ],
            correctIndex: 0,
            explanation:
              'A 9-meter C-band dish has a beamwidth of roughly half a degree, so a few tenths of a degree of ephemeris error puts the bird on the shoulder of the beam, present but degraded. At 0.4 deg off, the beacon loses about 6 dB. Program-track LOCKED only means the dish is where the ephemeris said it should be, not where the satellite is.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'beamwidth-risk-quiz',
      nice: ['K0721', 'K1032'],
      title: 'How Long Until It Falls Off',
      description: "Work out how long program-track can last, given the gap between the ephemeris and the real satellite and the dish's fixed beamwidth.",
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['read-program-track-decay'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Clock',
          params: {
            character: Character.SYSTEM,
            question:
              "The ephemeris predates the burn, so program-track points at a station-kept bird while the real one swings through its daily ±1.3° figure-8. The gap is about 0.4° now (beacon ~6 dB down) and opens about 0.6° an hour, which sheds a few tenths of a dB a minute. The ACU's half-power beamwidth (HPBW) is ~0.6°. What does that mean for program-track?",
            options: [
              'Borrowed time - in about twenty minutes the gap reaches about one beamwidth (~0.55-0.6°) and the carrier would drop out of lock',
              'Fine for the shift - ±1.3° is the size of the figure-8, not the pointing error, and program-track already follows the figure-8',
              'Fine with more gain - a few dB of LNB gain covers the pattern loss, and the strategy holds until Halifax publishes a fix',
              'Self-correcting - program-track refines its ephemeris from the beacon as the gap grows, and converges before Halifax publishes a fix',
            ],
            correctIndex: 0,
            explanation:
              "Pointing loss grows with the square of the error, about 12 x (gap / beamwidth)² dB. At 0.4° the loss is ~6 dB, which is what the ACU shows: beacon 28 dB, carrier still locked. At 0.6° an hour the gap reaches about one beamwidth (~0.55-0.6°) in about twenty minutes, the loss would climb to ~10-12 dB and the carrier would fall out of lock. By 1.3° it's tens of dB and the bird is off the beam entirely. The ephemeris knows nothing about the burn, so program-track keeps pointing at the old slot while the gap opens. No gain knob recovers pointing loss, because the LNB lifts the noise along with the signal, so the fix is to track the satellite itself. That's what the beacon is for.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: TRANSITION TO STEP-TRACK
    // ============================================================
    {
      id: 'enable-step-track',
      nice: ['S0421', 'K1032'],
      title: 'Engage Step-Track',
      description: 'Switch the antenna from program-track to step-track, so the beacon steers the dish instead of the ephemeris.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['beamwidth-risk-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Engaged',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'acquire-stable-beacon',
      nice: ['T0153', 'K1032'],
      // Phase 19.4: step-track is a real hill-climb, so this is a real
      // recovery: program-track leaves the beacon ~28 dB, step-track climbs it
      // back to ~34 dB in 40-60 s (nats-s18-F3; nats-step-track-validation.test.ts)
      title: 'Beacon Recovery',
      description:
        'Watch the ACU beacon C/N while step-track hunts. It steps the dish a fraction of a beamwidth at a time and keeps whichever direction reads higher. Hold here until the beacon is back to 32 dB or better for 10 s, which takes about half a minute of stepping.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['enable-step-track'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon C/N Recovered (≥ 32 dB)',
          params: { minBeaconCn: 32 },
          mustMaintain: true,
          maintainDuration: 10,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-carrier-recovery',
      nice: ['T0153', 'T1314'],
      title: 'Carrier Recovery',
      // Ledger (nats-scenario18.json): ME-02's own TM-2 carrier reads about 7.8 dB
      // on the stale ephemeris; step-track wins back ~6 dB (beacon 28 -> 34)
      description:
        'Open RX Analysis and confirm the customer carrier is back, locked with C/N of at least 12 dB for 15 s. On the stale ephemeris it sat near 7 dB, about 3 dB above the lock point.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['acquire-stable-beacon'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Recovered (≥ 12 dB)',
          params: { minCNRatio: 12, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
          maintainDuration: 15,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'no-manual-chase-quiz',
      nice: ['K0721', 'S0421'],
      title: 'Why Not Fly It By Hand',
      description: 'Pick the reason hand-pointing is the wrong fallback for a drifting satellite.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-carrier-recovery'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Hands Off the Axes',
          params: {
            character: Character.SYSTEM,
            question: 'A colleague suggests nudging the dish by hand every few minutes instead of trusting step-track. Why is that worse?',
            options: [
              'A human chases where the bird WAS while the loop tracks where it IS - nudges add error, and a bad one can drop the beacon',
              'Manual mode disables the beacon receiver; the ACU stops reporting C/N - nudges are made blind, and a bad nudge can drop the carrier',
              'It is not worse; a human reads the C/N faster than the loop steps - nudges every few minutes stay inside the beamwidth all day',
              'Manual pointing loads the drive motors; the ACU logs every nudge - a stalled axis is the risk, and a stall drops the beacon entirely',
            ],
            correctIndex: 0,
            explanation:
              "Step-track corrects continuously against the measured beacon, while a human nudging every few minutes lets pointing error build up between corrections, and fatigue guarantees a missed one. If the automation really does die, you'll fly manual because you must. Choosing manual while the loop works means worse performance at higher risk.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: HOLD AND REPORT
    // ============================================================
    {
      id: 'sustained-hold',
      nice: ['T0153', 'T1314'],
      title: 'Watch the Link Through the Drift',
      description:
        "Stay on ACU Control and watch step-track keep the beacon for 30 s while the figure-8 wanders. This is the new normal until Halifax fixes the vehicle. The hold counts only while you're on ACU Control.",
      groundStation: 'ME-02',
      // A watch: beacon, step-track and carrier are meant to stay as they are
      intent: 'confirm',
      prerequisiteObjectiveIds: ['no-manual-chase-quiz'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          // B3: the 30 s hold accrues only while the player is watching
          type: 'tab-active',
          hidden: true,
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon Held',
          mustMaintain: true,
          maintainDuration: 30,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Maintained',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Carrier Held',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'ground-observations-quiz',
      nice: ['T1314', 'K1032'],
      title: 'Feed the Vehicle Team',
      description: "Pick the ground data that actually helps Halifax's investigation.",
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['sustained-hold'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Useful Telemetry',
          params: {
            character: Character.SYSTEM,
            question: 'Which ground-side dataset is most valuable to the spacecraft team right now?',
            options: [
              'Timestamped step-track pointing history - the dish is following the satellite, so its az/el trace measures the actual orbit',
              'Timestamped receiver frame error counters - the demod is riding the carrier, so its error rate trace tracks the vehicle bus health',
              'Timestamped BUC and HPA temperatures - the uplink chain is loading against the drift, so its thermal trace tracks the range change',
              'Timestamped spectrum analyzer screenshots - the beacon level is tracking the excursion, so its amplitude trace maps the figure-8',
            ],
            correctIndex: 0,
            explanation:
              'When step-track follows the beacon, the antenna becomes a tracking instrument, because its az/el trace records where the satellite really was at each moment. Halifax can fit that trace against their dynamics model, and ground stations have refined orbits this way for decades. The other datasets describe how your equipment or the carrier is doing, not where the satellite is.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'impact-assessment-quiz',
      nice: ['K0721', 'T1020'],
      title: 'Customer Impact Posture',
      description: "Choose the customer impact statement for an anomaly that isn't affecting service right now.",
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['ground-observations-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Statement',
          params: {
            character: Character.SYSTEM,
            question: 'Service is fully restored under step-track. What should the customer impact assessment say?',
            options: [
              'No current impact; service nominal under step-track. Elevated risk while the anomaly is open; decision points: step-track margin loss, Halifax status change',
              'No impact; service nominal under step-track. Risk posture normal now that the link is recovered; no further decision points until Halifax closes the anomaly',
              'Severe impact; service at risk under step-track. Elevated risk while the anomaly is open; recommend customers migrate to TIDEMARK-1 before margin is lost',
              'Impact unknown; service nominal under step-track for now. Assessment deferred until Halifax closes the anomaly; no decision points set on the ground side',
            ],
            correctIndex: 0,
            explanation:
              "The honest posture is green today, amber risk, and named tripwires. Say what you know and label what you're watching, because every board-level report you write gets graded on exactly that. Reporting normal risk hides an open anomaly, and calling it severe sends customers away from a link that's working.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'escalation-boundary-quiz',
      nice: ['S0593', 'K0721'],
      title: 'Escalation Tripwires',
      description: "Decide which events stop being yours to handle and become Dana's call.",
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['impact-assessment-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Tripwires',
          params: {
            character: Character.SYSTEM,
            question: 'Which events escalate beyond the ground-operator role?',
            options: [
              'Step-track losing the beacon, C/N below demod threshold despite good tracking, or Halifax declaring the vehicle unsafe',
              'Any growth in the figure-8 size, beacon C/N moving more than 1 dB, or Halifax publishing a corrected ephemeris',
              'Each hourly mark automatically, every step-track correction logged, or any time the pointing history is sent to Halifax',
              'Nothing on the ground side - the operator owns the link, the pointing feed, and the incident from open to close',
            ],
            correctIndex: 0,
            explanation:
              "You own the link while the link is holdable, so the tripwires are anything that makes holding it impossible or unwise. Once the question becomes 'should this traffic move?' or 'should this bird carry traffic at all?', that's supervision and spacecraft authority, with your data underneath it.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-shift-summary',
      nice: ['K0645', 'T0153'],
      title: 'Log the Anomaly Response',
      description: 'Record the shift for the next operator, because the anomaly outlives your shift.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['escalation-boundary-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry hands this off correctly?',
            options: [
              'TM-2 vehicle anomaly (Halifax ref): N-S burn overran, ~1.3° inclination, ephemeris stale. ME-02 on step-track (time in the Ops Log), carrier recovered, no impact. Pointing history to Halifax. Anomaly OPEN.',
              'TM-2 tracking anomaly (ME-02 ref): program-track lost margin, ephemeris stale. Step-track engaged this shift, carrier recovered, no impact. Fix confirmed, no further action. Anomaly CLOSED.',
              'TM-2 vehicle anomaly (Halifax ref): N-S burn overran, ~1.3° inclination, ephemeris stale. ME-02 step-track for the burn window only, carrier recovered, no impact. Returned to program-track. Anomaly CLOSED.',
              'TM-2 vehicle anomaly (Halifax ref): thruster degradation under investigation. ME-02 carrier nominal, no impact. Halifax holds all detail and next steps. Anomaly OPEN, no ground actions.',
            ],
            correctIndex: 0,
            explanation:
              "The correct entry marks the anomaly OPEN, because the vehicle problem isn't fixed, and records what was done and what went to Halifax. The wrong ones close the anomaly early, blame the wrong party, or claim Halifax holds everything and the ground has no actions. The next operator inherits a healthy link inside an unresolved anomaly, and the log has to make both halves of that true.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Dana at 09:15]</em>
      </p>
      <p>
        "Marcus called the ops line at 0850. This morning's north-south burn on TM-2 ran long because of a stuck thruster valve, and it left the bird with over a degree of inclination. Burns are suspended while the vehicle team investigates. The ephemeris predates the burn, so Maine's link is paying for it. The ephemeris is the table of predicted positions that program-track follows. You're covering ME-02 today. Keep the link, feed Halifax what you see, and know where your job ends. The vehicle is theirs. The lock is yours."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/18/intro.mp3'),
    },
    objectives: {
      'beamwidth-risk-quiz': {
        text: `
        <p>
          This is Marcus in Halifax, and I can confirm what you're seeing. The burn left us about 1.3 degrees of inclination, and the published ephemeris predates it, so the gap will keep opening. A corrected ephemeris from us will take a while, so don't wait for it. You've got a beacon, and I'd trust your measurement over my numbers right now. Switch the dish over to follow it.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/18/obj-beamwidth-risk-quiz.mp3'),
      },
      'verify-carrier-recovery': {
        text: `
        <p>
          And there it is - your uplink's back up at the transponder, right where it belongs. The dish is flying the bird instead of the prediction. Nicely done.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/18/obj-verify-carrier-recovery.mp3'),
      },
      'ground-observations-quiz': {
        text: `
        <p>
          One more thing, keep that pointing history flowing to us. Right now your dish is the best instrument we have for orbit determination, which means working out exactly where the satellite is. Every hour of clean step-track trace tightens our fix on the orbit for the recovery burn.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/18/obj-ground-observations-quiz.mp3'),
      },
      'log-shift-summary': {
        text: `
        <p>
          Good shift. You spotted the program-track decay, made one decisive change to step-track, and stayed inside your lane while owning everything in it. That's anomaly response: the link stopped being a problem, so the vehicle team can work on theirs.
        </p>
        <p>
          The anomaly stays open, and tomorrow's operator starts from your log.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/18/obj-log-shift-summary.mp3'),
      },
    },
  },
};
