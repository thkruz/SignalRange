// Re-encoder backed by jpeg-js (pure JavaScript, no WASM, no native code).
// Decoding to raw pixels and encoding again drops EXIF, ICC, comments, thumbnails
// and any bytes appended after the image: only pixels survive.
import jpeg from 'npm:jpeg-js@0.4.4';
// Vendored decoder with hard caps on scans and marker segments (see jpeg-decoder.js).
import decodeJpeg from './jpeg-decoder.js';
import { MAX_SCREENSHOT_HEIGHT, MAX_SCREENSHOT_PIXELS, MAX_SCREENSHOT_WIDTH } from './jpeg.ts';

export function reencodeJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const decoded = decodeJpeg(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    // The handler refuses headers above 1920x1080; the decoder is held to the same bound.
    // The isolate has about 256 MB in total and RGBA output plus the encoder come on top.
    maxResolutionInMP: MAX_SCREENSHOT_PIXELS / 1_000_000,
    maxMemoryUsageInMB: 96,
  });
  // Defence in depth: the pre-parse already bounded the header, check what the decoder saw.
  if (decoded.width > MAX_SCREENSHOT_WIDTH || decoded.height > MAX_SCREENSHOT_HEIGHT) throw new Error('image too large');
  const encoded = jpeg.encode({ data: decoded.data, width: decoded.width, height: decoded.height }, 85);
  return Promise.resolve(new Uint8Array(encoded.data));
}
