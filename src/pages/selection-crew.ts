import { Character, CharacterAvatars, CharacterNames, CharacterTitles } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { selectionText } from './selection-browser';

/** Include speakers and quiz presenters once, excluding system-only messages. */
export function scenarioCharacters(scenario: ScenarioData): Character[] {
  const characters = new Set<Character>();
  const add = (character?: Character) => {
    if (character && CharacterAvatars[character]) characters.add(character);
  };
  add(scenario.dialogClips?.intro?.character);
  for (const clips of [scenario.dialogClips?.objectivesOnStart, scenario.dialogClips?.objectives]) {
    for (const clip of Object.values(clips ?? {})) add(clip.character);
  }
  for (const objective of scenario.objectives ?? []) {
    for (const condition of objective.conditions ?? []) {
      if (condition.type === 'status-check') add(condition.params?.character ?? Character.CHARLIE_BROOKS);
    }
  }
  return [...characters];
}

export function renderSelectionCrew(scenario: ScenarioData): string {
  const characters = scenarioCharacters(scenario);
  if (!characters.length) return '';
  return `<section class="selection-crew" aria-label="Mission participants"><h3>Mission crew</h3><ul>${characters
    .map(
      (character) =>
        `<li title="${selectionText(CharacterTitles[character])}"><img src="${selectionText(CharacterAvatars[character])}" alt="" width="56" height="64" decoding="async" onerror="this.onerror=null; this.src='/images/placeholder-avatar.png'" /><span>${selectionText(CharacterNames[character])}</span></li>`
    )
    .join('')}</ul></section>`;
}
