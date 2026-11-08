import { supabase } from '@app/user-account/supabase-client';
import type { FeedbackSnapshot } from './feedback-capture';

export interface FeedbackSubmission {
  id: string;
  message: string;
  screenshot: string | null;
  snapshot: FeedbackSnapshot;
}

export async function submitFeedback(submission: FeedbackSubmission): Promise<void> {
  if (!supabase) throw new Error('Feedback storage is unavailable.');
  const message = submission.message.trim();
  if (!message || message.length > 10_000) throw new Error('Enter feedback between 1 and 10,000 characters.');
  const { error } = await supabase
    .rpc('submit_signalrange_feedback', {
      submission_id: submission.id,
      feedback_message: message,
      screenshot_data: submission.screenshot,
      game_snapshot: submission.snapshot,
    })
    .abortSignal(AbortSignal.timeout(20_000));
  if (error) {
    if (error.code === '42501' || error.code === 'PGRST301') throw new Error('Sign in with an authorized developer account to send feedback.');
    throw new Error('Feedback could not be saved. Your draft is still here; please retry.');
  }
}
