import { vi } from 'vitest';
import {
  Character,
  CharacterAvatars,
  CharacterCompany,
  CharacterNames,
  CharacterTitles,
  Emotion,
  getCharacterAvatarUrl,
} from '../../src/modal/character-enum';

// Mock getAssetUrl
vi.mock('../../src/utils/asset-url', () => ({
  getAssetUrl: vi.fn((path: string) => path),
}));

describe('character-enum', () => {
  describe('Character enum', () => {
    it('should have all expected characters', () => {
      expect(Character.CHARLIE_BROOKS).toBe('charlie_brooks');
      expect(Character.CATHERINE_VEGA).toBe('catherine_vega');
      expect(Character.JAMES_OKAFOR).toBe('james_okafor');
      expect(Character.FRANCIS_MARTIN).toBe('francis_martin');
      expect(Character.MARCUS_CHEN).toBe('marcus_chen');
    });
  });

  describe('Emotion enum', () => {
    it('should have all expected emotions', () => {
      expect(Emotion.NEUTRAL).toBe('neutral');
      expect(Emotion.HAPPY).toBe('happy');
      expect(Emotion.ANGRY).toBe('angry');
      expect(Emotion.SAD).toBe('sad');
      expect(Emotion.SURPRISED).toBe('surprised');
      expect(Emotion.CONCERNED).toBe('concerned');
      expect(Emotion.CONFIDENT).toBe('confident');
      expect(Emotion.SKEPTICAL).toBe('skeptical');
      expect(Emotion.EXCITED).toBe('excited');
      expect(Emotion.FRUSTRATED).toBe('frustrated');
    });
  });

  describe('CharacterAvatars', () => {
    it('should have avatar paths for all characters', () => {
      expect(CharacterAvatars[Character.CHARLIE_BROOKS]).toContain('charlie-brooks.png');
      expect(CharacterAvatars[Character.CATHERINE_VEGA]).toContain('catherine-vega.png');
      expect(CharacterAvatars[Character.JAMES_OKAFOR]).toContain('james-okafor.png');
      expect(CharacterAvatars[Character.FRANCIS_MARTIN]).toContain('francis-martin.png');
      expect(CharacterAvatars[Character.MARCUS_CHEN]).toContain('marcus-chen.png');
    });

    it('should use correct path structure', () => {
      expect(CharacterAvatars[Character.CHARLIE_BROOKS]).toBe('/assets/characters/charlie-brooks.png');
    });
  });

  describe('CharacterNames', () => {
    it('should have display names for all characters', () => {
      expect(CharacterNames[Character.CHARLIE_BROOKS]).toBe('Charlie Brooks');
      expect(CharacterNames[Character.CATHERINE_VEGA]).toBe('Catherine Vega');
      expect(CharacterNames[Character.JAMES_OKAFOR]).toBe('James Okafor');
      expect(CharacterNames[Character.FRANCIS_MARTIN]).toBe('Francis Martin');
      expect(CharacterNames[Character.MARCUS_CHEN]).toBe('Marcus Chen');
    });
  });

  describe('CharacterTitles', () => {
    it('should have job titles for all characters', () => {
      expect(CharacterTitles[Character.CHARLIE_BROOKS]).toBe('Senior Ground Station Operator');
      expect(CharacterTitles[Character.CATHERINE_VEGA]).toBe('Ground Station Operator');
      expect(CharacterTitles[Character.JAMES_OKAFOR]).toBe('Fleet Captain');
      expect(CharacterTitles[Character.FRANCIS_MARTIN]).toBe('Board Member');
      expect(CharacterTitles[Character.MARCUS_CHEN]).toBe('Satellite Operations Engineer');
    });
  });

  describe('CharacterCompany', () => {
    it('should have company affiliations for all characters', () => {
      expect(CharacterCompany[Character.CHARLIE_BROOKS]).toBe('North Atlantic Teleport Services (Vermont)');
      expect(CharacterCompany[Character.CATHERINE_VEGA]).toBe('North Atlantic Teleport Services (Maine)');
      expect(CharacterCompany[Character.JAMES_OKAFOR]).toBe('Atlantic Shipping Alliance');
      expect(CharacterCompany[Character.FRANCIS_MARTIN]).toBe('SeaLink');
      expect(CharacterCompany[Character.MARCUS_CHEN]).toBe('SeaLink Maritime (Halifax)');
    });
  });

  describe('getCharacterAvatarUrl', () => {
    it('should return base path for neutral emotion', () => {
      const url = getCharacterAvatarUrl(Character.CHARLIE_BROOKS, Emotion.NEUTRAL);

      expect(url).toBe('/assets/characters/charlie-brooks.png');
    });

    it('should return base path when no emotion is provided', () => {
      const url = getCharacterAvatarUrl(Character.CHARLIE_BROOKS);

      expect(url).toBe('/assets/characters/charlie-brooks.png');
    });

    it('should return path with emotion suffix for non-neutral emotions', () => {
      const url = getCharacterAvatarUrl(Character.CHARLIE_BROOKS, Emotion.HAPPY);

      expect(url).toBe('/assets/characters/charlie-brooks-happy.png');
    });

    it('should work with all emotions', () => {
      const emotions = [
        Emotion.HAPPY,
        Emotion.ANGRY,
        Emotion.SAD,
        Emotion.SURPRISED,
        Emotion.CONCERNED,
        Emotion.CONFIDENT,
        Emotion.SKEPTICAL,
        Emotion.EXCITED,
        Emotion.FRUSTRATED,
      ];

      for (const emotion of emotions) {
        const url = getCharacterAvatarUrl(Character.CHARLIE_BROOKS, emotion);
        expect(url).toBe(`/assets/characters/charlie-brooks-${emotion}.png`);
      }
    });

    it('should work with all characters', () => {
      const characters = [
        Character.CHARLIE_BROOKS,
        Character.CATHERINE_VEGA,
        Character.JAMES_OKAFOR,
        Character.FRANCIS_MARTIN,
        Character.MARCUS_CHEN,
      ];

      for (const character of characters) {
        const url = getCharacterAvatarUrl(character, Emotion.HAPPY);
        expect(url).toContain('-happy.png');
      }
    });

    it('should correctly insert emotion before .png extension', () => {
      const url = getCharacterAvatarUrl(Character.CATHERINE_VEGA, Emotion.CONCERNED);

      expect(url).toBe('/assets/characters/catherine-vega-concerned.png');
    });
  });
});
