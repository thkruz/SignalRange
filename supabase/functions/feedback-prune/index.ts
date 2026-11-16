// Supabase Edge Function entry for screenshot retention. Run it daily with a schedule that
// POSTs with `Authorization: Bearer <service role key>` (gateway JWT check, left on) and the
// x-prune-secret header (see README.md).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { handlePrune, type PruneDeps } from './prune.ts';

const BUCKET = 'feedback-screenshots';
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } });

const deps: PruneDeps = {
  async expired(limit) {
    const { data, error } = await admin.rpc('feedback_expired_screenshots', { p_limit: limit });
    if (error) throw new Error('expired lookup failed');
    return (data as Array<{ id: string; screenshot_path: string }>).map((r) => ({ id: r.id, path: r.screenshot_path }));
  },
  async orphans(limit) {
    const { data, error } = await admin.rpc('feedback_orphan_screenshots', { p_limit: limit });
    if (error) throw new Error('orphan lookup failed');
    return (data as Array<{ name: string }>).map((r) => r.name);
  },
  async removeObjects(paths) {
    const { error } = await admin.storage.from(BUCKET).remove(paths);
    if (error) throw new Error('storage delete failed');
  },
  async clearPaths(ids) {
    const { error } = await admin.rpc('feedback_clear_screenshot_paths', { p_ids: ids });
    if (error) throw new Error('clear failed');
  },
};

Deno.serve((req) => handlePrune(req, deps, Deno.env.get('FEEDBACK_PRUNE_SECRET') ?? ''));
