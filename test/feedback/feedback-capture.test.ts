import { captureFeedbackScreen } from '../../src/feedback/feedback-capture';
import { describeCaptureFailure } from '../../src/feedback/feedback-capture-error';

const render = vi.hoisted(() => vi.fn());
vi.mock('html2canvas', () => ({ default: render }));
vi.mock('@app/scenario-manager', () => ({ ScenarioManager: {} }));
vi.mock('@app/sync/storage', () => ({ syncManager: {} }));

describe('screenshot failure diagnostics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    render.mockReset();
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
    render.mockResolvedValue({
      toDataURL: () => {
        throw new DOMException('Private asset URL', 'SecurityError');
      },
    });
    await expect(captureFeedbackScreen()).rejects.toMatchObject({ diagnostic: { stage: 'encode', reason: 'canvas-security' } });
  });

  it.each([
    ['invalid-image', 'data:,'],
    ['invalid-image', 'data:image/png;base64,image'],
    ['too-large', `data:image/jpeg;base64,${'a'.repeat(3_000_000)}`],
  ])('distinguishes invalid screenshots from oversized attachments (%s)', async (reason, image) => {
    render.mockResolvedValue({ toDataURL: () => image });
    await expect(captureFeedbackScreen()).rejects.toMatchObject({ diagnostic: { stage: 'validate', reason } });
  });

  it('does not serialize identifiers from unknown exceptions', () => {
    const diagnostic = describeCaptureFailure(new TypeError('sample@example.invalid on private-host'), 'encode');
    expect(diagnostic.reason).toBe('encode-failed');
    expect(JSON.stringify(diagnostic)).not.toMatch(/sample|private-host/iu);
    expect(describeCaptureFailure({ message: 'private-host' }).reason).toBe('render-failed');
  });

  it('returns successful JPEG captures unchanged', async () => {
    render.mockResolvedValue({ toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' });
    await expect(captureFeedbackScreen()).resolves.toBe('data:image/jpeg;base64,/9j/2Q==');
  });
});
