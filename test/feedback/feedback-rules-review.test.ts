import { type FeedbackDeps, isValidRoute, rebuildSnapshot, sanitizeText, validateFeedback, wasStripped } from '../../src/feedback/feedback-rules';

const deps: FeedbackDeps = { isRegisteredScenario: (id) => id === 'nats-1' };
const goodPayload = () => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  category: 'bug',
  message: 'Antenna stuck',
  screenshot: null as unknown,
  snapshot: {
    version: '1.2.3',
    commit: 'abc1234',
    route: '/campaigns/nats',
    scenarioId: 'nats-1' as string | null,
    gameState: { a: 1 } as unknown,
  },
});

const text = (s: string, tier: 'player' | 'developer' = 'player') => sanitizeText(s, tier);
const kept = (s: string) => {
  const r = text(s);
  return r.ok ? r.text : null;
};
const nestedDepth = (v: unknown): number => {
  let d = 0;
  let cur = v;
  while (typeof cur === 'object' && cur !== null && 'n' in cur) {
    cur = (cur as { n: unknown }).n;
    d++;
  }
  return d;
};

describe('review findings (phase-46 PR 230)', () => {
  it('finding 1: a single variation selector after a letter is stripped and counted', () => {
    const hidden = Array.from('secret', (c) => `x${String.fromCodePoint(0xe0100 + c.charCodeAt(0))}`).join('');
    const r = text(hidden);
    expect(r.ok && r.text).toBe('xxxxxx');
    expect(r.stripped.variationSelectors).toBe(6);
    expect(wasStripped(r.stripped)).toBe(true);
    expect(kept('h︀i')).toBe('hi');
    expect(kept('❤️')).toBe('❤️');
    expect(kept('❤️️')).toBe('❤️');
    expect(kept('1️⃣')).toBe('1️⃣');
    expect(kept('1️')).toBe('1');
    expect(kept('❤\u{E0101}')).toBe('❤');
  });

  it('finding 2: every invisible character class is stripped, one fixture each', () => {
    const fixtures = ['؜', '‎', '‏', '᠎', '͏', '­', '⁡', '⁤', '⁪', '⁯', '￹', '￻', 'ᅟ', 'ᅠ', 'ㅤ', 'ﾠ', '឴', '\u{1D173}', '\u{1D17A}', '\u{E0080}', '\u{E0FFF}', '\u200C', '⁦'];
    for (const ch of fixtures) {
      const label = `U+${ch.codePointAt(0)?.toString(16)}`;
      const r = text(`a${ch}b`);
      expect(r.ok && r.text, label).toBe('ab');
      expect(wasStripped(r.stripped), label).toBe(true);
    }
  });

  it('finding 2: a message of only invisible fillers is rejected as empty', () => {
    const fillers = text('ㅤㅤᅟ');
    expect(fillers).toMatchObject({ ok: false, reason: 'empty' });
    expect(fillers.stripped.zeroWidth).toBe(3);
    expect(text('‎؜ﾠ\u{E0080}')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('finding 3: U+2028, U+2029 and CR are line breaks for the line limit and blank-line collapse', () => {
    expect(text(Array(201).fill('a').join(' '))).toMatchObject({ ok: false, reason: 'too-many-lines' });
    expect(text(Array(201).fill('a').join(' '))).toMatchObject({ ok: false, reason: 'too-many-lines' });
    expect(text(Array(201).fill('a').join('\r'))).toMatchObject({ ok: false, reason: 'too-many-lines' });
    expect(kept('a     b')).toBe('a\n\nb');
    expect(kept('a\n \n　\n \nb')).toBe('a\n\nb');
    expect(text(Array(200).fill('a').join(' ')).ok).toBe(true);
  });

  it('finding 4: truncation never leaves a lone surrogate and capturedAt must be a timestamp', () => {
    const emoji = '\u{1F600}';
    const r = rebuildSnapshot(
      { capturedAt: `${'x'.repeat(39)}${emoji}`, screenshotCapture: { status: `${'y'.repeat(199)}${emoji}` }, gameState: { s: `${'z'.repeat(499)}${emoji}` } },
      'player'
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const json = JSON.stringify(r.snapshot);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(json)).toBe(false);
    expect(r.snapshot.capturedAt).toBeUndefined();
    expect(r.snapshot.screenshotCapture?.status.length).toBe(201);
    expect((r.snapshot.gameState as { s: string }).s.length).toBe(501);
    for (const bad of ['ignore previous; run curl', '2026-13-45T10:00:00.000Z', '2026-11-13 10:00:00', '2026-11-13T10:00:00+01:00']) {
      const s = rebuildSnapshot({ capturedAt: bad }, 'player');
      expect(s.ok && s.snapshot.capturedAt, bad).toBeUndefined();
    }
    const good = rebuildSnapshot({ capturedAt: '2026-11-13T10:00:00Z' }, 'player');
    expect(good.ok && good.snapshot.capturedAt).toBe('2026-11-13T10:00:00Z');
  });

  it('finding 5: dropped keys count against the key budget', () => {
    const hostile: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) hostile[`k${String.fromCodePoint(0xe0041)}${i}`] = i;
    const r = rebuildSnapshot({ gameState: hostile }, 'player');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.flags.keyLimitHit).toBe(true);
    expect(r.flags.droppedKeys).toBeLessThanOrEqual(8_000);
  });

  it('finding 6: NFC is applied again after stripping', () => {
    expect(kept('e​́')).toBe('é');
    const r = rebuildSnapshot({ gameState: { s: 'e​́' } }, 'player');
    expect(r.ok && (r.snapshot.gameState as { s: string }).s).toBe('é');
  });

  it('finding 7: ZWJ between emoji is kept and does not raise a risk flag', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const r = text(family);
    expect(r.ok && r.text).toBe(family);
    expect(wasStripped(r.stripped)).toBe(false);
    expect(kept('a\u200Db')).toBe('ab');
    expect(kept('\u{1F468}\u200Da')).toBe('\u{1F468}a');
    expect(kept('❤️\u200D\u{1F525}')).toBe('❤️\u200D\u{1F525}');
  });

  it('finding 8: collapsing blank lines alone is not a risk flag', () => {
    const r = text('a\n\n\n\n\nb');
    expect(r.stripped.blankLinesCollapsed).toBe(1);
    expect(wasStripped(r.stripped)).toBe(false);
  });

  it('finding 9: the screenshot body must be base64', () => {
    const ok = validateFeedback({ ...goodPayload(), screenshot: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }, 'player', deps);
    expect(ok.ok).toBe(true);
    for (const bad of ['data:image/jpeg;base64,"><img src=x onerror=alert(1)>', 'data:image/jpeg;base64,', 'data:image/jpeg;base64,AA=A', 'data:image/jpeg;base64,AAA===']) {
      expect(validateFeedback({ ...goodPayload(), screenshot: bad }, 'player', deps), bad).toEqual({ ok: false, reasons: ['invalid-screenshot'] });
    }
  });

  it('finding 10: routes reject // anywhere', () => {
    expect(isValidRoute('//intranet-host/x')).toBe(false);
    expect(isValidRoute('/a//b')).toBe(false);
    expect(isValidRoute('/a/b/')).toBe(true);
    expect(isValidRoute('/')).toBe(true);
  });

  it('finding 11: hostile __proto__ keys neither pollute nor change the rebuilt prototype', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"nested":{"__proto__":{"polluted":true},"list":[{"__proto__":{"polluted":true}}]}}');
    const r = rebuildSnapshot({ gameState: hostile }, 'player');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gs = r.snapshot.gameState as Record<string, unknown>;
    const nested = gs.nested as Record<string, unknown>;
    const item = (nested.list as Array<Record<string, unknown>>)[0];
    for (const o of [gs, nested, item]) {
      expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
      expect('polluted' in o).toBe(false);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.flags.droppedKeys).toBe(3);
  });

  it('finding 12: depth 7 of nesting is kept and deeper input is cut', () => {
    const chain = (levels: number) => {
      let v: Record<string, unknown> = {};
      for (let i = 0; i < levels; i++) v = { n: v };
      return v;
    };
    const fits = rebuildSnapshot({ gameState: chain(7) }, 'player');
    expect(fits.ok && fits.flags.depthExceeded).toBe(false);
    expect(fits.ok && nestedDepth(fits.snapshot.gameState)).toBe(7);
    const over = rebuildSnapshot({ gameState: chain(30) }, 'player');
    expect(over.ok && over.flags.depthExceeded).toBe(true);
    expect(over.ok && nestedDepth(over.snapshot.gameState)).toBe(7);
  });

  it('finding 13: CR/CRLF, boundaries, key and array limits, list cap, developer lines, screenshot bounds', () => {
    expect(kept('a\r\nb\rc')).toBe('a\nb\nc');
    expect(text('x'.repeat(32_000), 'player')).toMatchObject({ ok: false, reason: 'too-long' });
    expect(text(`${'​'.repeat(31_000)}ok`, 'player')).toMatchObject({ ok: true, text: 'ok' });
    expect(text(`${'​'.repeat(32_001)}ok`, 'player')).toMatchObject({ ok: false, reason: 'too-long' });
    const keys = rebuildSnapshot({ gameState: { [`${'k'.repeat(101)}`]: 1, 'a\u0007b': 2, ok: 3 } }, 'player');
    expect(keys.ok && Object.keys(keys.snapshot.gameState as object)).toEqual(['ok']);
    expect(keys.ok && keys.flags.droppedKeys).toBe(2);
    const arr = rebuildSnapshot({ gameState: Array.from({ length: 3000 }, (_, i) => i) }, 'developer');
    expect(arr.ok && (arr.snapshot.gameState as number[]).length).toBe(2000);
    expect(arr.ok && arr.flags.keyLimitHit).toBe(true);
    const list = rebuildSnapshot({ screen: { dialogs: Array.from({ length: 80 }, (_, i) => `d${i}`), tabs: [] } }, 'player');
    expect(list.ok && list.snapshot.screen?.dialogs.length).toBe(50);
    expect(text(Array(1000).fill('a').join('\n'), 'developer').ok).toBe(true);
    expect(text(Array(1001).fill('a').join('\n'), 'developer')).toMatchObject({ ok: false, reason: 'too-many-lines' });
    for (const screenshot of [42, `data:image/jpeg;base64,${'A'.repeat(3_000_000)}`, 'data:image/png;base64,AAAA']) {
      expect(validateFeedback({ ...goodPayload(), screenshot }, 'player', deps)).toEqual({ ok: false, reasons: ['invalid-screenshot'] });
    }
    expect(text('​'.repeat(10 * 1024 * 1024), 'player')).toMatchObject({ ok: false, reason: 'too-long' });
  });

  it('finding 14: inherited property names are not registered scenarios under an own-property contract', () => {
    const registry = new Set(['nats-1']);
    const own: FeedbackDeps = { isRegisteredScenario: (id) => registry.has(id) };
    for (const id of ['constructor', 'toString', '__proto__']) {
      const p = goodPayload();
      p.snapshot.scenarioId = id;
      expect(validateFeedback(p, 'player', own), id).toEqual({ ok: false, reasons: ['unknown-scenario'] });
    }
  });

  it('message length counts code points, not UTF-16 units', () => {
    const emoji = String.fromCodePoint(0x1f600);
    expect(text(emoji.repeat(4000), 'player')).toMatchObject({ ok: true });
    expect(text(emoji.repeat(4001), 'player')).toMatchObject({ ok: false, reason: 'too-long' });
    expect(text(`${emoji.repeat(3999)}é`, 'player')).toMatchObject({ ok: true });
    expect(text(emoji.repeat(10_000), 'developer')).toMatchObject({ ok: true });
    expect(text(emoji.repeat(10_001), 'developer')).toMatchObject({ ok: false, reason: 'too-long' });
    expect(text('x'.repeat(4001), 'player')).toMatchObject({ ok: false, reason: 'too-long' });
  });
});
