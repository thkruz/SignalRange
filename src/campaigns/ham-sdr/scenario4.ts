import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { backyardYagiStation } from './ground-stations';
import { cubehop1Satellite } from './satellites';

/**
 * ham-sdr Scenario 4 - "Set and Forget" / AFC discovery, staged A/B in one pass
 *
 * The AFC payoff (per the phase-1 retro note: manual chase first, AFC second).
 * A single pass carries both halves - Doppler drift is fastest near AOS and
 * LOS and pauses at closest approach, so the first half is a real manual
 * chase and the second half shows the loop doing the same job hands-off:
 * 1. chase the first half by hand (receiver-afc-enabled { afcEnabled: false },
 *    lock held 90 s),
 * 2. engage AFC (receiver-afc-enabled, the new Campaign 3 condition),
 * 3. hands off through the back half (lock + C/N >= 10 held 120 s with AFC on).
 *
 * Pass timeline (scenario clock starts 2027-06-21 16:34:00 UTC - the third
 * evening; TLE epoch 2027-06-19, still well inside SGP4 validity). This is
 * the strongest pass of the campaign so far, nearly overhead:
 * - CUBEHOP-1: AOS T+4.8 min, max el 83.1 deg at T+11.2, LOS T+17.5 min
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0421: Skill in operating communications equipment
 *   - K0740: Knowledge of system performance indicators
 * Supporting Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0153: Monitor system performance
 */
export const hamSdrScenario4Data: ScenarioData = {
  id: 'ham-sdr-scenario4',
  url: 'ham-sdr/scenarios/ham-sdr-scenario4',
  imageUrl: 'nats/4/card.png',
  number: 4,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['ham-sdr-scenario3'],
  title: 'Set and Forget',
  subtitle: 'Earn the AFC Checkbox',
  duration: '20-25 min',
  missionType: 'Backyard Session',
  description: `The tape comes off the checkbox tonight.<br><br>CUBEHOP-1 is coming over nearly dead overhead - the strongest pass yet, and the fastest Doppler at the edges. Riley's deal: fly the first half of the pass by hand, like you learned. At closest approach, flip on the AFC and take your hands off the dial. Watch what the loop does with the back half of the drift, and understand exactly what it's measuring to do it.<br><br>Automation you understand is a tool. Automation you don't is a prayer.`,
  equipment: [
    'DIY 70cm Crossed Yagi on TV Rotator',
    'RTL-SDR Receiver (Direct Sampling)',
    'SkyWatcher SDR Console (AFC unlocked)',
  ],
  settings: {
    isSync: true,
    groundStations: [backyardYagiStation],
    satellites: [cubehop1Satellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-21',
    scenarioStartWallTime: '16:34:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-3/scenario-4?content-only=true&dark=true',
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: "Read Riley's Note",
      description: 'The note explains what the AFC loop actually measures. Read it now - the quiz at the end of the night assumes you did.',
      groundStation: 'BKYD-YAGI',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Read',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'AFC Error Signal Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'When AFC is on, what does the receiver measure to decide which way to retune?',
            options: [
              "The carrier's offset from the center of the channel - it slews the VFO to re-center whatever it is locked to.",
              'The satellite position from the Observations list.',
              'The rotator azimuth and elevation rates.',
            ],
            correctIndex: 0,
            explanation: "AFC is beautifully dumb: it sees a carrier off-center in the passband and walks the VFO toward it. No orbit knowledge at all - which is both its power and, as you'll see someday, its weakness.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'track-cubehop',
      nice: ['S0421', 'K1032'],
      title: 'Track the Overhead Pass',
      description: 'Select CUBEHOP-1 and engage TRACK. An 83 degree pass means the rotator swings hard through the middle - let it work, your job tonight is the frequency.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Rotator Tracking CUBEHOP-1',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'CUBEHOP-1 Downlink Detected at 435.25 MHz',
          params: {
            signalId: 'CUBEHOP-1-FM',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'sdr-console',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'manual-first-half',
      nice: ['S0421', 'K0740'],
      title: 'Fly the First Half by Hand',
      description: 'Lock the downlink and hold it by hand for 90 seconds - AFC stays off. The inbound drift is the fastest you have chased yet; stay ahead of it.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['track-cubehop'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Lock Held by Hand (90 s)',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: true,
          maintainDuration: 90,
        },
        {
          type: 'receiver-afc-enabled',
          description: 'AFC Still Off',
          params: { modemNumber: 1, afcEnabled: false },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'engage-afc',
      nice: ['S0421'],
      title: 'Take the Tape Off',
      description: 'Near closest approach - while the drift is briefly standing still - check the AFC box on the SDR Console. Hand the dial to the machine.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['manual-first-half'],
      conditions: [
        {
          type: 'receiver-afc-enabled',
          description: 'AFC Engaged',
          params: { modemNumber: 1, afcEnabled: true },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'hands-off',
      nice: ['S0421', 'K0740', 'T0153'],
      title: 'Hands Off the Dial',
      description: 'Let the loop fly the outbound drift. Hold lock with at least 10 dB C/N for two minutes with AFC on and your hands in your pockets. Watch the VFO readout follow the carrier down.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['engage-afc'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Lock Held by the Loop (2 min)',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: true,
          maintainDuration: 120,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N At or Above 10 dB',
          params: { modemNumber: 1, minCNRatio: 10, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: true,
          maintainDuration: 120,
        },
        {
          type: 'receiver-afc-enabled',
          description: 'AFC Remains Engaged',
          params: { modemNumber: 1, afcEnabled: true },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'graduation-log',
      nice: ['K1032', 'K0740'],
      title: 'Log the Graduation',
      description: 'Manual chase and machine chase, same pass, same bird. One question before the checkbox is yours for keeps.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['hands-off'],
      conditions: [
        {
          type: 'status-check',
          description: 'AFC Limits Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'When would the AFC loop fail you, and manual skills save the pass?',
            options: [
              'When the carrier disappears from the passband - a deep fade, or drift faster than the loop can slew - AFC has nothing to measure and stops. A human can predict where the signal WILL be.',
              'Never - the loop is strictly better than a human at all times.',
              'Only if the rotator loses the satellite.',
            ],
            correctIndex: 0,
            explanation: "AFC follows what it can see. Lose the carrier and the loop goes quiet right when you need it most - it has no model of the orbit, only of the passband. That's why you learned the hand version first.",
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
      text: `<p>Big night. Nearly-overhead pass - eighty-three degrees, the strongest signal you'll have seen, and the nastiest Doppler at the edges. Perfect conditions for graduation.</p><p>The deal: first half by hand, to prove Tuesday wasn't luck. At the top of the pass, tape comes off, AFC goes on, hands go in pockets. Deal? Deal.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.EXCITED,
      audioUrl: '',
    },
    objectives: {
      'review-mission-brief': {
        text: `<p>"Beautifully dumb" is the phrase to keep. The loop centers a carrier. That's the whole machine. It doesn't know there's a satellite, an orbit, or a sky.</p><p>Get tracking - and brace for the rotator theatrics on this one, it has to whip around near the top. Ignore it. Frequency is your instrument tonight.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'track-cubehop': {
        text: `<p>Look at that signal strength - overhead passes are the good stuff. Short range, clean sky, all decibels for us.</p><p>Here comes the drift, and it's QUICK on a high pass. VFO high, fingers ready, just like Tuesday. Show me.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'manual-first-half': {
        text: `<p>Ninety seconds, hand-flown, on the fastest drift yet. Tuesday was not luck. Officially confirmed.</p><p>Feel that? The slide is easing off... easing... that's closest approach coming up. NOW - flip the checkbox. Right at the still moment. Perfect handoff conditions.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'engage-afc': {
        text: `<p>And... hands off. Watch the VFO readout. See it? Little steps, down and down, following the carrier as the drift picks back up. It's doing exactly what your fingers did - measure the offset, close the gap, repeat forever, never bored.</p><p>Two minutes. Don't touch anything. I know it's hard.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'hands-off': {
        text: `<p>The machine flew it to the horizon and never wobbled. And here's the thing - you can WATCH it work and know if it's healthy, because you've done its job with your own hands. That's the difference between using automation and trusting it blindly.</p><p>One question, then the checkbox is yours forever.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'graduation-log': {
        text: `<p>"It has no model of the orbit, only of the passband." Frame that. Every automated system you'll ever meet has a version of that sentence, and finding it is the whole job of an operator.</p><p>Congratulations - you're a real satellite operator now. A cheap one. The best kind. Next time: we point this thing at something weirder.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
    },
  },
};
