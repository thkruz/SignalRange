// Supabase Edge Function entry. Wires real dependencies into the pure handler.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { type Deps, handleFeedbackRequest, type RateDecision, RATE_LIMITS } from './handler.ts';
import { reencodeJpeg } from './jpeg-codec.ts';
import scenarioIds from './scenario-ids.json' with { type: 'json' };

const BUCKET = 'feedback-screenshots';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
// Own-property Set lookup: 'constructor' and '__proto__' are not scenarios.
const scenarios = new Set<string>(scenarioIds);

const deps: Deps = {
  async verifyUser(jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) return null;
    return { id: data.user.id, isAnonymous: data.user.is_anonymous === true };
  },
  async tierFor(userId) {
    const { data, error } = await admin.rpc('feedback_is_developer', { p_user: userId });
    if (error) throw new Error('tier lookup failed');
    return data === true ? 'developer' : 'player';
  },
  isRegisteredScenario: (id) => scenarios.has(id),
  async findOwner(id) {
    const { data, error } = await admin.rpc('feedback_owner', { p_id: id });
    if (error) throw new Error('owner lookup failed');
    return typeof data === 'string' ? data : null;
  },
  async consumeRate(userId, nowMs): Promise<RateDecision> {
    const { data, error } = await admin.rpc('feedback_consume_rate', {
      p_user: userId,
      p_now: new Date(nowMs).toISOString(),
      p_hour: RATE_LIMITS.perHour,
      p_day: RATE_LIMITS.perDay,
      p_global_hour: RATE_LIMITS.globalPerHour,
    });
    if (error || !data) throw new Error('rate lookup failed');
    return data.allowed ? { allowed: true } : { allowed: false, scope: data.scope, retryAfterSec: Number(data.retry_after_sec) || 60 };
  },
  async putScreenshot(path, bytes) {
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error('storage failed');
  },
  reencodeJpeg,
  async insert(row) {
    const { data, error } = await admin.rpc('feedback_insert', {
      p_id: row.id,
      p_user: row.userId,
      p_category: row.category,
      p_message: row.message,
      p_snapshot: row.snapshot,
      p_screenshot_path: row.screenshotPath,
      p_risk_flags: row.riskFlags,
    });
    if (error) throw new Error('insert failed');
    return data === 'inserted' || data === 'conflict' ? data : 'duplicate';
  },
  now: () => Date.now(),
  log: (event, detail) => console.log(JSON.stringify({ event, ...detail })),
  allowedOrigin: Deno.env.get('FEEDBACK_ALLOWED_ORIGIN') ?? '*',
};

Deno.serve((req) => handleFeedbackRequest(req, deps));
