// Real-server memory test: the handler runs under Deno.serve and takes raw TCP connections.
// It takes about 3 s, so it runs in `test:edge` by default. Set SKIP_EDGE_MEMORY_TEST=1 to skip it.
import assert from 'node:assert/strict';
import net from 'node:net';
import { type AuthUser, type Deps, handleFeedbackRequest, inflightReads } from './handler.ts';

const fail = () => Promise.reject(new Error('unexpected dependency call'));

function stubDeps(): Deps {
  return {
    verifyUser: (jwt): Promise<AuthUser | null> => Promise.resolve({ id: jwt, isAnonymous: false }),
    tierFor: fail,
    isRegisteredScenario: () => false,
    findOwner: fail,
    consumeRate: () => Promise.resolve({ allowed: false, scope: 'hour', retryAfterSec: 60 }),
    putScreenshot: fail,
    removeScreenshot: fail,
    reencodeJpeg: fail,
    insert: fail,
    now: () => Date.now(),
    bodyTimeoutMs: 1500,
  };
}

function connect(port: number, head: string, after?: (s: net.Socket) => void): Promise<number> {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    const s = net.connect(port, '127.0.0.1', () => {
      s.write(head);
      after?.(s);
    });
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(Number(/^HTTP\/1\.1 (\d{3})/u.exec(data)?.[1] ?? 0));
      s.destroy();
    };
    s.on('data', (d) => {
      data += d.toString('latin1');
      if (data.includes('\r\n\r\n')) done();
    });
    s.on('error', done);
    s.on('close', done);
  });
}

Deno.test({
  name: '100 hostile connections against a real Deno.serve keep external memory growth under 64 MB',
  ignore: Deno.env.get('SKIP_EDGE_MEMORY_TEST') === '1',
  async fn() {
    const deps = stubDeps();
    const ac = new AbortController();
    const server = Deno.serve({ hostname: '127.0.0.1', port: 0, signal: ac.signal, onListen: () => undefined }, (req) => handleFeedbackRequest(req, deps));
    const port = (server.addr as Deno.NetAddr).port;
    // @ts-ignore gc is exposed only with --v8-flags; ignore when absent.
    globalThis.gc?.();
    await new Promise((r) => setTimeout(r, 100));
    const base = Deno.memoryUsage();
    let peakExt = 0;
    let peakRss = 0;
    const sampler = setInterval(() => {
      const m = Deno.memoryUsage();
      peakExt = Math.max(peakExt, m.external - base.external);
      peakRss = Math.max(peakRss, m.rss - base.rss);
    }, 5);

    const flood = '1\r\n \r\n'.repeat(20_000);
    const jobs: Promise<number>[] = [];
    for (let i = 0; i < 50; i++) {
      const common = `POST /feedback-submit HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nAuthorization: Bearer user-${i}\r\n`;
      jobs.push(connect(port, `${common}Content-Length: 3300000\r\n\r\n`));
      jobs.push(connect(port, `${common}Transfer-Encoding: chunked\r\n\r\n`, (s) => s.write(flood)));
    }
    const statuses = await Promise.all(jobs);
    clearInterval(sampler);
    ac.abort();
    await server.finished;

    const counts: Record<number, number> = {};
    for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
    console.log(`real-server memory: peak external +${(peakExt / 1e6).toFixed(1)} MB, peak rss +${(peakRss / 1e6).toFixed(1)} MB, statuses ${JSON.stringify(counts)}`);
    for (const s of statuses) assert.ok([408, 413, 429].includes(s), `unexpected status ${s}`);
    assert.ok(peakExt < 64e6, `external grew ${(peakExt / 1e6).toFixed(1)} MB`);
    assert.deepEqual(inflightReads(), { total: 0, users: 0 });
  },
});
