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

const jwt = (role: string) => `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ role })).replace(/=+$/u, '')}.sig`;
const call = (headers: Record<string, string>) => new Request('http://x', { method: 'POST', headers });

Deno.test('prune endpoint needs a service role bearer, the shared secret and POST', async () => {
  const f = fake([], []);
  const svc = { authorization: `Bearer ${jwt('service_role')}` };
  assert.equal((await handlePrune(call(svc), f.deps, 's3cret')).status, 401, 'no secret');
  assert.equal((await handlePrune(call({ ...svc, 'x-prune-secret': 'wrong!' }), f.deps, 's3cret')).status, 401);
  assert.equal((await handlePrune(new Request('http://x', { method: 'GET', headers: svc }), f.deps, 's3cret')).status, 405);
  assert.equal((await handlePrune(call({ ...svc, 'x-prune-secret': 's3cret' }), f.deps, 's3cret')).status, 200);
  assert.equal(secretMatches('x', ''), false, 'an unset secret never matches');
});

Deno.test('an ordinary user or anon JWT with the correct secret is refused', async () => {
  const f = fake([], []);
  for (const role of ['authenticated', 'anon']) {
    const req = call({ authorization: `Bearer ${jwt(role)}`, 'x-prune-secret': 's3cret' });
    assert.equal((await handlePrune(req, f.deps, 's3cret')).status, 401, role);
  }
  assert.equal((await handlePrune(call({ 'x-prune-secret': 's3cret' }), f.deps, 's3cret')).status, 401, 'no bearer');
  assert.equal((await handlePrune(call({ authorization: 'Bearer not-a-jwt', 'x-prune-secret': 's3cret' }), f.deps, 's3cret')).status, 401);
});
