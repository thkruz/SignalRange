/**
 * S2 low-voltage training board: 12 V current-limited supply, a resistor
 * branch (SW1 + R1) and a switched LED indicator branch, with a removable fuse.
 * Pure model; JSON-serializable state; implements MeterCircuit for the DMM.
 */

import { Circuit, CircuitElement, SolveResult, solveCircuit } from './mna-solver';
import type { MeterCircuit } from './multimeter';

export type BoardFault = 'open-switch-contact' | 'reversed-led' | 'blown-fuse';
export type FuseState = 'installed' | 'removed' | 'blown';

export const BOARD_SUPPLY_V = 12;
export const BOARD_SUPPLY_LIMIT_A = 1.5;
export const R1_OHMS = 120;
export const R1_RATED_W = 2;
export const LED_SERIES_OHMS = 470;
export const LED_VF = 2.0;
export const F1_RATING_A = 0.5;

export type SchematicSymbolId = 'resistor' | 'capacitor' | 'inductor' | 'diode' | 'led' | 'transistor' | 'switch-spst' | 'battery' | 'fuse' | 'relay';

export interface BoardComponentInfo {
  refdes: string;
  symbolId: SchematicSymbolId;
  label: string;
  value: string;
  /** False for loose parts shown for the symbol-matching exercise only */
  inCircuit: boolean;
}

export const BOARD_COMPONENTS: readonly BoardComponentInfo[] = [
  { refdes: 'R1', symbolId: 'resistor', label: 'Resistor', value: '120 Ω, 2 W', inCircuit: true },
  { refdes: 'R2', symbolId: 'resistor', label: 'LED series resistor', value: '470 Ω', inCircuit: true },
  { refdes: 'C1', symbolId: 'capacitor', label: 'Capacitor', value: '100 µF', inCircuit: false },
  { refdes: 'L1', symbolId: 'inductor', label: 'Inductor', value: '10 µH', inCircuit: false },
  { refdes: 'D1', symbolId: 'diode', label: 'Diode', value: '1N4001', inCircuit: false },
  { refdes: 'LED1', symbolId: 'led', label: 'Indicator LED', value: 'red, Vf 2.0 V', inCircuit: true },
  { refdes: 'Q1', symbolId: 'transistor', label: 'Indicator driver transistor', value: 'NPN switch', inCircuit: true },
  { refdes: 'SW1', symbolId: 'switch-spst', label: 'Branch switch', value: 'SPST', inCircuit: true },
  { refdes: 'BT1', symbolId: 'battery', label: 'Supply (12 V)', value: '12 V', inCircuit: true },
  { refdes: 'F1', symbolId: 'fuse', label: 'Supply fuse', value: '0.5 A', inCircuit: true },
  { refdes: 'K1', symbolId: 'relay', label: 'Relay', value: '12 V coil', inCircuit: false },
];

/** Named test points -> solver node. */
const TEST_POINTS: Readonly<Record<string, string>> = {
  'tp-supply+': 'sup',
  'tp-supply-': 'gnd',
  'tp-f1-in': 'sup',
  'tp-f1-out': 'bus',
  'tp-sw1-in': 'bus',
  'tp-sw1-out': 'sw1o',
  'tp-r1-a': 'r1a',
  'tp-r1-b': 'gnd',
  'tp-q1-out': 'ledq',
  'tp-led-a': 'led-a',
  'tp-led-k': 'led-k',
  'tp-gnd': 'gnd',
};

/** Series break points -> link element and orientation. */
const BREAK_POINTS: Readonly<Record<string, { elementId: string; forward: boolean }>> = {
  'r1-branch': { elementId: 'link-r1', forward: true },
  'led-branch': { elementId: 'link-led', forward: true },
  'supply-feed': { elementId: 'F1', forward: true },
};

export interface BoardState {
  powered: boolean;
  sw1On: boolean;
  faults: BoardFault[];
  fuse: FuseState;
  fuseRatingA: number;
}

export interface BranchReport {
  currentA: number;
  powerW: number;
  ratedW: number;
  withinRating: boolean;
}

export class CircuitBoard implements MeterCircuit {
  state: BoardState;

  constructor(initial?: Partial<BoardState>) {
    this.state = {
      powered: false,
      sw1On: false,
      faults: [],
      fuse: 'installed',
      fuseRatingA: F1_RATING_A,
      ...initial,
    };
    if (this.state.faults.includes('blown-fuse')) this.state.fuse = 'blown';
  }

  // ---- controls ----
  setPower(on: boolean): void {
    this.state.powered = on;
  }
  setSwitch(on: boolean): void {
    this.state.sw1On = on;
  }

  injectFault(fault: BoardFault): void {
    if (!this.state.faults.includes(fault)) this.state.faults.push(fault);
    if (fault === 'blown-fuse') this.state.fuse = 'blown';
  }

  hasFault(fault: BoardFault): boolean {
    return this.state.faults.includes(fault);
  }

  /** Repair the open SW1 contact (also clears reversed LED when asked). */
  repair(fault: BoardFault): void {
    this.state.faults = this.state.faults.filter((f) => f !== fault);
  }

  removeFuse(): void {
    this.state.fuse = 'removed';
  }

  /** Fit a fuse. Wrong rating is refused (the board only accepts the original rating). */
  installFuse(ratingA: number): { ok: boolean; reason?: string } {
    if (Math.abs(ratingA - F1_RATING_A) > 1e-9) {
      return { ok: false, reason: `F1 must be replaced with the original ${F1_RATING_A} A rating, not ${ratingA} A.` };
    }
    this.state.fuse = 'installed';
    this.state.fuseRatingA = ratingA;
    this.state.faults = this.state.faults.filter((f) => f !== 'blown-fuse');
    return { ok: true };
  }

  // ---- MeterCircuit ----
  private elements_(energized: boolean): CircuitElement[] {
    const s = this.state;
    const contactOpen = this.hasFault('open-switch-contact');
    const reversed = this.hasFault('reversed-led');
    const els: CircuitElement[] = [
      { id: 'F1', type: 'fuse', a: 'sup', b: 'bus', ratingA: s.fuseRatingA, blown: s.fuse !== 'installed' },
      { id: 'SW1', type: 'switch', a: 'bus', b: 'sw1o', closed: s.sw1On && !contactOpen },
      { id: 'link-r1', type: 'resistor', a: 'sw1o', b: 'r1a', ohms: 0.001 },
      { id: 'R1', type: 'resistor', a: 'r1a', b: 'gnd', ohms: R1_OHMS },
      { id: 'Q1', type: 'switch', a: 'bus', b: 'ledq', closed: s.sw1On },
      { id: 'link-led', type: 'resistor', a: 'ledq', b: 'led-a0', ohms: 0.001 },
      { id: 'R2', type: 'resistor', a: 'led-a0', b: 'led-a', ohms: LED_SERIES_OHMS },
      reversed ? { id: 'LED1', type: 'diode', a: 'led-k', b: 'led-a', vf: LED_VF, ron: 10 } : { id: 'LED1', type: 'diode', a: 'led-a', b: 'led-k', vf: LED_VF, ron: 10 },
      { id: 'wire-k', type: 'resistor', a: 'led-k', b: 'gnd', ohms: 0.001 },
    ];
    if (energized) {
      els.unshift({
        id: 'V1',
        type: 'vsource',
        a: 'sup',
        b: 'gnd',
        volts: BOARD_SUPPLY_V,
        rInt: 0.01,
        limitA: BOARD_SUPPLY_LIMIT_A,
      });
    }
    return els;
  }

  getCircuit(): Circuit {
    return { elements: this.elements_(this.state.powered) };
  }
  getDeenergizedCircuit(): Circuit {
    return { elements: this.elements_(false) };
  }
  isEnergized(): boolean {
    return this.state.powered;
  }
  testPointNode(name: string): string | undefined {
    return TEST_POINTS[name];
  }
  breakPoint(name: string): { elementId: string; forward: boolean } | undefined {
    return BREAK_POINTS[name];
  }
  sourceTerminals(): Array<[string, string]> {
    return [['sup', 'gnd']];
  }

  testPointNames(): string[] {
    return Object.keys(TEST_POINTS);
  }
  breakPointNames(): string[] {
    return Object.keys(BREAK_POINTS);
  }

  solve(): SolveResult {
    return solveCircuit(this.getCircuit());
  }

  /** R1 branch current/power vs its rating. */
  r1Report(): BranchReport {
    const sol = this.solve();
    const currentA = sol.currents['R1'] ?? 0;
    const powerW = sol.powers['R1'] ?? 0;
    return { currentA, powerW, ratedW: R1_RATED_W, withinRating: powerW <= R1_RATED_W };
  }

  ledLit(): boolean {
    return this.solve().diodesOn.includes('LED1');
  }

  components(): readonly BoardComponentInfo[] {
    return BOARD_COMPONENTS;
  }
}
