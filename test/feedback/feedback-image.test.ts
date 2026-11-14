import { encodeScreenshot, fitWithin, SCREENSHOT_MAX_BYTES, SCREENSHOT_QUALITIES } from '../../src/feedback/feedback-image';

interface FakeCanvas {
  width: number;
  height: number;
  getContext: () => { fillStyle: string; fillRect: () => void; drawImage: ReturnType<typeof vi.fn> } | null;
  toBlob: (cb: (blob: Blob | null) => void, type: string, quality: number) => void;
}

function stubCanvas(sizeFor: (quality: number) => number | null, context = true): { qualities: number[]; drawImage: ReturnType<typeof vi.fn>; made: FakeCanvas[] } {
  const qualities: number[] = [];
  const drawImage = vi.fn();
  const made: FakeCanvas[] = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return realCreate(tag);
    const canvas: FakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => (context ? { fillStyle: '', fillRect: () => {}, drawImage } : null),
      toBlob: (cb, type, quality) => {
        qualities.push(quality);
        expect(type).toBe('image/jpeg');
        const size = sizeFor(quality);
        cb(size === null ? null : new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
      },
    };
    made.push(canvas);
    return canvas as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  return { qualities, drawImage, made };
}

const source = (width: number, height: number) => ({ width, height }) as HTMLCanvasElement;

describe('fitWithin', () => {
  it.each([
    [3840, 2160, 1920, 1080],
    [2560, 1080, 1920, 810],
    [1600, 900, 1600, 900],
    [1000, 4000, 270, 1080],
  ])('fits %ix%i into %ix%i without upscaling', (w, h, ew, eh) => {
    expect(fitWithin(w, h)).toEqual({ width: ew, height: eh });
  });
});

describe('encodeScreenshot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downscales into the 1920x1080 box and encodes at the first quality when it fits', async () => {
    const { qualities, drawImage, made } = stubCanvas(() => 400_000);
    const result = await encodeScreenshot(source(3840, 2160));
    expect(made[0].width).toBe(1920);
    expect(made[0].height).toBe(1080);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1920, 1080);
    expect(qualities).toEqual([0.85]);
    expect(result).toMatchObject({ width: 1920, height: 1080, bytes: 400_000, quality: 0.85 });
    expect(result.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('steps the quality down until the file fits', async () => {
    const { qualities } = stubCanvas((q) => (q > 0.6 ? 2_000_000 : 800_000));
    const result = await encodeScreenshot(source(1600, 900));
    expect(qualities).toEqual([0.85, 0.75, 0.65, 0.55]);
    expect(result.quality).toBe(0.55);
    expect(result.bytes).toBeLessThanOrEqual(SCREENSHOT_MAX_BYTES);
  });

  it('drops the screenshot with a too-large diagnostic when nothing fits', async () => {
    const { qualities } = stubCanvas(() => 5_000_000);
    await expect(encodeScreenshot(source(1600, 900))).rejects.toMatchObject({ diagnostic: { stage: 'validate', reason: 'too-large' } });
    expect(qualities).toEqual([...SCREENSHOT_QUALITIES]);
  });

  it('reports an encode failure when the browser returns no JPEG', async () => {
    stubCanvas(() => null);
    await expect(encodeScreenshot(source(800, 600))).rejects.toMatchObject({ diagnostic: { stage: 'encode', reason: 'encode-failed' } });
  });

  it('reports an encode failure when there is no 2d context', async () => {
    stubCanvas(() => 1000, false);
    await expect(encodeScreenshot(source(800, 600))).rejects.toMatchObject({ diagnostic: { reason: 'encode-failed' } });
  });
});
