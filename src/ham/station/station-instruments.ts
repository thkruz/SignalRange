/**
 * @file station-instruments - Multimeter, inline SWR meter, antenna analyzer and coax DC test
 * @description Each reading is logged as a `HamMeasurement` with the current revision and whether
 * the circuit was under load, so conditions can reject stale or no-load evidence.
 */

import type { MeterCircuit, MeterMode, MeterPlacement, RedSocket } from '../dc/multimeter';
import { OPEN_CIRCUIT_OHMS } from '../dc/multimeter';
import type { HamMeasurement } from '../ham-types';
import { txFrequencyMHz } from '../radio/radio-settings';
import { coaxDcTest } from '../rf/feedline';
import { analyzerSweep, readInlineSwrMeter } from '../rf/instruments';
import { type ActionResult, done, refuse, type StationCore } from './station-core';
import { liveConnections, rfDeviceTable } from './station-devices';

const QUANTITY: Record<MeterMode, string> = { DCV: 'voltage', DCA: 'current', OHM: 'resistance', CONT: 'continuity', OFF: 'off' };

function measure(core: StationCore, m: Omit<HamMeasurement, 'id' | 'tS' | 'revision'>): HamMeasurement {
  return core.log.measurement({ ...m, tS: core.state.nowS, revision: core.state.revision });
}

function circuit(core: StationCore, id: string | null): { kind: 'board' | 'dc'; target: MeterCircuit } | null {
  if (!id) return null;
  const b = core.boards.get(id);
  if (b) return { kind: 'board', target: b };
  const dc = core.dcSystems.get(id);

  return dc ? { kind: 'dc', target: dc } : null;
}

export function meterMode(core: StationCore, mode: MeterMode): ActionResult {
  core.meter.setMode(mode);
  core.event(`meter:mode:${mode}`);

  return done(`Meter set to ${mode}.`);
}

export function meterSocket(core: StationCore, socket: RedSocket): ActionResult {
  core.meter.setRedSocket(socket);
  core.event(`meter:socket:${socket}`);

  return done(`Red lead moved to the ${socket} socket.`);
}

export function meterPlace(core: StationCore, targetId: string, placement: MeterPlacement): ActionResult {
  const c = circuit(core, targetId);
  if (!c) return refuse(`${targetId} has no test points for the meter.`, 'no-test-points');
  const away = core.reachable(targetId);
  if (away) return away;
  core.meter.place(placement);
  core.state.meter.targetId = targetId;

  return done('Probes placed.');
}

export function meterRead(core: StationCore): ActionResult {
  const c = circuit(core, core.state.meter.targetId);
  if (!c) return refuse('Place the probes on a circuit first.', 'no-placement');
  const r = core.meter.read(c.target);
  if (!r.ok || r.value === null) return refuse(r.refusal ?? r.display ?? 'No reading.', 'meter');
  const p = core.meter.state.placement;
  const placement: Record<string, string> = { target: core.state.meter.targetId ?? '' };
  if (p.red) placement.red = p.red;
  if (p.black) placement.black = p.black;
  if (p.series) placement.series = p.series;
  const underLoad =
    c.kind === 'dc' ? (core.dcSystems.get(core.state.meter.targetId ?? '')?.state.ptt ?? false) : Boolean(core.boards.get(core.state.meter.targetId ?? '')?.state.powered);
  const unit = r.unit === '' ? 'Ω' : r.unit;
  const m = measure(core, {
    instrument: 'multimeter',
    quantity: QUANTITY[core.meter.state.mode],
    value: r.value,
    unit,
    placement,
    underLoad,
    context: { display: r.display, beep: Boolean(r.beep), overload: Boolean(r.overload) },
    note: r.warning,
  });

  return done(`Meter reads ${r.display}.`, { measurement: m, warning: r.warning ?? null });
}

/**
 * Meter min-hold: a brownout resets the radio faster than anyone can read a display. When the meter is on DC
 * volts with its probes on this DC system's terminals, the lowest voltage at those terminals before the reset
 * is logged as an under-load reading (the dip at the radio versus the dip, or none, at the supply).
 */
export function captureMinHold(core: StationCore, dcId: string, sample: { vSource: number; vRadio: number }): HamMeasurement | null {
  const meter = core.meter.state;
  if (meter.mode !== 'DCV' || meter.redSocket !== 'VΩ' || core.state.meter.targetId !== dcId) return null;
  const { red, black } = meter.placement;
  const side = (n?: string): 'src' | 'radio' | null => (n?.startsWith('psu') ? 'src' : n?.startsWith('radio') ? 'radio' : null);
  const rs = side(red);
  if (!rs || rs !== side(black) || red?.endsWith('-') || !black?.endsWith('-')) return null;
  const v = Math.round((rs === 'src' ? sample.vSource : sample.vRadio) * 100) / 100;
  const placement: Record<string, string> = { target: dcId, red: red ?? '', black: black ?? '' };
  core.event('meter:minhold', { dcId, v });

  return measure(core, {
    instrument: 'multimeter',
    quantity: 'voltage',
    value: v,
    unit: 'V',
    placement,
    underLoad: true,
    context: { display: `MIN ${v.toFixed(2)} V`, minHold: true, beep: false, overload: false },
    note: 'Lowest voltage held at the radio reset.',
  });
}

/** Read the battery energy gauge (Wh remaining) on a battery-powered DC system */
export function batteryRead(core: StationCore, deviceId: string): ActionResult {
  const dc = core.dcSystems.get(deviceId);
  if (!dc || dc.state.source !== 'battery') return refuse('That device has no battery gauge.', 'no-battery');
  const away = core.reachable(deviceId);
  if (away) return away;
  const wh = Math.round(dc.state.battery.energyWh * 10) / 10;
  const m = measure(core, {
    instrument: 'battery-monitor',
    quantity: 'battery-energy',
    value: wh,
    unit: 'Wh',
    placement: { target: deviceId },
    underLoad: dc.state.ptt,
  });

  return done(`Battery gauge reads ${wh.toFixed(1)} Wh.`, { measurement: m });
}

export function swrRead(core: StationCore, meterId: string): ActionResult {
  const k = core.state.keyed;
  if (!k) return refuse('The SWR meter only reads while a transmitter is keyed through it.', 'not-keyed');
  const radio = core.inService(k.deviceId)?.radio;
  const fMHz = radio ? txFrequencyMHz(radio) : k.emission.freqHz / 1e6;
  const path = core.path(k.deviceId, fMHz);
  if (!path.swrMeter || path.swrMeter.deviceId !== meterId) return refuse('That SWR meter is not in the keyed transmitter path.', 'not-in-path');
  const r = readInlineSwrMeter(path, k.outputW);
  const m = measure(core, {
    instrument: 'swr-meter',
    quantity: 'swr',
    value: Math.round(r.swr * 100) / 100,
    unit: 'ratio',
    placement: { meter: meterId, radio: k.deviceId },
    underLoad: true,
    context: {
      forwardW: Math.round(r.forwardW * 100) / 100,
      reflectedW: Math.round(r.reflectedW * 100) / 100,
      termination: path.termination,
      terminationDeviceId: path.terminationDeviceId ?? '',
      freqMHz: fMHz,
      unreliable: r.unreliable,
    },
  });

  return done(`FWD ${r.forwardW.toFixed(1)} W, REF ${r.reflectedW.toFixed(2)} W, SWR ${r.swr.toFixed(2)}:1${r.unreliable ? ' (reading unreliable)' : ''}.`, { measurement: m });
}

function analyzerId(core: StationCore, id?: string): string | undefined {
  if (id) return core.inService(id) ? id : undefined;

  return Object.values(core.state.devices).find((d) => d.kind === 'analyzer' && !d.spare && !d.removed)?.id;
}

export function analyzerCalibrate(core: StationCore, referenceDeviceId: string | null, deviceId?: string): ActionResult {
  const id = analyzerId(core, deviceId);
  if (!id) return refuse('There is no antenna analyzer in service.', 'no-analyzer');
  core.state.analyzerCal = { done: true, referenceDeviceId };
  core.event(`calibrate:${id}`, { referenceDeviceId });

  return done(referenceDeviceId ? `Analyzer calibrated at the end of ${core.device(referenceDeviceId)?.label ?? referenceDeviceId}.` : 'Analyzer calibrated at its own port.');
}

export function analyzerRun(core: StationCore, startMHz: number, stopMHz: number, points: number, deviceId?: string): ActionResult {
  const id = analyzerId(core, deviceId);
  if (!id) return refuse('There is no antenna analyzer in service.', 'no-analyzer');
  const away = core.reachable(id);
  if (away) return away;
  if (!(stopMHz > startMHz) || points < 2) return refuse('Set a stop frequency above the start and at least two points.', 'bad-sweep');
  const devices = rfDeviceTable(core.state.devices, core.ports);
  const sweep = analyzerSweep(devices, liveConnections(core.state.connections, core.state.devices), id, {
    startMHz,
    stopMHz,
    points: Math.min(points, 401),
    calibration: core.state.analyzerCal,
  });
  if (sweep.refusal) return refuse(sweep.refusal, 'analyzer');
  const path = core.path(id, (startMHz + stopMHz) / 2, 'rf');
  const min = sweep.minSwr;
  const m = measure(core, {
    instrument: 'analyzer',
    quantity: 'sweep',
    value: min ? Math.round(min.fMHz * 1000) / 1000 : 0,
    unit: 'MHz',
    placement: { analyzer: id, antenna: path.antennaDeviceId ?? '' },
    underLoad: false,
    context: {
      minSwr: min ? Math.round(min.swr * 100) / 100 : 99,
      startMHz,
      stopMHz,
      uncalibrated: sweep.uncalibrated,
      flags: sweep.flags.join(','),
      termination: path.termination,
    },
  });

  core.lastSweep = { points: sweep.points, flags: sweep.flags, measurement: m };

  return done(min ? `Sweep ${startMHz}-${stopMHz} MHz: minimum SWR ${min.swr.toFixed(2)} at ${min.fMHz.toFixed(3)} MHz.` : 'Sweep complete: no dip found.', {
    measurement: m,
    points: sweep.points,
    flags: sweep.flags,
  });
}

export function coaxTest(core: StationCore, deviceId: string): ActionResult {
  const d = core.inService(deviceId);
  if (!d?.coax) return refuse(`${d?.label ?? deviceId} is not a coax cable.`, 'not-coax');
  if (core.state.connections.some((c) => c.a.deviceId === deviceId || c.b.deviceId === deviceId)) {
    return refuse('Disconnect both ends of the cable before an ohmmeter test; otherwise you are measuring whatever it is plugged into.', 'connected');
  }
  const t = coaxDcTest(d.coax);
  const val = (v: number | null): number => (v === null ? OPEN_CIRCUIT_OHMS : Math.round(v * 1000) / 1000);
  const ms = [
    measure(core, { instrument: 'multimeter', quantity: 'centre-ohm', value: val(t.centreOhm), unit: 'Ω', placement: { coax: deviceId }, underLoad: false }),
    measure(core, { instrument: 'multimeter', quantity: 'shield-ohm', value: val(t.shieldOhm), unit: 'Ω', placement: { coax: deviceId }, underLoad: false }),
    measure(core, { instrument: 'multimeter', quantity: 'centre-shield-ohm', value: val(t.centreShieldOhm), unit: 'Ω', placement: { coax: deviceId }, underLoad: false }),
  ];
  const fmt = (v: number | null): string => (v === null ? 'OL (open)' : `${v.toFixed(2)} Ω`);

  return done(`Centre ${fmt(t.centreOhm)}, shield ${fmt(t.shieldOhm)}, centre-to-shield ${fmt(t.centreShieldOhm)}.`, { measurements: ms });
}
