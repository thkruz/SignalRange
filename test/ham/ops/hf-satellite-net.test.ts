import { describe, expect, it } from 'vitest';
import { HfPropagation } from '../../../src/ham/ops/hf-propagation';
import { compareMessage, NetControl, validateRadiogram } from '../../../src/ham/ops/net-control';
import { ISOLATION_DB, SatelliteLink } from '../../../src/ham/ops/satellite-link';
import { hearsAll, playerEmission } from './helpers';

describe('HfPropagation', () => {
  const mk = (state: 'open' | 'closed' | 'marginal') =>
    new HfPropagation({
      schedule: [],
      defaultCondition: state,
      playerCallsign: 'K0TST',
      stations: [
        { id: 'dx', callsign: 'W0DXQ', name: 'Ann', grid: 'EM38', position: { xKm: 2000, yKm: 0, heightM: 12 }, freqMHz: 28.425, erpDbm: 50, replyDelayS: 2 },
        { id: 'loc', callsign: 'N0LOC', name: 'Bo', grid: 'EN52', position: { xKm: 10, yKm: 0, heightM: 12 }, freqMHz: 28.46, erpDbm: 40, replyDelayS: 2 },
      ],
    });
  const tx = (erpDbm: number, freqHz = 28.425e6) => playerEmission({ freqHz, mode: 'USB', bandwidthHz: 2400, erpDbm });

  it('open answers a USB call; closed never does, even at high power', () => {
    const open = mk('open');
    open.onPlayerEmission(tx(37), { kind: 'cq' }, 0);
    expect(open.tick(5)).toHaveLength(1);
    const closed = mk('closed');
    const ev = closed.onPlayerEmission(tx(60), { kind: 'cq' }, 0);
    expect(ev[0].reason).toBe('closed');
    expect(closed.tick(10)).toHaveLength(0);
  });

  it('marginal needs power; local ground wave works when the band is closed', () => {
    const m = mk('marginal');
    expect(m.evaluate(tx(37), m_station(m), 0).decoded).toBe(false);
    expect(m.evaluate(tx(50), m_station(m), 0).decoded).toBe(true);
    const c = mk('closed');
    c.onPlayerEmission(tx(37, 28.46e6), { kind: 'cq' }, 0);
    expect(c.tick(5)).toHaveLength(1);
  });

  it('schedule changes the condition and RIT does not move TX', () => {
    const h = new HfPropagation({ schedule: [{ fromS: 100, toS: 200, state: 'open' }], defaultCondition: 'closed', stations: [], playerCallsign: 'K0TST' });
    expect(h.condition(50)).toBe('closed');
    expect(h.condition(150)).toBe('open');
    expect(h.rxFrequencyHz(28.4e6, 500, true)).toEqual({ txHz: 28.4e6, rxHz: 28.4005e6 });
  });

  it('off-frequency calls are not decoded; background CW and FT8 sit in 28.0-28.3', () => {
    const h = mk('open');
    expect(h.evaluate(tx(50, 28.43e6), m_station(h), 0).reason).toBe('off-frequency');
    for (const e of h.getBackgroundEmissions(0)) {
      expect(e.freqHz).toBeGreaterThanOrEqual(28.0e6);
      expect(e.freqHz).toBeLessThanOrEqual(28.3e6);
    }
  });

  it('full contact with open band', () => {
    const h = mk('open');
    h.onPlayerEmission(tx(40), { kind: 'cq' }, 0);
    const r = h.tick(5)[0];
    expect(h.getEmissionPathLossDb(r.id, 5)).toBeGreaterThan(130);
    h.notePlayerHeard(r.id, 0.9);
    h.onPlayerEmission(tx(40), { kind: 'reply', item: 'report' }, 10);
    h.onPlayerEmission(tx(40), { kind: 'identify' }, 20);
    expect(h.isValidContact(h.getContacts()[0].id)).toBe(true);
  });
});

function m_station(h: HfPropagation) {
  void h;
  return { id: 'dx', callsign: 'W0DXQ', name: 'Ann', grid: 'EM38', position: { xKm: 2000, yKm: 0, heightM: 12 }, freqMHz: 28.425, erpDbm: 50, replyDelayS: 2 };
}

describe('SatelliteLink', () => {
  const mk = () =>
    new SatelliteLink({
      id: 'cubehop',
      name: 'CUBEHOP',
      uplinkMHz: 435.9,
      downlinkMHz: 145.9,
      accessToneHz: 67.0,
      uplinkWindowHz: 7000,
      downlinkErpDbm: 30,
      playerCallsign: 'K0TST',
      hears: hearsAll,
      groundStation: { id: 'gs', callsign: 'N0GND', name: 'Kim', grid: 'EN52', position: { xKm: 200, yKm: 0, heightM: 20 }, replyDelayS: 2 },
    });
  const up = (hz: number, tone: number | null = 67.0) => playerEmission({ freqHz: hz, ctcssHz: tone });
  const geo = (isAboveHorizon = true) => ({ az: 90, el: 40, rangeKm: 900, dopplerFactor: 1.000023, isAboveHorizon });

  it('rejects an uncorrected uplink and accepts a corrected one', () => {
    const s = mk();
    s.setGeometry(geo());
    expect(s.onPlayerUplink(up(435.9e6), { kind: 'cq' }, 0).code).toBe('out-of-window');
    const ok = s.onPlayerUplink(up(s.correctedUplinkHz()), { kind: 'cq' }, 1);
    expect(ok.code).toBe('relayed');
    expect(ok.emissions[0].freqHz).toBe(s.downlinkHz());
    expect(ok.emissions[0].viaSatellite).toBe('cubehop');
  });

  it('wrong tone and below horizon do nothing', () => {
    const s = mk();
    s.setGeometry(geo());
    expect(s.onPlayerUplink(up(s.correctedUplinkHz(), 88.5), null, 0).code).toBe('wrong-tone');
    s.setGeometry(geo(false));
    const r = s.onPlayerUplink(up(s.correctedUplinkHz()), { kind: 'cq' }, 0);
    expect(r.code).toBe('below-horizon');
    expect(r.emissions).toHaveLength(0);
  });

  it('isolation: splitter unsafe, spaced antennas desense, duplexer ok', () => {
    const s = mk();
    s.setIsolation(ISOLATION_DB.splitter);
    expect(s.evaluateIsolation(5).status).toBe('unsafe');
    s.setGeometry(geo());
    expect(s.onPlayerUplink(up(s.correctedUplinkHz()), null, 0).code).toBe('unsafe');
    s.setIsolation(ISOLATION_DB.spacedAntennas);
    const d = s.evaluateIsolation(5);
    expect(d.status).toBe('desense');
    expect(d.sdrNoiseRaiseDb).toBeGreaterThan(0);
    s.setIsolation(ISOLATION_DB.duplexer);
    expect(s.evaluateIsolation(5).status).toBe('ok');
  });

  it('own downlink alone is not a contact; the ground station reply heard is', () => {
    const s = mk();
    s.setGeometry(geo());
    const r = s.onPlayerUplink(up(s.correctedUplinkHz()), { kind: 'cq' }, 0);
    s.notePlayerHeard(r.emissions[0].id, 1);
    expect(s.selfHeard).toBe(true);
    expect(s.getContacts()[0].playerHeardRemote).toBe(false);
    const reply = s.tick(10)[0];
    expect(reply.payload.text).toContain('grid EN52');
    s.notePlayerHeard(reply.id, 0.9);
    s.onPlayerUplink(up(s.correctedUplinkHz()), { kind: 'identify' }, 20);
    expect(s.isValidContact(s.getContacts()[0].id)).toBe(true);
  });
});

describe('NetControl', () => {
  const MSG = 'Quincy Xavier requests two hundred zinc bolts delivered Thursday';
  const mk = () =>
    new NetControl({
      freqMHz: 146.94,
      ncs: { id: 'ncs', callsign: 'W0NET', name: 'Dee', position: { xKm: 2, yKm: 2, heightM: 10 }, erpDbm: 40 },
      receiver: { id: 'rcv', callsign: 'N0RCV', name: 'Ed', position: { xKm: 3, yKm: 1, heightM: 10 }, erpDbm: 40 },
      playerCallsign: 'K0TST',
      openingS: 10,
      outage: { startsAtS: 600, fallbackMHz: 146.52 },
      message: MSG,
      hears: hearsAll,
    });
  const tx = (callsign = 'K0TST') => playerEmission({ freqHz: 146.94e6, payload: { kind: 'voice', text: 'x', callsign } });

  it('opens, requires identification at check-in, announces outage and assigns traffic', () => {
    const n = mk();
    expect(n.tick(5)).toHaveLength(0);
    expect(n.tick(30).length).toBe(2);
    n.onPlayerEmission(tx('BADCALL'), { kind: 'net-checkin' }, 31);
    expect(n.checkedIn).toBe(false);
    n.onPlayerEmission(tx(), { kind: 'net-checkin' }, 40);
    expect(n.checkedIn).toBe(true);
    const out = n.tick(80);
    const text = out.map((e) => e.payload.text).join(' | ');
    expect(text).toContain('146.520');
    const assign = out.find((e) => e.payload.text?.includes(MSG));
    expect(assign).toBeTruthy();
    n.notePlayerHeard((assign as { id: string }).id, 0.9);
    expect(n.heardAssignment).toBe(true);
    expect(n.outageActive(100)).toBe(false);
    expect(n.outageActive(700)).toBe(true);
  });

  it('receiver reads back what was sent; errors are caught, exact text passes', () => {
    const n = mk();
    n.tick(30);
    n.onPlayerEmission(tx(), { kind: 'net-checkin' }, 40);
    n.tick(100);
    n.onPlayerEmission(tx(), { kind: 'message', text: 'Quincy Xavier requests two hundred zinc bolts delivered Friday' }, 110);
    const bad = n
      .tick(130)
      .map((e) => e.payload.text)
      .join(' ');
    expect(bad).toContain('readback: Quincy Xavier requests two hundred zinc bolts delivered Friday');
    expect(bad).toContain('does not match');
    expect(n.messageDelivered).toBe(false);
    n.onPlayerEmission(tx(), { kind: 'message', text: `  ${MSG.toUpperCase()}  ` }, 140);
    expect(n.messageDelivered).toBe(true);
    expect(n.stage).toBe('message-delivered');
    n.onPlayerEmission(tx(), { kind: 'reply', item: 'fill' }, 150);
    expect(n.fills).toBe(1);
    const s = JSON.parse(JSON.stringify(n.getState()));
    const n2 = mk();
    n2.restoreState(s);
    expect(n2.messageDelivered).toBe(true);
  });

  it('compares messages with case/space normalization only', () => {
    expect(compareMessage('a  B c', 'A b C').exact).toBe(true);
    expect(compareMessage('a b d', 'a b c').wrongWords).toEqual(['c']);
  });

  it('radiogram check must equal word count', () => {
    const rg = { number: '12', precedence: 'R', origin: 'W0NET', check: 5, place: 'Riverton', time: '1415', date: 'Mar 15', text: 'one two three four five' };
    expect(validateRadiogram(rg).ok).toBe(true);
    const bad = validateRadiogram({ ...rg, check: 4 });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toContain('text (5)');
    expect(validateRadiogram({ ...rg, number: '' }).ok).toBe(false);
  });
});
