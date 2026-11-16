import { describe, expect, it } from 'vitest';
import { clampBoxTop } from '../../src/modal/clamp-box-top';

describe('clampBoxTop', () => {
  it('pulls a box that grew past the bottom edge back inside a 720 px viewport', () => {
    expect(clampBoxTop(175, 600, 720)).toBe(112);
  });
  it('leaves a box that fits where it is', () => {
    expect(clampBoxTop(100, 400, 720)).toBe(100);
  });
  it('never goes above the top margin when the box is taller than the viewport', () => {
    expect(clampBoxTop(50, 900, 720)).toBe(8);
  });
  it('honours the page scroll offset', () => {
    expect(clampBoxTop(1000, 600, 720, 500)).toBe(612);
  });
});
