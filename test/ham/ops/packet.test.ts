import { describe, expect, it } from 'vitest';
import type { HearsFn } from '../../../src/ham/ops/ops-common';
import { PacketStation } from '../../../src/ham/ops/packet';
import { hearsAll } from './helpers';

const NODE = {
  id: 'bbs',
  callsign: 'N0BBS-1',
  freqMHz: 144.39,
  position: { xKm: 8, yKm: 0, heightM: 30 },
  erpDbm: 40,
  replyDelayS: 1,
  banner: 'Welcome',
};
const RADIO = { freqHz: 144.39e6, erpDbm: 37 };
const GOOD = { inputDevice: 'interface', outputDevice: 'interface', ptt: 'rts' } as const;

function mk(audio = {}, hears: HearsFn = hearsAll) {
  return new PacketStation({
    node: NODE,
    hears,
    audio: { ...GOOD, ...audio },
    station: { mycall: 'K0TST-1', destination: 'N0BBS-1' },
  });
}

function connected(p: PacketStation): void {
  p.connect(0, RADIO);
  p.tick(1);
  expect(p.linkState).toBe('connected');
}

describe('PacketStation', () => {
  it('connects and delivers an I-frame only after RR', () => {
    const p = mk();
    connected(p);
    p.sendText('hello bbs', 2, RADIO);
    expect(p.getDelivered()).toEqual([]);
    expect(p.getUnacked()).toEqual(['hello bbs']);
    p.tick(3);
    expect(p.getDelivered()).toEqual(['hello bbs']);
    expect(p.getRemoteReceived()).toEqual(['hello bbs']);
  });

  it('wrong input device: remote answers but the player does not decode', () => {
    const p = mk({ inputDevice: 'laptop-mic' });
    p.connect(0, RADIO);
    const em = p.tick(1);
    expect(em[0].payload.frame?.type).toBe('UA');
    expect(p.linkState).toBe('connecting');
    expect(p.getRxLog()[0]).toMatchObject({ ok: false, reason: 'wrong-input-device' });
    p.setAudio({ inputDevice: 'interface' });
    p.tick(11); // T1 retry of SABM
    p.tick(12);
    expect(p.linkState).toBe('connected');
  });

  it('ptt none: radio never keys and the remote sees nothing', () => {
    const p = mk({ ptt: 'none' });
    const r = p.connect(0, RADIO);
    expect(r.rf).toBe(false);
    expect(r.emissions).toHaveLength(0);
    expect(p.tick(5)).toHaveLength(0);
    expect(p.linkState).toBe('connecting');
  });

  it('output device not the interface: carrier only, no decode', () => {
    const p = mk({ outputDevice: 'laptop-speakers' });
    const r = p.connect(0, RADIO);
    expect(r.emissions[0].payload.kind).toBe('carrier');
    expect(p.tick(2)).toHaveLength(0);
  });

  it('corrupted frame is missed, retried after T1, then acked', () => {
    const p = mk();
    connected(p);
    p.corruptNextFrame();
    p.sendText('msg', 2, RADIO);
    p.tick(5);
    expect(p.getDelivered()).toEqual([]);
    const retry = p.tick(12);
    expect(retry.some((e) => e.isPlayer && e.payload.frame?.type === 'I')).toBe(true);
    expect(p.retries).toBe(1);
    p.tick(13);
    expect(p.getDelivered()).toEqual(['msg']);
  });

  it('sent without ack is not delivered and fails after N2 retries', () => {
    let deaf = false;
    const p = mk({}, (_e, id) => ({ snrDb: 10, decoded: !(deaf && id === 'bbs') }));
    connected(p);
    deaf = true;
    p.sendText('lost', 2, RADIO);
    for (let t = 12; t <= 60; t += 10) p.tick(t);
    expect(p.getDelivered()).toEqual([]);
    expect(p.getFailed()).toEqual(['lost']);
    expect(p.linkState).toBe('disconnected');
  });

  it('TX level too high gives FCS failures; too low is not decodable', () => {
    const hi = mk({ txLevel: 9 });
    hi.connect(0, RADIO);
    expect(hi.tick(2)).toHaveLength(0);
    const lo = mk({ txLevel: 1 });
    lo.connect(0, RADIO);
    expect(lo.tick(2)).toHaveLength(0);
    expect(lo.getNotes().join(' ')).toContain('too low');
  });

  it('RX level: too low no decode, too high clipped', () => {
    const lo = mk({ rxLevel: 1 });
    lo.connect(0, RADIO);
    lo.tick(1);
    expect(lo.getRxLog()[0].reason).toBe('rx-level-low');
    const hi = mk({ rxLevel: 9 });
    hi.connect(0, RADIO);
    hi.tick(1);
    expect(hi.getRxLog()[0].reason).toBe('rx-level-high');
    expect(hi.linkState).toBe('connecting');
  });

  it('UI frames are never acknowledged or counted as delivered', () => {
    const p = mk();
    const r = p.sendUi('!4903.50N/07201.75W-', 0, RADIO);
    expect(r.rf).toBe(true);
    expect(p.tick(10)).toHaveLength(0);
    expect(p.getUiSent()).toHaveLength(1);
    expect(p.getDelivered()).toEqual([]);
  });

  it('system sounds routed to the interface key the radio with garbage', () => {
    const p = mk({ systemSoundsToInterface: true });
    p.connect(0, RADIO);
    const g = p.playSystemSound(5);
    expect(g.reason).toBe('spurious-keying');
    expect(g.emissions[0].payload.kind).toBe('noise');
    const clean = mk();
    clean.connect(0, RADIO);
    expect(clean.playSystemSound(5).rf).toBe(false);
  });

  it('disconnects and round-trips state', () => {
    const p = mk();
    connected(p);
    const s = JSON.parse(JSON.stringify(p.getState()));
    const p2 = mk();
    p2.restoreState(s);
    expect(p2.linkState).toBe('connected');
    p2.disconnect(5, RADIO);
    p2.tick(6);
    expect(p2.linkState).toBe('disconnected');
  });
});
