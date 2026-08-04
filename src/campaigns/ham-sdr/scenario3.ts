import type { AntennaState } from '@app/equipment/antenna';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import type { dBm } from '@app/types';
import { backyardYagiStation } from './ground-stations';
import { cubehop1Satellite } from './satellites';

/**
 * ham-sdr Scenario 3 - "Wrong-Handed" / circular polarization diagnosis
 *
 * Riley re-terminated the yagi's feed harness overnight and the handedness
 * switch was left on LHCP (per the phase-1 retro note: the scenario STARTS
 * wrong-handed). CUBEHOP-1 is RHCP, so the pass opens with the signal ~18 dB
 * in the hole - visible on the waterfall, hopeless to lock. The player has to
 * read the symptom (bird tracked, signal present but weak, C/N in the floor),
 * flip the feed to RHCP (the new antenna-polarization-set condition), and
 * prove it with a >= 10 dB C/N lock through the rest of the pass.
 *
 * Pass timeline (scenario clock starts 2027-06-20 16:24:00 UTC - the next
 * evening; the TLE epoch is 2027-06-19 16:00, well inside SGP4 validity):
 * - CUBEHOP-1: AOS T+4.3 min, max el 63.4 deg at T+10.6, LOS T+17.0 min
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0421: Skill in operating communications equipment
 *   - K0740: Knowledge of system performance indicators
 * Supporting Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0153: Monitor system performance
 */

/** The yagi rig as Riley left it: feed harness on the WRONG handedness */
const yagiStationLhcpStart: GroundStationConfig = {
  ...backyardYagiStation,
  antennasState: [
    {
      ...(backyardYagiStation.antennasState![0] as Partial<AntennaState>),
      circularHandedness: 'LHCP',
    } as Partial<AntennaState>,
  ],
};

export const hamSdrScenario3Data: ScenarioData = {
  id: 'ham-sdr-scenario3',
  url: 'ham-sdr/scenarios/ham-sdr-scenario3',
  imageUrl: 'nats/3/card.png',
  number: 3,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['ham-sdr-scenario2'],
  title: 'Wrong-Handed',
  subtitle: 'Diagnose the Polarization',
  duration: '20-25 min',
  missionType: 'Backyard Session',
  description: `Riley rebuilt the yagi's feed harness last night - "improved" it, allegedly - and now something is off. The rotator tracks fine. The frequency is right. The bird is up there. And the signal is a ghost of what it was yesterday.<br><br>Circularly polarized signals have a handedness, like a screw thread: right-hand or left-hand. Match your antenna to the signal and you lose half a decibel. Get it backwards and a well-built crossed yagi throws away eighteen. Somewhere in last night's rewiring is a switch in the wrong position.<br><br>Track the pass, read the symptom, find the switch. The bird gives you seventeen minutes.`,
  equipment: [
    'DIY 70cm Crossed Yagi on TV Rotator (feed harness "improved")',
    'RTL-SDR Receiver (Direct Sampling)',
    'SkyWatcher SDR Console',
  ],
  settings: {
    isSync: true,
    groundStations: [yagiStationLhcpStart],
    satellites: [cubehop1Satellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-20',
    scenarioStartWallTime: '16:24:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-3/scenario-3?content-only=true&dark=true',
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: "Read Riley's Note",
      description: 'The note is mostly an apology about the feed harness. The useful part: what handedness does to a circular signal, and how many dB are on the line.',
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
          description: 'Handedness Physics Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'A right-hand circular (RHCP) signal reflects off a metal roof on its way to you. What arrives?',
            options: [
              'A left-hand circular signal - reflection reverses the handedness.',
              'A right-hand circular signal, just weaker.',
              'A linearly polarized signal.',
            ],
            correctIndex: 0,
            explanation: 'Reflection flips the screw thread. It is why satellite antennas care so much about handedness - the direct signal and its reflections fight with opposite hands.',
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
      title: 'Track the Pass',
      description: 'Select CUBEHOP-1 in the rotator panel and engage TRACK, same as yesterday. The downlink should appear at 435.25 MHz as the bird rises... but look at how weak it is.',
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
          description: 'CUBEHOP-1 Downlink Visible (Weak)',
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
      id: 'fix-the-feed',
      nice: ['S0421', 'K0740'],
      title: 'Find the Switch',
      description: 'The rotator is on the bird and the VFO is on frequency, so the missing decibels are in the antenna. CUBEHOP-1 transmits right-hand circular. Check the feed handedness switch on the SDR Console and put it back on RHCP.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['track-cubehop'],
      conditions: [
        {
          type: 'antenna-polarization-set',
          description: 'Feed Restored to RHCP',
          params: { circularHandedness: 'RHCP' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'prove-the-link',
      nice: ['S0421', 'K0740', 'T0153'],
      title: 'Prove It with a Lock',
      description: 'With the feed right-handed the signal should come up like a light switch - about 18 dB. Chase the Doppler by hand like yesterday and hold a lock with at least 10 dB of C/N to prove the diagnosis.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['fix-the-feed'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'FM Downlink Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: true,
          maintainDuration: 60,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N At or Above 10 dB',
          params: { modemNumber: 1, minCNRatio: 10, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: true,
          maintainDuration: 60,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'wrong-handed-log',
      nice: ['K1032', 'K0740'],
      title: 'Log the Diagnosis',
      description: 'Eighteen decibels found in one switch. Log what the symptom looked like so you recognize it in ten seconds next time instead of ten minutes.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['prove-the-link'],
      conditions: [
        {
          type: 'status-check',
          description: 'Symptom Pattern Recorded',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'Next month a signal is 18 dB weaker than expected, but pointing, frequency, and hardware all check out. What does the symptom pattern suggest first?',
            options: [
              'Polarization mismatch - a large, CONSTANT loss with everything else nominal points at handedness.',
              'The satellite transmitter is failing.',
              'Doppler has shifted the signal outside the channel.',
            ],
            correctIndex: 0,
            explanation: 'A flat 15-20 dB deficit that does not vary with pointing or time is the polarization signature. Doppler moves, fades flutter - a wrong-handed feed just sits there, uniformly terrible.',
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
      text: `<p>So. Funny story. I re-terminated the feed harness last night because the old connectors were corroding, and I *may* have left something in the wrong position, and I'm not going to tell you what, because honestly this is the best lesson in the whole campaign and I'd hate to spoil it.</p><p>Bird's up in four minutes. Everything worked yesterday. Something doesn't work today. Go.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.HAPPY,
      audioUrl: '',
    },
    objectives: {
      'review-mission-brief': {
        text: `<p>Screw threads. That's the whole concept: a right-handed bolt doesn't go into a left-handed nut, and a right-handed wave doesn't go into a left-handed antenna. Well - it goes in eighteen decibels worth of badly.</p><p>Get tracking. And keep one eye on the signal strength as it comes up. Compare it to your memory of yesterday.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'track-cubehop': {
        text: `<p>Right? RIGHT? The rotator's dead on, the frequency's right there, and the signal is a whisper. Yesterday it filled the waterfall. Today it's barely out of the noise.</p><p>So run the checklist in your head. Pointing: good. Frequency: good. What's left between the bird and the receiver? ... The antenna. Specifically, the thing I rewired.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.SKEPTICAL,
        audioUrl: '',
      },
      'fix-the-feed': {
        text: `<p>THERE it is! Look at the waterfall - eighteen decibels, one switch. Cheapest signal boost in radio. The feed was cross-threaded, radio-wise: left-handed antenna, right-handed bird.</p><p>Now prove the fix holds. Chase it by hand and show me a real lock with real margin.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'prove-the-link': {
        text: `<p>Locked, ten dB of margin, drift and all. Diagnosis confirmed by experiment - that's the difference between guessing and knowing.</p><p>For the record: I owe you one pass. The switch was my fault. But you'd never have LOOKED at that switch if it had never bitten you, and someday, on some antenna, it will bite you for real.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'wrong-handed-log': {
        text: `<p>Constant loss, everything else nominal: check the polarization. Ten-second diagnosis. You're building the pattern library every operator carries around in their head.</p><p>Tomorrow, one more pass with this bird - and you finally get the checkbox. I want you to see exactly what the machine does, now that you know what it's replacing.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
