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
const CAPS_WORDS = ['AND', 'APPLY', 'ENCRYPTION', 'LOCK', 'PROGRAM', 'STOW', 'MERIDIAN', 'COMSEC', 'TRANSEC'];

/** Site names follow Ted's review: VT-01 = Vermont one, ME-02 = Maine two; nats-eu adds GW-01 = Galway one, SH-02 = Shetland two. */
const NAMES = [
  [/\bVT-0(\d)\b/gu, (_m, d) => `Vermont ${ONES[Number(d)]}`],
  [/\bME-0(\d)\b/gu, (_m, d) => `Maine ${ONES[Number(d)]}`],
  [/\bGW-0(\d)\b/gu, (_m, d) => `Galway ${ONES[Number(d)]}`],
  [/\bSH-0(\d)\b/gu, (_m, d) => `Shetland ${ONES[Number(d)]}`],
  [/\bKG-0(\d)\b/gu, (_m, d) => `K.G ${ONES[Number(d)]}`],
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

/** "04" -> "oh four", "14" -> "fourteen", "00" -> "zero zero" (military hour). */
const militaryHour = (hh) => (hh === 0 ? 'zero zero' : hh < 10 ? `oh ${ONES[hh]}` : two(hh));

/** Hop-set number: a zero-padded single digit gets "oh" ("04" -> "oh four"); an unpadded one is read plain. */
const hopNumber = (pad, n) => (n.length === 1 && pad ? `oh ${ONES[Number(n)]}` : intWords(Number(n)));

/** Hex digits: numerals as words, letters as the letter names ElevenLabs reads cleanly. */
const HEX_LETTERS = { A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'eff' };

/** Second half of a four-digit frequency read as two pairs: 05 -> "oh five", 00 -> "hundred". */
const FREQ_PAIR = (rest) => (rest === 0 ? 'hundred' : rest < 10 ? `oh ${ONES[rest]}` : two(rest));

/** Hyphenated nats-eu command, hop-set and key ids; spoken as words, never letter by letter with pauses. */
const IDS = [
  [/\bPLD-SAFE\b/gu, 'P.L.D safe'],
  [/\bPLD-ON\b/gu, 'P.L.D on'],
  [/\bPLD-STATUS\b/gu, 'P.L.D status'],
  [/\bHK-DUMP\b/gu, 'housekeeping dump'],
  [/\bREC-PLAYBACK\b/gu, 'record playback'],
  [/\bKEY-VERIFY\b/gu, 'key verify'],
  [/\bKEY-2027-(Q\d)\b/gu, 'key twenty twenty-seven $1'],
  [/(?<=hop set )HOP-SAR(\d)-(0?)(\d+)\b/gu, (_m, s, pad, n) => `Sar ${ONES[Number(s)]} ${hopNumber(pad, n)}`],
  [/\bHOP-SAR(\d)-(0?)(\d+)\b/gu, (_m, s, pad, n) => `hop Sar ${ONES[Number(s)]} ${hopNumber(pad, n)}`],
  [/\bMER-OPS-CAM-2027-0?(\d+)\b/gu, (_m, n) => `Meridian ops cam twenty twenty-seven ${Number(n) < 100 ? `oh ${two(Number(n))}` : intWords(Number(n))}`],
  [/\bMER-OPS-CAM-0?(\d+)\b/gu, (_m, n) => `Meridian ops cam ${intWords(Number(n))}`],
];

/** The prompt to send for a scenario line. */
export function promptFor(text, campaign) {
  const eu = campaign === 'nats-eu';
  let t = stripStageDirections(text)
    // Attributive size: "a 4 m Ku beamwidth" -> "a four-metre Ku beamwidth" (before the plain metres and band rules)
    .replace(/\b(a|an|the)\s(\d+(?:\.\d+)?) m(?=\s+(?!(?:of|and|or|to|from|above|below|away|per|in|on|at|is|are|was|by|the|a|an)\b)[A-Za-z])/gu, (_m, art, n) => `${art} ${n.includes('.') ? n : intWords(Number(n))}-metre`)
    // 5-digit uplink frequencies 14035 / 14065 kHz: "fourteen oh three five"
    .replace(/\b140(\d)(\d)\b/gu, (_m, a, b) => `fourteen oh ${ONES[Number(a)]} ${ONES[Number(b)]}`)
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
    // Ted (nats 10/sustain-rx-margin): "C/N is pronounced Carrier to Noise"
    .replace(/\bC\/N\b/gu, 'carrier to noise')
    .replace(/\bG\/T\b/gu, 'G over T')
    .replace(/\bAES-256-GCM\b/gu, 'AES two fifty-six GCM')
    .replace(/\bQPSK-/gu, 'QPSK ')
    // nats-eu vocabulary: band letters, RF chain and ops abbreviations (dotted letters read fluently)
    .replace(/\bKu\b/gu, 'K.U')
    .replace(/\bKa\b/gu, 'K.A')
    .replace(/\bTT&C\b/gu, 'T.T and C')
    .replace(/\bLNA\b/gu, 'L.N.A')
    .replace(/\bIMD\b/gu, 'I.M.D')
    .replace(/\bEIRP\b/gu, 'E.I.R.P')
    .replace(/\bGNSS\b/gu, 'G.N.S.S')
    .replace(/\bOBC\b/gu, 'O.B.C')
    .replace(/\bTRR\b/gu, 'T.R.R')
    .replace(/\bAOS\b/gu, 'A.O.S')
    // Ted (nats-eu 23/ride-through): "LOS is line of sight"
    .replace(/\bLOS\b/gu, 'line of sight')
    .replace(/\bLEOP\b/gu, 'Lee-op')
    .replace(/\bNAK\b/gu, 'N.A.K')
    // Ted (nats-eu 3/confirm-execution, 12/enable-the-hpa): "ACK is pronounced Acknowledgement"; "ack" was heard as "act"
    .replace(/\bACK\b/gu, 'acknowledgement')
    // Ted (nats 6/enable-transmit-path): "RX is pronounced receive"
    .replace(/\bRX\b/gu, 'receive')
    // Ted (nats-eu 7/ephemeris-epoch-check): "go / no-go" was read with an odd "if go"
    .replace(/\bgo \/ no-go\b/gu, 'go or no-go')
    // Ted (nats-eu 8/shetland-remote-sweep): odd emphasis on "Night."; he suggested goodnight
    .replace(/Station's yours\. Night\./gu, "Station's yours. Goodnight.")
    .replace(/\bComReg\b/gu, 'Com-Reg')
    .replace(/\bFaroes\b/gu, 'Fair-ohz')
    .replace(/\bUTC\b/gu, 'U.T.C')
    .replace(/\bQ(\d)b\b/gu, (_m, d) => `Q ${ONES[Number(d)]} B`)
    // Coordinates "62.5 N 7.5 W", metres, hex counters
    .replace(/\b(\d+(?:\.\d+)?) ([NS]) (\d+(?:\.\d+)?) ([EW])\b/gu, (_m, a, ns, b, ew) => `${a} ${ns === 'N' ? 'north' : 'south'} ${b} ${ew === 'E' ? 'east' : 'west'}`)
    .replace(/\b(\d+) m\b/gu, '$1 metres')
    .replace(/\b0x([0-9A-Fa-f]+)\b/gu, (_m, h) => `hex ${[...h].map((c) => (/\d/u.test(c) ? ONES[Number(c)] : (HEX_LETTERS[c.toUpperCase()] ?? c.toUpperCase()))).join(' ')}`);
  if (eu) t = t.replace(/\bIF\b/gu, 'I.F').replace(/\bLO\b/gu, 'L.O');
  for (const [re, fn] of IDS) t = t.replace(re, fn);
  t = t.replace(/\bSAR-(\d)\b/gu, (_m, d) => `Sar ${ONES[Number(d)]}`);
  // KG-01 as the crypto unit (the line mentions zeroizing) is "K.G oh one"; otherwise it stays "K.G one"
  if (/zeroi[sz]/iu.test(t)) t = t.replace(/\bKG-0(\d)\b/gu, (_m, d) => `K.G oh ${ONES[Number(d)]}`);
  for (const [re, fn] of NAMES) t = t.replace(re, fn);
  for (const w of CAPS_WORDS) t = t.replace(new RegExp(`\\b${w}\\b`, 'gu'), w[0] + w.slice(1).toLowerCase());
  t = t
    .replace(/\b(\d)\/(\d)\b/gu, (m) => FRACTIONS[m] ?? m)
    .replace(/(^|[\s(])-(\d)/gu, '$1minus $2')
    // Zulu / UTC times: 04:15:00Z, 1432Z, 14:32 UTC -> "oh four fifteen zulu", "fourteen thirty-two zulu"
    .replace(/\b([01]\d|2[0-3]):?([0-5]\d)(?::([0-5]\d))?\s?(Z|U\.T\.C)(?!\w)/gu, (_m, hh, mm, ss, zone) => {
      const minute = Number(mm);
      const clock = `${militaryHour(Number(hh))} ${minute === 0 ? 'hundred' : minute < 10 ? `oh ${ONES[minute]}` : two(minute)}`;
      const secs = ss === undefined || Number(ss) === 0 ? '' : ` and ${two(Number(ss))} seconds`;
      return `${clock}${secs} ${zone === 'Z' ? 'zulu' : 'U.T.C'}`;
    })
    // Compact UTC times occur in later NATS scripts (1032:30, 1035, 0850).
    .replace(/\b(at|around|by|about|the)\s+([01]\d|2[0-3])([0-5]\d)(?::([0-5]\d))?\b/gu, (_m, prefix, hh, mm, ss) => {
      const minute = Number(mm);
      const clock = `${two(Number(hh))} ${minute === 0 ? 'hundred' : minute < 10 ? `oh ${ONES[minute]}` : two(minute)}`;
      return `${prefix} ${ss === undefined ? clock : `${clock} and ${two(Number(ss))} seconds`}`;
    })
    // Clock times with seconds: 14:03:40 -> "fourteen oh three and forty seconds"
    .replace(/\b0?(\d{1,2}):(\d{2}):(\d{2})\b/gu, (_m, h, mm, ss) => {
      const min = Number(mm);
      return `${two(Number(h))} ${min === 0 ? (Number(ss) === 0 ? "o'clock" : 'hundred') : min < 10 ? `oh ${ONES[min]}` : two(min)}${Number(ss) === 0 ? '' : ` and ${two(Number(ss))} seconds`}`;
    })
    .replace(/\b0?(\d{1,2}):(\d{2})\b/gu, (_m, h, mm) => {
      const min = Number(mm);
      return `${two(Number(h))} ${min === 0 ? "o'clock" : min < 10 ? `oh ${ONES[min]}` : two(min)}`;
    })
    // Bare four-digit frequencies that would otherwise read as digits: "on 1414" -> "on fourteen fourteen"
    .replace(/(?<![\d.,:])(1290|1315|1340|1405|1414)(?![\d:]|[.,]\d)/gu, (_m, f) => `${two(Number(f.slice(0, 2)))} ${FREQ_PAIR(Number(f.slice(2)))}`)
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
export function settingsFor(cast, emotion, prompt, campaign) {
  const s = { ...(cast.voiceSettings ?? {}), ...(cast.emotionSettings?.[emotion] ?? {}) };
  if (cast.longLine && prompt.length > cast.longLine.minChars) s.speed = cast.longLine.speed;
  // Per-campaign override (a voice shared between campaigns keeps its settings in the other one)
  if (campaign && cast.campaignSettings?.[campaign]) Object.assign(s, cast.campaignSettings[campaign]);
  return s;
}
