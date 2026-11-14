import assert from 'node:assert/strict';
import { handlePrune, type PruneDeps, pruneScreenshots, secretMatches } from './prune.ts';

function fake(expired: Array<{ id: string; path: string }>, orphans: string[]) {
  const objects = new Set<string>([...expired.map((r) => r.path), ...orphans, 'keep/me.jpg']);
  const rows = new Map(expired.map((r) => [r.id, r.path as string | null]));
  const deps: PruneDeps = {
    expired: () => Promise.resolve(expired.filter((r) => rows.get(r.id) !== null)),
    orphans: () => Promise.resolve(orphans.filter((n) => objects.has(n))),
    removeObjects: (paths) => {
      for (const p of paths) objects.delete(p);
      return Promise.resolve();
    },
    clearPaths: (ids) => {
      for (const id of ids) rows.set(id, null);
      return Promise.resolve();
    },
  };
  return { deps, objects, rows };
}

Deno.test('prune deletes expired screenshot objects, clears the row path and removes orphans', async () => {
  const f = fake([{ id: 'a', path: 'u/a.jpg' }, { id: 'b', path: 'u/b.jpg' }], ['u/orphan.jpg']);
  const r = await pruneScreenshots(f.deps);
  assert.deepEqual(r, { expired: 2, orphans: 1 });
  assert.deepEqual([...f.objects], ['keep/me.jpg']);
  assert.equal(f.rows.get('a'), null);
});

Deno.test('a failed object delete leaves the row path in place for the next run', async () => {
  const f = fake([{ id: 'a', path: 'u/a.jpg' }], []);
  f.deps.removeObjects = () => Promise.reject(new Error('down'));
  await assert.rejects(pruneScreenshots(f.deps));
  assert.equal(f.rows.get('a'), 'u/a.jpg');
});

Deno.test('prune endpoint needs the shared secret and POST', async () => {
  const f = fake([], []);
  assert.equal((await handlePrune(new Request('http://x', { method: 'POST' }), f.deps, 's3cret')).status, 401);
  assert.equal((await handlePrune(new Request('http://x', { method: 'POST', headers: { 'x-prune-secret': 'wrong!' } }), f.deps, 's3cret')).status, 401);
  assert.equal((await handlePrune(new Request('http://x', { method: 'GET' }), f.deps, 's3cret')).status, 405);
  assert.equal((await handlePrune(new Request('http://x', { method: 'POST', headers: { 'x-prune-secret': 's3cret' } }), f.deps, 's3cret')).status, 200);
  assert.equal(secretMatches('x', ''), false, 'an unset secret never matches');
});

Deno.test('the handler checks only the secret; the service role bearer is verified by the gateway before it runs', async () => {
  const f = fake([], []);
  const req = new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer service-role-key', 'x-prune-secret': 's3cret' } });
  assert.equal((await handlePrune(req, f.deps, 's3cret')).status, 200);
  const noSecret = new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer service-role-key' } });
  assert.equal((await handlePrune(noSecret, f.deps, 's3cret')).status, 401);
});
