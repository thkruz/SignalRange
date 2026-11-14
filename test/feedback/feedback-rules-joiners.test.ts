import { sanitizeText, wasStripped } from '../../src/feedback/feedback-rules';

const intact = (s: string) => {
  const r = sanitizeText(s, 'player');
  return r.ok && r.text === s && !wasStripped(r.stripped);
};

describe('feedback rules: legitimate joiners and emoji', () => {
  it.each([
    ['woman technologist, medium skin', '\u{1F469}\u{1F3FD}‍\u{1F4BB}'],
    ['runner with tone and sign', '\u{1F3C3}\u{1F3FD}‍♀️'],
    ['red hair with tone', '\u{1F9D1}\u{1F3FB}‍\u{1F9B0}'],
    ['handshake with two tones', '\u{1F469}\u{1F3FD}‍\u{1F91D}‍\u{1F468}\u{1F3FF}'],
  ])('keeps a ZWJ after a skin-tone modifier: %s', (_n, s) => {
    expect(intact(s)).toBe(true);
  });

  it.each([
    ['England', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'],
    ['Scotland', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'],
    ['Wales', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}'],
  ])('keeps the %s subdivision flag', (_n, s) => {
    expect(intact(s)).toBe(true);
  });

  it('strips other tag characters, including a hidden payload inside a flag', () => {
    const payload = '\u{1F3F4}\u{E0068}\u{E0069}\u{E007F}';
    const r = sanitizeText(`x${payload}`, 'player');
    expect(r.ok && r.text).toBe('x\u{1F3F4}');
    expect(r.stripped.tags).toBe(3);
    const bare = sanitizeText('a\u{E0067}\u{E0062}b', 'player');
    expect(bare.ok && bare.text).toBe('ab');
    const noFlag = sanitizeText('a\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}b', 'player');
    expect(noFlag.ok && noFlag.text).toBe('ab');
  });

  it.each([
    ['Persian ZWNJ', 'می‌خواهم'],
    ['Sinhala ZWJ', 'ශ්‍රී'],
    ['Bengali ZWJ', 'র‍্য'],
    ['Devanagari ZWJ', 'क्‍ष'],
  ])('keeps %s between same-script letters without a risk flag', (_n, s) => {
    expect(intact(s)).toBe(true);
  });

  it('still strips a joiner between Latin letters, across scripts, or in a run', () => {
    for (const j of ['‌', '‍']) {
      const latin = sanitizeText(`a${j}b`, 'player');
      expect(latin.ok && latin.text).toBe('ab');
      expect(latin.stripped.zeroWidth).toBe(1);
      const mixed = sanitizeText(`م${j}a`, 'player');
      expect(mixed.ok && mixed.text).toBe('مa');
      const run = sanitizeText(`م${j}${j}خ`, 'player');
      expect(run.ok && run.text).toBe('مخ');
    }
  });

  it('rejects a message of only U+2800 as empty', () => {
    for (const s of ['⠀', '⠀⠀⠀', ' ⠀\n⠀ ']) {
      const r = sanitizeText(s, 'player');
      expect(r).toMatchObject({ ok: false, reason: 'empty' });
    }
    const mixed = sanitizeText('⠀hi', 'player');
    expect(mixed.ok).toBe(true);
  });
});
