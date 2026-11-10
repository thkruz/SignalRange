import { CircuitBoard } from '@app/ham/dc/circuit-board';
import { DcPowerSystem } from '@app/ham/dc/dc-power-system';
import { averageCurrentA, averagePowerW, energyUsedWh, handheldDrainWh, idealEnduranceH, inputVoltageRefusal, remainingWh, reserveCheck } from '@app/ham/dc/energy-budget';
import { solveCircuit } from '@app/ham/dc/mna-solver';
import { Multimeter } from '@app/ham/dc/multimeter';
import { HANDHELD_PROFILE, MOBILE_PROFILE } from '@app/ham/ham-profiles';
import { describe, expect, it } from 'vitest';

describe('mna-solver', () => {
  it('solves a divider', () => {
    const sol = solveCircuit({
      elements: [
        { id: 'V', type: 'vsource', a: 'in', b: 'gnd', volts: 10 },
        { id: 'R1', type: 'resistor', a: 'in', b: 'mid', ohms: 1000 },
        { id: 'R2', type: 'resistor', a: 'mid', b: 'gnd', ohms: 1000 },
      ],
    });
    expect(sol.voltages['mid']).toBeCloseTo(5, 3);
    expect(sol.currents['R1']).toBeCloseTo(0.005, 5);
    expect(sol.powers['R2']).toBeCloseTo(0.025, 5);
  });

  it('blocks a reversed diode and conducts a forward one', () => {
    const mk = (rev: boolean) =>
      solveCircuit({
        elements: [
          { id: 'V', type: 'vsource', a: 'in', b: 'gnd', volts: 5 },
          { id: 'R', type: 'resistor', a: 'in', b: 'x', ohms: 300 },
          rev ? { id: 'D', type: 'diode', a: 'gnd', b: 'x', vf: 2, ron: 10 } : { id: 'D', type: 'diode', a: 'x', b: 'gnd', vf: 2, ron: 10 },
        ],
      });
    expect(mk(false).currents['D']).toBeGreaterThan(0.009);
    expect(mk(true).currents['D']).toBe(0);
  });
});

describe('circuit board', () => {
  it('R1 branch: 0.100 A, 1.2 W, within 2 W rating', () => {
    const b = new CircuitBoard();
    b.setPower(true);
    b.setSwitch(true);
    const meter = new Multimeter();
    meter.setMode('DCA');
    meter.setRedSocket('A');
    meter.place({ series: 'r1-branch' });
    expect(meter.read(b).value).toBeCloseTo(0.1, 3);
    const r = b.r1Report();
    expect(r.powerW).toBeCloseTo(1.2, 1);
    expect(r.withinRating).toBe(true);
  });

  it('open contact gives 0 A, repair gives 0.1 A', () => {
    const b = new CircuitBoard();
    b.injectFault('open-switch-contact');
    b.setPower(true);
    b.setSwitch(true);
    const m = new Multimeter();
    m.setMode('DCA');
    m.setRedSocket('A');
    m.place({ series: 'r1-branch' });
    expect(m.read(b).value).toBeCloseTo(0, 3);
    b.repair('open-switch-contact');
    expect(m.read(b).value).toBeCloseTo(0.1, 3);
  });

  it('reversed probes read negative without changing the circuit', () => {
    const b = new CircuitBoard();
    b.setPower(true);
    b.setSwitch(true);
    const m = new Multimeter();
    m.setMode('DCV');
    m.place({ red: 'tp-supply+', black: 'tp-supply-' });
    expect(m.read(b).value).toBeCloseTo(12, 1);
    m.place({ red: 'tp-supply-', black: 'tp-supply+' });
    expect(m.read(b).value).toBeCloseTo(-12, 1);
    m.place({ red: 'tp-supply+', black: 'tp-supply-' });
    expect(m.read(b).value).toBeCloseTo(12, 1);
  });

  it('current mode across a source is refused', () => {
    const b = new CircuitBoard();
    b.setPower(true);
    const m = new Multimeter();
    m.setMode('DCA');
    m.setRedSocket('A');
    m.place({ red: 'tp-supply+', black: 'tp-supply-' });
    const r = m.read(b);
    expect(r.ok).toBe(false);
    expect(r.refusal).toMatch(/refuses current-mode placement across a source/u);
  });

  it('ohms while energized is refused; de-energized reads 120 ohms and continuity beeps', () => {
    const b = new CircuitBoard();
    b.setPower(true);
    const m = new Multimeter();
    m.setMode('OHM');
    m.place({ red: 'tp-r1-a', black: 'tp-r1-b' });
    const r = m.read(b);
    expect(r.ok).toBe(false);
    expect(r.refusal).toMatch(/Isolate power first/u);
    b.setPower(false);
    expect(m.read(b).value).toBeCloseTo(120, 0);
    m.setMode('CONT');
    expect(m.read(b).beep).toBe(false);
    m.place({ red: 'tp-sw1-in', black: 'tp-f1-out' });
    expect(m.read(b).beep).toBe(true);
  });

  it('open contact shows no continuity across SW1 when switched on; red lead in A socket invalidates voltage', () => {
    const b = new CircuitBoard();
    b.injectFault('open-switch-contact');
    b.setSwitch(true);
    const m = new Multimeter();
    m.setMode('CONT');
    m.place({ red: 'tp-sw1-in', black: 'tp-sw1-out' });
    expect(m.read(b).beep).toBe(false);
    m.setMode('DCV');
    m.setRedSocket('A');
    const r = m.read(b);
    expect(r.ok).toBe(false);
    expect(r.warning).toMatch(/A \(current\) socket/u);
  });

  it('fuse and reversed LED faults; replacement needs the correct rating', () => {
    const b = new CircuitBoard();
    b.setPower(true);
    b.setSwitch(true);
    expect(b.ledLit()).toBe(true);
    b.injectFault('reversed-led');
    expect(b.ledLit()).toBe(false);
    b.repair('reversed-led');
    b.injectFault('blown-fuse');
    expect(b.r1Report().currentA).toBeCloseTo(0, 3);
    expect(b.installFuse(2).ok).toBe(false);
    expect(b.installFuse(0.5).ok).toBe(true);
    expect(b.r1Report().currentA).toBeCloseTo(0.1, 3);
  });

  it('lists the matching-exercise symbols', () => {
    const ids = new Set(new CircuitBoard().components().map((c) => c.symbolId));
    for (const id of ['resistor', 'capacitor', 'inductor', 'diode', 'led', 'transistor', 'switch-spst', 'battery', 'fuse', 'relay']) {
      expect(ids.has(id as never)).toBe(true);
    }
  });
});

describe('dc power system', () => {
  it('RX 1 A gives 13.5 V at the radio with the 0.30 ohm lead', () => {
    const s = new DcPowerSystem({ fault: 'high-resistance-lead' });
    expect(s.measure().vRadio).toBeCloseTo(13.5, 2);
  });

  it('TX 8 A over 0.30 ohm is 11.4 V, browns out, and the captured sample survives the reset', () => {
    const s = new DcPowerSystem({ fault: 'high-resistance-lead' });
    s.tick(0.1, { ptt: true });
    expect(s.state.resetCount).toBe(1);
    expect(s.state.radioState).toBe('rebooting');
    expect(s.state.lastBrownout?.vRadio).toBeCloseTo(11.4, 2);
    expect(s.state.lastBrownout?.currentA).toBe(8);
    expect(s.isTransmitting()).toBe(false);
    s.tick(2.1, { ptt: false });
    expect(s.state.radioState).toBe('on');
    expect(s.state.lastBrownout?.vRadio).toBeCloseTo(11.4, 2);
  });

  it('the meter reads 11.4 V at radio+ during TX', () => {
    const s = new DcPowerSystem({ fault: 'high-resistance-lead' });
    s.state.ptt = true;
    const m = new Multimeter();
    m.setMode('DCV');
    m.place({ red: 'radio+', black: 'radio-' });
    expect(m.read(s).value).toBeCloseTo(11.4, 1);
    m.place({ red: 'psu+', black: 'psu-' });
    expect(m.read(s).value).toBeCloseTo(13.8, 1);
  });

  it('after repair: 13.56 V in TX, no reset, fuse rating kept', () => {
    const s = new DcPowerSystem({ fault: 'high-resistance-lead' });
    expect(s.replaceLead({ fuseRatingA: 30 }).ok).toBe(false);
    expect(s.replaceLead().ok).toBe(true);
    s.tick(1, { ptt: true });
    expect(s.state.resetCount).toBe(0);
    expect(s.measure().vRadio).toBeCloseTo(13.56, 2);
    expect(s.state.fuseRatingA).toBe(15);
    expect(s.isTransmitting()).toBe(true);
  });

  it('reversed polarity blows the fuse; radio is unharmed and unpowered', () => {
    const s = new DcPowerSystem({ fault: 'reversed-polarity' });
    s.tick(0.5, { ptt: true });
    expect(s.state.fuseBlown).toBe(true);
    expect(s.isTransmitting()).toBe(false);
    expect(s.state.resetCount).toBe(0);
  });

  it('supply current limit sags the source voltage itself', () => {
    const s = new DcPowerSystem({ fault: 'supply-current-limit' });
    s.state.ptt = true;
    const meas = s.measure();
    expect(meas.vSource).toBeLessThan(11);
    s.tick(0.1, { ptt: true });
    expect(s.state.lastBrownout?.vSource).toBeLessThan(11);
  });

  it('battery drains over time during TX and shows DC input above RF output', () => {
    const s = new DcPowerSystem({ source: 'battery', batteryUsableWh: 100 });
    const v0 = s.measure().vSource;
    for (let i = 0; i < 60; i++) s.tick(10, { ptt: true });
    expect(s.state.battery.energyWh).toBeCloseTo(82.6, 0);
    expect(v0).toBeGreaterThan(12.9);
  });

  it('battery drain rate matches V*I', () => {
    const s = new DcPowerSystem({ source: 'battery', batteryUsableWh: 100 });
    s.tick(3600, { ptt: false });
    expect(s.state.battery.energyWh).toBeCloseTo(100 - 13.3, 0);
    const eff = s.efficiency(50);
    expect(eff.dcInputW).toBeCloseTo(110.4, 1);
    expect(eff.dcInputW).toBeGreaterThan(eff.rfOutW);
  });

  it('ohms on the lead needs the source disconnected', () => {
    const s = new DcPowerSystem({ fault: 'high-resistance-lead' });
    const m = new Multimeter();
    m.setMode('OHM');
    m.place({ red: 'psu+', black: 'radio+' });
    expect(m.read(s).ok).toBe(false);
    s.setSourceConnected(false);
    expect(m.read(s).value).toBeCloseTo(0.3, 1);
  });
});

describe('energy budget', () => {
  it('S12: 21.6 W average, 32.4 Wh in 90 min, 87.6 Wh left, reserve satisfied', () => {
    const avg = averagePowerW({ rxW: 12, txW: 60, txDuty: 0.2 });
    expect(avg).toBeCloseTo(21.6, 6);
    const used = energyUsedWh(avg, 90);
    expect(used).toBeCloseTo(32.4, 6);
    expect(remainingWh(120, used)).toBeCloseTo(87.6, 6);
    expect(reserveCheck(120, used, 30).satisfied).toBe(true);
    expect(reserveCheck(120, 95, 30).satisfied).toBe(false);
  });

  it('S7: 2.4 A average, 4.17 h', () => {
    const a = averageCurrentA({ rxA: 1, txA: 8, txDuty: 0.2 });
    expect(a).toBeCloseTo(2.4, 6);
    expect(idealEnduranceH(10, a)).toBeCloseTo(4.17, 2);
  });

  it('handheld drain and the 13.8 V refusal', () => {
    expect(handheldDrainWh(HANDHELD_PROFILE, 60, 6)).toBeCloseTo(0.6 + 0.9, 6);
    expect(inputVoltageRefusal(HANDHELD_PROFILE, 13.8)).toMatch(/at most 8.4 V/u);
    expect(inputVoltageRefusal(HANDHELD_PROFILE, 7.4)).toBeNull();
    expect(inputVoltageRefusal(MOBILE_PROFILE, 13.8)).toBeNull();
  });
});
