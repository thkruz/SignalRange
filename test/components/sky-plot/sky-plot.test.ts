import { geoArcBand } from '@app/components/sky-plot/sky-geometry';
import { DEFAULT_SKY_PALETTE, getSkyDotStyleSpec, SKY_DOT_STYLES, type SkyDot, type SkyDotStyle, SkyPlot } from '@app/components/sky-plot/sky-plot';

function makeDots(n: number): SkyDot[] {
  const styles: SkyDotStyle[] = ['known', 'dim', 'known', 'known', 'pinned'];

  return Array.from({ length: n }, (_, i) => {
    let style: SkyDotStyle = styles[i % styles.length];

    if (i === 0) style = 'target';
    if (i === 1) style = 'candidate';

    return { id: `s${i}`, azDeg: (i * 137.5) % 360, elDeg: 5 + ((i * 37) % 85), style };
  });
}

function makePlot(config = {}): { plot: SkyPlot; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');

  document.body.appendChild(canvas);

  const plot = new SkyPlot('sky-test', { size: 400, ...config });

  plot.attach(canvas);

  return { plot, canvas };
}

describe('style mapping', () => {
  it('maps each style to the documented look', () => {
    expect(getSkyDotStyleSpec('known')).toMatchObject({ palette: 'known', fill: true, ring: false });
    expect(getSkyDotStyleSpec('dim')).toMatchObject({ palette: 'dim', fill: true });
    expect(getSkyDotStyleSpec('dim').alpha).toBeLessThan(1);
    expect(getSkyDotStyleSpec('target')).toMatchObject({ palette: 'target', fill: true });
    expect(getSkyDotStyleSpec('candidate')).toMatchObject({ palette: 'candidate', fill: false, ring: true });
    expect(getSkyDotStyleSpec('pinned')).toMatchObject({ ring: true, ringPalette: 'pinned' });
  });

  it('target is larger than known; dim is no larger than known', () => {
    expect(SKY_DOT_STYLES.target.radius).toBeGreaterThan(SKY_DOT_STYLES.known.radius);
    expect(SKY_DOT_STYLES.dim.radius).toBeLessThanOrEqual(SKY_DOT_STYLES.known.radius);
  });

  it('target is green and known is blue in the fallback palette', () => {
    const rgb = (c: string): number[] => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
    const [kr, kg, kb] = rgb(DEFAULT_SKY_PALETTE.known);
    const [tr, tg, tb] = rgb(DEFAULT_SKY_PALETTE.target);

    expect(kb).toBeGreaterThan(kr);
    expect(kb).toBeGreaterThan(kg);
    expect(tg).toBeGreaterThan(tr);
    expect(tg).toBeGreaterThan(tb);
  });
});

describe('SkyPlot', () => {
  it('hit-tests the nearest dot using the last draw', () => {
    const { plot } = makePlot();
    const { cx, cy, radius } = plot.getLayout();

    plot.setDots([
      { id: 'a', azDeg: 90, elDeg: 0, style: 'known' },
      { id: 'b', azDeg: 90, elDeg: 3, style: 'known' },
    ]);
    plot.draw();

    expect(plot.hitTest(cx + radius, cy)?.id).toBe('a');
    expect(plot.hitTest(cx + radius * (1 - 3 / 90), cy)?.id).toBe('b');
    expect(plot.hitTest(cx, cy)).toBeNull();
    plot.dispose();
  });

  it('fires hover and click callbacks and stops after dispose', () => {
    const onHover = vi.fn();
    const onClick = vi.fn();
    const { plot, canvas } = makePlot({ onHover, onClick });
    const { cx, cy } = plot.getLayout();

    plot.setDots([{ id: 'z', azDeg: 0, elDeg: 90, style: 'target' }]);
    plot.draw();

    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: cx, clientY: cy }));
    expect(onHover).toHaveBeenCalledWith(expect.objectContaining({ id: 'z' }), expect.anything());

    canvas.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy }));
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'z' }), expect.anything());

    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 0, clientY: 0 }));
    expect(onHover).toHaveBeenLastCalledWith(null, expect.anything());

    plot.dispose();
    onClick.mockClear();
    canvas.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is DPR-aware', () => {
    const old = window.devicePixelRatio;

    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

    const { plot, canvas } = makePlot();

    expect(canvas.width).toBe(800);
    plot.dispose();
    Object.defineProperty(window, 'devicePixelRatio', { value: old, configurable: true });
  });

  it('draws a full scene without throwing and survives dispose', () => {
    const { plot } = makePlot();

    plot.setDots(makeDots(50));
    plot.setBeam({ azDeg: 100, elDeg: 40, beamwidthDeg: 5 });
    plot.setTrack([
      { azDeg: 100, elDeg: 40 },
      { azDeg: 110, elDeg: 45 },
    ]);
    plot.setScanMask({ panelAzDeg: 180, tiltDeg: 30, maxScanDeg: 60 });
    plot.setZones([geoArcBand(36, -105, 5)!]);
    expect(() => plot.draw()).not.toThrow();
    plot.dispose();
    expect(() => plot.draw()).not.toThrow();
  });
});

describe('performance', () => {
  it('redraws 300 dots + mask + zone + track in under 2 ms (context stub: JS-side cost)', () => {
    const canvas = document.createElement('canvas');
    const noop = (): void => undefined;
    const stub = new Proxy({}, { get: () => noop, set: () => true }) as unknown as CanvasRenderingContext2D;

    canvas.getContext = (() => stub) as unknown as typeof canvas.getContext;

    const bench = new SkyPlot('sky-bench', { size: 400 });

    bench.attach(canvas);
    bench.setDots(makeDots(300));
    bench.setBeam({ azDeg: 100, elDeg: 40, beamwidthDeg: 5 });
    bench.setTrack(Array.from({ length: 20 }, (_, i) => ({ azDeg: 100 + i, elDeg: 40 + i * 0.3 })));
    bench.setScanMask({ panelAzDeg: 180, tiltDeg: 30, maxScanDeg: 60 });
    bench.setZones([geoArcBand(36, -105, 5)!]);

    for (let i = 0; i < 50; i++) bench.draw();

    const runs = 300;
    const t0 = performance.now();

    for (let i = 0; i < runs; i++) bench.draw();

    const ms = (performance.now() - t0) / runs;

    console.log(`SKYPLOT_PERF stub-context ms/draw=${ms.toFixed(4)}`);
    expect(ms).toBeLessThan(2);
    bench.dispose();
  });
});
