/**
 * @file station-rx - Per-tick reception for every powered receiver at the station
 * @description For each SDR and radio: resolve the RF path from its antenna port, apply antenna
 * gain/polarization, feedline and mismatch loss, local noise sources, then run `evaluateReception`
 * over everything on the air. Results feed the evidence log, transcripts and the ops modules.
 */

import type { AuthoredEmitter } from '../ham-station-config';
import type { OnAirEmission, ReceptionResult } from '../ham-types';
import { defaultNoiseFigureDb, noiseFloorDbm } from '../radio/link-model';
import { noiseRiseAtReceiver, type RfiDevice } from '../radio/noise-sources';
import { rxTunedHz } from '../radio/radio-settings';
import { evaluateReception, type ReceiverView, revealTranscript } from '../radio/reception-model';
import { generateSpectrumRow } from '../radio/spectrum-bins';
import { antennaGainDbi, mismatchLossDb } from '../rf/antenna-model';
import { cxAbs } from '../rf/complex';
import type { StationCore } from './station-core';
import { isReceiverKind, polarizationLabel, profileOf, sdrUsbConnected } from './station-devices';

/** Authored emitter on the air at nowS, or null */
export function authoredEmission(e: AuthoredEmitter, nowS: number): OnAirEmission | null {
  const t = nowS - (e.startS ?? 0);
  if (t < 0) return null;
  let id = e.id;
  let startS = e.startS ?? 0;
  let endS: number | null = null;
  if (e.schedule) {
    const { periodS, onS, offsetS } = e.schedule;
    const u = t - offsetS;
    if (u < 0) return null;
    const cycle = Math.floor(u / periodS);
    if (u - cycle * periodS >= onS) return null;
    id = `${e.id}#${cycle}`;
    startS = (e.startS ?? 0) + offsetS + cycle * periodS;
    endS = startS + onS;
  }
  const bw = e.bandwidthHz ?? (e.mode === 'FM' ? 15000 : e.mode === 'CW' ? 150 : e.mode === 'FT8' ? 50 : e.mode === 'DMR' ? 12500 : 2400);

  return {
    id,
    sourceId: e.id,
    isPlayer: false,
    freqHz: Math.round(e.freqMHz * 1e6),
    mode: e.mode,
    bandwidthHz: bw,
    erpDbm: e.erpDbm,
    polarization: e.polarization,
    position: e.position,
    ctcssHz: e.ctcssHz ?? null,
    payload: { kind: e.payload.kind, text: e.payload.text, callsign: e.payload.callsign },
    startS,
    endS,
  };
}

export function emissionsOnAir(core: StationCore, nowS: number): OnAirEmission[] {
  const out: OnAirEmission[] = [];
  for (const e of core.cfg.emitters) {
    const em = authoredEmission(e, nowS);
    if (em) out.push(em);
  }
  out.push(...core.ops.background(nowS));
  for (const e of core.state.air) if (e.startS <= nowS && (e.endS === null || e.endS > nowS)) out.push(e);

  return out;
}

function rfiDevices(core: StationCore): RfiDevice[] {
  const out: RfiDevice[] = [];
  for (const d of core.cfg.devices) {
    if (!d.noise) continue;
    const rt = core.inService(d.id);
    const quieted = core.state.faults.some((f) => f.target === d.id && f.kind === 'noisy-supply' && f.cleared);
    out.push({
      id: d.id,
      position: core.positionOf(d.id),
      energized: Boolean(rt?.powered) && !quieted,
      psdDbmHzAt1m: d.noise.psdDbmHzAt1m,
      supplyId: d.noise.supplyId,
      conductedBoostDb: d.noise.conductedBoostDb,
      reflection: d.noise.reflection,
    });
  }

  return out;
}

const LOG_DELTA = 0.05;

/** Evaluate every receiver; returns the emissions considered (for the UI) */
export function evaluateReceivers(core: StationCore, dtS: number, lastLogged: Map<string, number>): void {
  const nowS = core.state.nowS;
  const air = emissionsOnAir(core, nowS);
  const bySource = new Map(air.map((e) => [e.id, e]));
  const rfi = rfiDevices(core);
  const sat = core.ops.satGeometry();
  const latest: Record<string, ReceptionResult[]> = {};

  for (const d of Object.values(core.state.devices)) {
    if (!isReceiverKind(d.kind) || d.spare || d.removed || !d.radio) continue;
    const profile = profileOf(d);
    if (!profile) continue;
    const powered = core.energized(d.id);
    const fMHz = core.rxFreqMHz(d.id);
    const path = core.path(d.id, fMHz);
    const ant = path.antennaDeviceId ? core.inService(path.antennaDeviceId)?.antenna : undefined;
    const antennaPresent = path.valid && path.termination === 'antenna' && Boolean(ant);
    const feedLossDb = path.totalLossDb + mismatchLossDb(cxAbs(path.gammaAtStart));
    const position = core.positionOf(path.antennaDeviceId ?? d.id);
    const nf = defaultNoiseFigureDb(d.kind);
    const filterHz = d.radio.filterHz;
    const supplyId = core.dcFor(d.id)?.id ?? (d.kind === 'sdr' ? undefined : d.id);
    const gainAt = (bearing: number): number => (ant ? antennaGainDbi(ant, fMHz, bearing, 0) : 0);
    const noise = noiseRiseAtReceiver(rfi, { position, supplyId, antennaGainDb: gainAt }, filterHz, noiseFloorDbm(filterHz, nf));
    const transmitting = core.state.keyed?.deviceId === d.id;
    const view: ReceiverView = {
      profile,
      settings: d.radio,
      powered,
      antennaPresent,
      antennaGainDb: gainAt,
      antennaPolarization: polarizationLabel(ant),
      feedLossDb,
      usbConnected: d.kind === 'sdr' ? sdrUsbConnected(core.state.devices, core.state.connections, d.id) : undefined,
      transmitting,
      position,
      noiseFigureDb: nf,
    };
    if (d.kind === 'sdr') view.powered = d.powered;
    const own = air.filter((e) => !(transmitting && e.id === core.state.keyed?.emission.id));
    const terrestrial = own.filter((e) => !e.viaSatellite);
    const viaSat = own.filter((e) => e.viaSatellite);
    const overrides: Record<string, number> = {};
    for (const e of own) {
      const o = core.ops.pathLossOverride(e, nowS);
      if (o !== undefined) overrides[e.id] = o;
    }
    const env = { noiseRiseDb: noise.riseDb, pathLossDb: overrides };
    const results = evaluateReception(view, terrestrial, env);
    if (viaSat.length > 0 && sat) {
      const satView: ReceiverView = { ...view, antennaGainDb: () => (ant ? antennaGainDbi(ant, fMHz, sat.az, sat.el) : 0) };
      results.push(...evaluateReception(satView, viaSat, env));
    }
    latest[d.id] = results;

    let squelchOpen = false;
    for (const r of results) {
      const em = bySource.get(r.emissionId);
      if (!em) continue;
      squelchOpen = squelchOpen || r.squelchOpen;
      const key = `${d.id}|${r.emissionId}`;
      for (const imp of ['squelch-closed', 'filter-too-narrow', 'volume-zero'] as const) {
        const ik = `imp|${d.id}|${em.sourceId}|${imp}`;
        const has = (r.impairments as string[]).includes(imp);
        if (has && !lastLogged.has(ik)) {
          lastLogged.set(ik, 1);
          core.event(`rx:${d.id}:${imp}`, { emitter: em.sourceId });
        } else if (!has && lastLogged.has(ik)) {
          lastLogged.delete(ik);
        }
      }
      const prev = lastLogged.get(key);
      if (r.audible && (prev === undefined || Math.abs(prev - r.intelligibility) > LOG_DELTA)) {
        lastLogged.set(key, r.intelligibility);
        core.log.reception({
          tS: nowS,
          revision: core.state.revision,
          deviceId: d.id,
          emitterId: em.sourceId,
          emissionId: em.id,
          intelligibility: r.intelligibility,
          snrDb: r.snrDb,
          audible: true,
          impairments: r.impairments,
        });
      } else if (!r.audible && prev !== undefined) {
        lastLogged.delete(key);
      }
      if (r.audible && r.intelligibility > 0) {
        core.ops.notePlayerHeard(em.id, r.intelligibility);
        const text = em.payload.text;
        const cur = core.state.transcripts[em.sourceId];
        if (text && (!cur || r.intelligibility > cur.intelligibility)) {
          core.state.transcripts[em.sourceId] = { text: revealTranscript(text, r.intelligibility, core.cfg.seed), intelligibility: r.intelligibility };
        }
      }
    }
    if (d.kind !== 'sdr' && powered) core.ops.noteMonitoring(fMHz, squelchOpen, dtS, nowS);

    if (d.kind === 'sdr' && powered) {
      const rows = results
        .map((r) => ({ r, e: bySource.get(r.emissionId) }))
        .filter((x): x is { r: ReceptionResult; e: OnAirEmission } => Boolean(x.e))
        .map(({ r, e }) => ({ freqHz: e.freqHz, bandwidthHz: e.bandwidthHz, mode: e.mode, rssiDbm: r.rssiDbm }));
      core.spectrum.set(
        d.id,
        generateSpectrumRow({
          centerHz: rxTunedHz(d.radio),
          spanHz: d.radio.spanHz,
          bins: 256,
          emissions: rows,
          noiseFloorDbm: noiseFloorDbm(filterHz, nf) + noise.riseDb,
          noiseSourceRiseDb: noise.riseDb,
          seed: core.cfg.seed + Math.floor(nowS),
        })
      );
    }
  }
  core.state.latest = latest;
}

/** Noise floor and rise a receiver sees right now (instrument readings and the DF exercise) */
export function receiverNoise(core: StationCore, deviceId: string): { floorDbm: number; riseDb: number; rfiOn: Record<string, boolean> } | null {
  const d = core.state.devices[deviceId];
  if (!d?.radio) return null;
  const fMHz = core.rxFreqMHz(deviceId);
  const path = core.path(deviceId, fMHz);
  const ant = path.antennaDeviceId ? core.inService(path.antennaDeviceId)?.antenna : undefined;
  const nf = defaultNoiseFigureDb(d.kind);
  const supplyId = core.dcFor(deviceId)?.id ?? (d.kind === 'sdr' ? undefined : deviceId);
  const gainAt = (bearing: number): number => (ant ? antennaGainDbi(ant, fMHz, bearing, 0) : 0);
  const rfi = rfiDevices(core);
  const floorDbm = noiseFloorDbm(d.radio.filterHz, nf);
  const noise = noiseRiseAtReceiver(rfi, { position: core.positionOf(path.antennaDeviceId ?? deviceId), supplyId, antennaGainDb: gainAt }, d.radio.filterHz, floorDbm);
  const rfiOn: Record<string, boolean> = {};
  for (const r of rfi) rfiOn[r.id] = r.energized;

  return { floorDbm: floorDbm + noise.riseDb, riseDb: noise.riseDb, rfiOn };
}
