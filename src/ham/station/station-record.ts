/**
 * @file station-record - Receiver readings the player takes on purpose (`rx.record`)
 * @description Logs what the receiver shows right now (noise rise, and the signal-to-noise of one
 * emitter) together with the settings and devices that were active, so a scenario can compare a
 * before-and-after reading under the same conditions.
 */

import type { HamMeasurement } from '../ham-types';
import { type ActionResult, done, refuse, type StationCore } from './station-core';
import { receiverNoise } from './station-rx';

export function recordReceiver(core: StationCore, deviceId: string, emitterId?: string): ActionResult {
  const d = core.state.devices[deviceId];
  if (!d?.radio || d.removed) return refuse('That device has no receiver to read.', 'no-receiver');
  if (!core.energized(deviceId)) return refuse('Power the receiver on first.', 'no-power');
  const noise = receiverNoise(core, deviceId);
  if (!noise) return refuse('That device has no receiver to read.', 'no-receiver');
  const path = core.path(deviceId, core.rxFreqMHz(deviceId));
  const ant = path.antennaDeviceId ? core.inService(path.antennaDeviceId)?.antenna : undefined;
  const context: Record<string, string | number | boolean> = {
    vfoMHz: d.radio.vfoMHz,
    filterHz: d.radio.filterHz,
    mode: d.radio.mode,
    rfGainDb: d.radio.rfGainDb,
    azDeg: Math.round(ant?.azDeg ?? 0),
    orientation: ant?.orientation ?? 'vertical',
  };
  if (ant?.kind === 'adjustable-dipole') {
    const resonance = 143 / (ant.elementLengthsM[0] + ant.elementLengthsM[1]);
    context.inBand = Math.abs(resonance - d.radio.vfoMHz) <= 1.5;
  }
  for (const [id, on] of Object.entries(noise.rfiOn)) context[`on:${id}`] = on;
  for (const dev of Object.values(core.state.devices)) {
    if ((dev.kind === 'charger' || dev.kind === 'noise-source') && !(`on:${dev.id}` in context)) context[`on:${dev.id}`] = Boolean(core.inService(dev.id)?.powered);
  }
  const base = { tS: core.state.nowS, revision: core.state.revision, instrument: 'receiver' as const, underLoad: false, context };
  const rise = core.log.measurement({ ...base, quantity: 'noise-rise', value: Math.round(noise.riseDb * 10) / 10, unit: 'dB', placement: { receiver: deviceId } } as Omit<
    HamMeasurement,
    'id'
  >);
  let text = `Noise ${rise.value.toFixed(1)} dB above the receiver floor.`;
  if (emitterId) {
    const hit = core.state.latest[deviceId]?.find((r) => r.emissionId === emitterId || r.emissionId.startsWith(`${emitterId}#`));
    if (!hit) return refuse(`No signal from ${emitterId} reaches this receiver right now.`, 'no-signal');
    const snr = core.log.measurement({
      ...base,
      quantity: 'signal-snr',
      value: Math.round(hit.snrDb * 10) / 10,
      unit: 'dB',
      placement: { receiver: deviceId, emitter: emitterId },
      context: { ...context, intelligibility: Math.round(hit.intelligibility * 100) / 100 },
    } as Omit<HamMeasurement, 'id'>);
    text += ` ${emitterId}: ${snr.value.toFixed(1)} dB signal-to-noise.`;
  }

  return done(text);
}
