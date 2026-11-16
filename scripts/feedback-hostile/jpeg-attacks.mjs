// Builds the JPEG attack files from the review rounds. Starts from a valid 32x32 baseline JPEG
// (marker order: SOI APP0 DQT SOF0 DHT SOS EOI) and splices segments by hand.
export const BASE_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk8BDg4OExETJhUVJk81LTVPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT//AABEIACAAIAMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APOUipJXCMywkHtWqo3OiMydLf2rVYS50RqFhLX2rVZffodEapViizXFQVz55TLsUGe1exQo3NVMn2rGcYy3pV18TSwz5Lc0u3+bOim2yREkfvj6cVxe1xVf7Vl5af8AB/E64yiirBFXHg1c+eUy5t8tBgfMeleticQ8NSXJ8Utv1ZrTd2Pht+MmuLC4ZJXex1qoTqrMcIMD17mlLFVKknChpHv1f+X5/kdMGluVraLpWOXK9j53nLAi3ynjpxWlR+3xUuy0+7/g3OiErRJjGWbYOg6/WliZyqVPYQfurfzf/A/P5HTTlZXJgmPkTr3PpU1KvJ+5o79X28l5/l67dMJdWf/Z';

export const base = Buffer.from(BASE_B64, 'base64');

const M = (b) => Buffer.from(b);
const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);

/** Split the base into SOI, APP0, DQT, SOF0, DHT, SOS(header+entropy) and EOI. */
function split() {
  const seg = {};
  let i = 2;
  seg.soi = base.subarray(0, 2);
  while (i < base.length) {
    const m = base[i + 1];
    if (m === 0xd9) {
      seg.eoi = base.subarray(i, i + 2);
      break;
    }
    const len = base.readUInt16BE(i + 2);
    let end = i + 2 + len;
    if (m === 0xda) {
      while (!(base[end] === 0xff && base[end + 1] !== 0)) end++;
      seg.sosHeader = base.subarray(i, i + 2 + len);
      seg.sosData = base.subarray(i + 2 + len, end);
    } else seg[{ 0xe0: 'app0', 0xdb: 'dqt', 0xc0: 'sof', 0xc4: 'dht' }[m]] = base.subarray(i, end);
    i = end;
  }
  return seg;
}
const S = split();

function sofWith(w, h, marker = 0xc0) {
  const s = Buffer.from(S.sof);
  s[1] = marker;
  s.writeUInt16BE(h, 5);
  s.writeUInt16BE(w, 7);
  return s;
}
const join = (...p) => Buffer.concat(p.map(M));
const sosFull = () => join(S.sosHeader, S.sosData);

export const valid = () => Buffer.from(base);

export function attacks() {
  const a = {};
  const { soi, app0, dqt, sof, dht, eoi } = S;

  // DNL hidden scans: jpeg-js reads 4 bytes after FFDC and treats the rest as markers.
  const hiddenScan = Buffer.concat([Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]), Buffer.from([0x12, 0x34])]);
  const hidden = Buffer.concat(Array.from({ length: 4500 }, () => hiddenScan));
  const dnl = Buffer.concat([Buffer.from([0xff, 0xdc]), u16(2 + 2 + hidden.length), u16(32), hidden]);
  a['dnl-hidden-scans-after-sos'] = join(soi, app0, dqt, sof, dht, sosFull(), dnl, eoi);
  a['dnl-before-first-sos'] = join(soi, app0, dqt, sof, dht, dnl, sosFull(), eoi);
  a['dnl-minimal-4-bytes'] = join(soi, app0, dqt, sof, dht, sosFull(), Buffer.from([0xff, 0xdc, 0x00, 0x04, 0x00, 0x20]), eoi);

  // RSTn inside entropy data followed by a malformed APP1 that hides a marker stream.
  const evilApp1 = Buffer.from([0xff, 0xe1, 0xff, 0xff, ...hiddenScan, ...hiddenScan]);
  const data = Buffer.concat([S.sosData.subarray(0, 8), Buffer.from([0xff, 0xd0]), evilApp1, S.sosData.subarray(8)]);
  a['rstn-then-malformed-app1'] = join(soi, app0, dqt, sof, dht, S.sosHeader, data, eoi);
  a['rstn-plain-in-entropy'] = join(soi, app0, dqt, sof, dht, S.sosHeader, S.sosData.subarray(0, 8), Buffer.from([0xff, 0xd3]), S.sosData.subarray(8), eoi);
  a['dri-marker'] = join(soi, app0, dqt, Buffer.from([0xff, 0xdd, 0x00, 0x04, 0x00, 0x04]), sof, dht, sosFull(), eoi);

  // Multiple SOF: small first (passes size check), huge second.
  a['multiple-sof-small-then-huge'] = join(soi, app0, dqt, sofWith(8, 8), sofWith(65535, 65535), dht, sosFull(), eoi);
  a['multiple-sof-duplicate'] = join(soi, app0, dqt, sof, sof, dht, sosFull(), eoi);

  // Oversized dimensions.
  a['dims-65535x65535'] = join(soi, app0, dqt, sofWith(65535, 65535), dht, sosFull(), eoi);
  a['dims-2561x16'] = join(soi, app0, dqt, sofWith(2561, 16), dht, sosFull(), eoi);
  a['dims-4096x1000'] = join(soi, app0, dqt, sofWith(4096, 1000), dht, sosFull(), eoi);
  a['dims-2500x2500-6.25MP'] = join(soi, app0, dqt, sofWith(2500, 2500), dht, sosFull(), eoi);
  a['dims-zero'] = join(soi, app0, dqt, sofWith(0, 0), dht, sosFull(), eoi);
  // Just under the pixel budget with a tiny entropy stream: must not blow the worker.
  a['dims-2560x2343-at-pixel-cap'] = join(soi, app0, dqt, sofWith(2560, 2343), dht, sosFull(), eoi);

  // Progressive scan flood.
  const flood = (n, marker) => join(soi, app0, dqt, sofWith(32, 32, marker), dht, ...Array.from({ length: n }, () => sosFull()), eoi);
  a['progressive-scan-flood-17'] = flood(17, 0xc2);
  a['progressive-scan-flood-5000'] = flood(5000, 0xc2);
  a['baseline-scan-flood-5000'] = flood(5000, 0xc0);

  // Structure abuse.
  a['truncated-no-eoi'] = join(soi, app0, dqt, sof, dht, sosFull()).subarray(0, -2);
  a['jpeg-magic-then-garbage'] = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 0x41)]);
  a['segment-length-overrun'] = join(soi, Buffer.from([0xff, 0xe0, 0xff, 0xf0, 0x00]), eoi);
  a['sof-components-mismatch'] = (() => {
    const s = Buffer.from(sof);
    s[9] = 4; // claims 4 components, length says 3
    return join(soi, app0, dqt, s, dht, sosFull(), eoi);
  })();
  a['arithmetic-sof9'] = join(soi, app0, dqt, sofWith(32, 32, 0xc9), dht, sosFull(), eoi);

  // Content that must be dropped by the re-encode (accepted, but not stored verbatim).
  const script = Buffer.from('<script>alert(1)</script>PAYLOAD-MARKER-7f3a');
  a['appended-after-eoi'] = join(base, script);
  a['comment-with-script'] = join(soi, app0, Buffer.concat([Buffer.from([0xff, 0xfe]), u16(2 + script.length), script]), dqt, sof, dht, sosFull(), eoi);
  a['exif-app1-with-script'] = join(soi, Buffer.concat([Buffer.from([0xff, 0xe1]), u16(2 + 6 + script.length), Buffer.from('Exif\0\0'), script]), app0, dqt, sof, dht, sosFull(), eoi);

  // Size: padding with COM segments.
  const pad = (n) => Buffer.concat(Array.from({ length: n }, () => Buffer.concat([Buffer.from([0xff, 0xfe, 0xff, 0xff]), Buffer.alloc(65533, 0x41)])));
  a['near-max-1.4MB-padded'] = join(soi, app0, pad(21), dqt, sof, dht, sosFull(), eoi);
  a['over-max-1.6MB-padded'] = join(soi, app0, pad(25), dqt, sof, dht, sosFull(), eoi);
  return a;
}

export const dataUrl = (buf) => `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
