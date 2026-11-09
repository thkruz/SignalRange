/**
 * Pure sky geometry for the phased array: unit vectors in the station's local
 * ENU frame, angular separation and scan angle from the panel normal.
 * Azimuth is degrees clockwise from north, elevation degrees above the horizon.
 */
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export type Vec3 = readonly [number, number, number];

/** Unit vector (east, north, up) of a horizontal direction. */
export function enuUnit(azDeg: number, elDeg: number): [number, number, number] {
  const az = azDeg * D2R;
  const el = elDeg * D2R;
  const ce = Math.cos(el);

  return [Math.sin(az) * ce, Math.cos(az) * ce, Math.sin(el)];
}

/** Angle between two unit vectors, degrees. */
export function separationDeg(a: Vec3, b: Vec3): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  return Math.acos(Math.max(-1, Math.min(1, dot))) * R2D;
}

/** Great-circle separation between two az/el directions, degrees. */
export function azElSeparationDeg(az1: number, el1: number, az2: number, el2: number): number {
  return separationDeg(enuUnit(az1, el1), enuUnit(az2, el2));
}

/** Convert an ENU offset (east, north, up in any length unit) to az/el degrees. */
export function enuToAzEl(east: number, north: number, up: number): { az: number; el: number; range: number } {
  const range = Math.hypot(east, north, up);
  const az = (((Math.atan2(east, north) * R2D) % 360) + 360) % 360;
  const el = range > 0 ? Math.asin(Math.max(-1, Math.min(1, up / range))) * R2D : 0;

  return { az, el, range };
}

/** The fixed panel: its normal and how far the beam may scan from it. */
export class PanelGeometry {
  private normal_: Vec3;

  constructor(
    readonly panelAzDeg: number,
    /** Tilt of the panel from flat-facing-zenith, degrees (0 = looks straight up) */
    readonly panelTiltDeg: number,
    readonly maxScanDeg: number
  ) {
    this.normal_ = enuUnit(panelAzDeg, 90 - panelTiltDeg);
  }

  /** Panel normal as az/el (the stow direction). */
  get normalAzEl(): { az: number; el: number } {
    return { az: ((this.panelAzDeg % 360) + 360) % 360, el: 90 - this.panelTiltDeg };
  }

  /** Scan angle theta_s: angle between the beam direction and the panel normal, degrees. */
  scanAngleDeg(azDeg: number, elDeg: number): number {
    return separationDeg(enuUnit(azDeg, elDeg), this.normal_);
  }

  isInScanCone(azDeg: number, elDeg: number): boolean {
    return this.scanAngleDeg(azDeg, elDeg) <= this.maxScanDeg;
  }
}
