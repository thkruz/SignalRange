// Re-encoder backed by jpeg-js (pure JavaScript, no WASM, no native code).
// Decoding to raw pixels and encoding again drops EXIF, ICC, comments, thumbnails
// and any bytes appended after the image: only pixels survive.
import jpeg from 'npm:jpeg-js@0.4.4';

export function reencodeJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const decoded = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    // 4096 x 4096 is 16.8 MP; the handler already refuses larger headers.
    maxResolutionInMP: 17,
    maxMemoryUsageInMB: 256,
  });
  const encoded = jpeg.encode({ data: decoded.data, width: decoded.width, height: decoded.height }, 85);
  return Promise.resolve(new Uint8Array(encoded.data));
}
