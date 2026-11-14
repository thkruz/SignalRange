import { FeedbackCaptureError } from './feedback-capture-error';

/** Server limits (feedback-submit/jpeg.ts): 1920x1080 and 1,000,000 bytes. Stay a little under the byte cap. */
export const SCREENSHOT_MAX_WIDTH = 1920;
export const SCREENSHOT_MAX_HEIGHT = 1080;
export const SCREENSHOT_MAX_BYTES = 950_000;
export const SCREENSHOT_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35] as const;

export interface EncodedScreenshot {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  quality: number;
}

/** Largest size that fits the box while keeping the aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, SCREENSHOT_MAX_WIDTH / width, SCREENSHOT_MAX_HEIGHT / height);
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

const failure = (stage: 'encode' | 'validate', reason: 'encode-failed' | 'invalid-image' | 'too-large', message: string): FeedbackCaptureError =>
  new FeedbackCaptureError({ status: 'failed', renderer: 'html2canvas', stage, reason, message });

/**
 * Downscale into the 1920x1080 box and re-encode as JPEG (browsers write baseline JPEG from canvas).
 * Steps the quality down until the file fits; throws a `too-large` capture error when nothing fits.
 */
export async function encodeScreenshot(source: HTMLCanvasElement): Promise<EncodedScreenshot> {
  const size = fitWithin(source.width, source.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw failure('encode', 'encode-failed', 'The browser could not prepare the screenshot canvas.');
  // JPEG has no alpha: paint a solid background so transparent areas do not turn black.
  context.fillStyle = '#0b1119';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source, 0, 0, size.width, size.height);
  for (const quality of SCREENSHOT_QUALITIES) {
    const blob = await toBlob(canvas, quality);
    if (!blob || blob.type !== 'image/jpeg') throw failure('encode', 'encode-failed', 'The browser could not encode the screenshot as JPEG.');
    if (blob.size <= SCREENSHOT_MAX_BYTES) {
      const dataUrl = await blobToDataUrl(blob);
      if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw failure('validate', 'invalid-image', 'The browser returned an empty or unsupported screenshot format.');
      return { dataUrl, width: size.width, height: size.height, bytes: blob.size, quality };
    }
  }
  throw failure('validate', 'too-large', 'The screenshot is too large to attach, even at low quality.');
}
