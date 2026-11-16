import './character-portrait.css';
import { Character, CharacterAvatars, CharacterNames, Emotion, getCharacterAvatarUrl, UNCAST_CHARACTER_AVATAR } from './character-enum';

/** Uncast characters have no painted portrait yet; their avatar is a developer placeholder image. */
export function isUncastAvatar(character: Character): boolean {
  return CharacterAvatars[character] === UNCAST_CHARACTER_AVATAR;
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

const MISSING_HOOK = '__srPortraitMissing';

/** Dev builds only: tell contributors without the R2 art why every cast portrait shows initials. */
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  const warned = new Set<string>();
  (window as unknown as Record<string, unknown>)[MISSING_HOOK] = (src: string): void => {
    if (warned.has(src)) return;
    warned.add(src);
    // eslint-disable-next-line no-console
    console.warn(`[portrait] missing asset ${src}; run "npm run r2:pull" to fetch the character art`);
  };
}

const NOTICE_GLYPH =
  '<svg viewBox="0 0 24 24" width="55%" height="55%" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14h7M9 17h5"/></svg>';
const SYSTEM_GLYPH =
  '<svg viewBox="0 0 24 24" width="55%" height="55%" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 10l3 2-3 2M12 15h5"/></svg>';

/** Non-person speakers (written notices, the knowledge-check voice) get a glyph, not a person's initials. */
function getNonPersonGlyph(character: Character): string | null {
  if (character === Character.NOTICE) return NOTICE_GLYPH;
  if (character === Character.SYSTEM) return SYSTEM_GLYPH;
  return null;
}

/**
 * Portrait markup for a speaker. Cast characters get an <img> that swaps to the
 * in-world initials plate if it fails to load (and back if a later src loads);
 * uncast characters get the plate directly and never request the developer
 * placeholder image. An empty `alt` marks the portrait decorative.
 */
export function renderCharacterPortrait(character: Character, emotion: Emotion | undefined, options: { id?: string; className?: string; alt?: string } = {}): string {
  const name = escapeAttr(CharacterNames[character]);
  const cls = options.className ? `${escapeAttr(options.className)} ` : '';
  const uncast = isUncastAvatar(character) || !CharacterAvatars[character];
  const glyph = getNonPersonGlyph(character);
  const decorative = options.alt === '';
  const a11y = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${name}"`;
  const kind = glyph ? ' character-portrait-plate--glyph' : '';
  const plate = `<span class="character-portrait-plate${kind} ${cls}" ${a11y}${uncast ? '' : ' hidden'}>${glyph ?? getCharacterInitials(character)}</span>`;
  const id = options.id ? ` id="${escapeAttr(options.id)}"` : '';
  if (uncast) return plate.replace('<span ', `<span${id} `);
  const alt = escapeAttr(options.alt ?? CharacterNames[character]);
  const onerror = `this.hidden=true;this.nextElementSibling.hidden=false;window.${MISSING_HOOK}&&window.${MISSING_HOOK}(this.src);`;
  const onload = 'this.hidden=false;this.nextElementSibling.hidden=true;';
  const img = `<img${id} class="${cls.trim()}" src="${escapeAttr(getCharacterAvatarUrl(character, emotion))}" alt="${alt}" onerror="${onerror}" onload="${onload}" />`;
  return img + plate;
}

/** Swap the emotion on a rendered portrait. A missing element or the uncast initials plate is left alone. */
export function setPortraitEmotion(el: HTMLElement | null, character: Character, emotion: Emotion): void {
  if (el instanceof HTMLImageElement) el.src = getCharacterAvatarUrl(character, emotion);
}
