import { test } from '../fixtures/test-fixtures';
import {
  answerTechQuizzes,
  debugObjective,
  expectMissionComplete,
  inspectItem,
  openStationTab,
  openTechScenario,
  packetConnect,
  packetCorruptNext,
  packetSend,
  packetSendTestFrame,
  reviewMissionBrief,
  savePacketStation,
  setPacketAudio,
  submitWorksheet,
  waitForObjectiveComplete,
} from '../utils/ham-tech-helpers';
import { dismissDialogIfPresent } from '../utils/simulation-helpers';
import { simAdvance } from '../utils/test-clock';

test.use({ testClock: true });

const MESSAGE = 'Swap meet at the club on Saturday, tables open at nine';

/**
 * Campaign 3 Technician S9 "Send the Message" - full completion through the Station tab.
 * Mirrors test/campaigns/ham-tech/s09.solve.test.ts. The packet radio is the "mobile" device;
 * the unconnected test frame and the corrupt-next-frame test control are packet panel buttons.
 */
test('ham-tech-s09 completes all objectives', async ({ page, missionControlPage: mc }) => {
  test.setTimeout(360000);
  page.setDefaultTimeout(30000);
  await openTechScenario(page, mc, 'ham-tech-s09');
  const step = async (title: string, id: string, quizzes = 0): Promise<void> => {
    if (quizzes > 0) await answerTechQuizzes(page, quizzes);
    await dismissDialogIfPresent(page);
    try {
      await waitForObjectiveComplete(mc, title, 60000);
    } catch (error) {
      console.log(`${id}: ${JSON.stringify(await debugObjective(page, id))}`);
      throw error;
    }
  };
  const P = 'mobile';

  await reviewMissionBrief(page, mc);
  await openStationTab(page, mc);
  await simAdvance(page, 3000);

  // trace-connections
  await inspectItem(page, 'iface-radio');
  await submitWorksheet(page, 's09-trace', {
    paths: {
      'Receive audio': 'Radio to the interface, then the computer input',
      'Transmit audio': 'Computer output, then the interface, then the radio',
      'Push-to-talk': 'A keying line from the interface to the radio',
      'Radio lead': 'Mini-DIN cable between the radio data port and the interface',
    },
  });
  await step('Trace the Connections', 'trace-connections', 2);

  // fix-receive-input: the node beacon (every 30 s) must then be decoded
  await setPacketAudio(page, P, { input: 'interface' });
  await step('Fix the Receive Input', 'fix-receive-input', 3);

  // set-transmit-audio: first a level-5 frame with the chimes still on (not clean), then a clean one
  await setPacketAudio(page, P, { output: 'interface', txLevel: 5 });
  await packetSendTestFrame(page, P);
  await simAdvance(page, 2000);
  await setPacketAudio(page, P, { systemSounds: false });
  await packetSendTestFrame(page, P);
  await step('Set the Transmit Audio', 'set-transmit-audio');

  // enter-identity
  await savePacketStation(page, P, 'KF0SRT', 'KD0RLY', 'WIDE1-1');
  await step('Enter Your Station Identity', 'enter-identity');

  // connect-and-send: wait for the link, send, wait for the ack
  await packetConnect(page, P);
  await simAdvance(page, 6000);
  await packetSend(page, P, MESSAGE);
  await simAdvance(page, 8000);
  await step('Connect and Send', 'connect-and-send', 3);

  // recover-lost-frame: corrupt the next frame, resend, let the retry get acked
  await packetCorruptNext(page, P);
  await packetSend(page, P, MESSAGE);
  await step('Recover a Lost Frame', 'recover-lost-frame');

  // compare-networks (last objective)
  await submitWorksheet(page, 's09-networks', {
    ui: 'An unconnected UI frame, such as a position report',
    internet: 'Nothing, because Internet access grants no transmit privileges',
    kinds: {
      APRS: 'Position reports and short messages',
      'Linked voice repeater': 'Voice contacts over a wide area',
      Winlink: 'Email carried through radio gateways',
      'Mesh network': 'Many nodes relaying data for each other',
    },
  });
  await answerTechQuizzes(page, 2);
  await expectMissionComplete(page);
});
