import type { FeedbackSnapshot } from './feedback-capture';
import { type FeedbackCategory, type FeedbackTier, rebuildSnapshot, sanitizeText, type TextRejection, TIER_LIMITS } from './feedback-rules';
import { type FeedbackRequest, FeedbackSubmitError } from './feedback-service';

/** Form logic without any DOM: the draft, the pre-send checks and the wording for every failure. */
export interface FeedbackDraft {
  /** Lowercase UUID chosen once per draft and reused by every retry, so the server stores it once. */
  id: string;
  category: FeedbackCategory;
  message: string;
  includeScreenshot: boolean;
  screenshot: string | null;
  snapshot: FeedbackSnapshot;
  /** Set after a send attempt that may have committed: the payload must not change before the retry. */
  locked: boolean;
}

export const CATEGORY_LABELS: Record<FeedbackCategory, { label: string; hint: string }> = {
  bug: { label: 'Fault', hint: 'Something broke or behaved wrongly' },
  idea: { label: 'Idea', hint: 'A change or addition you would like' },
  content: { label: 'Content', hint: 'A mission, briefing or dialog problem' },
  other: { label: 'Other', hint: 'Anything else' },
};

export function createDraft(snapshot: FeedbackSnapshot, newId: () => string = () => crypto.randomUUID()): FeedbackDraft {
  return { id: newId().toLowerCase(), category: 'bug', message: '', includeScreenshot: false, screenshot: null, snapshot, locked: false };
}

/** Length in code points, the unit the server limit uses (an emoji is one character). */
export function codePointCount(text: string): number {
  return Array.from(text).length;
}

export function tierFor(isDeveloper: boolean): FeedbackTier {
  return isDeveloper ? 'developer' : 'player';
}

/** Cut text to the tier limit by code points (a textarea maxlength counts UTF-16 units). */
export function clampMessage(text: string, tier: FeedbackTier): string {
  const max = TIER_LIMITS[tier].maxChars;
  if (codePointCount(text) <= max) return text;
  return Array.from(text).slice(0, max).join('');
}

export type BuildResult = { ok: true; request: FeedbackRequest } | { ok: false; reason: TextRejection | 'snapshot' };

/** Sanitise through the shared rules. The server runs the same code again and never trusts this result. */
export function buildRequest(draft: FeedbackDraft, tier: FeedbackTier): BuildResult {
  const text = sanitizeText(draft.message, tier);
  if (text.ok === false) return { ok: false, reason: text.reason };
  let snap = rebuildSnapshot(draft.snapshot, tier);
  if (snap.ok === false && snap.reason === 'too-large') {
    // A very large game state must not block the report: send the context without it.
    snap = rebuildSnapshot({ ...draft.snapshot, gameState: null }, tier);
  }
  if (snap.ok === false) return { ok: false, reason: 'snapshot' };
  return {
    ok: true,
    request: { id: draft.id, category: draft.category, message: text.text, screenshot: draft.includeScreenshot ? draft.screenshot : null, snapshot: snap.snapshot },
  };
}

export interface ErrorView {
  /** Plain words for the operator, written as an in-world notice. */
  message: string;
  retryable: boolean;
  retryAfterSec: number | null;
  /** True when nothing was stored, the operator can edit, and the next attempt needs a fresh id. */
  editable: boolean;
}

function waitPhrase(seconds: number): string {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  if (seconds < 5400) return `${Math.ceil(seconds / 60)} minutes`;
  return `${Math.ceil(seconds / 3600)} hours`;
}

export function describeSubmitError(error: unknown): ErrorView {
  if (!(error instanceof FeedbackSubmitError)) {
    return { message: 'The report did not go out. Your draft is kept. Try again.', retryable: true, retryAfterSec: null, editable: false };
  }
  switch (error.kind) {
    case 'network':
      return { message: 'No link to the ground network. Your draft is kept. Retry when the link is back.', retryable: true, retryAfterSec: null, editable: false };
    case 'timeout':
      return { message: 'The network did not answer in time. Your draft is kept. Retry.', retryable: true, retryAfterSec: error.retryAfterSec, editable: false };
    case 'rate-limited':
      return {
        message: `Too many reports filed from this account. Retry in ${waitPhrase(error.retryAfterSec ?? 60)}. Your draft is kept.`,
        retryable: true,
        retryAfterSec: error.retryAfterSec ?? 60,
        editable: false,
      };
    case 'server':
      return {
        message: 'The report desk is not accepting reports right now. Your draft is kept. Retry in a moment.',
        retryable: true,
        retryAfterSec: error.retryAfterSec,
        editable: false,
      };
    case 'too-large':
      return {
        message: 'This report is too large to file. Switch off the screen capture or shorten the text, then file again.',
        retryable: false,
        retryAfterSec: null,
        editable: true,
      };
    case 'invalid':
      return {
        message: error.reasons.includes('message-too-long')
          ? 'The text is too long to file. Shorten it and file again.'
          : 'The report desk rejected this form. Check the text and file again.',
        retryable: false,
        retryAfterSec: null,
        editable: true,
      };
    case 'auth':
      return { message: 'Your sign-in has lapsed. Sign in again, then file the report. Your draft is kept.', retryable: true, retryAfterSec: null, editable: false };
    case 'conflict':
      return { message: 'This report number is already in use. Edit the text and file again.', retryable: false, retryAfterSec: null, editable: true };
  }
}

export function describeRejection(reason: TextRejection | 'snapshot'): string {
  switch (reason) {
    case 'empty':
      return 'Write something in the report body before filing.';
    case 'too-long':
      return 'The report body is over the character limit.';
    case 'too-many-lines':
      return 'The report body has too many lines.';
    default:
      return 'The report could not be prepared. Close the form and try again.';
  }
}

/** The honest list of what goes out with a report. */
export function attachmentSummary(draft: Pick<FeedbackDraft, 'includeScreenshot' | 'screenshot' | 'snapshot'>): string[] {
  const items = [`Scenario: ${draft.snapshot.scenarioId ?? 'none (menu or sandbox)'}`, 'Game state summary: route, version, clock and equipment settings'];
  if (draft.includeScreenshot && draft.screenshot) items.push('Screenshot: the screen as it was when you opened this form');
  return items;
}
