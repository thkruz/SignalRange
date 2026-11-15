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
    expect(markup).toContain('hidden>CB<');
  });
});
