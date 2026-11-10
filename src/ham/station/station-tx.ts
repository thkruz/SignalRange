/**
 * @file station-tx - Keying a radio through the live RF path, and what a keyed carrier does each tick
 * @description `ptt` runs `attemptTransmit` with the real path (termination, feedline, foldback).
 * A refusal changes nothing but is logged as evidence (`txRefused:<code>`). A keyed emission is on
 * the air for `holdS`, loads the radio's DC system and heats a dummy load.
 */

import type { OnAirEmission, TxIntent } from '../ham-types';
import { txFrequencyMHz } from '../radio/radio-settings';
import { attemptTransmit, type TxAntennaPath } from '../radio/transmit';
import { antennaGainDbi, isDirectional } from '../rf/antenna-model';
import { stepDummyLoad } from '../rf/instruments';
import { txPowerThroughPath } from '../rf/tx-protection';
import { type ActionResult, done, refuse, type StationCore } from './station-core';
import { polarizationLabel, profileOf } from './station-devices';

export const DEFAULT_HOLD_S = 4;
/** Effective gain of a dummy load: it radiates almost nothing */
export const DUMMY_LOAD_GAIN_DB = -100;

export interface PreparedTx {
  emission: OnAirEmission;
  outputW: number;
  deliveredW: number;
  termination: string;
  foldedBack: boolean;
  freqMHz: number;
}

/** Default transmit power (W) above which an uncleared rf-feedback fault corrupts the transmitted audio */
export const RF_FEEDBACK_THRESHOLD_W = 5;

/** Run every transmit check against the live path; a refusal is logged and changes nothing */
export function prepareTx(core: StationCore, deviceId: string, intent: TxIntent): PreparedTx | ActionResult {
  const away = core.reachable(deviceId);
  if (away) return away;
  const d = core.inService(deviceId);
  const profile = profileOf(d);
  if (!d?.radio || !profile) return refuse(`${d?.label ?? deviceId} is not a radio.`, 'not-a-radio');
  if (core.state.keyed) return refuse('A transmitter is already keyed. Release it first.', 'already-keyed');
  const fMHz = txFrequencyMHz(d.radio);
  const path = core.path(deviceId, fMHz);
  const ant = path.antennaDeviceId ? core.inService(path.antennaDeviceId)?.antenna : undefined;
  const tp = txPowerThroughPath(d.radio.txPowerW, path);
  const feedLossDb = path.totalLossDb;
  const mismatch = Math.max(0, 10 * Math.log10(Math.max(tp.outputW, 1e-9) / Math.max(tp.deliveredToLoadW, 1e-9)) - feedLossDb);
  const foldLossDb = 10 * Math.log10(Math.max(d.radio.txPowerW, 1e-9) / Math.max(tp.outputW, 1e-9));
  let antenna: TxAntennaPath;
  if (path.termination === 'antenna' && ant) {
    const gain = isDirectional(ant) ? antennaGainDbi(ant, fMHz, ant.azDeg, ant.elDeg) : antennaGainDbi(ant, fMHz, 0, 0);
    antenna = { present: true, safe: path.safeToTransmit, gainDb: gain, feedLossDb, mismatchLossDb: mismatch + foldLossDb, polarization: polarizationLabel(ant) };
  } else if (path.termination === 'dummy-load') {
    antenna = { present: true, safe: path.safeToTransmit, gainDb: DUMMY_LOAD_GAIN_DB, feedLossDb, mismatchLossDb: 0, polarization: 'V' };
  } else {
    antenna = { present: path.termination !== 'open', safe: false, gainDb: 0, feedLossDb, mismatchLossDb: 0, polarization: 'V' };
  }
  const feed = core.dcFor(deviceId);
  const res = attemptTransmit({
    deviceId,
    profile,
    settings: d.radio,
    license: core.cfg.operator.license,
    callsign: core.cfg.operator.callsign,
    powered: core.energized(deviceId) && !feed?.dc.state.txLocked,
    antenna,
    intent,
    nowS: core.state.nowS,
    position: core.positionOf(path.antennaDeviceId ?? deviceId),
  });
  if (res.ok && res.emission) {
    res.emission.txPowerW = d.radio.txPowerW;
    const inPath = new Set([deviceId, ...path.elements.map((el) => el.deviceId)]);
    const fb = core.state.faults.find((f) => f.kind === 'rf-feedback' && !f.cleared && inPath.has(f.target));
    if (fb && d.radio.txPowerW > (fb.value ?? RF_FEEDBACK_THRESHOLD_W)) res.emission.rfFeedback = true;
  }
  if (!res.ok || !res.emission) {
    const code = res.refusalCode ?? 'refused';
    const why = res.refusal ?? 'The radio did not key.';
    const extra = antenna.present && !antenna.safe && path.refusal ? ` ${path.refusal}` : '';
    core.event(`txRefused:${code}`, { deviceId, termination: path.termination });
    return refuse(`${why}${extra}`, code);
  }

  return { emission: res.emission, outputW: tp.outputW, deliveredW: tp.deliveredToLoadW, termination: path.termination, foldedBack: tp.foldedBack, freqMHz: fMHz };
}

export const isPrepared = (r: PreparedTx | ActionResult): r is PreparedTx => 'emission' in r;

/** Isolation between the uplink radio and the downlink receiver as currently wired, dB (null = not derivable) */
export function wiredIsolationDb(core: StationCore, txRadioId: string, rxRadioId: string, txMHz: number): number | null {
  const tx = core.path(txRadioId, txMHz);
  const rx = core.path(rxRadioId, core.rxFreqMHz(rxRadioId));
  if (!tx.antennaDeviceId || !rx.antennaDeviceId) return null;
  if (tx.antennaDeviceId !== rx.antennaDeviceId) return 30;
  const dup = tx.elements.find((e) => e.kind === 'duplexer');
  if (!dup) return 6;

  return core.cfg.devices.find((d) => d.id === dup.deviceId)?.isolationDb ?? 60;
}

export function ptt(core: StationCore, deviceId: string, intent: TxIntent, holdS = DEFAULT_HOLD_S): ActionResult {
  const prep = prepareTx(core, deviceId, intent);
  if (!isPrepared(prep)) return prep;
  const s = core.state;
  const fMHz = prep.freqMHz;
  s.emSeq += 1;
  const emission: OnAirEmission = { ...prep.emission, id: `tx-${deviceId}-${s.emSeq}`, endS: s.nowS + holdS };
  s.air.push(emission);
  s.keyed = { deviceId, emission, intent, untilS: s.nowS + holdS, outputW: prep.outputW, deliveredW: prep.deliveredW, termination: prep.termination };
  core.event(`txOk:${deviceId}`, { freqMHz: fMHz, mode: emission.mode, termination: prep.termination, outputW: round(prep.outputW), erpDbm: round(emission.erpDbm) });
  const wiring = core.cfg.satellite?.wiring;
  if (wiring && wiring.txRadioId === deviceId && core.ops.sat) {
    const iso = wiredIsolationDb(core, deviceId, wiring.rxRadioId, fMHz);
    if (iso !== null) core.ops.sat.setIsolation(iso);
  }
  const ops = core.ops.onPlayerEmission(emission, intent, s.nowS, prep.outputW);
  for (const ev of ops.events) core.event(ev.name, ev.data);
  s.air.push(...ops.emissions);
  const fold = prep.foldedBack ? ' The radio folded back its power: the antenna system is mismatched.' : '';

  return done(`Transmitting on ${fMHz.toFixed(4)} MHz ${emission.mode} for ${holdS} s.${fold}`, {
    emissionId: emission.id,
    erpDbm: emission.erpDbm,
    outputW: prep.outputW,
    termination: prep.termination,
    events: ops.events.map((e) => e.name),
  });
}

const round = (v: number): number => Math.round(v * 100) / 100;

export function endTx(core: StationCore, reset: boolean): void {
  const k = core.state.keyed;
  if (!k) return;
  const s = core.state;
  const em = s.air.find((e) => e.id === k.emission.id);
  if (em) em.endS = s.nowS;
  core.event(`txEnd:${k.deviceId}`, { durationS: round(s.nowS - k.emission.startS), reset });
  s.keyed = null;
}

/** Advance DC systems and dummy loads by dtS; ends the keyed TX on timeout or radio reset */
export function stepPower(core: StationCore, dtS: number): void {
  const s = core.state;
  for (const cfg of core.cfg.devices) {
    const dc = core.dcSystems.get(cfg.id);
    if (!dc || !cfg.dcSystem) continue;
    const keyedHere = s.keyed?.deviceId === cfg.dcSystem.radioId;
    if (cfg.dcSystem.txScalesWithPower) {
      const w = core.inService(cfg.dcSystem.radioId)?.radio?.txPowerW;
      if (typeof w === 'number') dc.state.txCurrentA = Math.round((1.5 + 0.13 * w) * 100) / 100;
    }
    dc.tick(dtS, { ptt: keyedHere });
    const prev = s.resetCounts[cfg.id] ?? 0;
    if (dc.state.resetCount > prev) {
      s.resetCounts[cfg.id] = dc.state.resetCount;
      const b = dc.state.lastBrownout;
      core.event('brownout', {
        dcId: cfg.id,
        radioId: cfg.dcSystem.radioId,
        vSource: b ? round(b.vSource) : null,
        vRadio: b ? round(b.vRadio) : null,
        currentA: b ? round(b.currentA) : null,
      });
      if (keyedHere) {
        core.event(`reset:${cfg.dcSystem.radioId}`);
        endTx(core, true);
      }
    }
  }
  for (const d of Object.values(s.devices)) {
    if (!d.dummyLoad) continue;
    const heating = s.keyed?.termination === 'dummy-load' && core.path(s.keyed.deviceId, s.keyed.emission.freqHz / 1e6).terminationDeviceId === d.id;
    d.dummyLoad = stepDummyLoad(d.dummyLoad, heating ? (s.keyed?.deliveredW ?? 0) : 0, dtS);
  }
  if (s.keyed && s.nowS >= s.keyed.untilS) endTx(core, false);
  s.air = s.air.filter((e) => e.endS === null || e.endS > s.nowS - 1);
}
