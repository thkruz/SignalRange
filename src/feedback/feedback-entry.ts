import { FEEDBACK_CONTACT_URL } from '@app/campaigns/release-stage';

/**
 * How other menus reach the field report without importing the form (and its capture stack).
 * The app-lifetime Feedback instance registers itself here.
 */
export interface FeedbackEntry {
  /** True when the in-game form can be opened for this player. */
  available(): boolean;
  /** Opens the form; `onClose` runs once, after the form is put away by any route. */
  open(onClose?: () => void): void;
}

let entry: FeedbackEntry | null = null;

export function setFeedbackEntry(next: FeedbackEntry | null): void {
  entry = next;
}

export function feedbackEntry(): FeedbackEntry | null {
  return entry;
}

export interface ContactContext {
  /** Campaign id from the route, e.g. `nats-eu`. The contact page maps it to its campaign list. */
  campaign?: string;
  scenario?: string;
  build?: string;
}

/** Contact page link that arrives with the mission already filled in. Game data only, never account data. */
export function contactUrl(context: ContactContext = {}): string {
  const params = new URLSearchParams();
  for (const key of ['campaign', 'scenario', 'build'] as const) {
    const value = context[key]?.trim();
    if (value) params.set(key, value.slice(0, 120));
  }
  const query = params.toString();
  return query ? `${FEEDBACK_CONTACT_URL}?${query}` : FEEDBACK_CONTACT_URL;
}
