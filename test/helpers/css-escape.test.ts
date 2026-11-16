import { describe, expect, it } from 'vitest';
import { cssEscape } from './css-escape';

describe('cssEscape (jsdom shim)', () => {
  it('escapes the matched character, not the interpolation', () => {
    expect(cssEscape('rack:1')).toBe('rack\\:1');
    expect(cssEscape('a.b#c')).toBe('a\\.b\\#c');
    expect(cssEscape('x y')).toBe('x\\ y');
  });
  it('leaves identifier characters alone', () => {
    expect(cssEscape('rack-1_A')).toBe('rack-1_A');
  });
  it('hex-escapes leading digits and control characters', () => {
    expect(cssEscape('1a')).toBe('\\31 a');
    expect(cssEscape('-1')).toBe('-\\31 ');
    expect(cssEscape('a\u0001b')).toBe('a\\1 b');
  });
  it('escapes a lone hyphen and replaces NUL', () => {
    expect(cssEscape('-')).toBe('\\-');
    expect(cssEscape('a\u0000')).toBe('a\uFFFD');
  });
  it('is installed as globalThis.CSS.escape and selects punctuated ids', () => {
    expect(CSS.escape('rack:1')).toBe('rack\\:1');
    document.body.innerHTML = '<div id="rack:1"></div>';
    expect(document.querySelector(`#${CSS.escape('rack:1')}`)).not.toBeNull();
  });
});
