/**
 * Text rules for voice-over prompts: turn scenario dialog into text ElevenLabs
 * reads the way Ted wants it heard. Each rule comes from a review note in
 * src/private/notes/vo-regen-2026-10-16.md; add a rule when a review finds a new
 * mispronunciation, never edit the scenario text for it.
 *
 * Lessons the rules encode:
 * - Hyphen-spelled letters ("G-P-S") make the voice pause between letters. Plain
 *   acronyms are fine unless they start with A (read "ah" or "I see you"); dotted
 *   letters without a final period ("A.C.U") read fluently.
 * - Blank-line paragraph breaks give 1.4-1.5 s silences; a 0.6 s break tag keeps
 *   the beat at a topic change without dragging.
 * - Long numbers read digit by digit sound unnatural: say them the way an
 *   operator would ("ten seventy-four point five").
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const two = (n) => (n < 10 ? ONES[n] : n < 20 ? TEENS[n - 10] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));

/** Operator style: 153 -> "one fifty-three", 1074 -> "ten seventy-four", 5250 -> "fifty-two fifty", 105 -> "one oh five". */
export function intWords(n) {
  if (n < 100) return two(n);
  // Ted: 7,000 is seven thousand, not seventy hundred.
  if (n >= 1000 && n < 10000 && n % 1000 === 0) return `${ONES[n / 1000]} thousand`;
  const pair = (rest) => (rest === 0 ? 'hundred' : rest < 10 ? `oh ${ONES[rest]}` : two(rest));
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} ${pair(n % 100)}`;
  if (n < 10000) return `${two(Math.floor(n / 100))} ${pair(n % 100)}`;
  return String(n);
}

/** Decimals and comma-grouped numbers in words; plain small integers stay digits. */
function numbers(text) {
  return text.replace(/\b(\d{1,3}(?:,\d{3})+|\d+)\.(\d+)\b|\b(\d{1,3}(?:,\d{3})+)\b/gu, (_m, intPart, dec, commaInt) => {
    const int = Number((intPart ?? commaInt).replace(/,/gu, ''));
    const whole = intPart !== undefined && int === 0 ? 'zero' : intWords(int);
    return dec !== undefined ? `${whole} point ${[...dec].map((d) => ONES[Number(d)]).join(' ')}` : whole;
  });
}

const FRACTIONS = { '1/2': 'one half', '2/3': 'two thirds', '3/4': 'three quarters', '5/6': 'five sixths', '7/8': 'seven eighths', '1/3': 'one third', '1/4': 'one quarter' };

/** Labels written in capitals for the UI; spoken as ordinary words. */
const CAPS_WORDS = ['AND', 'APPLY', 'ENCRYPTION', 'LOCK', 'PROGRAM', 'STOW'];

/** Site names follow Ted's review: VT-01 = Vermont one, ME-02 = Maine two. */
const NAMES = [
  [/\bVT-0(\d)\b/gu, (_m, d) => `Vermont ${ONES[Number(d)]}`],
  [/\bME-0(\d)\b/gu, (_m, d) => `Maine ${ONES[Number(d)]}`],
  [/\bTP-(\d)\b/gu, (_m, d) => `T.P ${ONES[Number(d)]}`],
];

/**
 * Stage directions are for the screen, not the voice: "[Text message from Dana at 2:03 AM] "Hey - ..."" is spoken as
 * just the message (Ted 2026-10-16). A text-message line voices only its quoted messages, one paragraph each, so
 * narration after them ("Congratulations. You've demonstrated ...") stays on screen. Other lines drop [bracketed]
 * notes. Double quotes are never spoken, so all of them go.
 */
function stripStageDirections(text) {
  if (/\[\s*text message/iu.test(text)) {
    const messages = [...text.matchAll(/["“]([^"”]+)["”]/gu)].map((m) => m[1].trim());
    if (messages.length) return messages.join('\n\n');
  }
  return text.replace(/\[[^\]]*\]/gu, ' ').replace(/["“”]/gu, '').trim();
}

/** The prompt to send for a scenario line. */
export function promptFor(text) {
  let t = stripStageDirections(text)
    // Pronunciation (Ted's review notes)
    .replace(/GPSDO/gu, 'GPS D-O')
    .replace(/GPS-Disciplined/gu, 'GPS Disciplined')
    .replace(/\bBUCs\b/gu, 'bucks')
    .replace(/\bBUC\b/gu, 'buck')
    .replace(/\bACU\b/gu, 'A.C.U')
    .replace(/\bAGC\b/gu, 'A.G.C')
    .replace(/\bSLA\b/gu, 'S.L.A')
    .replace(/\bGEO\b/gu, 'Gee-oh')
    .replace(/\bcoax\b/gu, 'co-ax')
    // Ted: "dB should be pronounced 'decibels' or 'dee-bee'"; dee-bee also covers dBm/dBW, which decibels cannot
    .replace(/\bdBs\b/gu, 'dee-bees')
    .replace(/\bdBm\b/gu, 'dee-bee-em')
    .replace(/\bdBW\b/gu, 'dee-bee-double-you')
    .replace(/\bdB\b/gu, 'dee-bee')
    .replace(/\bC\/N\b/gu, 'C over N')
    .replace(/\bG\/T\b/gu, 'G over T')
    .replace(/\bAES-256-GCM\b/gu, 'AES two fifty-six GCM')
    .replace(/\bQPSK-/gu, 'QPSK ');
  for (const [re, fn] of NAMES) t = t.replace(re, fn);
  for (const w of CAPS_WORDS) t = t.replace(new RegExp(`\\b${w}\\b`, 'gu'), w[0] + w.slice(1).toLowerCase());
  t = t
    .replace(/\b(\d)\/(\d)\b/gu, (m) => FRACTIONS[m] ?? m)
    .replace(/(^|[\s(])-(\d)/gu, '$1minus $2')
    // Compact UTC times occur in later NATS scripts (1032:30, 1035, 0850).
    .replace(/\b(at|around|by|about|the)\s+([01]\d|2[0-3])([0-5]\d)(?::([0-5]\d))?\b/gu, (_m, prefix, hh, mm, ss) => {
      const minute = Number(mm);
      const clock = `${two(Number(hh))} ${minute === 0 ? 'hundred' : minute < 10 ? `oh ${ONES[minute]}` : two(minute)}`;
      return `${prefix} ${ss === undefined ? clock : `${clock} and ${two(Number(ss))} seconds`}`;
    })
    .replace(/\b0?(\d{1,2}):(\d{2})\b/gu, (_m, h, mm) => {
      const min = Number(mm);
      return `${two(Number(h))} ${min === 0 ? "o'clock" : min < 10 ? `oh ${ONES[min]}` : two(min)}`;
    })
    .replace(/\b(\d+)\s?K\b/gu, '$1 kelvin')
    .replace(/\b(\d+)\s?kHz\b/gu, (_m, n) => `${intWords(Number(n))} kilohertz`)
    .replace(/\b10 MHz\b/gu, 'ten megahertz');
  t = numbers(t)
    .replace(/\bMHz\b/gu, 'megahertz')
    .replace(/\bGHz\b/gu, 'gigahertz')
    .replace(/\bkHz\b/gu, 'kilohertz');
  return t
    .replace(/\s*\n\s*\n\s*/gu, ' <break time="0.6s" /> ')
    .replace(/\s*\n\s*/gu, ' ')
    .trim();
}

/**
 * Voice settings for one line: the character's approved settings, then its
 * per-emotion overrides, then a slower speed for long explanatory lines.
 */
export function settingsFor(cast, emotion, prompt) {
  const s = { ...(cast.voiceSettings ?? {}), ...(cast.emotionSettings?.[emotion] ?? {}) };
  if (cast.longLine && prompt.length > cast.longLine.minChars) s.speed = cast.longLine.speed;
  return s;
}
