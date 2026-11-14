// JPEG helpers for the feedback-submit function. Pure: no network, no Deno APIs.

/** The client never sends more than 1920x1080 (feedback-capture.ts: scale = min(1, 1920 / innerWidth, 1080 / innerHeight)). */
export const MAX_SCREENSHOT_BYTES = 1_000_000;
export const MAX_SCREENSHOT_WIDTH = 1920;
export const MAX_SCREENSHOT_HEIGHT = 1080;
/** Pixel budget; the decoder gets the same cap (see jpeg-codec.ts). */
export const MAX_SCREENSHOT_PIXELS = MAX_SCREENSHOT_WIDTH * MAX_SCREENSHOT_HEIGHT;
/** A baseline canvas export has exactly one scan; the decoder keeps a looser cap as a backstop. */
export const MAX_JPEG_SCANS = 1;

/** Base64 length of the largest accepted image (1 MB is 1,333,336 characters). */
export const MAX_SCREENSHOT_BASE64_CHARS = 1_333_400;

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

export interface JpegInfo {
  width: number;
  height: number;
  scans: number;
  progressive: boolean;
}

/**
 * Strict structural pre-parse. Walks every marker segment, requires each declared length to fit
 * exactly (DQT and DHT contents must fill their segment, so jpeg-js and this parser agree on where
 * every segment ends), counts SOS scans and requires exactly one SOF and a closing EOI.
 * Returns null for anything it cannot account for byte by byte; callers refuse null.
 */
export function inspectJpeg(b: Uint8Array): JpegInfo | null {
  if (!hasJpegMagic(b)) return null;
  let i = 2;
  let sof: { width: number; height: number; progressive: boolean; ids: number[] } | null = null;
  let scans = 0;
  let eoi = false;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    // Fill bytes before a marker.
    while (marker === 0xff && i + 2 < b.length) {
      i++;
      marker = b[i + 1];
    }
    if (marker === undefined || marker === 0x00) return null;
    if (marker === 0xd8) return null;
    if (marker === 0xd9) {
      eoi = true;
      i += 2;
      break;
    }
    // Allowlist: only markers jpeg-js reads the same way this parser does. DNL (FFDC), TEM, DRI (FFDD),
    // RSTn anywhere, arithmetic and lossless SOFs and every reserved marker are refused. jpeg-js reads only 4
    // bytes after DNL and treats the rest of its payload as markers, so skipping by length hides scans.
    const allowed = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe || marker === 0xdb || marker === 0xc4 || marker === 0xc0 || marker === 0xda;
    if (!allowed) return null;
    if (i + 4 > b.length) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    const start = i + 4;
    const end = i + 2 + len;
    if (marker === 0xdb) {
      // DQT: one or more 8-bit tables (1 + 64 bytes) filling the segment. 16-bit tables are refused.
      let p = start;
      while (p < end) {
        if (b[p] >> 4 !== 0 || (b[p] & 0x0f) > 3) return null;
        p += 65;
      }
      if (p !== end) return null;
    } else if (marker === 0xc4) {
      // DHT: 1 + 16 + sum(counts) bytes per table, filling the segment.
      let p = start;
      while (p < end) {
        if (p + 17 > end) return null;
        let total = 0;
        for (let k = 1; k <= 16; k++) total += b[p + k];
        if (total > 256) return null;
        p += 17 + total;
      }
      if (p !== end) return null;
    } else if (marker === 0xc0) {
      // SOF0 baseline, 8-bit samples only. SOF1 (extended sequential), SOF2 progressive and every other SOF are
      // refused: a baseline canvas export needs none of them.
      if (sof !== null || len < 8 || b[start] !== 8) return null;
      const components = b[start + 5];
      if (components < 1 || components > 4 || len !== 8 + 3 * components) return null;
      const ids: number[] = [];
      for (let k = 0; k < components; k++) ids.push(b[start + 6 + 3 * k]);
      if (new Set(ids).size !== components) return null;
      sof = { height: (b[start + 1] << 8) | b[start + 2], width: (b[start + 3] << 8) | b[start + 4], progressive: false, ids };
    } else if (marker === 0xda) {
      if (sof === null) return null;
      scans++;
      if (scans > MAX_JPEG_SCANS) return null;
      const components = b[start];
      if (components < 1 || components > 4 || len !== 6 + 2 * components) return null;
      // Selectors must be distinct and exist in the frame header; a baseline scan is Ss=0, Se=63, Ah=Al=0.
      const seen = new Set<number>();
      for (let k = 0; k < components; k++) {
        const sel = b[start + 1 + 2 * k];
        if (!sof.ids.includes(sel) || seen.has(sel)) return null;
        seen.add(sel);
      }
      if (b[start + 1 + 2 * components] !== 0 || b[start + 2 + 2 * components] !== 63 || b[start + 3 + 2 * components] !== 0) return null;
      // Skip entropy-coded data: it ends at the next FF xx with xx not 00. An RSTn there is refused (and DRI
      // never passes the allowlist): jpeg-js steps over an RSTn back into its top-level marker reader and
      // reads the following bytes at an offset this parser does not share.
      let p = end;
      for (;;) {
        if (p + 1 >= b.length) return null;
        if (b[p] === 0xff && b[p + 1] !== 0x00) {
          if (b[p + 1] >= 0xd0 && b[p + 1] <= 0xd7) return null;
          break;
        }
        p++;
      }
      i = p;
      continue;
    }
    i = end;
  }
  if (!eoi || sof === null || scans === 0) return null;
  if (sof.width < 1 || sof.height < 1) return null;
  return { width: sof.width, height: sof.height, scans, progressive: sof.progressive };
}

/** Width and height from the strict pre-parse, or null. */
export function readJpegSize(b: Uint8Array): { width: number; height: number } | null {
  const info = inspectJpeg(b);
  return info === null ? null : { width: info.width, height: info.height };
}
