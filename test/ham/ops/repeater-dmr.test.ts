import { describe, expect, it } from 'vitest';
import { DmrRepeater } from '../../../src/ham/ops/dmr';
import { makeClubRepeaterConfig, RADIO_BOOT_TONE_HZ, Repeater } from '../../../src/ham/ops/repeater';
import { hearsAll, playerEmission } from './helpers';

const IN = 146.34e6;
const OUT = 146.94e6;

describe('Repeater', () => {
  const mk = () => new Repeater(makeClubRepeaterConfig(hearsAll, 'K0TST'));

  it('stays silent on the wrong tone, then relays with the right one', () => {
    const r = mk();
    const bad = r.onPlayerEmission(playerEmission({ freqHz: IN, ctcssHz: RADIO_BOOT_TONE_HZ }), { kind: 'cq' }, 0);
    expect(bad.code).toBe('wrong-tone');
    expect(bad.emissions).toHaveLength(0);
    const good = r.onPlayerEmission(playerEmission({ freqHz: IN, ctcssHz: 100.0 }), { kind: 'cq' }, 10);
    expect(good.code).toBe('relayed');
    expect(good.emissions[0].freqHz).toBe(OUT);
    expect(good.emissions[0].payload.text).toBe('x');
  });

  it('missing tone and simplex on the output do nothing', () => {
    const r = mk();
    expect(r.onPlayerEmission(playerEmission({ freqHz: IN }), null, 0).code).toBe('no-tone');
    const out = r.onPlayerEmission(playerEmission({ freqHz: OUT, ctcssHz: 100 }), null, 1);
    expect(out.code).toBe('wrong-frequency');
    expect(out.emissions).toHaveLength(0);
  });

  it('courtesy tone alone is never a contact; a club operator answers through the repeater', () => {
    const r = mk();
    const res = r.onPlayerEmission(playerEmission({ freqHz: IN, ctcssHz: 100 }), { kind: 'carrier' }, 0);
    expect(res.emissions.some((e) => e.payload.text === '(courtesy tone)')).toBe(true);
    expect(r.getContacts()).toHaveLength(0);
    r.onPlayerEmission(playerEmission({ freqHz: IN, ctcssHz: 100 }), { kind: 'cq' }, 10);
    const reply = r.tick(20);
    const spoken = reply.find((e) => e.payload.callsign === 'N0CLB');
    expect(spoken?.freqHz).toBe(OUT);
    r.notePlayerHeard((spoken as { id: string }).id, 0.8);
    r.onPlayerEmission(playerEmission({ freqHz: IN, ctcssHz: 100 }), { kind: 'reply', item: 'name' }, 30);
    r.onPlayerEmission(playerEmission({ freqHz: IN, ctcssHz: 100 }), { kind: 'identify' }, 40);
    const c = r.getContacts()[0];
    expect(r.isValidContact(c.id)).toBe(true);
  });

  it('outage switch disables access and round-trips state', () => {
    const r = mk();
    r.setOutage(true);
    expect(r.onPlayerEmission(playerEmission({ freqHz: IN, ctcssHz: 100 }), null, 0).code).toBe('outage');
    const s = JSON.parse(JSON.stringify(r.getState()));
    const r2 = mk();
    r2.restoreState(s);
    expect(r2.isOutage).toBe(true);
  });

  it('time-out truncates a long transmission', () => {
    const r = mk();
    const res = r.onPlayerEmission(playerEmission({ freqHz: IN, ctcssHz: 100, endS: 300 }), null, 0);
    expect(res.code).toBe('timed-out');
    expect(res.emissions[0].endS).toBe(180);
  });
});

describe('DmrRepeater', () => {
  const mk = () =>
    new DmrRepeater({
      id: 'dmr1',
      callsign: 'W0DMR',
      outputMHz: 442.1,
      inputMHz: 447.1,
      colorCode: 1,
      slots: { 1: [8, 3100], 2: [9, 31665] },
      position: { xKm: 4, yKm: 4, heightM: 80 },
      erpDbm: 47,
      hears: hearsAll,
      remote: { id: 'dmr-u', callsign: 'N0DMR', name: 'Lee', talkgroup: 31665, timeSlot: 2, replyDelayS: 2, lines: ['Hello.'] },
    });
  const tx = (cc: number, ts: 1 | 2, tg: number) => playerEmission({ freqHz: 447.1e6, mode: 'DMR', dmr: { colorCode: cc, timeSlot: ts, talkgroup: tg } });

  it('gives three distinct failures then a response with the right config', () => {
    const d = mk();
    expect(d.onPlayerEmission(tx(2, 2, 31665), 0).code).toBe('no-talk-permit');
    expect(d.onPlayerEmission(tx(1, 1, 31665), 1).code).toBe('tg-not-on-slot');
    const empty = d.onPlayerEmission(tx(1, 2, 9), 2);
    expect(empty.code).toBe('empty-talkgroup');
    expect(d.tick(100)).toHaveLength(0);
    expect(d.onPlayerEmission(tx(1, 2, 31665), 10).code).toBe('ok');
    const reply = d.tick(30);
    expect(reply).toHaveLength(1);
    expect(reply[0].mode).toBe('DMR');
    expect(reply[0].dmr).toEqual({ colorCode: 1, timeSlot: 2, talkgroup: 31665 });
    d.notePlayerHeard(reply[0].id, 0.9);
    expect(d.playerHeardReply).toBe(true);
    expect(d.getAccessLog().map((l) => l.code)).toEqual(['no-talk-permit', 'tg-not-on-slot', 'empty-talkgroup', 'ok']);
  });

  it('wrong frequency and outage are reported', () => {
    const d = mk();
    expect(d.onPlayerEmission(playerEmission({ freqHz: 442.1e6, mode: 'DMR', dmr: { colorCode: 1, timeSlot: 2, talkgroup: 9 } }), 0).code).toBe('wrong-frequency');
    d.setOutage(true);
    expect(d.onPlayerEmission(tx(1, 2, 9), 1).code).toBe('outage');
  });
});
