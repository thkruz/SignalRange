/**
 * Two-probe DMM model. Generic: works over anything implementing MeterCircuit
 * (the S2 training board and the mobile DC system both do).
 * Reading a meter never changes the circuit (reversed probes just flip the sign).
 */
import { Circuit, solveCircuit } from './mna-solver';

export type MeterMode = 'DCV' | 'DCA' | 'OHM' | 'CONT' | 'OFF';
export type RedSocket = 'VΩ' | 'A';
export type MeterUnit = 'V' | 'A' | 'Ω' | '';

export const CONTINUITY_THRESHOLD_OHMS = 30;
export const OPEN_CIRCUIT_OHMS = 1e7;
const TEST_CURRENT_A = 0.001;
const AMMETER_SHUNT_OHMS = 0.1;

/** Anything the meter can probe. */
export interface MeterCircuit {
  /** Circuit in its present (possibly energized) state */
  getCircuit(): Circuit;
  /** Same circuit with every source/load removed (isolated) */
  getDeenergizedCircuit(): Circuit;
  isEnergized(): boolean;
  testPointNode(name: string): string | undefined;
  /** A series break point where an ammeter can be inserted; forward = positive current flows a -> b */
  breakPoint(name: string): { elementId: string; forward: boolean } | undefined;
  /** Terminal node pairs [+, -] of every source (to detect current-mode placement across a source) */
  sourceTerminals(): Array<[string, string]>;
}

export interface MeterPlacement {
  /** Test point names */
  red?: string;
  black?: string;
  /** DCA only: meter inserted in series at this break point (red on the upstream side) */
  series?: string;
  /** DCA series only: leads swapped relative to the arrow */
  seriesReversed?: boolean;
}

export interface MeterReading {
  ok: boolean;
  value: number | null;
  unit: MeterUnit;
  display: string;
  refusal?: string;
  warning?: string;
  /** Continuity beeper */
  beep?: boolean;
  /** Resistance reading is beyond range ("OL") */
  overload?: boolean;
}

export interface MeterState {
  mode: MeterMode;
  redSocket: RedSocket;
  placement: MeterPlacement;
}

function refuse(message: string, unit: MeterUnit = ''): MeterReading {
  return { ok: false, value: null, unit, display: 'ERR', refusal: message };
}

export function formatResistance(ohms: number): string {
  if (ohms >= OPEN_CIRCUIT_OHMS) return 'OL';
  if (ohms >= 1e6) return `${(ohms / 1e6).toFixed(2)} MΩ`;
  if (ohms >= 1e3) return `${(ohms / 1e3).toFixed(2)} kΩ`;
  return `${ohms.toFixed(1)} Ω`;
}

export class Multimeter {
  state: MeterState = { mode: 'OFF', redSocket: 'VΩ', placement: {} };

  setMode(mode: MeterMode): void {
    this.state.mode = mode;
  }

  setRedSocket(socket: RedSocket): void {
    this.state.redSocket = socket;
  }

  place(placement: MeterPlacement): void {
    this.state.placement = { ...placement };
  }

  clear(): void {
    this.state.placement = {};
  }

  read(target: MeterCircuit): MeterReading {
    return readMeter(this.state, target);
  }
}

function resolveNodes(p: MeterPlacement, target: MeterCircuit): { red: string; black: string } | MeterReading {
  if (p.red === undefined || p.black === undefined) {
    return refuse('Place both probes on test points first.');
  }
  const red = target.testPointNode(p.red);
  const black = target.testPointNode(p.black);
  if (red === undefined || black === undefined) return refuse('A probe is not on a valid test point.');
  return { red, black };
}

export function readMeter(state: MeterState, target: MeterCircuit): MeterReading {
  const { mode, redSocket, placement } = state;
  if (mode === 'OFF') return { ok: true, value: null, unit: '', display: '' };

  if (mode === 'DCA') {
    if (redSocket !== 'A') {
      return {
        ...refuse('Red lead is in the VΩ socket: move it to the A socket to measure current.', 'A'),
        warning: 'socket',
      };
    }
    return readCurrent(placement, target);
  }

  // voltage / resistance / continuity
  if (redSocket === 'A') {
    return {
      ok: false,
      value: null,
      unit: mode === 'DCV' ? 'V' : 'Ω',
      display: 'ERR',
      warning: 'Red lead is in the A (current) socket: move it to VΩ for this mode. The reading is invalid.',
    };
  }
  const nodes = resolveNodes(placement, target);
  if ('ok' in nodes) return nodes;

  if (mode === 'DCV') {
    const sol = solveCircuit(target.getCircuit());
    const v = (sol.voltages[nodes.red] ?? 0) - (sol.voltages[nodes.black] ?? 0);
    const r = Math.abs(v) < 5e-4 ? 0 : v;
    return { ok: true, value: r, unit: 'V', display: `${r.toFixed(2)} V` };
  }

  // OHM / CONT
  if (target.isEnergized()) {
    return refuse('Isolate power first: resistance and continuity must be measured on a de-energized circuit.', 'Ω');
  }
  const base = target.getDeenergizedCircuit();
  const probe: Circuit = {
    elements: [...base.elements, { id: '__meter-test', type: 'isource', from: nodes.black, to: nodes.red, amps: TEST_CURRENT_A }],
  };
  const sol = solveCircuit(probe);
  let ohms = ((sol.voltages[nodes.red] ?? 0) - (sol.voltages[nodes.black] ?? 0)) / TEST_CURRENT_A;
  if (nodes.red === nodes.black) ohms = 0;
  const open = ohms >= OPEN_CIRCUIT_OHMS || ohms < 0;
  if (open) ohms = Infinity;
  if (mode === 'CONT') {
    const beep = !open && ohms < CONTINUITY_THRESHOLD_OHMS;
    return {
      ok: true,
      value: open ? null : ohms,
      unit: 'Ω',
      display: open ? 'OL' : formatResistance(ohms),
      beep,
      overload: open,
    };
  }
  return {
    ok: true,
    value: open ? null : ohms,
    unit: 'Ω',
    display: open ? 'OL' : formatResistance(ohms),
    overload: open,
  };
}

function readCurrent(p: MeterPlacement, target: MeterCircuit): MeterReading {
  if (p.series !== undefined) {
    const bp = target.breakPoint(p.series);
    if (!bp) return refuse('That is not a break point; open the circuit where an ammeter can be inserted.', 'A');
    const sol = solveCircuit(target.getCircuit());
    let i = sol.currents[bp.elementId] ?? 0;
    if (!bp.forward) i = -i;
    if (p.seriesReversed) i = -i;
    if (Math.abs(i) < 5e-7) i = 0;
    return { ok: true, value: i, unit: 'A', display: `${i.toFixed(3)} A` };
  }
  const nodes = resolveNodes(p, target);
  if ('ok' in nodes) return nodes;
  const across = target.sourceTerminals().some(([plus, minus]) => (plus === nodes.red && minus === nodes.black) || (plus === nodes.black && minus === nodes.red));
  if (across) {
    return refuse('The meter refuses current-mode placement across a source: it would short the source. Break the circuit and insert the meter in series.', 'A');
  }
  if (nodes.red === nodes.black) return { ok: true, value: 0, unit: 'A', display: '0.000 A' };
  const base = target.getCircuit();
  const withShunt: Circuit = {
    elements: [...base.elements, { id: '__ammeter', type: 'resistor', a: nodes.red, b: nodes.black, ohms: AMMETER_SHUNT_OHMS }],
  };
  const sol = solveCircuit(withShunt);
  const i = sol.currents['__ammeter'] ?? 0;
  return { ok: true, value: i, unit: 'A', display: `${i.toFixed(3)} A` };
}
