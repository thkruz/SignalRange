// JPEG helpers for the feedback-submit function. Pure: no network, no Deno APIs.

export const MAX_SCREENSHOT_BYTES = 1_500_000;
export const MAX_SCREENSHOT_DIMENSION = 4096;

export const DATA_URL_PREFIX = 'data:image/jpeg;base64,';

/** Decode strict base64 to bytes; returns null on any malformed input. */
export function decodeBase64(b64: string): Uint8Array | null {
  if (b64.length % 4 !== 0) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export const hasJpegMagic = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/**
 * Read width and height from the first SOF marker without decoding pixels, so an
 * oversized image is refused before any large allocation. Returns null if no SOF is found.
 */
export function readJpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    while (marker === 0xff && i + 2 < b.length) {
      i++;
      marker = b[i + 1];
    }
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return { width, height };
    }
    i += 2 + len;
  }
  return null;
}
