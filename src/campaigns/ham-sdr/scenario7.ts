import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { backyardYagiStation } from './ground-stations';
import { cubehop1Satellite } from './satellites';

/**
 * ham-sdr Scenario 7 - "Margin Call" / local RFI foxhunt + marginal pass
 *
 * Local interference arc on the yagi rig. A neighbor's failing device starts
 * hashing the 70cm band (E1 terrestrial emitter at 435.36 MHz, ~1.2 km due
 * east): the noise floor jumps and tonight's only CUBEHOP pass is a LOW one -
 * 18.4 deg max el, the thinnest link margin of the campaign. The player:
 * 1. hears the hash and confirms it is local (no Doppler, no pass predicted),
 * 2. DFs it with manual yagi sweeps (MAN AZ control - signal peaks on the
 *    emitter bearing, due east),
 * 3. notches it out (FILTER section, one-knob notch at 435.360),
 * 4. narrows the IF filter to 100 kHz (lower noise gate) and catches the
 *    marginal pass with the margin they just clawed back.
 *
 * Timeline (scenario clock starts 2027-06-24 15:15:00 UTC):
 * - T+1:00  RFI on the air (continuous - accidents don't have duty cycles)
 * - CUBEHOP-1: AOS 15:35, max el 18.4 deg, LOS 15:46 (the margin call)
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0648: Skill in detecting anomalies
 *   - S0421: Skill in operating communications equipment
 * Supporting Codes:
 *   - K0740: Knowledge of system performance indicators
 *   - T0153: Monitor system performance
 */
export const hamSdrScenario7Data: ScenarioData = {
  id: 'ham-sdr-scenario7',
  url: 'ham-sdr/scenarios/ham-sdr-scenario7',
  imageUrl: 'nats/7/card.png',
  number: 7,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['ham-sdr-scenario6'],
  title: 'Margin Call',
  subtitle: 'Find the Noise. Then Beat It.',
  duration: '20-25 min',
  missionType: 'Backyard Session',
  description: `Something in the neighborhood is sick. The 70cm band has grown a hash of noise that was not there yesterday - and tonight's only CUBEHOP-1 pass tops out at eighteen degrees, right in the trees, with no margin to spare.<br><br>A directional antenna is a signal finder AND a direction finder. Sweep the yagi by hand until the hash peaks and you own the bearing. Then take the interference out of the receiver: notch the hash, narrow the front-end filter until the noise gate drops below the bird, and catch a pass most operators would write off.<br><br>Decibels are a budget. Tonight you audit it.`,
  equipment: [
    'DIY 70cm Crossed Yagi on TV Rotator (manual slew)',
    'RTL-SDR Receiver (Direct Sampling)',
    'SkyWatcher SDR Console (FILTER section unlocked)',
  ],
  settings: {
    isSync: true,
    groundStations: [backyardYagiStation],
    satellites: [cubehop1Satellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-24',
    scenarioStartWallTime: '15:15:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-3/scenario-7?content-only=true&dark=true',
    interferenceEvents: [
      {
        // The neighbor's failing device: continuous hash, 1.2 km due east.
        // Continuous on purpose - deliberate interference has a duty cycle,
        // accidents just run until somebody unplugs them.
        id: 'ballast-rfi',
        frequency: 435.36e6,
        bandwidth: 80e3,
        power: 20, // EIRP dBm
        polarization: 'V',
        startTime: 60,
        duration: 5400,
        periodSeconds: 5400,
        onSeconds: 5400,
        path: 'terrestrial',
        emitter: { latitude: 44.48, longitude: -73.1949 },
      },
    ],
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: "Read Riley's Note",
      description: 'The note covers two things: what a noise floor actually is, and why tonight\'s eighteen-degree pass leaves no room for one that has grown.',
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
          description: 'Link Margin Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'Why does a LOW pass leave less margin than the overhead passes you have worked so far?',
            options: [
              'The bird is farther away at low elevation (more path loss) and the signal grazes trees and terrain - every dB of extra noise comes straight out of the decode margin.',
              'Satellites transmit less power when low in the sky.',
              'The rotator moves too fast on low passes.',
            ],
            correctIndex: 0,
            explanation: 'Slant range nearly doubles at 18 degrees versus overhead, and the horizon is full of obstructions. On a fat pass you never notice a noisy band. Tonight you will.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'hear-the-hash',
      nice: ['S0648', 'T0153'],
      title: 'Confirm the Intruder',
      description: 'Get the hash on the waterfall - a raised, ragged band around 435.360. Note what it is NOT doing: not drifting, not scheduled, not in the Observations list. Everything about it says local.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'RFI Hash Detected near 435.360',
          params: {
            signalId: 'INTERFERER-ballast-rfi',
            minPower: -110 as dBm,
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
      id: 'df-the-source',
      nice: ['S0421', 'S0648'],
      title: 'Foxhunt: Take a Bearing',
      description: 'Use MAN AZ to sweep the yagi around the horizon and watch the hash strength. Twelve dB of forward gain means it peaks hard when the boom crosses the source. Park the beam on the peak.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['hear-the-hash'],
      conditions: [
        {
          type: 'antenna-position',
          description: 'Beam on the Bearing (due east, +/-12 deg)',
          params: { azimuth: 90, tolerance: 12 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'notch-it',
      nice: ['S0421', 'K0740'],
      title: 'Notch the Hash',
      description: 'You cannot unplug the neighbor\'s gear, but you can carve it out of your receiver. In the FILTER section, enable the notch and center it on 435.360 - watch the hash drop out of the waterfall.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['df-the-source'],
      conditions: [
        {
          type: 'notch-filter-configured',
          description: 'Notch Centered on 435.360 MHz',
          params: {
            notchCenterFrequency: 435.36,
            notchCenterFrequencyTolerance: 0.03,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'narrow-and-catch',
      nice: ['S0421', 'K0740', 'T0153'],
      title: 'Make the Margin, Catch the Pass',
      description: 'Last dB: narrow the IF filter to 100 kHz - the front-end noise gate drops with it. Then TRACK CUBEHOP-1 and hold a lock through the eighteen-degree pass. AFC is allowed; excuses are not.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['notch-it'],
      conditions: [
        {
          type: 'filter-bandwidth-set',
          description: 'IF Filter at 100 kHz',
          params: { bandwidthIndex: 5 },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Rotator Tracking CUBEHOP-1',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Locked Through the Low Pass',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'margin-log',
      nice: ['K0740', 'S0648'],
      title: 'Log the Audit',
      description: 'You found decibels in three places tonight. Log where they came from.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['narrow-and-catch'],
      conditions: [
        {
          type: 'status-check',
          description: 'Margin Audit Recorded',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'What told you the hash was LOCAL rather than a satellite?',
            options: [
              'No Doppler, no predicted pass, and the strength changed with the yagi bearing, not with time - ground signals hold still.',
              'It was too strong to be a satellite.',
              'Satellites never transmit near 435.3 MHz.',
            ],
            correctIndex: 0,
            explanation: 'Physics again: real birds drift and set; ground noise sits there and swings with your beam. The DF sweep is the same trick you will use on the day something pretends to be a satellite.',
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
      text: `<p>Bad news in stereo. One: something nearby is spraying hash all over seventy centimeters - started overnight, my money's on the new grow lights three doors down. Two: tonight's only CUBEHOP window tops out at eighteen degrees. In the TREES.</p><p>Good news: this is my favorite kind of night. We're going to find the noise, delete it, and steal that pass anyway. Read the note.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: '',
    },
    objectives: {
      'review-mission-brief': {
        text: `<p>Margin is arithmetic: signal minus noise minus losses, and whatever's left over is your picture. Tonight everything on the minus side got worse at once.</p><p>First, meet the enemy. Get the hash on the waterfall and really look at it.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'hear-the-hash': {
        text: `<p>Ugly, right? Now notice everything it isn't doing. It isn't drifting - no Doppler. It isn't in the Observations list. It doesn't rise or set. That's not a bird, that's a NEIGHBOR.</p><p>So let's find which one. Sweep the yagi with MAN AZ and watch the strength. When the boom crosses the source, you'll know.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.SKEPTICAL,
        audioUrl: '',
      },
      'df-the-source': {
        text: `<p>Due east and LOUD. That's the Hendersons'. Called it. I'll print them a very friendly pamphlet about RF interference and ballast filters.</p><p>Diplomacy takes weeks; the pass is in minutes. Carve them out of the receiver instead - FILTER section, notch, 435.360.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'notch-it': {
        text: `<p>Gone. Well - still on the air, but not in OUR passband, which is all physics ever promised us.</p><p>One more dB to find: the IF filter is 200 kHz wide and the noise gate charges by the hertz. Narrow it to 100 and the floor drops with it. Then get on the bird - it's coming in LOW.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'narrow-and-catch': {
        text: `<p>LOCKED at eighteen degrees through the tree line with a jammed band. Do you understand what you just did? Most operators see a low pass on a bad band and go inside for dinner.</p><p>You audited the budget and found the decibels. Log it.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'margin-log': {
        text: `<p>No Doppler, no schedule, swings with the beam: ground truth, literally. File that signature away - next time, the thing pretending to be in orbit won't be a grow light.</p><p>One scenario left. The tape comes off the microphone. Study for your exam.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
