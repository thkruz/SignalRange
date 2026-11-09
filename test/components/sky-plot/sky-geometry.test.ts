import {
  angularSeparationDeg,
  azElToXY,
  geoArcBand,
  geoArcPoints,
  geoLookAngle,
  isWithinScan,
  nearestWithin,
  scanLimitOutline,
  xyToAzEl,
} from '@app/components/sky-plot/sky-geometry';

describe('azElToXY', () => {
  const cx = 100;
  const cy = 100;
  const R = 80;

  it('puts zenith at the centre', () => {
    const p = azElToXY(123, 90, cx, cy, R);

    expect(p.x).toBeCloseTo(cx, 6);
    expect(p.y).toBeCloseTo(cy, 6);
  });

  it('has north up, east right, south down, west left on the horizon', () => {
    expect(azElToXY(0, 0, cx, cy, R).x).toBeCloseTo(100, 6);
    expect(azElToXY(0, 0, cx, cy, R).y).toBeCloseTo(20, 6);
    expect(azElToXY(90, 0, cx, cy, R).x).toBeCloseTo(180, 6);
    expect(azElToXY(180, 0, cx, cy, R).y).toBeCloseTo(180, 6);
    expect(azElToXY(270, 0, cx, cy, R).x).toBeCloseTo(20, 6);
  });

  it('uses r = R(1 - el/90)', () => {
    const p = azElToXY(0, 45, cx, cy, R);

    expect(cy - p.y).toBeCloseTo(40, 6);
  });

  it('clamps negative elevation to the horizon and round-trips', () => {
    expect(azElToXY(0, -10, cx, cy, R).y).toBeCloseTo(20, 6);

    const p = azElToXY(217, 33, cx, cy, R);
    const back = xyToAzEl(p.x, p.y, cx, cy, R)!;

    expect(back.azDeg).toBeCloseTo(217, 6);
    expect(back.elDeg).toBeCloseTo(33, 6);
    expect(xyToAzEl(0, 0, cx, cy, R)).toBeNull();
  });
});

describe('nearestWithin (hit-testing)', () => {
  const xs = [10, 12, 100];
  const ys = [10, 10, 100];
  const pads = [3, 3, 6];

  it('returns the nearest dot within tolerance', () => {
    expect(nearestWithin(xs, ys, pads, 3, 11.5, 10, 4)).toBe(1);
    expect(nearestWithin(xs, ys, pads, 3, 10.4, 10, 4)).toBe(0);
  });

  it('returns -1 outside tolerance plus pad', () => {
    expect(nearestWithin(xs, ys, pads, 3, 50, 50, 4)).toBe(-1);
    expect(nearestWithin(xs, ys, pads, 3, 100, 111, 4)).toBe(-1);
    expect(nearestWithin(xs, ys, pads, 3, 100, 109, 4)).toBe(2);
  });
});

describe('isWithinScan for a tilted panel', () => {
  it('flat panel is a cone about zenith', () => {
    expect(isWithinScan(0, 90, 0, 0, 60)).toBe(true);
    expect(isWithinScan(77, 31, 0, 0, 60)).toBe(true);
    expect(isWithinScan(77, 29, 0, 0, 60)).toBe(false);
  });

  it('a panel tilted 30 deg to the south reaches further south than north', () => {
    // normal az 180, el 60; scan 60 -> south edge at el 0, north edge over zenith at el 60
    expect(isWithinScan(180, 1, 180, 30, 60)).toBe(true);
    expect(isWithinScan(0, 59, 180, 30, 60)).toBe(false);
    expect(isWithinScan(0, 61, 180, 30, 60)).toBe(true);
  });

  it('is symmetric about the normal azimuth', () => {
    expect(isWithinScan(220, 20, 180, 30, 60)).toBe(isWithinScan(140, 20, 180, 30, 60));
  });

  it('rejects below the horizon', () => {
    expect(isWithinScan(0, -1, 0, 0, 120)).toBe(false);
  });

  it('outline points lie exactly maxScan from the normal (above the horizon)', () => {
    for (const p of scanLimitOutline(200, 25, 50)) {
      if (p.elDeg > 0) expect(angularSeparationDeg(p.azDeg, p.elDeg, 200, 65)).toBeCloseTo(50, 5);
    }
  });
});

describe('GEO arc geometry', () => {
  it('36N 105W: arc peaks due south near 48 deg', () => {
    const peak = geoLookAngle(36, -105, -105);

    expect(peak.azDeg).toBeCloseTo(180, 4);
    expect(peak.elDeg).toBeGreaterThan(47.5);
    expect(peak.elDeg).toBeLessThan(48.8);

    const arc = geoArcPoints(36, -105, 1);
    const maxEl = Math.max(...arc.map((p) => p.elDeg));

    expect(maxEl).toBeCloseTo(peak.elDeg, 4);
  });

  it('36N 105W: arc starts in the south-west (west satellites) and ends in the south-east', () => {
    const arc = geoArcPoints(36, -105, 1);

    expect(arc[0].azDeg).toBeGreaterThan(180);
    expect(arc[0].azDeg).toBeLessThan(270);
    expect(arc[arc.length - 1].azDeg).toBeLessThan(180);
    expect(arc[arc.length - 1].azDeg).toBeGreaterThan(90);
    expect(arc.length).toBeGreaterThan(120);
    expect(arc.length).toBeLessThan(165);
  });

  it('equator station sees a satellite overhead at its own longitude', () => {
    expect(geoLookAngle(0, 30, 30).elDeg).toBeCloseTo(90, 4);
  });

  it('southern hemisphere stations see the arc to the north', () => {
    const p = geoLookAngle(-34, 151, 151);

    expect(Math.min(p.azDeg, 360 - p.azDeg)).toBeLessThan(0.01);
    expect(p.elDeg).toBeGreaterThan(50);
  });

  it('arc elevation drops with latitude (60N peaks well below 36N)', () => {
    expect(geoLookAngle(60, -105, -105).elDeg).toBeLessThan(geoLookAngle(36, -105, -105).elDeg - 15);
  });

  it('polar stations see no GEO arc', () => {
    expect(geoArcBand(88, 0, 5)).toBeNull();
  });

  it('band for 36N 105W is a closed polygon whose edges sit N deg from the arc', () => {
    const half = 5;
    const band = geoArcBand(36, -105, half)!;
    const arc = geoArcPoints(36, -105, 1, -half);

    expect(band.points.length).toBe(arc.length * 2);

    for (let i = 0; i < arc.length; i += 10) {
      const p = band.points[i];

      if (p.elDeg > 0) {
        expect(angularSeparationDeg(p.azDeg, p.elDeg, arc[i].azDeg, arc[i].elDeg)).toBeCloseTo(half, 3);
      }
    }

    const els = band.points.map((p) => p.elDeg);

    expect(Math.max(...els)).toBeCloseTo(48.2 + half, 0);
    expect(band.points.every((p) => p.elDeg >= 0)).toBe(true);
  });
});
