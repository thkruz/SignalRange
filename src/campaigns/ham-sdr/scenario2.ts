import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { backyardYagiStation } from './ground-stations';
import { cubehop1Satellite } from './satellites';

/**
 * ham-sdr Scenario 2 - "The Slippery Bird" / manual Doppler chase on the yagi
 *
 * The yagi and its TV rotator enter the campaign. CUBEHOP-1's 435.25 MHz FM
 * downlink drifts +/-10 kHz across the pass - more than the 15 kHz channel can
 * swallow - so the operator must ride the VFO with the tune buttons for the
 * whole pass. AFC exists and is deliberately forbidden: the chase objective
 * asserts receiver-afc-enabled { afcEnabled: false } while the lock is held
 * (Riley: "I make everyone do it by hand once"). Scenario 4 pays this off.
 *
 * Pass timeline (scenario clock starts 2027-06-19 16:14:00 UTC - the same
 * evening as Scenario 1, one bird later):
 * - CUBEHOP-1: AOS T+4.0 min, max el 48.2 deg at T+10.2, LOS T+16.5 min
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0421: Skill in operating communications equipment
 *   - K1032: Knowledge of satellite-based communication systems
 * Supporting Codes:
 *   - K0740: Knowledge of system performance indicators
 *   - T0153: Monitor system performance
 */
export const hamSdrScenario2Data: ScenarioData = {
  id: 'ham-sdr-scenario2',
  url: 'ham-sdr/scenarios/ham-sdr-scenario2',
  imageUrl: 'nats/2/card.png',
  number: 2,
  isDisabled: false,
  difficulty: 'beginner',
  prerequisiteScenarioIds: ['ham-sdr-scenario1'],
  title: 'The Slippery Bird',
  subtitle: 'Chase a Cubesat by Hand',
  duration: '20-25 min',
  missionType: 'Backyard Session',
  description: `The crossed yagi is bolted to the rotator and the rotator mostly obeys. Tonight's target is CUBEHOP-1, an amateur FM cubesat on 435.25 MHz - and at 435 MHz, Doppler stops being polite.<br><br>The downlink will slide ten kilohertz high to ten kilohertz low across the pass, and the channel is only fifteen wide. Nobody is going to chase it for you: Riley has taped over the AFC checkbox. Track the bird with the rotator, ride the VFO with the tune buttons, and hold the lock from horizon to horizon.<br><br>Every operator does this by hand once. Tonight is your once.`,
  equipment: [
    'DIY 70cm Crossed Yagi on TV Rotator',
    'RTL-SDR Receiver (Direct Sampling)',
    'SkyWatcher SDR Console',
  ],
  settings: {
    isSync: true,
    groundStations: [backyardYagiStation],
    satellites: [cubehop1Satellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-19',
    scenarioStartWallTime: '16:14:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-3/scenario-2?content-only=true&dark=true',
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: "Read Riley's Note",
      description: 'The brief covers the pass, the rotator, and which way the frequency is going to run. Read it before AOS - the bird will not wait.',
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
          description: 'Doppler Direction Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'CUBEHOP-1 rises in a few minutes. Which way does its downlink frequency move over the pass?',
            options: [
              'Starts ~10 kHz HIGH while the bird approaches, slides through nominal at closest approach, ends ~10 kHz LOW as it recedes.',
              'Starts low and climbs as the satellite gains elevation.',
              'It oscillates randomly around 435.25 MHz.',
            ],
            correctIndex: 0,
            explanation: 'The ambulance siren, in radio: pitch is high approaching, drops as it passes. So start your VFO high and be ready to walk it down all pass.',
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
      title: 'Put the Yagi on the Bird',
      description: 'In the SDR Console rotator panel, select CUBEHOP-1 and engage TRACK so the yagi follows the pass. The beam is 40 degrees wide - the rotator does not have to be perfect, it has to be pointing the right general way.',
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
      id: 'chase-by-hand',
      nice: ['S0421', 'K0740', 'T0153'],
      title: 'Ride the VFO',
      description: 'Lock the FM downlink and HOLD it for two minutes of the drift - by hand. Watch the carrier walk across the waterfall and keep the VFO on it with the +/-1 kHz and +/-10 kHz tune buttons. The AFC checkbox stays OFF; if it goes on, the objective resets.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['track-cubehop'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Lock Held Through the Drift (2 min)',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: true,
          maintainDuration: 120,
        },
        {
          type: 'receiver-afc-enabled',
          description: 'AFC Off - This One Is By Hand',
          params: { modemNumber: 1, afcEnabled: false },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'slippery-log',
      nice: ['K1032', 'K0740'],
      title: 'Log the Chase',
      description: 'You held a moving frequency with your fingers for a whole pass segment. Before your hands stop shaking, log what you noticed about the middle of the pass.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['chase-by-hand'],
      conditions: [
        {
          type: 'status-check',
          description: 'Closest-Approach Insight Recorded',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'Near the top of the pass the drift briefly slowed to almost nothing, then sped up again. Why?',
            options: [
              'At closest approach the range rate passes through zero - no motion along the line of sight, no Doppler shift.',
              'The satellite throttles its transmitter at high elevation.',
              'The rotator caught up with the bird and cancelled the drift.',
            ],
            correctIndex: 0,
            explanation: 'Doppler comes from motion TOWARD or AWAY from you. Overhead, all the motion is sideways for a moment - the frequency stands still, then the slide resumes. That pause is closest approach, every pass.',
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
      text: `<p>The rotator works! Mostly. It groans on the way past north, ignore that.</p><p>Tonight you meet the slippery bird. CUBEHOP-1 does everything WXSAT-19 did, except at four-thirty-five megahertz, where Doppler is three times bigger and our channel is three times smaller. The signal will NOT stay put. And no, you can't use the AFC - I taped over the checkbox. By hand, once. Everyone. House rule.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: '',
    },
    objectives: {
      'review-mission-brief': {
        text: `<p>High to low, every pass, forever. Once you've internalized that, you're ahead of half the people who buy an SDR and give up.</p><p>Now get the yagi moving: pick CUBEHOP-1 in the rotator panel and hit TRACK. The rotator's slow, so give it a head start.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'track-cubehop': {
        text: `<p>Yagi's on it - see the signal come up as the boom swings around? Twelve dB of gain means the yagi actually has to point, unlike your fence post. Forty degrees of beam means "point" is a generous word. It's a very forgiving instrument. The frequency is not.</p><p>Here it comes. VFO high. Fingers on the tune buttons.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'chase-by-hand': {
        text: `<p>YES! Two whole minutes on a runaway frequency! Feel how it accelerated through the middle and eased off at the ends? You just FELT orbital mechanics. In your fingertips. That's the thing the checkbox would have stolen from you.</p><p>Okay, log it. There's one detail from mid-pass I want to make sure you caught.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'slippery-log': {
        text: `<p>The standing-still moment. Closest approach. Some operators time it with a stopwatch and work out the orbit from when it happens - that's a whole hobby in itself.</p><p>You've earned the checkbox, by the way. Not tonight, though. Tomorrow the yagi gets... a small surprise. Nothing you can't diagnose.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
    },
  },
};
