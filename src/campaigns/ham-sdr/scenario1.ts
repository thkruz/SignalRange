import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { backyardQfhStation } from './ground-stations';
import { cubehop1Satellite, wxsat19Satellite } from './satellites';

/**
 * ham-sdr Scenario 1 - "First Light" / QFH + APT first contact
 *
 * The campaign opener: one antenna (the fence-post QFH), one bird (WXSAT-19),
 * one job - catch the pass and decode the picture. Teaches the SDR Console's
 * three core interactions in sequence: click-to-tune (the rig boots with the
 * VFO parked 70 kHz high), channel bandwidth (it boots on a 15 kHz voice
 * channel that clips the 34 kHz APT signal), and leaving a working lock
 * alone (a 45 s hands-off hold). Plants the Doppler contrast that Scenario 2
 * cashes in: at 137 MHz the drift fits inside the channel, so once locked,
 * this one needs no chasing.
 *
 * Pass timeline (scenario clock starts 2027-06-19 16:00:00 UTC, same evening
 * as the sandbox - the RF envelope phase 1 verified live):
 * - WXSAT-19: AOS T+3.0 min, max el 55.1 deg at T+10.6, LOS T+18.3 min
 * - CUBEHOP-1 rises at T+18.0 (foreshadowed; the yagi arrives in Scenario 2)
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - S0421: Skill in operating communications equipment
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures
 *   - T0153: Monitor system performance
 */

/**
 * S1 boots the rig exactly as Riley left it after last night's FM session:
 * VFO parked at 137.170 MHz (70 kHz above the APT downlink, still inside the
 * 200 kHz waterfall view so the parked VFO box is visibly sitting beside the
 * stripe) on a 15 kHz voice channel. The 34 kHz APT signal cannot fit a
 * 15 kHz channel (the receiver drops signals wider than the modem bandwidth),
 * so the player must click-to-tune AND open the channel to 50 kHz - the two
 * SDR Console interactions this scenario exists to teach.
 */
const firstLightQfhStation = {
  ...backyardQfhStation,
  receivers: [{
    activeModem: 1,
    modems: [{
      modemNumber: 1,
      isPowered: true,
      frequency: 137.17 as MHz, // parked 70 kHz above the APT downlink
      bandwidth: 0.015 as MHz,  // last night's FM voice channel: clips 34 kHz APT
      modulation: 'BPSK',
      fec: '1/2',
      antenna_id: 1,
    }],
  }],
} as GroundStationConfig;

export const hamSdrScenario1Data: ScenarioData = {
  id: 'ham-sdr-scenario1',
  url: 'ham-sdr/scenarios/ham-sdr-scenario1',
  imageUrl: 'nats/1/card.png',
  number: 1,
  isDisabled: false,
  difficulty: 'beginner',
  title: 'First Light',
  subtitle: 'Catch a Weather Satellite with a Fence Post',
  duration: '20-25 min',
  missionType: 'Backyard Session',
  description: `Riley's rule for new operators: before you get the rotator, you earn the fence post.<br><br>The quadrifilar helix zip-tied to the back fence stares straight up and hears most of the sky at once. WXSAT-19 - a polar weather bird - rises in three minutes and will spend a quarter of an hour drawing a picture of the weather, one scan line at a time, on 137.100 MHz.<br><br>The rig is exactly as Riley left it last night: VFO parked off-frequency, channel set for FM voice. Your whole job: find the signal, put the radio on it, open the channel wide enough to swallow it - and then keep your hands off.<br><br>No mission control. No checklist. An SDR dongle, a waterfall, and physics.`,
  equipment: [
    'DIY 137 MHz Quadrifilar Helix (fixed skyward)',
    'RTL-SDR Receiver (Direct Sampling)',
    'SkyWatcher SDR Console',
  ],
  settings: {
    isSync: true,
    groundStations: [firstLightQfhStation],
    satellites: [wxsat19Satellite, cubehop1Satellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-19',
    scenarioStartWallTime: '16:00:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-3/scenario-1?content-only=true&dark=true',
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: "Read Riley's Note",
      description: 'Open the brief taped to the laptop lid. It has the pass time, the frequency, and exactly one rule about the channel bandwidth.',
      groundStation: 'BKYD-QFH',
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
          description: 'Antenna Concept Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'The QFH has no rotator and never moves. Why does that work for a satellite screaming by at 7.5 km/s?',
            options: [
              'Its beam is enormous - about 140 degrees wide - so the whole pass happens inside the beam.',
              'The satellite steers its own signal toward the antenna.',
              'It does not work; that is why the picture is always noisy.',
            ],
            correctIndex: 0,
            explanation: 'Right. Gain and beamwidth trade off: 3 dBi of gain buys a beam so fat the bird never leaves it. Big dishes point; little antennas wait.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'check-observations',
      nice: ['K1032', 'T0153'],
      title: 'Check the Observations List',
      description: 'Open the Observations tab and find WXSAT-19. Note the AOS time and the maximum elevation - a 55 degree pass is a good one for the fence post.',
      groundStation: 'BKYD-QFH',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Observations Tab Open',
          params: { tab: 'pass-schedule' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'detect-apt',
      nice: ['S0421', 'T0153'],
      title: 'See First Light',
      description: 'Watch the SDR Console waterfall. When WXSAT-19 clears the horizon its APT downlink appears as a steady stripe at 137.100 MHz. That stripe is your first satellite - and notice it is NOT where the VFO is parked.',
      groundStation: 'BKYD-QFH',
      prerequisiteObjectiveIds: ['check-observations'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'WXSAT-19 APT Detected at 137.1 MHz',
          params: {
            signalId: 'WXSAT-19-APT',
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
      id: 'tune-apt',
      nice: ['S0421'],
      title: 'Put the VFO on the Bird',
      description: 'The VFO is still parked where Riley left it last night, 70 kHz above the bird. Click the stripe on the waterfall to tune to it (the bookmark and the tune buttons work too). Get the VFO within 5 kHz of 137.100 MHz.',
      groundStation: 'BKYD-QFH',
      prerequisiteObjectiveIds: ['detect-apt'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'VFO on 137.100 MHz (+/-5 kHz)',
          params: {
            modemNumber: 1,
            frequency: 137.1e6,
            frequencyTolerance: 5e3,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'lock-apt',
      nice: ['S0421', 'K1032'],
      title: 'Open the Channel and Lock',
      description: 'On frequency and still no decode? Look at the channel: 15 kHz of FM voice channel cannot swallow 34 kHz of APT - the demodulator never even sees it. Set the channel bandwidth to 50 kHz to bracket the signal, and the lock will follow. Too narrow clips the signal; too wide drowns it in noise.',
      groundStation: 'BKYD-QFH',
      prerequisiteObjectiveIds: ['tune-apt'],
      conditions: [
        {
          type: 'rx-modem-bandwidth-set',
          description: 'Channel Opened to ~50 kHz',
          params: {
            modemNumber: 1,
            bandwidth: 50e3,
            bandwidthTolerance: 25e3,
          },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'APT Downlink Locked, Picture Decoding',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'hold-the-picture',
      nice: ['K1032', 'T0153'],
      title: "Don't Touch What's Working",
      description: 'The picture is coming down one scan line at a time. Rule three of the backyard: when it works, hands off. Hold the lock for 45 seconds without losing it - no retuning, no fiddling.',
      groundStation: 'BKYD-QFH',
      prerequisiteObjectiveIds: ['lock-apt'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Lock Held Hands-Off (45 s)',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: true,
          maintainDuration: 45,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'first-light-log',
      nice: ['K1032'],
      title: 'Log the Observation',
      description: 'Forty-five seconds of lock and you never touched the tuning. Record why in the log.',
      groundStation: 'BKYD-QFH',
      prerequisiteObjectiveIds: ['hold-the-picture'],
      conditions: [
        {
          type: 'status-check',
          description: 'Doppler Contrast Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'The bird is moving at 7.5 km/s, which shifts its frequency (Doppler). Why has the lock held without you retuning?',
            options: [
              'At 137 MHz the whole Doppler swing is about +/-3 kHz - the 50 kHz channel swallows it.',
              'The satellite compensates its transmitter for Doppler.',
              'The SDR hardware automatically removes Doppler from everything.',
            ],
            correctIndex: 0,
            explanation: 'Exactly. Doppler scales with frequency. At 137 MHz it hides inside the channel. Remember that phrasing - tomorrow we work a bird at 435 MHz, and it will NOT hide.',
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
      text: `<p>Okay! First real session. Forget everything Uncle Charlie told you about procedures - out here the procedure is: know when the bird rises, be on frequency, don't touch what's working.</p><p>WXSAT-19 is up in three minutes. It draws weather maps with radio, live, for anyone with an antenna. Tonight that's you. Fair warning: the radio is still set up from my FM session last night, so it's YOUR job to put it on the bird. Read my note first.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.EXCITED,
      audioUrl: '',
    },
    objectives: {
      'review-mission-brief': {
        text: `<p>See? One page. Uncle Charlie's briefs have annexes. Mine has a frequency, a channel rule, and a snack recommendation.</p><p>Now pull up Observations and find our bird - the list is just orbital math, the same math the big stations use, running on my laptop.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'check-observations': {
        text: `<p>There it is. AOS in a couple minutes, fifty-five degrees at the top - that's a good pass. Above about twenty-five degrees the QFH hears everything; below that the trees eat it.</p><p>Eyes on the waterfall now. You're waiting for a stripe to fade in at 137.1. It won't knock. It'll just appear - and no, it won't be where the VFO is parked. That's tomorrow-you's first lesson, happening today.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'detect-apt': {
        text: `<p>THERE! That stripe is a satellite. Your fence post is hearing a spacecraft. I never get tired of this part.</p><p>Now look at the VFO box - it's sitting in empty spectrum 70 kHz up, right where I left it last night. Click the stripe. The whole point of a waterfall radio: see the signal, touch the signal.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'tune-apt': {
        text: `<p>On frequency! And... nothing decoding. Welcome to the second-most-common mistake in satellite radio.</p><p>Check the channel width: 15 kilohertz, set for FM voice. The APT signal is 34 kilohertz wide - the demodulator literally can't see a signal that doesn't fit its channel. Open it up to 50 and bracket the bird.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'lock-apt': {
        text: `<p>Locked! And look - the picture. That's the Atlantic seaboard, scan line by scan line, straight off the bird. No internet involved. People two hundred years ago would have called this witchcraft. People today mostly don't know it's possible.</p><p>Now the hard part for every new operator: do nothing. Forty-five seconds, hands in your pockets. Watch what the lock does. Or rather, doesn't.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'hold-the-picture': {
        text: `<p>Forty-five seconds, zero retunes, picture still rolling in. See? The bird is doing 7.5 kilometers a second and the lock never blinked.</p><p>Notice what you're NOT doing: chasing it. Log the observation and tell me why.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'first-light-log': {
        text: `<p>First light, logged. That's a real term, by the way - astronomers use it for a telescope's first image. Radio counts.</p><p>Enjoy how easy the VHF bird was. Tomorrow the yagi goes up, we work a cubesat at 435 megahertz, and you find out what Doppler does when it doesn't fit in the channel. Bring the snack.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
