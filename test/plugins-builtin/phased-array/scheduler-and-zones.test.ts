import { BeamScheduler, type SkyObject, type SkySource, selectTarget } from '@app/plugins-builtin/phased-array/beam-scheduler';
import { ExclusionZoneSet, GeoArcExclusionZone, visibleGeoArc } from '@app/plugins-builtin/phased-array/exclusion-zones';
import { PanelGeometry } from '@app/plugins-builtin/phased-array/scan-geometry';

class FakeSky implements SkySource {
  objects = new Map<number, SkyObject>();
  set(norad: number, az: number, el: number): void {
    this.objects.set(norad, { norad, name: `SAT ${norad}`, az, el });
  }
  list(): SkyObject[] {
    return [...this.objects.values()].filter((o) => o.el > 0);
  }
  positionOf(norad: number): { az: number; el: number } | null {
    const o = this.objects.get(norad);

    return o ? { az: o.az, el: o.el } : null;
  }
}

const panel = new PanelGeometry(0, 0, 57);

function make(sky: FakeSky, excluded: (az: number, el: number) => boolean = () => false): BeamScheduler {
  return new BeamScheduler(sky, panel, excluded, { handoverOutageMs: 100 });
}

describe('selectTarget', () => {
  it('picks the highest elevation', () => {
    expect(
      selectTarget(
        [
          { norad: 1, el: 50 },
          { norad: 2, el: 70 },
        ],
        null,
        8
      )?.norad
    ).toBe(2);
  });
  it('keeps the current target inside the hysteresis margin', () => {
    expect(
      selectTarget(
        [
          { norad: 1, el: 60 },
          { norad: 2, el: 66 },
        ],
        1,
        8
      )?.norad
    ).toBe(1);
  });
  it('switches when the best beats the current by more than the margin', () => {
    const r = selectTarget(
      [
        { norad: 1, el: 60 },
        { norad: 2, el: 70 },
      ],
      1,
      8
    );

    expect(r?.norad).toBe(2);
    expect(r?.isHandover).toBe(true);
  });
  it('returns null for an empty set', () => {
    expect(selectTarget([], null, 8)).toBeNull();
  });
});

describe('BeamScheduler', () => {
  it('acquires the best eligible satellite in auto mode', () => {
    const sky = new FakeSky();

    sky.set(1, 10, 55);
    sky.set(2, 200, 80);
    const s = make(sky);

    s.update(0);
    expect(s.targetNorad).toBe(2);
    expect(s.beam).toEqual({ az: 200, el: 80 });
  });

  it('ignores satellites outside the scan cone', () => {
    const sky = new FakeSky();

    sky.set(1, 10, 20);
    const s = make(sky);

    s.update(0);
    expect(s.targetNorad).toBeNull();
    expect(s.snapshot().visible.find((x) => x.norad === 1)?.inScan).toBe(false);
  });

  it('holds the target through a small elevation lead (hysteresis)', () => {
    const sky = new FakeSky();

    sky.set(1, 0, 60);
    sky.set(2, 90, 62);
    const s = make(sky);

    s.update(0);
    const first = s.targetNorad;

    sky.set(2, 90, 64);
    s.update(2000);
    expect(s.targetNorad).toBe(first);
  });

  it('logs a link drop with the serving satellite at each handover', () => {
    const sky = new FakeSky();

    sky.set(1, 0, 60);
    sky.set(2, 180, 55);
    const s = make(sky);

    s.update(0);
    expect(s.linkDrops).toHaveLength(0);
    sky.set(1, 0, 20);
    s.update(1000);
    expect(s.linkDrops).toHaveLength(1);
    expect(s.linkDrops[0]).toMatchObject({ atMs: 1000, servingNorad: 1, nextNorad: 2 });
  });

  it('hands over when the target leaves the cone, with an outage', () => {
    const sky = new FakeSky();

    sky.set(1, 0, 60);
    sky.set(2, 180, 55);
    const s = make(sky);

    s.update(0);
    expect(s.targetNorad).toBe(1);
    sky.set(1, 0, 20);
    s.update(1000);
    expect(s.targetNorad).toBe(2);
    expect(s.snapshot().lastHandover?.reason).toBe('left-cone');
    expect(s.handoverCount).toBe(1);
    expect(s.isInOutage(1000)).toBe(true);
    expect(s.isInOutage(1099)).toBe(true);
    expect(s.isInOutage(1100)).toBe(false);
  });

  it('skips satellites inside an exclusion zone', () => {
    const sky = new FakeSky();

    sky.set(1, 0, 85);
    sky.set(2, 180, 60);
    const s = make(sky, (az) => az < 90);

    s.update(0);
    expect(s.targetNorad).toBe(2);
    expect(s.snapshot().visible.find((x) => x.norad === 1)?.inExclusion).toBe(true);
  });

  it('manual lock holds a lower satellite and refuses bad targets', () => {
    const sky = new FakeSky();

    sky.set(1, 0, 85);
    sky.set(2, 180, 60);
    sky.set(3, 90, 15);
    sky.set(4, 45, -5);
    sky.set(5, 270, 70);
    const s = make(sky, (az, el) => az === 270 && el === 70);

    expect(s.lock(2)).toEqual({ ok: true });
    s.update(0);
    s.update(5000);
    expect(s.mode).toBe('manual');
    expect(s.targetNorad).toBe(2);
    expect(s.lock(3)).toEqual({ ok: false, reason: 'out-of-scan' });
    expect(s.lock(4)).toEqual({ ok: false, reason: 'below-horizon' });
    expect(s.lock(5)).toEqual({ ok: false, reason: 'in-exclusion' });
    expect(s.lock(99)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('manual lock is dropped, not re-selected, when the target leaves the cone', () => {
    const sky = new FakeSky();

    sky.set(1, 0, 60);
    sky.set(2, 180, 70);
    const s = make(sky);

    s.lock(1);
    sky.set(1, 0, 10);
    s.update(1000);
    expect(s.targetNorad).toBeNull();
    expect(s.snapshot().lockLostReason).toBe('left-cone');
  });

  it('stow parks the beam on the panel normal with no target', () => {
    const sky = new FakeSky();

    sky.set(1, 0, 80);
    const s = make(sky);

    s.update(0);
    s.stow();
    s.update(1000);
    expect(s.mode).toBe('stow');
    expect(s.targetNorad).toBeNull();
    expect(s.beam.el).toBeCloseTo(90, 6);
  });

  it('predicts upcoming handovers in auto mode', () => {
    const sky = new FakeSky();
    const live: SkySource = {
      list: () => sky.list(),
      positionOf: (n, t) => {
        if (n === 1) {
          return t < 180_000 ? { az: 0, el: 80 } : { az: 0, el: 10 };
        }

        return { az: 180, el: 55 };
      },
    };

    sky.set(1, 0, 80);
    sky.set(2, 180, 55);
    const s = new BeamScheduler(live, panel, () => false, { handoverOutageMs: 100 });

    s.update(0);
    const h = s.snapshot().handovers;

    expect(h.length).toBeGreaterThan(0);
    expect(h[0].toNorad).toBe(2);
    expect(h[0].atMs).toBeGreaterThanOrEqual(150_000);
    expect(h[0].atMs).toBeLessThanOrEqual(200_000);
  });

  it('stays cheap with thousands of satellites', () => {
    const sky = new FakeSky();

    for (let i = 0; i < 11000; i++) {
      sky.set(i, (i * 7) % 360, 1 + ((i * 13) % 89));
    }
    const s = new BeamScheduler(sky, panel, () => false, {});
    const t0 = performance.now();

    s.update(0);
    for (let k = 1; k <= 60; k++) {
      s.update(k * 16);
    }
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('GEO arc exclusion zone at 36N 105W', () => {
  const lat = 36;
  const lon = -105;
  const topOf = (arc: readonly { az: number; el: number }[]) => arc.reduce((a, b) => (b.el > a.el ? b : a));

  it('the visible arc is in the southern sky and peaks near the meridian', () => {
    const arc = visibleGeoArc(lat, lon);
    const top = topOf(arc);

    expect(arc.length).toBeGreaterThan(20);
    expect(top.el).toBeGreaterThan(45);
    expect(top.el).toBeLessThan(55);
    expect(Math.abs(top.az - 180)).toBeLessThan(2);
  });

  it('contains points on and near the arc, not far from it', () => {
    const z = new GeoArcExclusionZone(lat, lon);
    const top = topOf(visibleGeoArc(lat, lon));

    expect(z.contains(top.az, top.el)).toBe(true);
    expect(z.contains(top.az, top.el + 5)).toBe(true);
    expect(z.contains(top.az, top.el + 20)).toBe(false);
    expect(z.contains(0, 80)).toBe(false);
  });

  it('width setter changes membership and clamps; toggle disables', () => {
    const z = new GeoArcExclusionZone(lat, lon);
    const top = topOf(visibleGeoArc(lat, lon));
    const probe = top.el + 12;

    expect(z.contains(top.az, probe)).toBe(false);
    z.setWidthDeg(15);
    expect(z.contains(top.az, probe)).toBe(true);
    z.setWidthDeg(500);
    expect(z.widthDeg).toBe(GeoArcExclusionZone.MAX_WIDTH_DEG);
    const set = new ExclusionZoneSet();

    set.add(z);
    expect(set.isExcluded(top.az, top.el)).toBe(true);
    z.enabled = false;
    expect(set.isExcluded(top.az, top.el)).toBe(false);
  });

  it('ExclusionZoneSet.isExcluded ORs its zones', () => {
    const set = new ExclusionZoneSet();
    const z = new GeoArcExclusionZone(lat, lon);

    set.add(z);
    const top = topOf(z.arc);

    expect(set.isExcluded(top.az, top.el)).toBe(true);
    expect(set.isExcluded(0, 85)).toBe(false);
  });
});
