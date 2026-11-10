import { desenseFree, eventHappened, radioSetting, satBeaconHeard, satContact, satDownlinkHeard, satRelayedCorrected, worksheetCorrect } from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { makeCubehopUvSatellite } from './cubehop-uv';
import { briefObjective, chain, quiz, riley, techSettings } from './s09-12-helpers';
import { S11_DOWNLINK_MHZ, S11_TONE_HZ, S11_UPLINK_MHZ, s11Station } from './s11-station';

/**
 * C3 Technician Scenario 11 - "A Contact Through Space" (satellite pass: receive first, then a modest uplink)
 *
 * Fixtures (see s11-station.ts, cubehop-uv.ts and the S11 mission brief):
 * - CUBEHOP-UV: uplink 435.900 MHz FM with a 67.0 Hz access tone, downlink 145.900 MHz FM, beacon on the downlink.
 * - Start 2027-06-19 16:13 local sim time; the pass rises about 5 minutes later and peaks near 48 degrees.
 * - If the pass is missed the next one rises about 100 minutes later (16 degrees); settings.timeSkip offers a skip to it.
 * - Doppler about +/- 3.4 kHz on the downlink and +/- 10 kHz on the uplink; the satellite receiver accepts 7 kHz.
 * - The duplexer gives 60 dB between the handheld and the SDR; a splitter (6 dB) blocks keying.
 * - W0GRD (Mo, grid EN34) is fictional and answers a CQ with its grid square.
 */
export const hamTechS11Data: ScenarioData = {
  id: 'ham-tech-s11',
  url: 'ham-sdr/scenarios/ham-tech-s11',
  imageUrl: 'home-sdr/8/card.png',
  number: 11,
  title: 'A Contact Through Space',
  subtitle: 'Prepare a duplexed satellite station, acquire the downlink while receiving only, follow the Doppler shift and complete a grid-square exchange',
  duration: '35-40 min',
  difficulty: 'intermediate',
  missionType: 'Station Session',
  description:
    "<p>A small amateur satellite is about to rise over Riley's backyard. Connect the uplink and downlink radios to one Yagi through a duplexer, find the satellite's beacon without transmitting, then use a low-power uplink to reach another operator.</p><p>The satellite, the pass and the other station are simulation fixtures.</p>",
  equipment: ['Dual-band handheld (uplink)', 'USB SDR (downlink)', 'Duplexer', 'Dual-band satellite Yagi', 'Pass card'],
  // A missed first pass leaves the next one 100 minutes away (real orbit); the skip control fast-forwards to it
  settings: {
    ...techSettings(11, s11Station, { date: '2027-06-19', wallTime: '16:13:00' }, [makeCubehopUvSatellite()]),
    timeSkip: { leadTimeS: 180, minSkipS: 300, horizonHours: 6 },
  },
  objectives: [
    briefObjective('Open the mission brief. It lists the pass card, the frequencies and the order of work for the pass.'),
    ...chain('review-mission-brief', [
      {
        id: 'read-pass-card',
        nice: ['K0645'],
        title: 'Read the Pass Card',
        description:
          'Fill in the pass worksheet: the uplink frequency, the access tone, the Doppler shift on the 145.900 MHz downlink and which way it moves as the satellite rises.',
        points: 10,
        conditions: [worksheetCorrect('s11-pass', 'Pass card worked out'), quiz('S11-Q1'), quiz('S11-Q2'), quiz('S11-A1')],
      },
      {
        id: 'prepare-paths',
        nice: ['K0645'],
        title: 'Prepare Both Paths',
        description: `Inspect the duplexer. Set the handheld to ${S11_UPLINK_MHZ.toFixed(3)} MHz with the ${S11_TONE_HZ.toFixed(1)} Hz access tone and no more than 2.5 W, and set the SDR to the ${S11_DOWNLINK_MHZ.toFixed(3)} MHz downlink in FM.`,
        points: 15,
        conditions: [
          eventHappened('inspect:duplexer', {}, 'Duplexer inspected'),
          radioSetting(
            'ht',
            (s) => Math.abs(s.vfoMHz - S11_UPLINK_MHZ) < 0.0005 && s.txToneHz === S11_TONE_HZ && s.txPowerW <= 2.5,
            'uplink-set',
            'Handheld on the uplink with the tone at low power'
          ),
          radioSetting('sdr', (s) => s.mode === 'FM' && Math.abs(s.vfoMHz - S11_DOWNLINK_MHZ) < 0.02, 'downlink-set', 'SDR on the downlink in FM'),
        ],
      },
      {
        id: 'acquire-downlink',
        nice: ['K0645'],
        title: 'Acquire the Downlink',
        description: 'Without transmitting, point the Yagi toward the rising satellite, tune the SDR to follow the Doppler shift and copy the satellite beacon.',
        points: 20,
        conditions: [satBeaconHeard('Satellite beacon copied'), quiz('S11-Q3'), quiz('S11-Q4'), quiz('S11-A2')],
      },
      {
        id: 'first-uplink',
        nice: ['K0645'],
        title: 'Send a Modest Uplink',
        description:
          'Correct the uplink for Doppler, key a short CQ with your call sign, and keep the SDR on the downlink while you transmit, and hear your own signal come back. The satellite must accept it and the SDR must not be overloaded.',
        points: 20,
        conditions: [
          eventHappened('sat:relayed', {}, 'The satellite relayed your uplink'),
          desenseFree({}, 'The uplink did not overload the receiver'),
          satDownlinkHeard('Your own signal heard on the downlink while you transmit'),
        ],
      },
      {
        id: 'follow-doppler',
        nice: ['K0645'],
        title: 'Follow the Doppler Shift',
        description: 'Key up again at least 90 seconds later with the uplink retuned so that the satellite receiver sees it within 1.5 kHz of 435.900 MHz.',
        points: 10,
        conditions: [satRelayedCorrected({ maxOffsetHz: 1500, count: 2, minGapS: 90 }, 'Two corrected uplinks, 90 seconds apart')],
      },
      {
        id: 'grid-exchange',
        nice: ['K0645'],
        title: 'Exchange Grid Squares',
        description:
          'Call CQ through the satellite. When W0GRD answers with a grid square, reply with your grid and identify with KF0SRT. Your own signal coming back is not the contact.',
        points: 15,
        conditions: [satContact({ items: ['grid'], identified: true }, 'Grid exchange with W0GRD completed')],
      },
      {
        id: 'explain-fading',
        nice: ['K0645'],
        title: 'Explain the Fading',
        description: 'Operators often report a satellite signal that rises and falls at a steady rhythm. Pick the cause and the fix on the worksheet.',
        points: 5,
        conditions: [worksheetCorrect('s11-fading', 'Fading explained'), quiz('S11-Q5'), quiz('S11-Q6'), quiz('S11-Q7')],
      },
      {
        id: 'log-the-pass',
        nice: ['K0645'],
        title: 'Log the Pass',
        description: 'Choose the log entry that records the date, the satellite, the other station, the grid square and the frequencies.',
        points: 5,
        conditions: [worksheetCorrect('s11-log', 'Log entry chosen'), quiz('S11-Q8')],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("The satellite's only above us for a few minutes. We'll connect both paths and find its downlink before we transmit anything.", Emotion.NEUTRAL),
    objectives: {
      'review-mission-brief': riley("Good, you've got the pass card. The satellite rises soon, so know your numbers before it does."),
      'read-pass-card': riley("That shift is why you'll keep tuning during the pass. It's about three point four kilohertz on the downlink and ten on the uplink."),
      'prepare-paths': riley("Both radios share one antenna through the duplexer, so your transmitter can't overload the receiver. Now point the Yagi and listen."),
      'acquire-downlink': riley("There's the beacon. You listened first, so you know exactly where the satellite sits before you transmit.", Emotion.HAPPY),
      'first-uplink': riley("That's your own signal coming back through the satellite. It's a quick check, but it isn't a contact yet."),
      'follow-doppler': riley('The satellite still hears you on the right frequency because you moved your transmit frequency as the shift changed.'),
      'grid-exchange': riley('Another station answered you through the satellite, and you swapped grid squares. That was a real exchange.', Emotion.HAPPY),
      'explain-fading': riley('A spinning satellite turns its antenna against yours, so the signal rises and falls. Tilting your antenna can follow it.'),
      'log-the-pass': riley(
        'Your signal came back through the satellite, and another operator answered. You did it with the station you learned to test and repair.',
        Emotion.HAPPY
      ),
    },
  },
};
