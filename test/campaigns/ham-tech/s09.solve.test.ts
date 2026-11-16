import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS09Data } from '../../../src/campaigns/ham-sdr/tech/s09-send-the-message';
import { S09_MESSAGE } from '../../../src/campaigns/ham-sdr/tech/s09-station';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { harness } from '../../ham/manager/harness';
import { allTrue, anyTrue, objective, quizLocalIds } from './scn-c-util';

afterEach(() => HamStationManager.destroy());

const cfg = () => hamTechS09Data.settings.hamStation!;
const o = (id: string) => objective(hamTechS09Data, id);

describe('S9 Send the Message solve path', () => {
  it('uses its ten quiz items exactly once', () => {
    const ids = quizLocalIds(hamTechS09Data).sort();
    expect(ids).toEqual(['S09-A1', 'S09-A2', 'S09-Q1', 'S09-Q2', 'S09-Q3', 'S09-Q4', 'S09-Q5', 'S09-Q6', 'S09-Q7', 'S09-Q8']);
  });

  it('solves every objective in order, with negative checks along the way', () => {
    const h = harness(cfg());

    // 1 trace
    expect(anyTrue(o('trace-connections'), h.m)).toBe(false);
    h.actOk({ type: 'inspect', targetId: 'iface-radio' });
    h.actOk({ type: 'worksheet.answer', id: 's09-trace', values: { paths: {} } });
    expect(allTrue(o('trace-connections'), h.m)).toBe(false); // wrong match is not credit
    const sheet = cfg().worksheets.find((w) => w.id === 's09-trace')!;
    h.actOk({ type: 'worksheet.answer', id: 's09-trace', values: { paths: sheet.fields[0].answer as Record<string, string> } });
    expect(allTrue(o('trace-connections'), h.m)).toBe(true);

    // 2 decode: wrong input device logs failed decodes only
    h.advance(65, 5);
    expect(allTrue(o('fix-receive-input'), h.m)).toBe(false);
    h.actOk({ type: 'packet.config', patch: { audio: { inputDevice: 'interface' } } });
    h.advance(65, 5);
    expect(allTrue(o('fix-receive-input'), h.m)).toBe(true);

    // 3 transmit audio: baseline (level 9, speakers, chimes) is not a clean frame; a fixed level with chimes still on is not either
    expect(allTrue(o('set-transmit-audio'), h.m)).toBe(false);
    h.actOk({ type: 'packet.config', patch: { audio: { outputDevice: 'interface', txLevel: 5 } } });
    h.actOk({ type: 'packet.send', text: 'test', ui: true });
    h.advance(5);
    expect(h.m.events('packet:chime').length).toBeGreaterThan(0);
    expect(allTrue(o('set-transmit-audio'), h.m)).toBe(false);
    h.actOk({ type: 'packet.config', patch: { audio: { systemSoundsToInterface: false } } });
    expect(allTrue(o('set-transmit-audio'), h.m)).toBe(false); // the earlier frame was before the fix: needs a new clean one
    h.actOk({ type: 'packet.send', text: 'test', ui: true });
    h.advance(5);
    expect(allTrue(o('set-transmit-audio'), h.m)).toBe(true);

    // 4 identity: default identity is refused by the node
    expect(allTrue(o('enter-identity'), h.m)).toBe(false);
    h.actOk({ type: 'packet.config', patch: { station: { mycall: 'KF0SRT', destination: 'KD0RLY', path: ['WIDE1-1'] } } });
    expect(allTrue(o('enter-identity'), h.m)).toBe(true);

    // 5 connect and send; "sent" without an ack is not enough
    h.actOk({ type: 'packet.connect' });
    h.advance(6);
    expect(h.m.packetState()?.link).toBe('connected');
    h.actOk({ type: 'packet.send', text: S09_MESSAGE });
    expect(allTrue(o('connect-and-send'), h.m)).toBe(false);
    h.advance(8);
    expect(allTrue(o('connect-and-send'), h.m)).toBe(true);

    // 6 retry
    expect(allTrue(o('recover-lost-frame'), h.m)).toBe(false);
    h.actOk({ type: 'packet.injectCorruption' });
    h.actOk({ type: 'packet.send', text: S09_MESSAGE });
    h.advance(40);
    expect(allTrue(o('recover-lost-frame'), h.m)).toBe(true);

    // 7 networks
    expect(allTrue(o('compare-networks'), h.m)).toBe(false);
    const nets = cfg().worksheets.find((w) => w.id === 's09-networks')!;
    h.actOk({ type: 'worksheet.answer', id: 's09-networks', values: Object.fromEntries(nets.fields.map((f) => [f.id, f.answer])) });
    expect(allTrue(o('compare-networks'), h.m)).toBe(true);
  });

  it('a node that is not addressed does not acknowledge', () => {
    const h = harness(cfg());
    h.actOk({ type: 'packet.config', patch: { audio: { inputDevice: 'interface', outputDevice: 'interface', txLevel: 5, systemSoundsToInterface: false } } });
    h.actOk({ type: 'packet.connect' });
    h.advance(30);
    expect(h.m.packetState()?.link).not.toBe('connected');
  });
});
