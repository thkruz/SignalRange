/**
 * @file reception-model - What a receiver actually hears from the on-air emissions
 * @description Bounded model, not DSP: SNR drives an intelligibility curve per
 * mode, then settings (filter, mode, squelch, tone, volume, tuning) and
 * interference (collisions, RFI, front-end overload) modify it. Every reduction
 * is reported as a ReceptionImpairment so the UI can say why.
 */

import type { HamCapabilityProfile, HamMode, LocalPosition, OnAirEmission, RadioSettings, ReceptionImpairment, ReceptionResult } from '../ham-types';
import { defaultNoiseFigureDb, linkLoss, noiseFloorDbm, polarizationMismatchDb, receivedPowerDbm } from './link-model';
import { effectiveNoiseFigureDb, overloadRiseDb } from './noise-sources';
import { rxTunedHz } from './radio-settings';

export type ReceiverSettings = Pick<RadioSettings, 'vfoMHz' | 'mode' | 'filterHz' | 'squelch' | 'volume' | 'rfGainDb' | 'rxToneHz' | 'monitor' | 'ritHz' | 'ritOn'> &
  Partial<Pick<RadioSettings, 'memories' | 'activeMemory' | 'codeplug' | 'activeDmrChannel' | 'offset' | 'offsetKHz' | 'txToneHz' | 'ppm'>>;

export interface ReceiverView {
  profile: HamCapabilityProfile;
  settings: ReceiverSettings;
  powered: boolean;
  /** An antenna is connected to the RF input */
  antennaPresent: boolean;
  /** Antenna gain toward an absolute bearing (deg true), dBi. Default 0 (isotropic) */
  antennaGainDb?: (bearingDeg: number) => number;
  antennaPolarization?: 'V' | 'H' | 'RHCP' | 'LHCP';
  feedLossDb?: number;
  /** SDR only: USB cable to the laptop is connected */
  usbConnected?: boolean;
  /** Half-duplex radio currently keyed */
  transmitting?: boolean;
  position: LocalPosition;
  noiseFigureDb?: number;
  /** SDR front-end filter (FM trap / notch) attenuation on strong signals, dB */
  filterAttenDb?: number;
  /** SDR front-end passband, Hz (strong signals inside it can overload) */
  frontEndPassbandHz?: number;
}

export interface ReceptionEnv {
  /** RFI noise rise over the receiver floor, dB (from noise-sources) */
  noiseRiseDb?: number;
  /** Authored obstruction by emission id, dB */
  obstructionDb?: Readonly<Record<string, number>>;
  /** Path loss override by emission id (satellite or pre-computed paths), dB */
  pathLossDb?: Readonly<Record<string, number>>;
}

/** Squelch dial 0..10 to a threshold in dBm: 0 opens always, 10 needs about S9 */
export function squelchThresholdDbm(squelch: number): number {
  if (squelch <= 0) {
    return -200;
  }

  return -130 + 6 * Math.min(squelch, 10);
}

interface ModeSpec {
  /** Filter width needed for undistorted audio, Hz */
  needHz: number;
  /** Beyond this the filter is wastefully wide, Hz */
  wideHz: number;
  /** Tuning error tolerated before audio degrades, Hz */
  tuneTolHz: number;
}

const MODE_SPECS: Record<HamMode, ModeSpec> = {
  FM: { needHz: 12000, wideHz: 30000, tuneTolHz: 2000 },
  AM: { needHz: 6000, wideHz: 12000, tuneTolHz: 1500 },
  USB: { needHz: 2400, wideHz: 3600, tuneTolHz: 150 },
  LSB: { needHz: 2400, wideHz: 3600, tuneTolHz: 150 },
  CW: { needHz: 300, wideHz: 1500, tuneTolHz: 100 },
  DMR: { needHz: 12000, wideHz: 25000, tuneTolHz: 1500 },
  PKT: { needHz: 12000, wideHz: 30000, tuneTolHz: 1500 },
  FT8: { needHz: 2400, wideHz: 3600, tuneTolHz: 100 },
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (x: number, lo: number, hi: number): number => {
  const t = clamp01((x - lo) / (hi - lo));

  return t * t * (3 - 2 * t);
};

/** SNR to base intelligibility, by the receiver's demodulation mode */
export function snrToIntelligibility(snrDb: number, mode: HamMode): number {
  switch (mode) {
    case 'FM':
    case 'PKT':
      return smooth(snrDb, 3, 12);
    case 'DMR':
      return snrDb < 6 ? 0 : smooth(snrDb, 6, 10);
    case 'AM':
      return smooth(snrDb, 4, 22);
    case 'USB':
    case 'LSB':
      return smooth(snrDb, -2, 18);
    case 'CW':
    case 'FT8':
      return smooth(snrDb, -8, 8);
  }
}

type Compat = 'match' | 'close' | 'mismatch';

/** Can a receiver set to `rx` demodulate an emission sent as `tx`? */
function modeCompat(tx: HamMode, rx: HamMode): Compat {
  if (tx === rx) {
    return 'match';
  }
  if (tx === 'CW' && (rx === 'USB' || rx === 'LSB')) {
    return 'close';
  }
  if (tx === 'FT8' && rx === 'USB') {
    return 'close';
  }
  if (tx === 'PKT' && rx === 'FM') {
    return 'close';
  }

  return 'mismatch';
}

function dead(emissionId: string, impairments: ReceptionImpairment[]): ReceptionResult {
  return { emissionId, rssiDbm: -200, snrDb: -200, offsetHz: 0, squelchOpen: false, intelligibility: 0, impairments, audible: false };
}

export function evaluateReception(rx: ReceiverView, emissions: readonly OnAirEmission[], env: ReceptionEnv = {}): ReceptionResult[] {
  const s = rx.settings;
  if (!rx.powered) {
    return emissions.map((e) => dead(e.id, ['no-power']));
  }
  if (rx.profile.kind === 'sdr' && rx.usbConnected === false) {
    return emissions.map((e) => dead(e.id, ['usb-disconnected']));
  }
  if (!rx.antennaPresent) {
    return emissions.map((e) => dead(e.id, ['no-antenna']));
  }
  if (rx.transmitting && rx.profile.duplex === 'half') {
    return emissions.map((e) => dead(e.id, ['transmitting']));
  }

  const tunedHz = rxTunedHz(s as RadioSettings);
  const spec = MODE_SPECS[s.mode];
  const isSdr = rx.profile.kind === 'sdr';

  // Per-emission signal levels
  const levels = emissions.map((e) => {
    const pol = e.polarization;
    let pathLossDb: number;
    let bearing = 0;
    const override = env.pathLossDb?.[e.id];
    if (override !== undefined) {
      pathLossDb = override;
    } else if (e.position) {
      const ll = linkLoss({ freqHz: e.freqHz, tx: e.position, rx: rx.position, obstructionDb: env.obstructionDb?.[e.id] });
      pathLossDb = ll.pathLossDb;
      bearing = ll.bearingDeg;
    } else {
      pathLossDb = 200;
    }
    const rssiDbm = receivedPowerDbm({
      erpDbm: e.erpDbm,
      pathLossDb,
      rxGainDb: rx.antennaGainDb?.(bearing) ?? 0,
      polarizationMismatchDb: polarizationMismatchDb(pol, rx.antennaPolarization ?? 'V'),
      rxFeedLossDb: rx.feedLossDb ?? 0,
    });

    return { e, rssiDbm, offsetHz: e.freqHz - tunedHz };
  });

  // SDR front-end overload from strong signals anywhere in the passband
  let overloadDb = 0;
  if (isSdr) {
    const half = (rx.frontEndPassbandHz ?? 2_400_000) / 2;
    overloadDb = overloadRiseDb({
      signals: levels.filter((l) => Math.abs(l.offsetHz) <= half).map((l) => ({ rssiDbm: l.rssiDbm })),
      rfGainDb: s.rfGainDb,
      filterAttenDb: rx.filterAttenDb,
    });
  }
  const nf = isSdr ? effectiveNoiseFigureDb(rx.noiseFigureDb ?? defaultNoiseFigureDb(rx.profile.kind), s.rfGainDb) : (rx.noiseFigureDb ?? defaultNoiseFigureDb(rx.profile.kind));
  const rfiRise = env.noiseRiseDb ?? 0;
  const floorDbm = noiseFloorDbm(s.filterHz, nf, rfiRise + overloadDb);

  const inPassband = levels.map((l) => Math.abs(l.offsetHz) <= s.filterHz / 2);
  const threshold = squelchThresholdDbm(s.squelch);
  const dmrChannel = s.mode === 'DMR' && s.activeDmrChannel != null ? s.codeplug?.[s.activeDmrChannel] : undefined;

  return levels.map((l, i) => {
    const { e, rssiDbm, offsetHz } = l;
    const impairments: ReceptionImpairment[] = [];
    const snrDb = rssiDbm - floorDbm;
    const out = (intelligibility: number, squelchOpen: boolean, audible: boolean): ReceptionResult => ({
      emissionId: e.id,
      rssiDbm,
      snrDb,
      offsetHz,
      squelchOpen,
      intelligibility: clamp01(intelligibility),
      impairments,
      audible,
    });

    if (!inPassband[i]) {
      impairments.push('off-frequency');

      return out(0, false, false);
    }

    // Squelch gating: level, then access tone, then DMR addressing
    let open = s.monitor || rssiDbm >= threshold;
    let toneClosed = false;
    if (!s.monitor && s.rxToneHz && e.ctcssHz !== s.rxToneHz) {
      toneClosed = true;
      open = false;
    }
    if (
      dmrChannel &&
      e.mode === 'DMR' &&
      (!e.dmr || e.dmr.colorCode !== dmrChannel.colorCode || e.dmr.timeSlot !== dmrChannel.timeSlot || e.dmr.talkgroup !== dmrChannel.talkgroup)
    ) {
      open = false;
    }

    // Intelligibility
    let q = snrToIntelligibility(snrDb, s.mode);
    if (snrDb < 6) {
      impairments.push('weak-signal');
    }
    const compat = modeCompat(e.mode, s.mode);
    if (compat === 'mismatch') {
      q = 0;
      impairments.unshift('mode-mismatch');
    } else if (compat === 'close') {
      q *= 0.85;
    }
    if (s.filterHz < spec.needHz) {
      q *= (s.filterHz / spec.needHz) ** 1.5;
      impairments.push('filter-too-narrow');
    } else if (s.filterHz > spec.wideHz) {
      impairments.push('filter-too-wide');
    }
    const tuneErr = Math.abs(offsetHz);
    if (tuneErr > spec.tuneTolHz) {
      q *= clamp01(1 - (tuneErr - spec.tuneTolHz) / Math.max(s.filterHz / 2 - spec.tuneTolHz, 1));
      impairments.push('off-frequency');
    }
    if (overloadDb > 10) {
      impairments.push('overload');
    } else if (overloadDb > 3) {
      impairments.push('desense');
    }
    if (rfiRise > 3) {
      impairments.push('interference');
    }
    q = collide(i, q, levels, inPassband, s.mode, impairments);

    if (!open) {
      impairments.unshift(toneClosed ? 'tone-squelch-closed' : 'squelch-closed');

      return out(0, false, false);
    }
    if (s.volume <= 0) {
      impairments.unshift('volume-zero');

      return out(0, true, false);
    }

    return out(q, true, true);
  });
}

/** Co-channel interference among emissions inside the same passband; adjusts q for emission i */
function collide(i: number, q: number, levels: { e: OnAirEmission; rssiDbm: number }[], inPassband: boolean[], mode: HamMode, impairments: ReceptionImpairment[]): number {
  let result = q;
  for (let j = 0; j < levels.length; j++) {
    if (j === i || !inPassband[j] || levels[j].e.id === levels[i].e.id) {
      continue;
    }
    const diff = levels[i].rssiDbm - levels[j].rssiDbm;
    const fm = mode === 'FM' || mode === 'PKT' || mode === 'DMR';
    if (Math.abs(diff) < 6) {
      result *= 0.1;
      impairments.unshift('collision');
    } else if (diff <= -10) {
      // We are the weaker signal
      result *= fm ? 0 : 0.2;
      impairments.unshift('interference');
    } else if (diff >= 10) {
      // We are stronger: FM captures cleanly, SSB shows some bleed
      result *= fm ? 1 : 0.85;
    } else {
      result *= diff > 0 ? 0.6 : 0.05;
      impairments.unshift('collision');
    }
  }

  return result;
}

/** Deterministic hash to [0,1) */
function hash01(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;

  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Partial transcript: each word survives with probability = intelligibility; dropped words become an ellipsis */
export function revealTranscript(text: string, intelligibility: number, seed: number): string {
  const q = clamp01(intelligibility);
  if (q >= 0.98) {
    return text;
  }
  const words = text.split(/\s+/u).filter((w) => w.length > 0);

  return words.map((w, i) => (q > 0.02 && hash01(seed, i) < q ? w : '…')).join(' ');
}
