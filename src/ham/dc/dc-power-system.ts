/**
 * Mobile/base radio DC power system (S6/S7/S12): regulated supply or battery,
 * fused DC lead with loop resistance, constant-current radio load with
 * brownout reset. Pure model; JSON-serializable state; implements MeterCircuit.
 */
import { MOBILE_PROFILE } from '../ham-profiles';
import { Circuit, CircuitElement, SolveResult, solveCircuit } from './mna-solver';
import type { MeterCircuit } from './multimeter';

export type DcFault = 'high-resistance-lead' | 'supply-current-limit' | 'reversed-polarity';
export type SourceKind = 'supply' | 'battery';
export type RadioState = 'on' | 'rebooting';

export const GOOD_LEAD_OHMS = 0.03;
export const HIGH_RESISTANCE_LEAD_OHMS = 0.3;
export const SUPPLY_NOMINAL_V = 13.8;
export const SUPPLY_LIMIT_A = 20;
export const LOW_SUPPLY_LIMIT_A = 5;
export const LEAD_FUSE_A = 15;
export const RADIO_REBOOT_S = 2;
export const BATTERY_INTERNAL_OHMS = 0.03;
export const DEFAULT_RF_OUT_W = 50;

/** LiFePO4-ish open-circuit voltage vs state of charge (0..1). */
const OCV_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 12.0],
  [0.05, 12.6],
  [0.2, 13.0],
  [0.5, 13.2],
  [0.9, 13.3],
  [1, 13.3],
];

export function batteryOcv(soc: number): number {
  const s = Math.min(1, Math.max(0, soc));
  for (let i = 1; i < OCV_CURVE.length; i++) {
    const [s1, v1] = OCV_CURVE[i];
    const [s0, v0] = OCV_CURVE[i - 1];
    if (s <= s1) return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0 || 1);
  }
  return OCV_CURVE[OCV_CURVE.length - 1][1];
}

export interface BrownoutSample {
  vSource: number;
  vRadio: number;
  currentA: number;
  timeS: number;
}

export interface DcSystemState {
  source: SourceKind;
  supplyV: number;
  supplyLimitA: number;
  battery: { capacityWh: number; energyWh: number; rIntOhms: number };
  leadOhms: number;
  fuseRatingA: number;
  fuseBlown: boolean;
  /** Fuse physically pulled from its holder: the lead is open */
  fuseOut: boolean;
  sourceConnected: boolean;
  polarityReversed: boolean;
  faults: DcFault[];
  radioState: RadioState;
  rebootRemainingS: number;
  /** After a reset, TX needs a fresh key-up */
  txLocked: boolean;
  ptt: boolean;
  timeS: number;
  resetCount: number;
  lastBrownout: BrownoutSample | null;
  /** Optional transmit current override (A), set by the station when the load follows the radio power setting */
  txCurrentA?: number;
}

export interface DcSystemOptions {
  source?: SourceKind;
  batteryUsableWh?: number;
  batterySoc?: number;
  leadOhms?: number;
  fault?: DcFault;
  /** The transmit current follows the radio power setting (about 2 A at 5 W, 8 A at 50 W) */
  txScalesWithPower?: boolean;
}

const TEST_POINTS: Readonly<Record<string, string>> = {
  'psu+': 'src',
  'psu-': 'gnd',
  'lead-mid': 'mid',
  'radio+': 'radio+',
  'radio-': 'gnd',
};

export class DcPowerSystem implements MeterCircuit {
  state: DcSystemState;

  constructor(opts: DcSystemOptions = {}) {
    const wh = opts.batteryUsableWh ?? 100;
    this.state = {
      source: opts.source ?? 'supply',
      supplyV: SUPPLY_NOMINAL_V,
      supplyLimitA: SUPPLY_LIMIT_A,
      battery: { capacityWh: wh, energyWh: wh * (opts.batterySoc ?? 1), rIntOhms: BATTERY_INTERNAL_OHMS },
      leadOhms: opts.leadOhms ?? GOOD_LEAD_OHMS,
      fuseRatingA: LEAD_FUSE_A,
      fuseBlown: false,
      fuseOut: false,
      sourceConnected: true,
      polarityReversed: false,
      faults: [],
      radioState: 'on',
      rebootRemainingS: 0,
      txLocked: false,
      ptt: false,
      timeS: 0,
      resetCount: 0,
      lastBrownout: null,
    };
    if (opts.fault) this.injectFault(opts.fault);
  }

  // ---- faults / repairs ----
  injectFault(fault: DcFault): void {
    if (!this.state.faults.includes(fault)) this.state.faults.push(fault);
    if (fault === 'high-resistance-lead') this.state.leadOhms = HIGH_RESISTANCE_LEAD_OHMS;
    if (fault === 'supply-current-limit') this.state.supplyLimitA = LOW_SUPPLY_LIMIT_A;
    if (fault === 'reversed-polarity') this.state.polarityReversed = true;
  }

  /** Repair or replace the lead (0.03 ohm). The inline fuse rating must be retained. */
  replaceLead(opts: { fuseRatingA?: number } = {}): { ok: boolean; reason?: string } {
    if (opts.fuseRatingA !== undefined && opts.fuseRatingA !== this.state.fuseRatingA) {
      return { ok: false, reason: `Keep the original ${this.state.fuseRatingA} A inline fuse; a larger fuse defeats the protection.` };
    }
    this.state.leadOhms = GOOD_LEAD_OHMS;
    this.state.faults = this.state.faults.filter((f) => f !== 'high-resistance-lead');
    return { ok: true };
  }

  fixPolarity(): void {
    this.state.polarityReversed = false;
    this.state.faults = this.state.faults.filter((f) => f !== 'reversed-polarity');
  }

  replaceFuse(ratingA: number): { ok: boolean; reason?: string } {
    if (ratingA !== LEAD_FUSE_A) return { ok: false, reason: `Replace the fuse with the original ${LEAD_FUSE_A} A rating.` };
    this.state.fuseBlown = false;
    this.state.fuseOut = false;
    return { ok: true };
  }

  /** Pull the inline fuse from its holder; the radio loses power. */
  pullFuse(): void {
    this.state.fuseOut = true;
  }

  /** Put the pulled fuse back. A blown element stays blown. */
  refitFuse(): void {
    this.state.fuseOut = false;
  }

  setSupplyLimit(limitA: number): void {
    this.state.supplyLimitA = limitA;
  }

  // ---- model ----
  private sourceVolts_(): number {
    const s = this.state;
    if (s.source === 'battery') return s.battery.energyWh <= 0 ? 0 : batteryOcv(s.battery.energyWh / s.battery.capacityWh);
    return s.supplyV;
  }

  /** Over-current supply folds back: output sags in proportion to the shortfall. */
  private effectiveVolts_(loadA: number): number {
    const s = this.state;
    const v = this.sourceVolts_();
    return s.source === 'supply' && loadA > s.supplyLimitA ? v * (s.supplyLimitA / loadA) : v;
  }

  private radioLoadA_(ptt: boolean): number {
    const s = this.state;
    if (s.radioState !== 'on' || s.polarityReversed || s.fuseBlown || s.fuseOut) return 0;
    const tx = ptt && !s.txLocked;
    return tx ? (s.txCurrentA ?? MOBILE_PROFILE.power.txCurrentA ?? 8) : (MOBILE_PROFILE.power.rxCurrentA ?? 1);
  }

  private build_(energized: boolean, loadA: number, volts: number): CircuitElement[] {
    const s = this.state;
    const els: CircuitElement[] = [
      { id: 'lead-fuse', type: 'fuse', a: 'src', b: 'mid', ratingA: s.fuseRatingA, blown: s.fuseBlown || s.fuseOut },
      { id: 'lead-r1', type: 'resistor', a: 'mid', b: 'radio+', ohms: s.leadOhms },
    ];
    if (energized) {
      const signed = s.polarityReversed ? -volts : volts;
      els.unshift({
        id: 'V1',
        type: 'vsource',
        a: 'src',
        b: 'gnd',
        volts: signed,
        rInt: s.source === 'battery' ? s.battery.rIntOhms : 0,
      });
      if (loadA > 0) els.push({ id: 'radio', type: 'isource', from: 'radio+', to: 'gnd', amps: loadA });
    }
    return els;
  }

  /** Solve the present state, applying supply foldback (sag) and fuse overload. */
  private solveFor_(ptt: boolean): { sol: SolveResult; loadA: number; vSrc: number } {
    const s = this.state;
    const loadA = this.radioLoadA_(ptt);
    const volts = this.effectiveVolts_(loadA);
    const sol = solveCircuit({ elements: this.build_(s.sourceConnected, loadA, volts) });
    return { sol, loadA, vSrc: sol.voltages['src'] ?? 0 };
  }

  getCircuit(): Circuit {
    const loadA = this.radioLoadA_(this.state.ptt);
    return { elements: this.build_(this.state.sourceConnected, loadA, this.effectiveVolts_(loadA)) };
  }
  getDeenergizedCircuit(): Circuit {
    return { elements: this.build_(false, 0, 0) };
  }
  isEnergized(): boolean {
    return this.state.sourceConnected;
  }
  /** Plug/unplug the source (isolate power before using OHM/CONT). */
  setSourceConnected(connected: boolean): void {
    this.state.sourceConnected = connected;
  }
  testPointNode(name: string): string | undefined {
    return TEST_POINTS[name];
  }
  breakPoint(name: string): { elementId: string; forward: boolean } | undefined {
    return name === 'dc-lead' ? { elementId: 'lead-fuse', forward: true } : undefined;
  }
  sourceTerminals(): Array<[string, string]> {
    return [['src', 'gnd']];
  }

  /** Present electrical snapshot. */
  measure(): { vSource: number; vRadio: number; currentA: number; dcInputW: number } {
    const { sol, loadA } = this.solveFor_(this.state.ptt);
    const vRadio = sol.voltages['radio+'] ?? 0;
    return { vSource: sol.voltages['src'] ?? 0, vRadio, currentA: loadA, dcInputW: vRadio * loadA };
  }

  /** Efficiency while transmitting: RF out over DC in (default 50 W RF). */
  efficiency(rfOutW: number = DEFAULT_RF_OUT_W): { dcInputW: number; rfOutW: number; efficiency: number; lossW: number } {
    const tx = MOBILE_PROFILE.power.txCurrentA ?? 8;
    const dcInputW = (MOBILE_PROFILE.power.nominalV ?? SUPPLY_NOMINAL_V) * tx;
    return { dcInputW, rfOutW, efficiency: rfOutW / dcInputW, lossW: dcInputW - rfOutW };
  }

  /** Advance time; handles brownout reset, fuse overload and battery drain. */
  tick(dtS: number, input: { ptt: boolean }): void {
    const s = this.state;
    s.timeS += dtS;
    s.ptt = input.ptt;
    if (!input.ptt) s.txLocked = false;

    if (s.radioState === 'rebooting') {
      s.rebootRemainingS -= dtS;
      if (s.rebootRemainingS <= 0) {
        s.rebootRemainingS = 0;
        s.radioState = 'on';
      }
    }

    // Reversed polarity: the inline fuse blows, radio is protected and does not power.
    if (s.polarityReversed && !s.fuseBlown) s.fuseBlown = true;

    const { sol, loadA, vSrc } = this.solveFor_(input.ptt);
    const vRadio = sol.voltages['radio+'] ?? 0;
    const fuseI = Math.abs(sol.currents['lead-fuse'] ?? 0);
    if (fuseI > s.fuseRatingA * 1.25) s.fuseBlown = true;

    const transmitting = s.radioState === 'on' && input.ptt && !s.txLocked && loadA > (MOBILE_PROFILE.power.rxCurrentA ?? 1);
    if (transmitting && vRadio < (MOBILE_PROFILE.power.minOperatingV ?? 11.5)) {
      s.lastBrownout = { vSource: vSrc, vRadio, currentA: loadA, timeS: s.timeS };
      s.resetCount++;
      s.radioState = 'rebooting';
      s.rebootRemainingS = RADIO_REBOOT_S;
      s.txLocked = true;
      return;
    }

    if (s.source === 'battery' && loadA > 0) {
      const wh = (vSrc * loadA * dtS) / 3600;
      s.battery.energyWh = Math.max(0, s.battery.energyWh - wh);
    }
  }

  /** True while the radio is actually transmitting. */
  isTransmitting(): boolean {
    const s = this.state;
    return s.radioState === 'on' && s.ptt && !s.txLocked && !s.fuseBlown && !s.fuseOut && !s.polarityReversed;
  }

  batterySoc(): number {
    return this.state.battery.energyWh / this.state.battery.capacityWh;
  }
}
