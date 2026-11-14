import type { FeedbackSnapshot } from '../../src/feedback/feedback-capture';
import { attachmentSummary, buildRequest, clampMessage, codePointCount, createDraft, describeSubmitError } from '../../src/feedback/feedback-form';
import { TIER_LIMITS } from '../../src/feedback/feedback-rules';
import { FeedbackSubmitError } from '../../src/feedback/feedback-service';

vi.mock('@app/user-account/auth', () => ({ Auth: {} }));
vi.mock('@app/user-account/supabase-client', () => ({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'anon' }));

const snapshot = {
  capturedAt: '2026-11-14T10:00:00.000Z',
  version: '1.1.0',
  commit: 'abcdef1',
  route: '/campaigns/nats',
  scenarioId: 'nats-1',
  viewport: { width: 1600, height: 900, pixelRatio: 1 },
  screen: { dialogs: [], tabs: [] },
  clock: { runMs: 1, scenarioMs: 1, speed: 1 },
  gameState: { ok: true },
} as unknown as FeedbackSnapshot;

describe('draft', () => {
  it('uses a lowercase uuid and starts with the screenshot off', () => {
    const draft = createDraft(snapshot, () => 'ABCDEF12-3456-4789-8ABC-DEF012345678');
    expect(draft.id).toBe('abcdef12-3456-4789-8abc-def012345678');
    expect(draft).toMatchObject({ category: 'bug', includeScreenshot: false, screenshot: null, locked: false });
  });
});

describe('code point counting and clamping', () => {
  it('counts an emoji as one character', () => {
    expect(codePointCount('a😀b')).toBe(3);
    expect('a😀b'.length).toBe(4);
  });
  it('clamps by code points, never splitting a surrogate pair', () => {
    const max = TIER_LIMITS.player.maxChars;
    const text = '😀'.repeat(max + 5);
    const clamped = clampMessage(text, 'player');
    expect(codePointCount(clamped)).toBe(max);
    expect(clampMessage('short', 'player')).toBe('short');
    expect(codePointCount(clampMessage('x'.repeat(max + 1), 'developer'))).toBe(max + 1);
  });
});

describe('buildRequest', () => {
  const draft = () => ({ ...createDraft(snapshot), message: '  The  dish stalled​ at 40 degrees  ' });

  it('sanitises through the shared rules and keeps the id and category', () => {
    const d = { ...draft(), category: 'idea' as const };
    const built = buildRequest(d, 'player');
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.request.id).toBe(d.id);
      expect(built.request.category).toBe('idea');
      expect(built.request.message).not.toContain('​');
      expect(built.request.message.startsWith(' ')).toBe(false);
      expect(built.request.screenshot).toBeNull();
      expect(built.request.snapshot.scenarioId).toBe('nats-1');
    }
  });

  it('attaches the screenshot only when the toggle is on', () => {
    const shot = 'data:image/jpeg;base64,/9j/2Q==';
    const off = buildRequest({ ...draft(), screenshot: shot, includeScreenshot: false }, 'player');
    const on = buildRequest({ ...draft(), screenshot: shot, includeScreenshot: true }, 'player');
    expect(off.ok && off.request.screenshot).toBeNull();
    expect(on.ok && on.request.screenshot).toBe(shot);
  });

  it.each([
    ['', 'empty'],
    ['   \n ', 'empty'],
    ['x'.repeat(TIER_LIMITS.player.maxChars + 1), 'too-long'],
    ['a\n'.repeat(TIER_LIMITS.player.maxLines + 10).replace(/\n\n/gu, '\n'), 'too-many-lines'],
  ])('rejects an unfileable body (%#)', (message, reason) => {
    expect(buildRequest({ ...draft(), message }, 'player')).toEqual({ ok: false, reason });
  });

  it('drops an oversized game state instead of refusing the report', () => {
    const big = { ...snapshot, gameState: { rows: Array.from({ length: 1900 }, (_, i) => `row-${i}-${'x'.repeat(480)}`) } } as unknown as FeedbackSnapshot;
    const built = buildRequest({ ...createDraft(big), message: 'hello' }, 'player');
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.request.snapshot.gameState ?? null).toBeNull();
  });
});

describe('describeSubmitError', () => {
  const err = (kind: ConstructorParameters<typeof FeedbackSubmitError>[0], status = 0, retry: number | null = null, reasons: string[] = []) =>
    describeSubmitError(new FeedbackSubmitError(kind, status, retry, reasons));

  it.each([
    ['network', 0],
    ['timeout', 408],
    ['rate-limited', 429],
    ['server', 503],
    ['auth', 401],
  ] as const)('keeps the draft and offers retry for %s', (kind, status) => {
    const view = err(kind, status);
    expect(view.retryable).toBe(true);
    expect(view.editable).toBe(false);
    expect(view.message).toMatch(/draft is kept/iu);
  });

  it('honours Retry-After on 429', () => {
    const view = err('rate-limited', 429, 1800);
    expect(view.retryAfterSec).toBe(1800);
    expect(view.message).toMatch(/30 minutes/u);
    expect(err('rate-limited', 429, 12).message).toMatch(/12 seconds/u);
  });

  it('explains 400 and 413 as editable, non-retryable notices', () => {
    for (const view of [err('invalid', 400), err('too-large', 413), err('invalid', 400, null, ['message-too-long'])]) {
      expect(view.retryable).toBe(false);
      expect(view.editable).toBe(true);
    }
    expect(err('too-large', 413).message).toMatch(/screen capture/iu);
  });

  it('falls back to a retryable notice for an unknown error', () => {
    expect(describeSubmitError(new TypeError('boom')).retryable).toBe(true);
  });
});

describe('attachmentSummary', () => {
  it('lists scenario and state, and the screenshot only when it is attached', () => {
    const base = { snapshot, includeScreenshot: false, screenshot: null };
    expect(attachmentSummary(base)).toHaveLength(2);
    expect(attachmentSummary(base)[0]).toContain('nats-1');
    expect(attachmentSummary({ ...base, includeScreenshot: true, screenshot: 'data:image/jpeg;base64,AA==' })).toHaveLength(3);
    expect(attachmentSummary({ ...base, snapshot: { ...snapshot, scenarioId: null } })[0]).toContain('none');
  });
});
