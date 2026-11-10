import { eventHappened, keyReleased, packetAcked, packetDecoded, packetStationIs, packetTxClean, worksheetCorrect } from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s09-12-helpers';
import { s09Station } from './s09-station';

/**
 * C3 Technician Scenario 9 - "Send the Message" (packet through an audio and PTT interface)
 *
 * Fixtures (see s09-station.ts and the S9 mission brief):
 * - Dual-band FM mobile on 145.570 MHz, laptop, USB audio and PTT interface, KD0RLY training node.
 * - Baseline: the packet software listens to the laptop microphone, transmit level 9, output on the
 *   laptop speakers, notification sounds routed to the interface, identity N0CALL to APRS.
 * - Targets: input = interface; output = interface; transmit level 4 to 6 (3 to 7 decodes);
 *   notifications silenced; KF0SRT to KD0RLY via WIDE1-1.
 * - KD0RLY's node beacons a reference packet every 30 s so a decode can be checked first.
 * - The node acknowledges only frames addressed to it from a real call sign.
 */
export const hamTechS09Data: ScenarioData = {
  id: 'ham-tech-s09',
  url: 'ham-sdr/scenarios/ham-tech-s09',
  imageUrl: 'home-sdr/8/card.png',
  number: 9,
  title: 'Send the Message',
  subtitle: 'Connect a laptop to a radio through an audio and PTT interface, decode a packet, and send a message that the far station acknowledges',
  duration: '30-40 min',
  difficulty: 'intermediate',
  missionType: 'Station Session',
  description:
    "<p>Riley's radio can hear the packet channel, but the laptop is not decoding anything. Trace the audio and keying connections, fix the settings, then send a short message to the training node and wait for its acknowledgment.</p><p>The call signs here are fictional and the channel is a simulation fixture.</p>",
  equipment: ['Dual-band FM mobile radio', 'USB audio and PTT interface', 'Laptop with packet software', 'Roof vertical antenna'],
  settings: techSettings(9, s09Station, { date: '2027-03-13', wallTime: '14:00:00' }),
  objectives: [
    briefObjective('Open the mission brief. It lists the kit, the packet fixtures and the setup checklist.'),
    ...chain('review-mission-brief', [
      {
        id: 'trace-connections',
        nice: ['K0645'],
        title: 'Trace the Connections',
        description: 'Inspect the radio lead to the interface, then match receive audio, transmit audio, push-to-talk and the radio lead to the connections that carry them.',
        points: 10,
        conditions: [
          eventHappened('inspect:iface-radio', {}, 'Radio lead inspected'),
          worksheetCorrect('s09-trace', 'Audio and PTT paths matched'),
          quiz('S09-Q1'),
          quiz('S09-Q2'),
        ],
      },
      {
        id: 'fix-receive-input',
        nice: ['K0645'],
        title: 'Fix the Receive Input',
        description: "The radio hears the training node but the software does not decode it. Select the interface as the sound input and decode the node's reference packet.",
        points: 15,
        conditions: [packetDecoded('Reference packet decoded'), quiz('S09-Q3'), quiz('S09-Q4'), quiz('S09-A1')],
      },
      {
        id: 'set-transmit-audio',
        nice: ['K0645'],
        title: 'Set the Transmit Audio',
        description:
          'Set the output device to the interface, set the transmit level between 4 and 6, and keep notification sounds on the laptop speakers. Then send a short unconnected test frame to confirm a clean transmission.',
        points: 15,
        conditions: [packetTxClean([4, 6], 'Clean test frame sent')],
      },
      {
        id: 'enter-identity',
        nice: ['K0645'],
        title: 'Enter Your Station Identity',
        description: 'Enter your call sign KF0SRT, the destination KD0RLY and the path WIDE1-1 in the packet software.',
        points: 10,
        conditions: [packetStationIs({ mycall: 'KF0SRT', destination: 'KD0RLY', path: ['WIDE1-1'] }, 'KF0SRT to KD0RLY via WIDE1-1')],
      },
      {
        id: 'connect-and-send',
        nice: ['K0645'],
        title: 'Connect and Send',
        description: 'Connect to KD0RLY and send the message from the exercise card. The window saying "sent" is not enough. Wait for the far station\'s acknowledgment.',
        points: 20,
        conditions: [packetAcked({}, 'Message acknowledged by KD0RLY'), keyReleased('Key released'), quiz('S09-Q5'), quiz('S09-Q6'), quiz('S09-A2')],
      },
      {
        id: 'recover-lost-frame',
        nice: ['K0645'],
        title: 'Recover a Lost Frame',
        description: 'Use the test control to corrupt the next frame, send the message again, and let the software retry until the far station acknowledges it.',
        points: 15,
        conditions: [eventHappened('packet:injectCorruption', {}, 'A frame was corrupted on the air'), packetAcked({ retried: true }, 'Delivered after a retry')],
      },
      {
        id: 'compare-networks',
        nice: ['K0645'],
        title: 'Compare the Digital Networks',
        description:
          'Use the reference page to tell position reports, linked voice, Winlink email and mesh networks apart, and answer the two questions about acknowledgments and privileges.',
        points: 15,
        conditions: [worksheetCorrect('s09-networks', 'Networks compared'), quiz('S09-Q7'), quiz('S09-Q8')],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("The radio can hear the packets, but the computer isn't decoding them. Follow the audio connection before changing anything at the antenna.", Emotion.NEUTRAL),
    objectives: {
      'review-mission-brief': riley('Good, you have the kit list. Start with the connections, because three separate paths run through that interface.'),
      'trace-connections': riley("Receive audio, transmit audio and the keying line are separate paths. Now find out why the computer isn't listening to the radio."),
      'fix-receive-input': riley("There it is, the node's reference packet. The laptop was listening to its own microphone, not the radio.", Emotion.HAPPY),
      'set-transmit-audio': riley("Clean frame, no chime. Audio that's too loud distorts the packet, and a notification sound would have gone out over the air."),
      'enter-identity': riley('The node only answers packets addressed to it, so the destination matters as much as your call sign.'),
      'connect-and-send': riley("Acknowledged, so the message got through. Now let's see what happens when a frame doesn't.", Emotion.HAPPY),
      'recover-lost-frame': riley('The frame got lost and the software sent it again until the node acknowledged it. That wait is how the protocol protects the message.'),
      'compare-networks': riley("The other station acknowledged the message, so we know it arrived. Seeing it in our own transmit window wouldn't prove that.", Emotion.HAPPY),
    },
  },
};
