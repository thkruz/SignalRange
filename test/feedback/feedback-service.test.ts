import { describeSubmitError } from '../../src/feedback/feedback-form';
import { FEEDBACK_ENDPOINT_PATH, type FeedbackRequest, FeedbackSubmitError, submitFeedback } from '../../src/feedback/feedback-service';

const token = vi.hoisted(() => ({ value: 'jwt-1' as string | null }));
vi.mock('@app/user-account/auth', () => ({ Auth: { getValidAccessToken: async () => token.value } }));
vi.mock('@app/user-account/supabase-client', () => ({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'anon-key' }));

const request: FeedbackRequest = {
  id: '11111111-2222-4333-8444-555555555555',
  category: 'bug',
  message: 'The dish stalled',
  screenshot: null,
  snapshot: { route: '/campaigns/nats', scenarioId: null },
};

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe('submitFeedback', () => {
  beforeEach(() => {
    token.value = 'jwt-1';
  });

  it('posts the payload to the Edge Function with the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { ok: true, id: request.id }));
    await expect(submitFeedback(request, fetchMock)).resolves.toEqual({ duplicate: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://127.0.0.1:54321${FEEDBACK_ENDPOINT_PATH}`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(request);
  });

  it('reports a duplicate replay as success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { ok: true, duplicate: true }));
    await expect(submitFeedback(request, fetchMock)).resolves.toEqual({ duplicate: true });
  });

  it('fails as auth without a token and sends nothing', async () => {
    token.value = null;
    const fetchMock = vi.fn();
    await expect(submitFeedback(request, fetchMock)).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [408, 'timeout', true],
    [429, 'rate-limited', true],
    [500, 'server', true],
    [503, 'server', true],
    [400, 'invalid', false],
    [413, 'too-large', false],
    [401, 'auth', false],
    [409, 'conflict', false],
  ])('maps %i to %s', async (status, kind, retryable) => {
    const fetchMock = vi.fn().mockResolvedValue(reply(status, { ok: false, error: 'x' }));
    const error = await submitFeedback(request, fetchMock).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FeedbackSubmitError);
    expect(error).toMatchObject({ kind, status });
    expect((error as FeedbackSubmitError).retryable).toBe(retryable);
  });

  it('reads Retry-After from a 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(429, { ok: false }, { 'Retry-After': '90' }));
    await expect(submitFeedback(request, fetchMock)).rejects.toMatchObject({ kind: 'rate-limited', retryAfterSec: 90 });
  });

  it('waits the full Retry-After of an hourly limit, not the 60 s fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(429, { ok: false }, { 'Retry-After': '3600' }));
    const error = (await submitFeedback(request, fetchMock).catch((e: unknown) => e)) as FeedbackSubmitError;
    expect(error.retryAfterSec).toBe(3600);
    expect(describeSubmitError(error).retryAfterSec).toBe(3600);
  });

  it('ignores a malformed Retry-After', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(429, {}, { 'Retry-After': 'tomorrow' }));
    await expect(submitFeedback(request, fetchMock)).rejects.toMatchObject({ retryAfterSec: null });
  });

  it('returns validation reasons from a 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(400, { ok: false, error: 'invalid-feedback', reasons: ['unknown-scenario', 7] }));
    await expect(submitFeedback(request, fetchMock)).rejects.toMatchObject({ kind: 'invalid', reasons: ['unknown-scenario'] });
  });

  it('treats a thrown fetch as a retryable network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(submitFeedback(request, fetchMock)).rejects.toMatchObject({ kind: 'network', retryable: true });
  });

  it('resends the same id and body when retried', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(200, { ok: true }));
    await expect(submitFeedback(request, fetchMock)).rejects.toMatchObject({ kind: 'server' });
    await expect(submitFeedback(request, fetchMock)).resolves.toEqual({ duplicate: false });
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies[0].id).toBe(bodies[1].id);
    expect(bodies[0]).toEqual(bodies[1]);
  });
});
