import type { HamMode, OnAirEmission } from '../../../src/ham/ham-types';
import type { HearsFn } from '../../../src/ham/ops/ops-common';

let n = 0;

export function playerEmission(p: Partial<OnAirEmission> & { freqHz: number; mode?: HamMode }): OnAirEmission {
  n++;
  return {
    id: `p-${n}`,
    sourceId: 'player',
    isPlayer: true,
    mode: 'FM',
    bandwidthHz: 15000,
    erpDbm: 37,
    polarization: 'V',
    ctcssHz: null,
    payload: { kind: 'voice', text: 'x', callsign: 'K0TST' },
    startS: 0,
    endS: 4,
    ...p,
  } as OnAirEmission;
}

/** Everyone hears everything at 20 dB SNR unless overridden */
export const hearsAll: HearsFn = () => ({ snrDb: 20, decoded: true });

export function hearsOnly(ids: string[]): HearsFn {
  return (_e, id) => ({ snrDb: ids.includes(id) ? 20 : -20, decoded: ids.includes(id) });
}
