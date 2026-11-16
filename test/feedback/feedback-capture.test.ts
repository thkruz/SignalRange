import { captureFeedbackScreen } from '../../src/feedback/feedback-capture';
import { describeCaptureFailure, FeedbackCaptureError } from '../../src/feedback/feedback-capture-error';

const render = vi.hoisted(() => vi.fn());
const encode = vi.hoisted(() => vi.fn());
vi.mock('html2canvas', () => ({ default: render }));
vi.mock('../../src/feedback/feedback-image', () => ({ encodeScreenshot: encode }));
vi.mock('@app/scenario-manager', () => ({ ScenarioManager: {} }));
vi.mock('@app/sync/storage', () => ({ syncManager: {} }));

describe('screenshot failure diagnostics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    render.mockReset();
    encode.mockReset();
    render.mockResolvedValue({});
  });

  it('records unsupported CSS rendering without copying raw messages or stacks', async () => {
    render.mockRejectedValue(new Error('Attempting to parse an unsupported color function "oklab" at https://private.invalid/account?email=sample@example.invalid'));
    await expect(captureFeedbackScreen()).rejects.toMatchObject({ diagnostic: { stage: 'render', reason: 'unsupported-color' } });
    try {
      await captureFeedbackScreen();
    } catch (error) {
      expect(JSON.stringify(describeCaptureFailure(error))).not.toMatch(/private|account|email|sample/iu);
    }
  });

  it('identifies canvas security errors during JPEG encoding', async () => {
    encode.mockRejectedValue(new DOMException('Private asset URL', 'SecurityError'));
    await expect(captureFeedbackScreen()).rejects.toMatchObject({ diagnostic: { stage: 'encode', reason: 'canvas-security' } });
  });

  it('passes the encoder diagnostics (too large, invalid image) through unchanged', async () => {
    const diagnostic = { status: 'failed', renderer: 'html2canvas', stage: 'validate', reason: 'too-large', message: 'too big' } as const;
    encode.mockRejectedValue(new FeedbackCaptureError(diagnostic));
    await expect(captureFeedbackScreen()).rejects.toMatchObject({ diagnostic });
  });

  it('does not serialize identifiers from unknown exceptions', () => {
    const diagnostic = describeCaptureFailure(new TypeError('sample@example.invalid on private-host'), 'encode');
    expect(diagnostic.reason).toBe('encode-failed');
    expect(JSON.stringify(diagnostic)).not.toMatch(/sample|private-host/iu);
    expect(describeCaptureFailure({ message: 'private-host' }).reason).toBe('render-failed');
  });

  it('returns the encoded JPEG data URL', async () => {
    encode.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,/9j/2Q==' });
    await expect(captureFeedbackScreen()).resolves.toBe('data:image/jpeg;base64,/9j/2Q==');
  });
});
