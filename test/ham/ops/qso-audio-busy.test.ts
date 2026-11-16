import { afterEach, describe, expect, it } from 'vitest';
import { s08Station } from '../../../src/campaigns/ham-sdr/tech/s08-station';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { type BusyWindow, QsoMachine, type RemoteStationConfig } from '../../../src/ham/ops/qso-machine';
import { harness } from '../manager/harness';
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
  personality: [],
};
const F = 146.52e6;
const POS = { xKm: 1, yKm: 1, heightM: 5 };
const BUSY: BusyWindow = {
  freqMHz: 146.52,
  fromS: 0,
  toS: 30,
  relativeToMonitor: true,
  traffic: {
    gapS: 10,
    erpDbm: 37,
    mode: 'FM',
    lines: [
      { sourceId: 'chat-a', callsign: 'N0AAA', text: 'line one', position: POS },
      { sourceId: 'chat-b', callsign: 'N0BBB', text: 'line two', position: POS },
    ],
  },
};
const mk = (extra: Partial<ConstructorParameters<typeof QsoMachine>[0]> = {}) => new QsoMachine({ playerCallsign: 'K0TST', stations: [ST], hears: hearsAll, ...extra });
const tx = (p: { drive?: number; powerW?: number; feedback?: boolean } = {}) =>
  playerEmission({ freqHz: F, audioDrive: p.drive ?? 5, txPowerW: p.powerW ?? 5, rfFeedback: p.feedback });
/** Monitor one second at a time, ticking the machine each second */
function listen(q: QsoMachine, fromS: number, toS: number): void {
  for (let t = fromS; t < toS; t++) {
    q.tick(t);
    q.noteMonitoring(146.52, true, 1, t);
  }
}

describe('busy channel with authored traffic', () => {
  it('radiates the scripted lines while the window is open and stops after', () => {
    const q = mk({ busy: [BUSY] });
    const lines: string[] = [];
    for (let t = 0; t < 45; t++) {
      for (const e of q.tick(t)) lines.push(`${e.sourceId}:${e.payload.text}`);
      q.noteMonitoring(146.52, true, 1, t);
    }
    expect(lines).toEqual(['chat-a:line one', 'chat-b:line two', 'chat-a:line one']);
  });

  it('the window starts when the player first monitors the frequency', () => {
    const q = mk({ busy: [BUSY] });
    expect(q.isChannelBusy(F, 100)).toBe(false);
    q.tick(100);
    expect(q.tick(101)).toHaveLength(0); // nobody is monitoring yet, nothing is radiated
    q.noteMonitoring(146.52, true, 1, 102);
    expect(q.isChannelBusy(F, 110)).toBe(true);
    expect(q.isChannelBusy(F, 133)).toBe(false);
  });

  it('listening time only counts while the channel is clear', () => {
    const q = mk({ busy: [BUSY] });
    listen(q, 0, 30);
    expect(q.monitoredFor(146.52)).toBe(30);
    expect(q.clearMonitoredFor(146.52)).toBe(0);
    listen(q, 30, 42);
    expect(q.clearMonitoredFor(146.52)).toBe(12);
  });

  it('a call over the busy channel collides, whatever the power', () => {
    const q = mk({ busy: [BUSY] });
    listen(q, 0, 12);
    for (const powerW of [0.5, 50]) {
      q.onPlayerEmission(tx({ powerW }), { kind: 'call', target: 'N0ABC' }, 12);
      expect(q.getContacts()).toHaveLength(0);
    }
    expect(q.getNotes().filter((n) => n.code === 'channel-busy')).toHaveLength(2);
    expect(q.listenedBeforeFirstCall(10)).toBe(false);
  });

  it('the first call needs 10 s of clear listening, not just time on the channel', () => {
    const q = mk({ busy: [BUSY] });
    listen(q, 0, 33); // 30 s busy, 3 s clear
    q.onPlayerEmission(tx(), { kind: 'call', target: 'N0ABC' }, 33);
    expect(q.getContacts()).toHaveLength(1);
    expect(q.monitoredFor(146.52)).toBeGreaterThanOrEqual(10);
    expect(q.listenedBeforeFirstCall(10)).toBe(false);

    const q2 = mk({ busy: [BUSY] });
    listen(q2, 0, 44);
    q2.onPlayerEmission(tx(), { kind: 'call', target: 'N0ABC' }, 44);
    expect(q2.listenedBeforeFirstCall(10)).toBe(true);
  });

  it('round-trips the busy state', () => {
    const q = mk({ busy: [BUSY] });
    listen(q, 0, 15);
    const q2 = mk({ busy: [BUSY] });
    q2.restoreState(JSON.parse(JSON.stringify(q.getState())));
    expect(q2.isChannelBusy(F, 20)).toBe(true);
    expect(q2.clearMonitoredFor(146.52)).toBe(0);
  });
});

describe('audio reports: overdrive versus RF feedback', () => {
  const mkAudio = () => mk({ audioCheck: true });

  it('overdrive reads the same at any power and names the gain', () => {
    const q = mkAudio();
    q.onPlayerEmission(tx({ drive: 9, powerW: 2 }), { kind: 'test' }, 0);
    q.onPlayerEmission(tx({ drive: 9, powerW: 50 }), { kind: 'test' }, 20);
    expect(q.getAudioReports().map((r) => r.verdict)).toEqual(['overdrive', 'overdrive']);
    const text = q.tick(40).map((e) => e.payload.text ?? '');
    expect(text[0]).toContain('all power levels');
    expect(text[0]).not.toContain('squeal');
  });

  it('feedback is a different report, about power and not gain', () => {
    const q = mkAudio();
    q.onPlayerEmission(tx({ drive: 5, powerW: 15, feedback: true }), { kind: 'test' }, 0);
    expect(q.getAudioReports().map((r) => r.verdict)).toEqual(['feedback']);
    const text = q.tick(5)[0].payload.text ?? '';
    expect(text).toContain('squeal');
    expect(text).not.toContain('all power levels');
  });

  it('a test transmission starts no contact', () => {
    const q = mkAudio();
    q.onPlayerEmission(tx(), { kind: 'test' }, 0);
    expect(q.getContacts()).toHaveLength(0);
  });

  it('without audioCheck a test transmission is still just a carrier', () => {
    const q = mk();
    q.onPlayerEmission(tx(), { kind: 'test' }, 0);
    expect(q.getAudioReports()).toHaveLength(0);
    expect(q.getNotes().some((n) => n.code === 'carrier-only')).toBe(true);
  });

  it('feedback clears only when the same power goes out clean; lower gain or lower power do not clear it', () => {
    const q = mkAudio();
    q.onPlayerEmission(tx({ powerW: 15, feedback: true }), { kind: 'call', target: 'N0ABC' }, 0);
    expect(q.getNotes().some((n) => n.code === 'rf-feedback')).toBe(true);
    // lower gain, feedback still present
    q.onPlayerEmission(tx({ drive: 3, powerW: 15, feedback: true }), { kind: 'reply', item: 'report' }, 10);
    expect(q.getContacts()[0].exchanged).not.toContain('feedback-cleared');
    // lower power hides it but is not a fix
    q.onPlayerEmission(tx({ powerW: 5 }), { kind: 'reply', item: 'name' }, 20);
    expect(q.getContacts()[0].exchanged).not.toContain('feedback-cleared');
    // remedy applied: clean at the original power
    q.onPlayerEmission(tx({ powerW: 15 }), { kind: 'reply', item: 'location' }, 30);
    expect(q.getContacts()[0].exchanged).toContain('feedback-cleared');
  });

  it('mic overdrive still clears with gain 4 to 6', () => {
    const q = mkAudio();
    q.onPlayerEmission(tx({ drive: 9 }), { kind: 'call', target: 'N0ABC' }, 0);
    q.onPlayerEmission(tx({ drive: 5 }), { kind: 'reply', item: 'report' }, 10);
    expect(q.getContacts()[0].exchanged).toContain('mic-adjusted');
  });
});

describe('rf-feedback fault through the station (S8 fixture)', () => {
  const run = (patch: Record<string, unknown>, setup?: (h: ReturnType<typeof harness>) => void) => {
    const h = harness(structuredClone(s08Station));
    h.advance(3);
    setup?.(h);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch } as never);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 3 } as never);
    h.advance(10);
    const v = h.m.audioReports().map((r) => r.verdict);
    HamStationManager.destroy();

    return v;
  };

  it('appears only above the threshold power, independent of mic gain', () => {
    expect(run({ txPowerW: 15, micGain: 5 })).toEqual(['feedback']);
    expect(run({ txPowerW: 15, micGain: 2 })).toEqual(['feedback']);
    expect(run({ txPowerW: 5, micGain: 5 })).toEqual(['clean']);
    expect(run({ txPowerW: 5, micGain: 9 })).toEqual(['overdrive']);
    expect(run({ txPowerW: 15, micGain: 9 })).toEqual(['both']);
  });

  it('is cured by the choked feed line and by nothing else', () => {
    expect(run({ txPowerW: 15, micGain: 5 }, (h) => h.actOk({ type: 'install', spareId: 'feed-choked', replaces: 'feed' } as never))).toEqual(['clean']);
  });
});
