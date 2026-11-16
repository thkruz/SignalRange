import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACE_ART } from '../../src/ham/ui/bench/bench-art';
import { INSTRUMENTS } from '../../src/ham/ui/bench/instrument-face';
import { boxStyle, markFailed, paintedFace, syncPaintedChassis } from '../../src/ham/ui/panels/painted-face';

const used = (file: string): string[] => {
  const src = readFileSync(`src/ham/ui/panels/${file}`, 'utf8');
  const block = src.slice(src.indexOf('paintedFace('));

  return [...block.matchAll(/\['(\w+)',/gu)].map((m) => m[1]);
};

describe('painted instrument faces (issue 307)', () => {
  const panels: [string, string, string][] = [
    ['meter', 'meter-panel.ts', 'multimeter'],
    ['swr', 'swr-panel.ts', 'swr'],
    ['analyzer', 'analyzer-panel.ts', 'analyzer'],
  ];

  it.each(panels)('%s: every slot the panel places has a painted region', (key, file, art) => {
    const names = used(file);
    expect(names.length).toBeGreaterThan(3);
    for (const n of names) expect(FACE_ART[art].regions[n], `${art}.${n}`).toBeDefined();
    expect(INSTRUMENTS[key].painted).toBe(true);
  });

  it('every region box lies inside the picture', () => {
    for (const art of Object.values(FACE_ART)) {
      for (const b of Object.values(art.regions)) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(1.0001);
        expect(b.y + b.h).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('boxStyle gives percentages and an unknown region throws', () => {
    expect(boxStyle({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toBe('left:10.00%;top:20.00%;width:30.00%;height:40.00%');
    expect(() => paintedFace(FACE_ART.swr, 'swr', [['nope', document.createElement('div')]])).toThrow(/no region/u);
  });

  it('controls stay live and placed when the face image fails', () => {
    const btn = document.createElement('button');
    let clicks = 0;
    btn.addEventListener('click', () => clicks++);
    const chassis = document.createElement('section');
    chassis.className = 'inst-chassis inst-painted';
    const face = paintedFace(FACE_ART.swr, 'swr', [['key', btn]]);
    chassis.append(face);
    markFailed(face);
    expect(face.classList.contains('pface-failed')).toBe(true);
    expect(face.style.backgroundImage).toBe('none');
    expect(chassis.classList.contains('inst-painted')).toBe(false);
    expect(face.querySelector('img')).toBeNull();
    expect(btn.style.width).not.toBe('');
    btn.click();
    expect(clicks).toBe(1);
  });

  it('image fails first, chassis built afterwards: plain chassis is restored', () => {
    const face = paintedFace(FACE_ART.swr, 'swr', []);
    markFailed(face);
    const chassis = document.createElement('section');
    chassis.className = 'inst-chassis inst-painted';
    chassis.append(face);
    syncPaintedChassis(chassis);
    expect(chassis.classList.contains('inst-painted')).toBe(false);
    const ok = document.createElement('section');
    ok.className = 'inst-chassis inst-painted';
    ok.append(paintedFace(FACE_ART.swr, 'swr', []));
    syncPaintedChassis(ok);
    expect(ok.classList.contains('inst-painted')).toBe(true);
  });
});
