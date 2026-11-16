// In-flight body read limits (2 per user, 12 per isolate) and the read buffer sizing.
import assert from 'node:assert/strict';
import { type AuthUser, type Deps, handleFeedbackRequest, inflightReads } from './handler.ts';

const fail = () => Promise.reject(new Error('unexpected dependency call'));
let rateCalls = 0;

function makeDeps(): Deps {
  return {
    verifyUser: (jwt): Promise<AuthUser | null> => Promise.resolve({ id: jwt, isAnonymous: false }),
    tierFor: () => Promise.resolve('player'),
    isRegisteredScenario: () => false,
    findOwner: () => Promise.resolve(null),
    consumeRate: () => {
      rateCalls++;
      return Promise.resolve({ allowed: false, scope: 'hour', retryAfterSec: 60 });
    },
    putScreenshot: fail,
    removeScreenshot: fail,
    reencodeJpeg: fail,
    insert: fail,
    now: () => Date.now(),
    bodyTimeoutMs: 300,
  };
}

const stall = () =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode('{"id":'));
    },
  });

function postAs(token: string, stream: ReadableStream<Uint8Array>, headers: Record<string, string> = { 'transfer-encoding': 'chunked' }): Request {
  return new Request('http://local/feedback-submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
    body: stream,
    // @ts-ignore duplex is required for streamed request bodies
    duplex: 'half',
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idle = { total: 0, users: 0 };

Deno.test('at most 2 body reads per user are in flight; the third gets 429 with Retry-After and no quota use', async () => {
  rateCalls = 0;
  const deps = makeDeps();
  const pending = [postAs('u1', stall()), postAs('u1', stall())].map((r) => handleFeedbackRequest(r, deps));
  await sleep(50);
  assert.equal(inflightReads().total, 2);
  const third = await handleFeedbackRequest(postAs('u1', stall()), deps);
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers.get('retry-after')) >= 1);
  const other = handleFeedbackRequest(postAs('u2', stall()), deps);
  await sleep(20);
  assert.equal(inflightReads().total, 3);
  assert.deepEqual((await Promise.all([...pending, other])).map((r) => r.status), [408, 408, 408]);
  assert.deepEqual(inflightReads(), idle);
  assert.equal(rateCalls, 0);
});

Deno.test('at most 12 body reads per isolate are in flight', async () => {
  const deps = makeDeps();
  const statuses = (await Promise.all(Array.from({ length: 14 }, (_, i) => handleFeedbackRequest(postAs(`iso-${i}`, stall()), deps)))).map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 408).length, 12);
  assert.equal(statuses.filter((s) => s === 429).length, 2);
  assert.deepEqual(inflightReads(), idle);
});

Deno.test('limits can be injected', async () => {
  const deps = { ...makeDeps(), maxReadsPerUser: 1 };
  const a = handleFeedbackRequest(postAs('u3', stall()), deps);
  await sleep(30);
  assert.equal((await handleFeedbackRequest(postAs('u3', stall()), deps)).status, 429);
  assert.equal((await a).status, 408);
  assert.deepEqual(inflightReads(), idle);
});

Deno.test('the count is released when the read times out and when it errors, and the slot works again', async () => {
  const deps = makeDeps();
  assert.equal((await handleFeedbackRequest(postAs('u4', stall()), deps)).status, 408);
  assert.deepEqual(inflightReads(), idle);
  const broken = new ReadableStream<Uint8Array>({ start: (c) => c.error(new Error('connection reset')) });
  assert.equal((await handleFeedbackRequest(postAs('u4', broken), deps)).status, 500);
  assert.deepEqual(inflightReads(), idle);
  for (let i = 0; i < 4; i++) assert.equal((await handleFeedbackRequest(postAs('u4', stall()), deps)).status, 408);
  assert.deepEqual(inflightReads(), idle);
});

Deno.test('a refused or finished read does not stop a quick request from the same user (concurrency, not quota)', async () => {
  const deps = makeDeps();
  const body = new TextEncoder().encode('{}');
  for (let i = 0; i < 5; i++) {
    const res = await handleFeedbackRequest(postAs('u5', new ReadableStream({ start: (c) => (c.enqueue(body), c.close()) })), deps);
    assert.equal(res.status, 400);
  }
  assert.deepEqual(inflightReads(), idle);
});

Deno.test('a declared Content-Length does not size the read buffer', async () => {
  const deps = makeDeps();
  deps.bodyTimeoutMs = 200;
  // @ts-ignore gc is exposed only with --v8-flags; ignore when absent.
  globalThis.gc?.();
  const before = Deno.memoryUsage().external;
  const res = await handleFeedbackRequest(postAs('u6', stall(), { 'content-length': '3300000' }), deps);
  assert.equal(res.status, 408);
  assert.ok(Deno.memoryUsage().external - before < 2_000_000);
});
