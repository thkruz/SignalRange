import './character-portrait.css';
import { Character, CharacterAvatars, CharacterNames, Emotion, getCharacterAvatarUrl } from './character-enum';

/** Uncast characters have no painted portrait yet; their avatar is a developer placeholder image. */
export function isUncastAvatar(character: Character): boolean {
  return CharacterAvatars[character].includes('placeholder-avatar');
}

/** Two-letter initials from the display name, ignoring quoted nicknames: "Marek Domański" -> "MD". */
export function getCharacterInitials(character: Character): string {
  const words = CharacterNames[character]
    .replace(/[“”"][^“”"]*[“”"]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
  const letters = [words[0], words[words.length - 1]].map((w) => (w ? [...w][0] : ''));
  return (words.length > 1 ? letters.join('') : letters[0]).toUpperCase();
}

function escapeAttr(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;');
}

/**
 * Portrait markup for a speaker. Cast characters get an <img> that swaps to the
 * in-world initials plate if it fails to load; uncast characters get the plate
 * directly and never request the developer placeholder image.
 */
export function renderCharacterPortrait(character: Character, emotion: Emotion | undefined, options: { id?: string; className?: string; alt?: string } = {}): string {
  const name = escapeAttr(CharacterNames[character]);
  const cls = options.className ? `${escapeAttr(options.className)} ` : '';
  const uncast = isUncastAvatar(character) || !CharacterAvatars[character];
  const plate = `<span class="character-portrait-plate ${cls}" role="img" aria-label="${name}"${uncast ? '' : ' hidden'}>${getCharacterInitials(character)}</span>`;
  if (uncast) return plate;
  const id = options.id ? ` id="${escapeAttr(options.id)}"` : '';
  const alt = escapeAttr(options.alt ?? CharacterNames[character]);
  const img = `<img${id} class="${cls.trim()}" src="${escapeAttr(getCharacterAvatarUrl(character, emotion))}" alt="${alt}" onerror="this.onerror=null;this.hidden=true;this.nextElementSibling.hidden=false;" />`;
  return img + plate;
}
