import { describe, expect, it } from 'vitest';
import { Character } from '../../src/modal/character-enum';
import { renderSelectionCrew, scenarioCharacters } from '../../src/pages/selection-crew';
import type { ScenarioData } from '../../src/ScenarioData';

describe('mission participants', () => {
  it('collects every speaker and quiz presenter once, excluding system notices', () => {
    const clip = (character: Character) => ({ character, text: '', audioUrl: '' });
    const scenario = {
      dialogClips: {
        intro: clip(Character.RILEY_BROOKS),
        objectivesOnStart: { first: clip(Character.FIONA_MACLEOD), repeated: clip(Character.RILEY_BROOKS) },
        objectives: { notice: clip(Character.NOTICE), last: clip(Character.CATHERINE_VEGA) },
      },
      objectives: [
        {
          conditions: [
            { type: 'status-check', params: { character: Character.SYSTEM } },
            { type: 'status-check', params: {} },
          ],
        },
      ],
    } as ScenarioData;
    expect(scenarioCharacters(scenario)).toEqual([Character.RILEY_BROOKS, Character.FIONA_MACLEOD, Character.CATHERINE_VEGA, Character.CHARLIE_BROOKS]);
  });

  it('omits the portrait section for solo/system-only missions', () => {
    expect(renderSelectionCrew({ dialogClips: { intro: { character: Character.SYSTEM, text: '', audioUrl: '' } } } as ScenarioData)).toBe('');
  });
});
