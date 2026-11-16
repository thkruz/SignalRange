import { Auth } from '@app/user-account/auth';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@app/user-account/supabase-client';
import type { CleanSnapshot, FeedbackCategory } from './feedback-rules';

/** Exactly the body feedback-submit validates. */
export interface FeedbackRequest {
  id: string;
  category: FeedbackCategory;
  message: string;
  screenshot: string | null;
  snapshot: CleanSnapshot;
}

export type FeedbackErrorKind = 'network' | 'timeout' | 'rate-limited' | 'invalid' | 'too-large' | 'auth' | 'conflict' | 'server';

export class FeedbackSubmitError extends Error {
  constructor(
    readonly kind: FeedbackErrorKind,
    readonly status: number,
    readonly retryAfterSec: number | null = null,
    readonly reasons: readonly string[] = []
  ) {
    super(`feedback ${kind}`);
    this.name = 'FeedbackSubmitError';
  }

  /** Network errors, 408, 429 and 5xx keep the draft and offer Retry with the same id. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'rate-limited' || this.kind === 'server';
  }
}

export const FEEDBACK_ENDPOINT_PATH = '/functions/v1/feedback-submit';
const REQUEST_TIMEOUT_MS = 30_000;

function parseRetryAfter(header: string | null): number | null {
  if (!header || !/^\d{1,7}$/u.test(header.trim())) return null;
  return Math.max(1, Number(header.trim()));
}

function classify(status: number): FeedbackErrorKind {
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate-limited';
  if (status === 400 || status === 415) return 'invalid';
  if (status === 413) return 'too-large';
  if (status === 401 || status === 403) return 'auth';
  if (status === 409) return 'conflict';
  return 'server';
}

async function readReasons(response: Response): Promise<string[]> {
  try {
    const body = (await response.json()) as { reasons?: unknown };
    return Array.isArray(body.reasons) ? body.reasons.filter((r): r is string => typeof r === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}

/** POST one report. Resolves with whether the server had already stored this id; throws FeedbackSubmitError otherwise. */
export async function submitFeedback(request: FeedbackRequest, fetchImpl: typeof fetch = fetch): Promise<{ duplicate: boolean }> {
  const token = await Auth.getValidAccessToken().catch(() => null);
  if (!SUPABASE_URL || !token) throw new FeedbackSubmitError('auth', 401);
  let response: Response;
  try {
    response = await fetchImpl(`${SUPABASE_URL}${FEEDBACK_ENDPOINT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}) },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new FeedbackSubmitError(error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network', 0);
  }
  if (response.ok) {
    const body = (await response.json().catch(() => ({}))) as { duplicate?: unknown };
    return { duplicate: body.duplicate === true };
  }
  const reasons = response.status === 400 ? await readReasons(response) : [];
  // The server lists Retry-After in Access-Control-Expose-Headers; without that the browser hides it on a cross-origin call.
  throw new FeedbackSubmitError(classify(response.status), response.status, parseRetryAfter(response.headers.get('Retry-After')), reasons);
}
