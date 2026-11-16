/**
 * @file ham-privileges - U.S. Technician transmit privileges (47 CFR 97.301(e), 97.305)
 * @description The operator's legal permission to transmit, checked at the
 * moment of keying. Separate from what the hardware can do (ham-profiles.ts).
 * Bounded to the segments C3 can reach; everything not listed is refused.
 *
 * Sources: 47 CFR 97.301(e) (Technician frequency privileges), 97.305(c)
 * (authorized emission types), 97.313 (power). Checked 2026-11-09 against the
 * eCFR. CW-only HF segments are included so boundary tests are honest.
 */

import type { HamMode } from './ham-types';

export type LicenseClass = 'none' | 'technician';

export type EmissionCategory = 'cw' | 'phone' | 'data';

export interface PrivilegeSegment {
  loMHz: number;
  hiMHz: number;
  band: string;
  categories: readonly EmissionCategory[];
  /** Max transmitter output, W PEP */
  maxPowerW: number;
  note?: string;
}

/** Technician privileges the campaign uses (97.301(e) plus the VHF/UHF bands above 50 MHz) */
export const TECHNICIAN_SEGMENTS: readonly PrivilegeSegment[] = [
  { loMHz: 3.525, hiMHz: 3.6, band: '80 m', categories: ['cw'], maxPowerW: 200 },
  { loMHz: 7.025, hiMHz: 7.125, band: '40 m', categories: ['cw'], maxPowerW: 200 },
  { loMHz: 21.025, hiMHz: 21.2, band: '15 m', categories: ['cw'], maxPowerW: 200 },
  { loMHz: 28.0, hiMHz: 28.3, band: '10 m', categories: ['cw', 'data'], maxPowerW: 200, note: 'CW, RTTY and data' },
  { loMHz: 28.3, hiMHz: 28.5, band: '10 m', categories: ['cw', 'phone'], maxPowerW: 200, note: 'CW and SSB phone' },
  { loMHz: 50.0, hiMHz: 50.1, band: '6 m', categories: ['cw'], maxPowerW: 1500, note: 'CW only (97.305(c))' },
  { loMHz: 50.1, hiMHz: 54.0, band: '6 m', categories: ['cw', 'phone', 'data'], maxPowerW: 1500 },
  { loMHz: 144.0, hiMHz: 144.1, band: '2 m', categories: ['cw'], maxPowerW: 1500, note: 'CW only (97.305(c))' },
  { loMHz: 144.1, hiMHz: 148.0, band: '2 m', categories: ['cw', 'phone', 'data'], maxPowerW: 1500 },
  { loMHz: 222.0, hiMHz: 225.0, band: '1.25 m', categories: ['cw', 'phone', 'data'], maxPowerW: 1500 },
  { loMHz: 420.0, hiMHz: 450.0, band: '70 cm', categories: ['cw', 'phone', 'data'], maxPowerW: 1500 },
];

export function emissionCategory(mode: HamMode): EmissionCategory {
  switch (mode) {
    case 'CW':
      return 'cw';
    case 'PKT':
    case 'FT8':
      return 'data';
    default:
      // FM, AM, SSB and DMR digital voice are all phone emissions
      return 'phone';
  }
}

/** Nominal occupied bandwidth of an emission, Hz */
export function occupiedBandwidthHz(mode: HamMode): number {
  switch (mode) {
    case 'CW':
      return 150;
    case 'USB':
    case 'LSB':
      return 2800;
    case 'AM':
      return 6000;
    case 'FT8':
      return 50;
    case 'DMR':
      return 12500;
    case 'PKT':
    case 'FM':
      return 16000;
  }
}

/** Lowest and highest frequency an emission occupies, Hz (USB above the carrier, LSB below) */
export function occupiedEdgesHz(freqHz: number, mode: HamMode, bandwidthHz = occupiedBandwidthHz(mode)): [number, number] {
  if (mode === 'USB' || mode === 'FT8') {
    return [freqHz, freqHz + bandwidthHz];
  }
  if (mode === 'LSB') {
    return [freqHz - bandwidthHz, freqHz];
  }

  return [freqHz - bandwidthHz / 2, freqHz + bandwidthHz / 2];
}

export interface PrivilegeCheck {
  allowed: boolean;
  code?: 'no-license' | 'privilege' | 'band-edge' | 'power-limit';
  reason?: string;
  segment?: PrivilegeSegment;
}

/**
 * May a Technician (or an unlicensed listener) transmit this emission?
 * The whole occupied bandwidth must sit inside one segment that allows the
 * emission category, and output power must not exceed the segment limit.
 */
export function checkTransmitPrivilege(license: LicenseClass, freqHz: number, mode: HamMode, powerW: number, bandwidthHz?: number): PrivilegeCheck {
  if (license === 'none') {
    return { allowed: false, code: 'no-license', reason: 'No license grant is on record for this operator, so the station may not transmit.' };
  }

  const category = emissionCategory(mode);
  const [lo, hi] = occupiedEdgesHz(freqHz, mode, bandwidthHz);
  const carrierMHz = freqHz / 1e6;
  const containing = TECHNICIAN_SEGMENTS.filter((s) => carrierMHz >= s.loMHz && carrierMHz <= s.hiMHz);

  if (containing.length === 0) {
    return { allowed: false, code: 'privilege', reason: `${carrierMHz.toFixed(4)} MHz is outside Technician transmit privileges.` };
  }

  // Adjacent segments of the same band can be merged when both allow the category
  const allowing = TECHNICIAN_SEGMENTS.filter((s) => s.categories.includes(category));
  const fits = allowing.find((s) => lo / 1e6 >= s.loMHz - 1e-9 && hi / 1e6 <= s.hiMHz + 1e-9) ?? mergedFit_(allowing, lo / 1e6, hi / 1e6);

  if (!fits) {
    const carrierSegment = containing.find((s) => s.categories.includes(category));
    if (carrierSegment) {
      return {
        allowed: false,
        code: 'band-edge',
        reason: `The ${mode} signal occupies ${(lo / 1e6).toFixed(4)}-${(hi / 1e6).toFixed(4)} MHz, which crosses the edge of the ${carrierSegment.band} segment that allows it.`,
        segment: carrierSegment,
      };
    }

    return {
      allowed: false,
      code: 'privilege',
      reason: `${mode} is not a permitted Technician emission at ${carrierMHz.toFixed(4)} MHz (${containing[0].note ?? containing[0].band}).`,
      segment: containing[0],
    };
  }

  if (powerW > fits.maxPowerW) {
    return { allowed: false, code: 'power-limit', reason: `${powerW} W exceeds the ${fits.maxPowerW} W PEP Technician limit in this segment.`, segment: fits };
  }

  return { allowed: true, segment: fits };
}

/** Contiguous segments allowing the category (e.g. 144.1-148 within 2 m) treated as one span */
function mergedFit_(allowing: readonly PrivilegeSegment[], loMHz: number, hiMHz: number): PrivilegeSegment | undefined {
  const start = allowing.find((s) => loMHz >= s.loMHz - 1e-9 && loMHz <= s.hiMHz);
  if (!start) {
    return undefined;
  }
  let reach = start.hiMHz;
  let maxPowerW = start.maxPowerW;
  let advanced = true;
  while (advanced && reach < hiMHz) {
    advanced = false;
    const next = allowing.find((s) => Math.abs(s.loMHz - reach) < 1e-9);
    if (next) {
      reach = next.hiMHz;
      maxPowerW = Math.min(maxPowerW, next.maxPowerW);
      advanced = true;
    }
  }

  return reach >= hiMHz - 1e-9 ? { ...start, hiMHz: reach, maxPowerW } : undefined;
}
