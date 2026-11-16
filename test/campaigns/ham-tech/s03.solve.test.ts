import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS03Data } from '../../../src/campaigns/ham-sdr/tech/s03-your-first-contact';
import { evaluateWith } from '../../../src/ham/ham-conditions';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { harness } from '../../ham/manager/harness';
import { practical, quizIds } from './solve-utils-a';

afterEach(() => HamStationManager.destroy());

const config = () => structuredClone(hamTechS03Data.settings.hamStation) as NonNullable<typeof hamTechS03Data.settings.hamStation>;
type H = ReturnType<typeof harness>;
const act = (h: H, a: Record<string, unknown>) => h.actOk(a as never);
const tx = (h: H, intent: Record<string, unknown>) => {
  act(h, { type: 'ptt', deviceId: 'ht', intent, holdS: 3 });
  h.advance(10);
};
const READY = { type: 'radio.set', deviceId: 'ht', patch: { vfoMHz: 146.55, txPowerW: 0.5 } };
const BATTERY = [
  { type: 'inspect', targetId: 'ht' },
  { type: 'inspect', targetId: 'ht-ant' },
  { type: 'repair', faultId: 'ht-battery' },
];

describe('S3 Your First Contact solve', () => {
  it('uses exactly its ten quiz items, each once', () => {
    const ids = quizIds(hamTechS03Data);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect([...ids].sort()).toEqual(['S03-A1', 'S03-A2', 'S03-Q1', 'S03-Q2', 'S03-Q3', 'S03-Q4', 'S03-Q5', 'S03-Q6', 'S03-Q7', 'S03-Q8']);
  });

  it('solves every objective in order', () => {
    const h = harness(config());
    const ok = (id: string) => practical(hamTechS03Data, id).every((c) => evaluateWith(c, h.m));
    h.advance(3);

    expect(ok('confirm-station-privileges')).toBe(false);
    act(h, {
      type: 'worksheet.answer',
      id: 's03-privileges',
      values: {
        band: 'Yes, it is inside Technician privileges',
        power: 'The minimum needed to communicate',
        ident: 'At the end of the contact and at least every 10 minutes during it',
      },
    });
    expect(ok('confirm-station-privileges')).toBe(true);

    expect(ok('check-power-connection')).toBe(false);
    act(h, BATTERY[0]);
    act(h, BATTERY[1]);
    expect(ok('check-power-connection')).toBe(false); // battery still unseated
    act(h, BATTERY[2]);
    expect(ok('check-power-connection')).toBe(true);

    expect(ok('review-antenna-clearance')).toBe(false);
    act(h, { type: 'worksheet.answer', id: 's03-exposure', values: { hold: 'Upright, with the antenna kept away from your head and body', power: 'A lower transmit power' } });
    expect(ok('review-antenna-clearance')).toBe(true);

    // listening takes time on the right channel at low power
    expect(ok('listen-before-calling')).toBe(false);
    act(h, READY);
    h.advance(4);
    expect(ok('listen-before-calling')).toBe(false); // not long enough yet
    h.advance(34); // the scripted conversation is still running or only just over
    expect(h.m.clearMonitoredFor(146.55)).toBeLessThan(10);
    expect(ok('listen-before-calling')).toBe(false); // nobody has been quiet for 10 s yet
    h.advance(14);
    expect(ok('listen-before-calling')).toBe(true);
    expect(h.m.transcripts()['s03-chat-a']).toBeTruthy(); // the conversation was audible

    expect(ok('make-first-call')).toBe(false);
    tx(h, { kind: 'call', target: 'W0SRC' });
    expect(ok('make-first-call')).toBe(true);
    expect(h.m.qsoNotes().some((n) => n.code === 'mic-distorted')).toBe(true);

    expect(ok('exchange-signal-report')).toBe(false);
    tx(h, { kind: 'reply', item: 'name' });
    tx(h, { kind: 'reply', item: 'location' });
    tx(h, { kind: 'reply', item: 'report' });
    expect(ok('exchange-signal-report')).toBe(false); // mic still too hot, Sam never confirmed clean audio
    act(h, { type: 'radio.set', deviceId: 'ht', patch: { micGain: 5 } });
    tx(h, { kind: 'reply', item: 'report' });
    expect(ok('exchange-signal-report')).toBe(true);

    expect(ok('close-the-contact')).toBe(false);
    tx(h, { kind: 'identify' });
    expect(ok('close-the-contact')).toBe(true);
  });

  it('negative: a call over the busy channel collides, and more power does not help', () => {
    const h = harness(config());
    for (const a of BATTERY) act(h, a);
    act(h, READY);
    h.advance(8); // conversation in progress
    act(h, { type: 'radio.set', deviceId: 'ht', patch: { txPowerW: 5 } });
    tx(h, { kind: 'call', target: 'W0SRC' });
    expect(h.m.qsoNotes().some((n) => n.code === 'channel-busy')).toBe(true);
    expect(h.m.contacts()).toHaveLength(0);
    h.advance(60); // channel is clear for a long time afterwards
    expect(practical(hamTechS03Data, 'make-first-call').every((c) => evaluateWith(c, h.m))).toBe(false);
    // a fresh call after the channel cleared and 10 s of clear listening works
    tx(h, { kind: 'call', target: 'W0SRC' });
    expect(h.m.contacts()).toHaveLength(1);
    expect(practical(hamTechS03Data, 'make-first-call').every((c) => evaluateWith(c, h.m))).toBe(true);
  });

  it('negative: calling the instant the conversation ends skips the clear listening', () => {
    const h = harness(config());
    for (const a of BATTERY) act(h, a);
    act(h, READY);
    h.advance(37);
    tx(h, { kind: 'call', target: 'W0SRC' });
    expect(practical(hamTechS03Data, 'make-first-call').every((c) => evaluateWith(c, h.m))).toBe(false);
  });

  it('negative: calling without listening does not satisfy the listening objective', () => {
    const h = harness(config());
    for (const a of BATTERY) act(h, a);
    act(h, READY);
    h.advance(2);
    tx(h, { kind: 'call', target: 'W0SRC' });
    expect(practical(hamTechS03Data, 'make-first-call').every((c) => evaluateWith(c, h.m))).toBe(false);
  });

  it('negative: without the battery the radio cannot transmit', () => {
    const h = harness(config());
    act(h, READY);
    h.advance(12);
    expect(h.m.act({ type: 'ptt', deviceId: 'ht', intent: { kind: 'call', target: 'W0SRC' }, holdS: 3 }).ok).toBe(false);
    expect(practical(hamTechS03Data, 'listen-before-calling').every((c) => evaluateWith(c, h.m))).toBe(false);
  });

  it('negative: a contact without the closing identification is not complete', () => {
    const h = harness(config());
    for (const a of BATTERY) act(h, a);
    act(h, READY);
    h.advance(12);
    tx(h, { kind: 'call', target: 'W0SRC' });
    tx(h, { kind: 'reply', item: 'name' });
    expect(practical(hamTechS03Data, 'close-the-contact').every((c) => evaluateWith(c, h.m))).toBe(false);
  });
});
