import type { FeedbackSnapshot } from '../../src/feedback/feedback-capture';
import { submitFeedback } from '../../src/feedback/feedback-service';

const rpc = vi.hoisted(() => vi.fn());
const request = vi.hoisted(() => vi.fn());
vi.mock('@app/user-account/supabase-client', () => ({ supabase: { rpc } }));
const submission = {
  id: 'receipt-id',
  message: '  A useful observation  ',
  screenshot: 'data:image/jpeg;base64,/9j/2Q==',
  snapshot: { route: '/campaigns/nats' } as FeedbackSnapshot,
};

describe('submitFeedback', () => {
  beforeEach(() => {
    rpc.mockReset();
    request.mockReset();
    request.mockResolvedValue({ error: null });
    rpc.mockReturnValue({ abortSignal: request });
  });
  it('sends note, evidence and receipt together without a caller-supplied user ID', async () => {
    await submitFeedback(submission);
    expect(rpc).toHaveBeenCalledWith('submit_signalrange_feedback', {
      submission_id: 'receipt-id',
      feedback_message: 'A useful observation',
      screenshot_data: submission.screenshot,
      game_snapshot: submission.snapshot,
    });
  });
  it.each(['', ' ', 'a'.repeat(10001)])('rejects invalid feedback before making a request', async (message) => {
    await expect(submitFeedback({ ...submission, message })).rejects.toThrow('between 1 and 10,000');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('explains denied developer access without surfacing database details', async () => {
    request.mockResolvedValue({ error: { code: '42501', message: 'private table' } });
    await expect(submitFeedback(submission)).rejects.toThrow('authorized developer');
  });
  it('sends SQL null rather than image data when the screenshot is excluded', async () => {
    await submitFeedback({ ...submission, screenshot: null });
    expect(rpc.mock.calls[0][1].screenshot_data).toBeNull();
    expect(rpc.mock.calls[0][1].game_snapshot).toEqual(submission.snapshot);
  });
});
