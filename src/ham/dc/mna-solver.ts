/**
 * Small modified-nodal-analysis DC solver for the ham training layer.
 *
 * Pure, deterministic, no DOM. Nodes are string ids; ground is 'gnd'.
 * Sign conventions (all currents in A, voltages in V, power in W):
 *  - resistor / switch / fuse / diode: current positive flowing a -> b through the element
 *  - vsource: a is +, b is -; current positive when SOURCING (out of the + terminal);
 *    power positive when delivering
 *  - isource: constant-current load/sink draws `amps` from `from`, returns it at `to`
 */

export const GROUND = 'gnd';
const SWITCH_CLOSED_OHMS = 0.001;
const FUSE_CLOSED_OHMS = 0.0001;
const MIN_SOURCE_OHMS = 1e-6;
const GMIN = 1e-9;
const MAX_ITERATIONS = 20;

export interface ResistorEl {
  id: string;
  type: 'resistor';
  a: string;
  b: string;
  ohms: number;
}
export interface VoltageSourceEl {
  id: string;
  type: 'vsource';
  a: string;
  b: string;
  volts: number;
  /** Internal series resistance, ohms (default ~0) */
  rInt?: number;
  /** Output current limit, A; when exceeded the source becomes a constant-current source */
  limitA?: number;
}
export interface CurrentSourceEl {
  id: string;
  type: 'isource';
  from: string;
  to: string;
  amps: number;
}
export interface SwitchEl {
  id: string;
  type: 'switch';
  a: string;
  b: string;
  closed: boolean;
}
export interface FuseEl {
  id: string;
  type: 'fuse';
  a: string;
  b: string;
  ratingA: number;
  blown: boolean;
}
export interface DiodeEl {
  id: string;
  type: 'diode';
  a: string;
  b: string;
  vf: number;
  ron?: number;
}

export type CircuitElement = ResistorEl | VoltageSourceEl | CurrentSourceEl | SwitchEl | FuseEl | DiodeEl;

export interface Circuit {
  elements: CircuitElement[];
}

export interface SolveResult {
  voltages: Record<string, number>;
  currents: Record<string, number>;
  powers: Record<string, number>;
  /** Ids of diodes that ended up forward-biased */
  diodesOn: string[];
  /** Ids of sources that are in current-limit */
  limited: string[];
  iterations: number;
  converged: boolean;
}

function endpoints(el: CircuitElement): [string, string] {
  return el.type === 'isource' ? [el.from, el.to] : [el.a, el.b];
}

/** Solve A*x = b in place with partial pivoting. */
function gaussSolve(m: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    if (piv !== col) {
      [m[piv], m[col]] = [m[col], m[piv]];
      [rhs[piv], rhs[col]] = [rhs[col], rhs[piv]];
    }
    const d = m[col][col];
    if (Math.abs(d) < 1e-30) continue;
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) m[r][c] -= f * m[col][c];
      rhs[r] -= f * rhs[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = rhs[r];
    for (let c = r + 1; c < n; c++) s -= m[r][c] * x[c];
    x[r] = Math.abs(m[r][r]) < 1e-30 ? 0 : s / m[r][r];
  }
  return x;
}

export function solveCircuit(circuit: Circuit): SolveResult {
  const nodeIndex = new Map<string, number>();
  for (const el of circuit.elements) {
    for (const n of endpoints(el)) {
      if (n !== GROUND && !nodeIndex.has(n)) nodeIndex.set(n, nodeIndex.size);
    }
  }
  const n = nodeIndex.size;
  const idx = (node: string): number => (node === GROUND ? -1 : (nodeIndex.get(node) as number));

  const diodeOn = new Set<string>();
  const ccSources = new Set<string>();
  let volts: number[] = new Array<number>(n).fill(0);
  let iterations = 0;
  let converged = false;

  const vOf = (node: string): number => (node === GROUND ? 0 : volts[idx(node)]);
  const sourceOutA = (el: VoltageSourceEl): number => {
    if (ccSources.has(el.id)) return el.limitA as number;
    const g = 1 / Math.max(el.rInt ?? 0, MIN_SOURCE_OHMS);
    return g * (el.volts - (vOf(el.a) - vOf(el.b)));
  };

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const rhs = new Array<number>(n).fill(0);
    const stampG = (a: string, b: string, g: number): void => {
      const ia = idx(a);
      const ib = idx(b);
      if (ia >= 0) m[ia][ia] += g;
      if (ib >= 0) m[ib][ib] += g;
      if (ia >= 0 && ib >= 0) {
        m[ia][ib] -= g;
        m[ib][ia] -= g;
      }
    };
    const inject = (node: string, i: number): void => {
      const k = idx(node);
      if (k >= 0) rhs[k] += i;
    };
    for (let k = 0; k < n; k++) m[k][k] += GMIN;

    for (const el of circuit.elements) {
      switch (el.type) {
        case 'resistor':
          stampG(el.a, el.b, 1 / Math.max(el.ohms, 1e-9));
          break;
        case 'switch':
          if (el.closed) stampG(el.a, el.b, 1 / SWITCH_CLOSED_OHMS);
          break;
        case 'fuse':
          if (!el.blown) stampG(el.a, el.b, 1 / FUSE_CLOSED_OHMS);
          break;
        case 'vsource': {
          if (ccSources.has(el.id)) {
            inject(el.a, el.limitA as number);
            inject(el.b, -(el.limitA as number));
          } else {
            const g = 1 / Math.max(el.rInt ?? 0, MIN_SOURCE_OHMS);
            stampG(el.a, el.b, g);
            inject(el.a, el.volts * g);
            inject(el.b, -el.volts * g);
          }
          break;
        }
        case 'isource':
          inject(el.from, -el.amps);
          inject(el.to, el.amps);
          break;
        case 'diode':
          if (diodeOn.has(el.id)) {
            const g = 1 / (el.ron ?? 0.5);
            stampG(el.a, el.b, g);
            inject(el.a, el.vf * g);
            inject(el.b, -el.vf * g);
          }
          break;
      }
    }
    volts = gaussSolve(m, rhs);

    let changed = false;
    for (const el of circuit.elements) {
      if (el.type === 'diode') {
        const vd = vOf(el.a) - vOf(el.b);
        const on = diodeOn.has(el.id);
        if (!on && vd > el.vf) {
          diodeOn.add(el.id);
          changed = true;
        } else if (on && vd < el.vf) {
          diodeOn.delete(el.id);
          changed = true;
        }
      } else if (el.type === 'vsource' && el.limitA !== undefined) {
        if (ccSources.has(el.id)) {
          if (vOf(el.a) - vOf(el.b) >= el.volts) {
            ccSources.delete(el.id);
            changed = true;
          }
        } else if (sourceOutA(el) > el.limitA) {
          ccSources.add(el.id);
          changed = true;
        }
      }
    }
    if (!changed) {
      converged = true;
      break;
    }
  }

  const voltages: Record<string, number> = { [GROUND]: 0 };
  for (const [name, i] of nodeIndex) voltages[name] = volts[i];
  const currents: Record<string, number> = {};
  const powers: Record<string, number> = {};
  for (const el of circuit.elements) {
    const [pa, pb] = endpoints(el);
    const vd = vOf(pa) - vOf(pb);
    let i = 0;
    switch (el.type) {
      case 'resistor':
        i = vd / Math.max(el.ohms, 1e-9);
        break;
      case 'switch':
        i = el.closed ? vd / SWITCH_CLOSED_OHMS : 0;
        break;
      case 'fuse':
        i = el.blown ? 0 : vd / FUSE_CLOSED_OHMS;
        break;
      case 'vsource':
        i = sourceOutA(el);
        break;
      case 'isource':
        i = el.amps;
        break;
      case 'diode':
        i = diodeOn.has(el.id) ? (vd - el.vf) / (el.ron ?? 0.5) : 0;
        break;
    }
    currents[el.id] = i;
    powers[el.id] = vd * i;
  }
  return {
    voltages,
    currents,
    powers,
    diodesOn: [...diodeOn],
    limited: [...ccSources],
    iterations,
    converged,
  };
}
