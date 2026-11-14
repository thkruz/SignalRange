// Re-encoder backed by jpeg-js (pure JavaScript, no WASM, no native code).
// Decoding to raw pixels and encoding again drops EXIF, ICC, comments, thumbnails
// and any bytes appended after the image: only pixels survive.
import jpeg from 'npm:jpeg-js@0.4.4';
import { MAX_SCREENSHOT_DIMENSION } from './jpeg.ts';

export function reencodeJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const decoded = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    // The handler refuses headers above 6 MP; the decoder is held to the same bound.
    // The isolate has about 256 MB in total and RGBA output plus the encoder come on top.
    maxResolutionInMP: 6,
    maxMemoryUsageInMB: 96,
  });
  // Defence in depth: the pre-parse already bounded the header, check what the decoder saw.
  if (decoded.width > MAX_SCREENSHOT_DIMENSION || decoded.height > MAX_SCREENSHOT_DIMENSION) throw new Error('image too large');
  const encoded = jpeg.encode({ data: decoded.data, width: decoded.width, height: decoded.height }, 85);
  return Promise.resolve(new Uint8Array(encoded.data));
}
