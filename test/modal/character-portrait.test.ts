import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/asset-url', () => ({
  getAssetUrl: vi.fn((path: string) => path),
}));

import { Character, Emotion } from '../../src/modal/character-enum';
import { getCharacterInitials, renderCharacterPortrait } from '../../src/modal/character-portrait';

const UNCAST = [Character.ALEKSANDRA_WYSOCKA, Character.MAREK_DOMANSKI, Character.IRENA_MAZUR, Character.TOMASZ_WRONA];

describe('character portraits', () => {
  it('never renders the developer placeholder image for uncast speakers', () => {
    for (const character of UNCAST) {
      const markup = renderCharacterPortrait(character, Emotion.HAPPY);
      expect(markup).not.toContain('placeholder-avatar');
      expect(markup).not.toContain('<img');
      expect(markup).toContain('character-portrait-plate');
    }
  });

  it('uses initials, ignoring quoted nicknames', () => {
    expect(getCharacterInitials(Character.MAREK_DOMANSKI)).toBe('MD');
    expect(getCharacterInitials(Character.ALEKSANDRA_WYSOCKA)).toBe('AW');
    expect(getCharacterInitials(Character.TOMASZ_WRONA)).toBe('TW');
  });

  it('cast speakers get an image that swaps to the plate on load failure', () => {
    const markup = renderCharacterPortrait(Character.CHARLIE_BROOKS, Emotion.HAPPY, { id: 'x' });
    expect(markup).toContain('<img id="x"');
    expect(markup).toContain('charlie-brooks-happy.png');
    expect(markup).not.toContain('placeholder-avatar');
    expect(markup).toMatch(/onerror="[^"]*hidden=true/u);
    expect(markup).not.toContain('this.onerror=null');
    expect(markup).toMatch(/onload="this\.hidden=false;this\.nextElementSibling\.hidden=true/u);
    expect(markup).toContain('alt="Charlie Brooks"');
    expect(markup).toContain('hidden>CB<');
  });
});

describe('non-person and decorative plates', () => {
  it('NOTICE and SYSTEM show a glyph, not initials', () => {
    for (const c of [Character.NOTICE, Character.SYSTEM]) {
      const markup = renderCharacterPortrait(c, undefined);
      expect(markup).toContain('<svg');
      expect(markup).toContain('character-portrait-plate--glyph');
      expect(markup).not.toContain('<img');
    }
  });

  it('an empty alt hides the plate from assistive tech, otherwise it is named', () => {
    expect(renderCharacterPortrait(Character.MAREK_DOMANSKI, undefined, { alt: '' })).toContain('aria-hidden="true"');
    expect(renderCharacterPortrait(Character.MAREK_DOMANSKI, undefined)).toContain('role="img" aria-label="Marek');
  });

  it('the dev hint warns once per missing asset', () => {
    const hook = (window as unknown as Record<string, (s: string) => void>).__srPortraitMissing;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hook('/a.png');
    hook('/a.png');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('r2:pull');
    warn.mockRestore();
  });
});

describe('dialog-manager call site', () => {
  it('renders the speaker through renderCharacterPortrait, not a raw <img>', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/modal/dialog-manager.ts', 'utf8');
    expect(src).toContain('renderCharacterPortrait(');
    expect(src).not.toMatch(/<img[^>]*getCharacterAvatarUrl/u);
    expect(src).not.toMatch(/<img\b/u);
  });

  it('uncast plates carry the requested id', () => {
    expect(renderCharacterPortrait(Character.MAREK_DOMANSKI, Emotion.HAPPY, { id: 'quiz-avatar' })).toContain('id="quiz-avatar"');
  });
});
