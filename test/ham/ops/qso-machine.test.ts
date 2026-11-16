import { describe, expect, it } from 'vitest';
import { QsoMachine, type RemoteStationConfig } from '../../../src/ham/ops/qso-machine';
import { hearsAll, playerEmission } from './helpers';

const ST: RemoteStationConfig = {
  id: 'st1',
  callsign: 'N0ABC',
  name: 'Sam',
  location: 'Riverton',
  grid: 'EN52',
  position: { xKm: 5, yKm: 0, heightM: 10 },
  freqMHz: 146.52,
  mode: 'FM',
  erpDbm: 37,
  replyDelayS: 2,
  personality: ['Nice to meet you.'],
  beacon: undefined,
};
const F = 146.52e6;
const call = () => playerEmission({ freqHz: F });

function mk(extra: Partial<ConstructorParameters<typeof QsoMachine>[0]> = {}) {
  return new QsoMachine({ playerCallsign: 'K0TST', stations: [ST], hears: hearsAll, ...extra });
}

describe('QsoMachine', () => {
  it('completes a full contact only after reply heard, exchange and identify', () => {
    const q = mk();
    q.onPlayerEmission(call(), { kind: 'cq' }, 0);
    const em = q.tick(2);
    expect(em).toHaveLength(1);
    expect(em[0].payload.text).toContain('K0TST this is N0ABC');
    q.notePlayerHeard(em[0].id, 0.9);
    q.onPlayerEmission(call(), { kind: 'reply', item: 'report' }, 10);
    q.onPlayerEmission(call(), { kind: 'reply', item: 'name' }, 20);
    const acks = q.tick(30);
    expect(acks.map((a) => a.payload.text).join(' ')).toContain('My name is Sam');
    q.onPlayerEmission(call(), { kind: 'identify' }, 40);
    const c = q.getContacts()[0];
    expect(c.closed && c.identified && c.remoteHeardPlayer && c.playerHeardRemote).toBe(true);
    expect(c.exchanged).toEqual(['report', 'name']);
    expect(q.isValidContact(c.id)).toBe(true);
  });

  it('low intelligibility does not set playerHeardRemote', () => {
    const q = mk();
    q.onPlayerEmission(call(), { kind: 'cq' }, 0);
    const em = q.tick(2);
    q.notePlayerHeard(em[0].id, 0.4);
    expect(q.getContacts()[0].playerHeardRemote).toBe(false);
  });

  it('a carrier alone never starts a contact', () => {
    const q = mk();
    q.onPlayerEmission(call(), { kind: 'carrier' }, 0);
    expect(q.getContacts()).toHaveLength(0);
    expect(q.tick(10)).toHaveLength(0);
  });

  it('a remote beacon heard alone never completes a contact', () => {
    const q = new QsoMachine({
      playerCallsign: 'K0TST',
      hears: hearsAll,
      stations: [{ ...ST, beacon: { intervalS: 30, text: 'BEACON N0ABC' } }],
    });
    const em = q.tick(0);
    expect(em[0].payload.text).toBe('BEACON N0ABC');
    q.notePlayerHeard(em[0].id, 1);
    expect(q.getContacts()).toHaveLength(0);
  });

  it('calling over an ongoing conversation collides', () => {
    const q = mk({ busy: [{ freqMHz: 146.52, fromS: 0, toS: 60 }] });
    q.onPlayerEmission(call(), { kind: 'cq' }, 5);
    expect(q.getContacts()).toHaveLength(0);
    expect(q.getNotes().some((n) => n.code === 'channel-busy')).toBe(true);
    q.onPlayerEmission(call(), { kind: 'cq' }, 70);
    expect(q.getContacts()).toHaveLength(1);
  });

  it('tracks listen-before-call time', () => {
    const q = mk();
    for (let i = 0; i < 6; i++) q.noteMonitoring(146.52, true, 2);
    q.onPlayerEmission(call(), { kind: 'cq' }, 12);
    expect(q.getFirstCall()?.monitoredS).toBe(12);
    expect(q.listenedBeforeFirstCall(10)).toBe(true);
    const q2 = mk();
    q2.onPlayerEmission(call(), { kind: 'cq' }, 1);
    expect(q2.listenedBeforeFirstCall(10)).toBe(false);
  });

  it('flags overdue identification after 10 minutes', () => {
    const q = mk();
    q.onPlayerEmission(call(), { kind: 'cq' }, 0);
    expect(q.identificationOverdue(500)).toBe(false);
    expect(q.identificationOverdue(601)).toBe(true);
    q.tick(601);
    expect(q.getNotes().some((n) => n.code === 'id-overdue')).toBe(true);
    q.onPlayerEmission(call(), { kind: 'reply', item: 'name' }, 602); // not an ID
    expect(q.identificationOverdue(700)).toBe(true);
  });

  it('remote complains about an overdriven mic, then accepts a corrected drive', () => {
    const q = mk();
    q.onPlayerEmission(playerEmission({ freqHz: F, audioDrive: 9 }), { kind: 'cq' }, 0);
    expect(q.tick(2)[0].payload.text).toContain('Back off from the microphone');
    q.onPlayerEmission(playerEmission({ freqHz: F, audioDrive: 5 }), { kind: 'reply', item: 'report' }, 10);
    expect(q.getContacts()[0].exchanged).toContain('mic-adjusted');
  });

  it('round-trips state', () => {
    const q = mk();
    q.onPlayerEmission(call(), { kind: 'cq' }, 0);
    const s = q.getState();
    const q2 = mk();
    q2.restoreState(JSON.parse(JSON.stringify(s)));
    expect(q2.tick(2)).toHaveLength(1);
  });
});
