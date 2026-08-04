import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { backyardQfhStation, backyardYagiStation } from './ground-stations';
import { CUBEHOP1_TLE1, CUBEHOP1_TLE2, makeCubehop1Satellite, wxsat19Satellite } from './satellites';

/**
 * ham-sdr Scenario 6 - "The Network Wants Vermont" / tampered-TLE diagnosis
 *
 * Riley's station joins a volunteer observation network, which asks for two
 * contacts tonight: a WXSAT-19 image pass and a CUBEHOP-1 telemetry pass.
 * The wrinkle: the CUBEHOP TLE Riley pulled from a mirror site is TAMPERED
 * (RAAN shifted 60 deg) - the Observations list shows no CUBEHOP pass all
 * afternoon while the network's request sheet promises one. The tell is the
 * disagreement between two sources of truth; the fix is fetching fresh
 * elements (M4 ephemeris panel, reskinned to amateur voice) and catching the
 * bird on the recovered prediction.
 *
 * Engine notes: the scenario's CUBEHOP is a scenario-local instance
 * (makeCubehop1Satellite) and the tamper is applied via spaceEvents[].initialTle
 * on every load - replay-safe, and the roster instance S2-S4 share is never
 * touched. First campaign use of settings.timeSkip (deferred from S4).
 *
 * Timeline (scenario clock starts 2027-06-23 14:40:00 UTC):
 * - WXSAT-19:  AOS 14:50, max el 35.9 deg, LOS 15:04  (network request #1)
 * - CUBEHOP-1: briefed window ~16:59-17:12 at 56.8 deg (network request #2)
 *   - tampered TLE predicts NO CUBEHOP pass this afternoon
 *   - fresh elements restore the 16:59 prediction; timeSkip crosses the gap
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0820: Knowledge of supply chain risks
 *   - T0153: Monitor system performance
 * Supporting Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - S0421: Skill in operating communications equipment
 */

/** Tampered mirror TLE: RAAN 94 -> 154 deg. The bird this describes never rises over Vermont this afternoon. */
const TAMPERED_CUBEHOP_TLE2 = '2 63002  97.5000 154.0000 0010000  90.0000 226.0000 14.90000000123456';

/** Scenario-local bird - the tamper must never leak into S2-S4's shared instance */
const s6CubehopSatellite = makeCubehop1Satellite();

export const hamSdrScenario6Data: ScenarioData = {
  id: 'ham-sdr-scenario6',
  url: 'ham-sdr/scenarios/ham-sdr-scenario6',
  imageUrl: 'nats/6/card.png',
  number: 6,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['ham-sdr-scenario5'],
  title: 'The Network Wants Vermont',
  subtitle: 'Trust, but Cross-Check the Elements',
  duration: '25-30 min',
  missionType: 'Backyard Session',
  description: `Riley signed the station up for a volunteer observation network - amateurs around the world catching passes the big stations can't be bothered with. Tonight the network wants Vermont twice: a WXSAT-19 weather image at 14:50, and CUBEHOP-1 telemetry at 16:59.<br><br>The weather pass is routine by now. The cubesat is the problem: the request sheet promises a high evening pass, and your Observations list says CUBEHOP-1 will not rise over Vermont at all today. One of them is lying.<br><br>Orbital elements are data files, fetched from mirrors, passed hand to hand. Nobody signs them. Tonight you find out what that costs - and how a good operator catches it.`,
  equipment: [
    'DIY 137 MHz Quadrifilar Helix (fixed skyward)',
    'DIY 70cm Crossed Yagi on TV Rotator',
    'RTL-SDR Receivers (Direct Sampling)',
    'SkyWatcher SDR Console + Observations',
  ],
  settings: {
    isSync: true,
    groundStations: [backyardQfhStation, backyardYagiStation],
    satellites: [wxsat19Satellite, s6CubehopSatellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-23',
    scenarioStartWallTime: '14:40:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-3/scenario-6?content-only=true&dark=true',
    timeSkip: {},
    spaceEvents: [
      {
        id: 'CUBEHOP-TLE',
        satelliteNoradId: 63002,
        maneuverAtS: 30,
        label: "CUBEHOP-1 elements fail the network's cross-check",
        // The truth, as published by the network
        newTle: { tle1: CUBEHOP1_TLE1 as string, tle2: CUBEHOP1_TLE2 as string },
        // The tampered mirror file the station booted with (re-applied every
        // load so replays keep the puzzle)
        initialTle: { tle1: CUBEHOP1_TLE1 as string, tle2: TAMPERED_CUBEHOP_TLE2 },
      },
    ],
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0820'],
      title: 'Read the Observation Requests',
      description: "The network's request sheet: two passes, two birds, exact windows. Note the CUBEHOP window - 16:59, fifty-seven degrees - and remember where your own predictions come from.",
      groundStation: 'BKYD-QFH',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Request Sheet Read',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Element Supply Chain Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'Where did the TLE your Observations list runs on actually come from?',
            options: [
              'A text file, fetched from a volunteer mirror site, with no signature and no way to verify it.',
              'Directly from the satellite, which broadcasts its own orbit.',
              'The rotator measures it during the first pass.',
            ],
            correctIndex: 0,
            explanation: "Element sets are just files. Someone tracks the bird, someone publishes numbers, mirrors copy mirrors. It works because everyone is honest. 'Because everyone is honest' is not a security model.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'catch-wxsat',
      nice: ['S0421', 'K1032'],
      title: 'Network Request #1: WXSAT-19',
      description: 'The weather bird rises at 14:50 - business as usual on the fence post. Lock the APT downlink and let the network have its picture.',
      groundStation: 'BKYD-QFH',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'WXSAT-19 APT Detected',
          params: {
            signalId: 'WXSAT-19-APT',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'sdr-console',
          },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'APT Locked, Image Flowing',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'spot-the-discrepancy',
      nice: ['T0153', 'K0820'],
      title: 'Two Sources, One Sky',
      description: 'Open Observations and find the 16:59 CUBEHOP-1 window the network promised. Take your time. It is not there - no CUBEHOP pass all afternoon. Decide who you believe.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['catch-wxsat'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Observations Checked',
          params: { tab: 'pass-schedule' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Discrepancy Diagnosed',
          params: {
            character: Character.RILEY_BROOKS,
            question: "The network's request sheet says CUBEHOP rises at 16:59. Your Observations list says it never rises today. What is the most likely explanation?",
            options: [
              'The local element file is wrong - stale or tampered. Predictions are only as good as the TLE they run on.',
              'The satellite was destroyed since the request was issued.',
              'The Observations list only works for weather satellites.',
            ],
            correctIndex: 0,
            explanation: 'The sky has one truth and you hold two descriptions of it. The network cross-checks elements against actual observations from dozens of stations; your copy came from one unsigned mirror. Bet on the network - and verify with the pass.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'fetch-elements',
      nice: ['S0421', 'K0820'],
      title: 'Fetch Fresh Elements',
      description: 'The Observations tab has flagged the CUBEHOP element set - the network cross-check agrees with your suspicion. Fetch the fresh elements and watch the 16:59 window appear in the list.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['spot-the-discrepancy'],
      conditions: [
        {
          type: 'ephemeris-updated',
          description: 'Fresh Elements Loaded',
          params: { eventId: 'CUBEHOP-TLE' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'catch-cubehop',
      nice: ['S0421', 'K1032', 'T0153'],
      title: 'Network Request #2: CUBEHOP-1',
      description: 'The prediction is back and it matches the request sheet: 16:59, fifty-seven degrees. Skip ahead if you like the button, wait if you like the suspense - then track, tune, and lock. AFC is yours now.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['fetch-elements'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Rotator Tracking CUBEHOP-1',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'CUBEHOP-1 Downlink Detected',
          params: {
            signalId: 'CUBEHOP-1-FM',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'sdr-console',
          },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Telemetry Locked for the Network',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'supply-chain-log',
      nice: ['K0820', 'K1032'],
      title: 'Log the Lesson',
      description: 'Two requests delivered, one bad element file caught. Write down the habit that caught it.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['catch-cubehop'],
      conditions: [
        {
          type: 'status-check',
          description: 'Cross-Check Habit Recorded',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'What actually caught the tampered TLE tonight?',
            options: [
              'Comparing two independent sources - the network request sheet against local predictions - and refusing to explain the disagreement away.',
              'Antivirus software on the laptop.',
              'The rotator refused to point at invalid elements.',
            ],
            correctIndex: 0,
            explanation: 'Cross-checking is the whole defense. Elements, timestamps, frequencies - any input someone hands you is a claim. Two independent claims that agree are evidence. One claim alone is a vibe.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
  dialogClips: {
    intro: {
      text: `<p>Big night! We're on the network roster now - real observation requests, from real people, who will send real passive-aggressive emails if we miss our windows.</p><p>Two jobs: weather picture at 14:50, cubesat telemetry at 16:59. I already pulled fresh TLEs from a mirror this morning, so we should be all set. Read the request sheet.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.EXCITED,
      audioUrl: '',
    },
    objectives: {
      'review-mission-brief': {
        text: `<p>Unsigned text files from volunteer mirrors. I know, I know - it's held since the seventies, mostly because nobody bothered to lie to amateurs before.</p><p>Weather bird first. Fence post, 137.1, you could do this asleep by now. Prove it.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'catch-wxsat': {
        text: `<p>Request one, delivered. The network's plot of Vermont just got a weather map with your fingerprints on it.</p><p>Now line up the cubesat window. Pull up Observations and find the 16:59 pass... hm. Take a good look and tell me what you see. Or don't see.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'spot-the-discrepancy': {
        text: `<p>Right. The sheet says 16:59 and the list says never. And look - the tab flagged it too: the element set failed the network's cross-check. My "fresh" morning TLEs. From the mirror. Great.</p><p>Someone fed that mirror garbage - by accident or not, doesn't matter tonight. Fetch the real elements and let's get our bird back.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.SKEPTICAL,
        audioUrl: '',
      },
      'fetch-elements': {
        text: `<p>And there it is - 16:59, fifty-seven degrees, exactly what the network promised. One good file and the whole sky snaps back into agreement.</p><p>We've got time before AOS. The skip button exists. I'm just saying.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'catch-cubehop': {
        text: `<p>Locked! Request two, delivered, on a prediction we rebuilt ourselves after catching a bad element file. That's a full supply-chain incident, detected and recovered, before dinner.</p><p>Log it while I draft a VERY polite note to whoever runs that mirror.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'supply-chain-log': {
        text: `<p>"Two independent claims that agree are evidence. One claim alone is a vibe." I'm putting that on a sticker.</p><p>Next time: something in the neighborhood starts making noise on our frequencies, and we get to find out where the yagi's REAL superpower is. Bring walking shoes.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
