// Screenshot retention for the feedback-screenshots bucket. All I/O comes in through `PruneDeps`.

export interface PruneDeps {
  /** Rows with a screenshot older than 30 days. */
  expired(limit: number): Promise<Array<{ id: string; path: string }>>;
  /** Objects no row references. */
  orphans(limit: number): Promise<string[]>;
  removeObjects(paths: string[]): Promise<void>;
  clearPaths(ids: string[]): Promise<void>;
}

export interface PruneResult {
  expired: number;
  orphans: number;
}

const BATCH = 200;
const MAX_BATCHES = 20;

/**
 * Deletes the stored objects first and clears the row path only after the delete succeeded,
 * so a failed delete is retried on the next run instead of leaving an unreferenced object.
 */
export async function pruneScreenshots(deps: PruneDeps): Promise<PruneResult> {
  const result: PruneResult = { expired: 0, orphans: 0 };
  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await deps.expired(BATCH);
    if (rows.length === 0) break;
    await deps.removeObjects(rows.map((r) => r.path));
    await deps.clearPaths(rows.map((r) => r.id));
    result.expired += rows.length;
    if (rows.length < BATCH) break;
  }
  for (let i = 0; i < MAX_BATCHES; i++) {
    const names = await deps.orphans(BATCH);
    if (names.length === 0) break;
    await deps.removeObjects(names);
    result.orphans += names.length;
    if (names.length < BATCH) break;
  }
  return result;
}

/** Constant-time string comparison for the shared secret. */
export function secretMatches(given: string | null, expected: string): boolean {
  if (given === null || expected.length === 0 || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function handlePrune(req: Request, deps: PruneDeps, secret: string): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!secretMatches(req.headers.get('x-prune-secret'), secret)) return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
  try {
    const result = await pruneScreenshots(deps);
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'internal-error' }), { status: 500 });
  }
}
