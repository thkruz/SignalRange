/**
 * @file rf-path - resolves the RF chain from a port outward to its termination
 * @description Connector compatibility, partly seated connectors, per-element loss,
 * reflections (complex, with phase) and termination safety. Pure and deterministic.
 */

import type { HamConnection, PortDef } from '../ham-types';
import { type AntennaState, antennaGamma } from './antenna-model';
import { type Cx, cx, cxAbs, cxAdd, cxMul, cxPolar, swrFromGamma } from './complex';
import { type CoaxState, coaxDiscontinuity, coaxElectricalLengthM, coaxLossDb } from './feedline';

export type RfDeviceKind = 'radio' | 'coax' | 'adapter' | 'swr-meter' | 'dummy-load' | 'cal-load' | 'analyzer' | 'antenna' | 'duplexer' | 'sdr';

/** Minimal RF-side descriptor of a station device (the manager maps its device records to this) */
export interface RfDevice {
  id: string;
  kind: RfDeviceKind;
  label?: string;
  ports: readonly PortDef[];
  coax?: CoaxState;
  antenna?: AntennaState;
  /** Insertion loss of adapters, meters, duplexers; dB */
  insertionLossDb?: number;
}

/** 'radio' is what a path ends in when a transmitter sits at the far end (unsafe for analyzers) */
export type RfTermination = 'antenna' | 'dummy-load' | 'cal-load' | 'analyzer' | 'open' | 'sdr-input' | 'radio';

export interface RfDiscontinuity {
  /** Position within the element 0..1 */
  pos: number;
  gamma: Cx;
  blocking: boolean;
}

export interface RfPathElement {
  deviceId: string;
  kind: RfDeviceKind | 'connection';
  /** One-way loss at the path frequency, dB */
  lossDb: number;
  /** Electrical length, m (physical / VF) */
  electricalLengthM: number;
  discontinuities: RfDiscontinuity[];
  /** connection elements: the HamConnection id */
  connectionId?: string;
}

export interface SwrMeterPlacement {
  elementIndex: number;
  deviceId: string;
  /** One-way loss between the path start and the meter, dB */
  lossToMeterDb: number;
  /** Gamma seen looking beyond the meter */
  gamma: Cx;
  swr: number;
}

export interface RfPath {
  startDeviceId: string;
  startPortId: string;
  freqMHz: number;
  elements: RfPathElement[];
  totalLossDb: number;
  termination: RfTermination;
  terminationDeviceId: string | null;
  antennaDeviceId: string | null;
  /** Load reflection at the termination plane */
  loadGamma: Cx;
  /** Gamma at the start reference plane (the radio / analyzer port) */
  gammaAtStart: Cx;
  swrAtStart: number;
  swrMeter: SwrMeterPlacement | null;
  /** False when a mating was refused: the chain is cut there and reads as open */
  valid: boolean;
  brokenReason: string | null;
  safeToTransmit: boolean;
  /** Operator-facing text when not safe */
  refusal: string | null;
}

export type ConnectionCheck = { ok: true } | { ok: false; reason: string };

const C_M_S = 299_792_458;

/** Whether two ports can mate (same family; plug-jack, or genderless-genderless) */
export function validateConnection(a: PortDef, b: PortDef): ConnectionCheck {
  if (a.family !== b.family) return { ok: false, reason: `${a.family} does not fit ${b.family}. An adapter is needed.` };
  const g = [a.gender, b.gender];
  if (g[0] === 'genderless' && g[1] === 'genderless') return { ok: true };
  if (g[0] === 'genderless' || g[1] === 'genderless') return { ok: false, reason: 'A genderless connector only mates with another genderless connector.' };
  if (g[0] === g[1]) return { ok: false, reason: `Two ${g[0]} connectors cannot mate: one end must be a plug and the other a jack.` };
  return { ok: true };
}

export const TX_REFUSALS: Readonly<Record<'cal-load' | 'analyzer' | 'sdr-input' | 'open' | 'radio', string>> = {
  'cal-load': 'Transmit blocked: the calibration load is rated 0.5 W. Transmitting into it would destroy it. Use the 100 W dummy load.',
  analyzer: 'Transmit blocked: this path ends at an antenna analyzer port. Transmitting into an analyzer destroys its front end.',
  'sdr-input': 'Transmit blocked: this path ends at a receive-only SDR input. Transmitting into it destroys the front end.',
  open: 'Transmit blocked: the RF path is open (nothing, or a broken connection, at the far end). Transmitting into an open circuit can damage the final amplifier.',
  radio: 'Transmit blocked: this path ends at another radio. Do not connect two transmitters.',
};

/** Deterministic partly-seated loss for a connection, 6..15 dB */
export function looseConnectionLossDb(connectionId: string): number {
  let h = 0;
  for (let i = 0; i < connectionId.length; i += 1) h = (h * 31 + connectionId.charCodeAt(i)) % 997;
  return 6 + (h % 10);
}

const rfPorts = (d: RfDevice): PortDef[] => d.ports.filter((p) => p.role === 'rf');
const TERMINALS: ReadonlySet<RfDeviceKind> = new Set(['antenna', 'dummy-load', 'cal-load', 'analyzer', 'sdr', 'radio']);

function exitPort(d: RfDevice, enteredPortId: string, fMHz: number): PortDef | null {
  const ports = rfPorts(d);
  if (d.kind === 'duplexer') {
    if (enteredPortId === 'common') return ports.find((p) => p.id === (fMHz < 300 ? 'vhf' : 'uhf')) ?? null;
    return ports.find((p) => p.id === 'common') ?? null;
  }
  return ports.find((p) => p.id !== enteredPortId) ?? null;
}

function deviceElement(d: RfDevice, fMHz: number): RfPathElement {
  if (d.kind === 'coax' && d.coax) {
    const disc = coaxDiscontinuity(d.coax);
    return {
      deviceId: d.id,
      kind: 'coax',
      lossDb: coaxLossDb(d.coax, fMHz),
      electricalLengthM: coaxElectricalLengthM(d.coax),
      discontinuities: disc ? [{ pos: disc.pos, gamma: disc.gamma, blocking: disc.blocking }] : [],
    };
  }
  const defaultLoss = d.kind === 'swr-meter' ? 0.1 : d.kind === 'adapter' ? 0.1 : d.kind === 'duplexer' ? 0.5 : 0;
  return { deviceId: d.id, kind: d.kind, lossDb: d.insertionLossDb ?? defaultLoss, electricalLengthM: 0, discontinuities: [] };
}

function loadGammaFor(d: RfDevice, fMHz: number): Cx {
  switch (d.kind) {
    case 'antenna':
      return d.antenna ? antennaGamma(d.antenna, fMHz) : cx(1);
    case 'sdr':
      return cx(0.1);
    case 'dummy-load':
    case 'cal-load':
    case 'analyzer':
    case 'radio':
      return cx(0);
    default:
      return cx(1);
  }
}

/**
 * Gamma seen looking into `elements[fromIndex..]` from the plane before fromIndex,
 * with the termination `loadGamma` at the end. Single-bounce model: each discontinuity
 * and the load reflect once, attenuated by 2x the cable loss to them, with round-trip phase.
 */
export function gammaBeyond(path: Pick<RfPath, 'elements' | 'loadGamma' | 'freqMHz'>, fromIndex: number): Cx {
  let sum = cx(0);
  let cumLoss = 0;
  let cumLen = 0;
  const k = (2 * Math.PI * path.freqMHz * 1e6) / C_M_S;
  for (let i = fromIndex; i < path.elements.length; i += 1) {
    const el = path.elements[i];
    for (const disc of el.discontinuities) {
      const loss = cumLoss + disc.pos * el.lossDb;
      const len = cumLen + disc.pos * el.electricalLengthM;
      sum = cxAdd(sum, cxMul(disc.gamma, cxPolar(10 ** (-loss / 10), -2 * k * len)));
      if (disc.blocking) return sum;
    }
    cumLoss += el.lossDb;
    cumLen += el.electricalLengthM;
  }
  return cxAdd(sum, cxMul(path.loadGamma, cxPolar(10 ** (-cumLoss / 10), -2 * k * cumLen)));
}

export interface ResolveOptions {
  startDeviceId: string;
  /** Default 'ant' */
  startPortId?: string;
  freqMHz: number;
}

/** Resolve the chain from a device port outward to its termination */
export function resolveRfPath(devices: Readonly<Record<string, RfDevice>>, connections: readonly HamConnection[], opts: ResolveOptions): RfPath {
  const f = opts.freqMHz;
  const startPort = opts.startPortId ?? 'ant';
  const elements: RfPathElement[] = [];
  let termination: RfTermination = 'open';
  let terminationDeviceId: string | null = null;
  let antennaDeviceId: string | null = null;
  let valid = true;
  let brokenReason: string | null = null;
  let loadGamma = cx(1);
  let meterIndex = -1;

  const find = (deviceId: string, portId: string): { other: { deviceId: string; portId: string }; conn: HamConnection } | null => {
    for (const c of connections) {
      if (c.a.deviceId === deviceId && c.a.portId === portId) return { other: c.b, conn: c };
      if (c.b.deviceId === deviceId && c.b.portId === portId) return { other: c.a, conn: c };
    }
    return null;
  };

  let curDev = devices[opts.startDeviceId];
  let curPortId = startPort;
  for (let hop = 0; hop < 16 && curDev; hop += 1) {
    const link = find(curDev.id, curPortId);
    if (!link) break; // open end
    const next = devices[link.other.deviceId];
    const portA = curDev.ports.find((p) => p.id === curPortId);
    const portB = next?.ports.find((p) => p.id === link.other.portId);
    if (!next || !portA || !portB) break;
    const check = validateConnection(portA, portB);
    if (check.ok === false) {
      valid = false;
      brokenReason = check.reason;
      break;
    }
    if (!link.conn.seated) {
      elements.push({
        deviceId: link.conn.id,
        kind: 'connection',
        lossDb: looseConnectionLossDb(link.conn.id),
        electricalLengthM: 0,
        discontinuities: [{ pos: 0, gamma: cx(0.4), blocking: false }],
        connectionId: link.conn.id,
      });
    }
    if (TERMINALS.has(next.kind)) {
      terminationDeviceId = next.id;
      if (next.kind === 'antenna') {
        termination = 'antenna';
        antennaDeviceId = next.id;
      } else if (next.kind === 'sdr') termination = 'sdr-input';
      else termination = next.kind as RfTermination;
      loadGamma = loadGammaFor(next, f);
      break;
    }
    if (next.kind === 'swr-meter' && meterIndex < 0) meterIndex = elements.length;
    elements.push(deviceElement(next, f));
    const out = exitPort(next, link.other.portId, f);
    if (!out) break;
    curDev = next;
    curPortId = out.id;
  }

  const partial = { elements, loadGamma, freqMHz: f };
  const gammaAtStart = gammaBeyond(partial, 0);
  const totalLossDb = elements.reduce((s, e) => s + e.lossDb, 0);

  let swrMeter: SwrMeterPlacement | null = null;
  if (meterIndex >= 0) {
    const g = gammaBeyond(partial, meterIndex + 1);
    swrMeter = {
      elementIndex: meterIndex,
      deviceId: elements[meterIndex].deviceId,
      lossToMeterDb: elements.slice(0, meterIndex).reduce((s, e) => s + e.lossDb, 0),
      gamma: g,
      swr: swrFromGamma(g),
    };
  }

  const unsafeKey = termination === 'antenna' || termination === 'dummy-load' ? null : termination;
  // A blocking fault (open/short coax) also makes the path unsafe: the transmitter sees a total reflection.
  const blocked = elements.some((e) => e.discontinuities.some((d) => d.blocking));
  const safe = unsafeKey === null && !blocked && valid;
  return {
    startDeviceId: opts.startDeviceId,
    startPortId: startPort,
    freqMHz: f,
    elements,
    totalLossDb,
    termination,
    terminationDeviceId,
    antennaDeviceId,
    loadGamma,
    gammaAtStart,
    swrAtStart: swrFromGamma(gammaAtStart),
    swrMeter,
    valid,
    brokenReason,
    safeToTransmit: safe,
    refusal: safe ? null : TX_REFUSALS[(unsafeKey ?? 'open') as keyof typeof TX_REFUSALS],
  };
}

/** |Gamma| at the antenna itself, unchanged by feedline loss (the "antenna is still bad" check) */
export const loadGammaMag = (path: RfPath): number => cxAbs(path.loadGamma);

/** Attenuation factor (linear power) for the one-way loss of the path */
export const pathPowerFactor = (path: RfPath): number => 10 ** (-path.totalLossDb / 10);

/* ---------------- device factories ---------------- */

const rfPort = (id: string, label: string, family: PortDef['family'], gender: PortDef['gender']): PortDef => ({ id, label, family, gender, role: 'rf' });

export function coaxDevice(id: string, coax: CoaxState, endA: { family: PortDef['family']; gender: PortDef['gender'] } = { family: 'UHF', gender: 'plug' }, endB = endA): RfDevice {
  return { id, kind: 'coax', coax, ports: [rfPort('a', 'End A', endA.family, endA.gender), rfPort('b', 'End B', endB.family, endB.gender)] };
}

export function adapterDevice(id: string, a: { family: PortDef['family']; gender: PortDef['gender'] }, b: { family: PortDef['family']; gender: PortDef['gender'] }): RfDevice {
  return { id, kind: 'adapter', ports: [rfPort('a', 'Side A', a.family, a.gender), rfPort('b', 'Side B', b.family, b.gender)] };
}

export function terminalDevice(
  id: string,
  kind: 'dummy-load' | 'cal-load' | 'analyzer' | 'sdr' | 'antenna',
  family: PortDef['family'],
  gender: PortDef['gender'],
  antenna?: AntennaState
): RfDevice {
  return { id, kind, antenna, ports: [rfPort(kind === 'analyzer' ? 'rf' : 'in', 'RF', family, gender)] };
}

export function swrMeterDevice(id: string): RfDevice {
  return { id, kind: 'swr-meter', ports: [rfPort('tx', 'TX', 'UHF', 'plug'), rfPort('ant', 'ANT', 'UHF', 'jack')] };
}
