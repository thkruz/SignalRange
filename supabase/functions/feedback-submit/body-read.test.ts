// Body-read integrity: a real Deno.serve on 127.0.0.1 (port 0) reads chunked and Content-Length bodies of boundary sizes
// byte for byte, and the BYOB and default-reader branches are each exercised on purpose.
import assert from 'node:assert/strict';
import { MAX_BODY_BYTES, readBodyBytes } from './handler.ts';

const TIMEOUT_MS = 8000;

/** Deterministic, non-ASCII bytes so a dropped or reordered byte shows up in the hash. */
function payload(size: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(size);
  let x = 0x9e3779b9 ^ size;
  for (let i = 0; i < size; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

function sizes(): number[] {
  const list = [1, 3, 4095, 4096, 4097, 65_535, 65_536, 65_537];
  // The buffer starts at 64 KB and doubles up to the cap; one byte below each doubled size.
  for (let b = 131_072; b < MAX_BODY_BYTES; b *= 2) list.push(b - 1);
  list.push(MAX_BODY_BYTES - 1, MAX_BODY_BYTES, MAX_BODY_BYTES + 1);
  return list;
}

function chunkedBody(bytes: Uint8Array, piece: number): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      const controller = c as ReadableByteStreamController;
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + piece));
      at += piece;
    },
  });
}

Deno.test('Deno.serve reads chunked and Content-Length bodies of boundary sizes byte for byte, cap+1 gets 413', async () => {
  const ac = new AbortController();
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, signal: ac.signal, onListen: () => undefined }, async (req) => {
    const body = await readBodyBytes(req, MAX_BODY_BYTES, TIMEOUT_MS);
    if (body === 'timeout') return new Response('timeout', { status: 408 });
    if (body === null) return new Response('too-large', { status: 413 });
    return Response.json({ len: body.length, sha: await sha256(body), chunked: req.headers.has('transfer-encoding') });
  });
  const url = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/`;
  try {
    for (const size of sizes()) {
      const bytes = payload(size);
      const want = await sha256(bytes);
      for (const mode of ['content-length', 'chunked'] as const) {
        const init: RequestInit & { duplex?: 'half' } =
          mode === 'chunked'
            ? { method: 'POST', body: chunkedBody(bytes, size > 100_000 ? 65_536 : 1000), duplex: 'half' }
            : { method: 'POST', body: bytes };
        const res = await fetch(url, init);
        if (size > MAX_BODY_BYTES) {
          assert.equal(res.status, 413, `${mode} ${size}`);
          await res.body?.cancel();
          continue;
        }
        assert.notEqual(res.status, 408, `${mode} ${size} timed out`);
        assert.equal(res.status, 200, `${mode} ${size}`);
        const got = await res.json();
        assert.equal(got.len, size, `${mode} ${size} length`);
        assert.equal(got.sha, want, `${mode} ${size} hash`);
        if (mode === 'chunked') assert.equal(got.chunked, true, `${size} was not sent chunked`);
      }
    }
  } finally {
    ac.abort();
    await server.finished;
  }
});

function requestOf(stream: ReadableStream<Uint8Array>): Request {
  return new Request('http://127.0.0.1/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
}

function byteStream(bytes: Uint8Array, piece: number): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    type: 'bytes',
    pull(c) {
      const controller = c as ReadableByteStreamController;
      if (at >= bytes.length) {
        controller.close();
        controller.byobRequest?.respond(0);
        return;
      }
      const end = Math.min(bytes.length, at + piece);
      const request = controller.byobRequest;
      if (request?.view) {
        const n = Math.min(request.view.byteLength, end - at);
        new Uint8Array(request.view.buffer, request.view.byteOffset, n).set(bytes.subarray(at, at + n));
        at += n;
        request.respond(n);
      } else {
        controller.enqueue(bytes.slice(at, end));
        at = end;
      }
    },
  });
}

/** readBodyBytes only touches req.body, so a bare object lets a real byte stream (and its BYOB reader) through untouched. */
function bodyOnly(stream: ReadableStream<Uint8Array>): Request {
  return { body: stream } as unknown as Request;
}

Deno.test('readBodyBytes takes the BYOB branch on a byte stream and returns the exact bytes at the cap', async () => {
  const cap = 200_000;
  for (const size of [0, 1, 3, cap - 1, cap]) {
    const bytes = payload(size);
    const stream = byteStream(bytes, size > 1000 ? 65_536 : 7);
    const modes: string[] = [];
    const original = stream.getReader.bind(stream) as (o?: { mode?: string }) => unknown;
    Object.defineProperty(stream, 'getReader', {
      value: (o?: { mode?: string }) => {
        const reader = original(o);
        modes.push(o?.mode ?? 'default');
        return reader;
      },
    });
    const got = await readBodyBytes(bodyOnly(stream), cap, 5000);
    assert.deepEqual(modes, ['byob'], `size ${size} did not use a BYOB reader`);
    assert.ok(got instanceof Uint8Array, `size ${size}`);
    assert.equal(await sha256(got), await sha256(bytes), `size ${size} hash`);
  }
  assert.equal(await readBodyBytes(bodyOnly(byteStream(payload(cap + 1), 4096)), cap, 5000), null);
});

Deno.test('non-BYOB fallback reads the body correctly, bounded by the cap and the read count', async () => {
  const fallbackRequest = (stream: ReadableStream<Uint8Array>): Request => {
    const req = requestOf(stream);
    const body = req.body as ReadableStream<Uint8Array>;
    const original = body.getReader.bind(body) as (o?: { mode?: string }) => unknown;
    Object.defineProperty(body, 'getReader', {
      value: (o?: { mode?: string }) => {
        if (o?.mode === 'byob') throw new TypeError('byob unsupported');
        return original(o);
      },
    });
    return req;
  };
  // Correct bytes through 3000 one-byte chunks.
  const bytes = payload(3000);
  const got = await readBodyBytes(fallbackRequest(chunkedBody(bytes, 1)), 10_000, 5000);
  assert.ok(got instanceof Uint8Array);
  assert.equal(await sha256(got), await sha256(bytes));
  // Over the cap is refused without buffering the rest.
  assert.equal(await readBodyBytes(fallbackRequest(chunkedBody(payload(20_000), 1000)), 10_000, 5000), null);
  // A flood of tiny chunks hits the read-count limit instead of looping forever.
  const flood = new ReadableStream<Uint8Array>({
    pull(c) {
      const controller = c as ReadableByteStreamController;
      controller.enqueue(new Uint8Array(1));
    },
  });
  assert.equal(await readBodyBytes(fallbackRequest(flood), 1_000_000, 5000), null);
});
