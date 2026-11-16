# Feedback hostile-input suite (local only)

Runs hostile requests against `feedback-submit` and `feedback-prune` on a LOCAL Supabase stack.
Every URL is checked against 127.0.0.1 / [::1] before it is sent, and `SUPABASE_*` variables are
removed from the process environment. Never point it at a remote project.

```
npx supabase start -x studio,imgproxy,vector,logflare,realtime,mailpit,postgres-meta,supavisor
# the retention migration calls cron.schedule, so create the extension first:
docker exec supabase_db_signalrange-local psql -U postgres -c "create extension if not exists pg_cron"
npx supabase migration up --local
node scripts/feedback-hostile/run.mjs --stage pre
node scripts/feedback-hostile/run.mjs --stage post --apply-revoke --areas smoke,payload,idempotency,rls,storage
node scripts/feedback-hostile/run.mjs --render scripts/feedback-hostile/results-pre.json scripts/feedback-hostile/results-post.json
npx supabase stop
```

The script starts and stops `supabase functions serve` itself, with a random `FEEDBACK_PRUNE_SECRET`.
`--stage post --apply-revoke` applies `supabase/pending/signalrange_feedback_revoke_old_rpc.sql` to the local database.
Areas: smoke, auth, payload, jpeg, text, rate, idempotency, rls, storage, prune. `results-*.json` are local output and ignored.

Notes
- The latest Supabase CLI rejects `[inbucket]` in `supabase/config.toml`; set `FEEDBACK_SUPABASE_CLI=supabase@2.106.0` to make the suite call that version through `npx`.
- `--stage pre` aborts if the pending revoke is already applied to the local database (it survives `supabase stop`). Use `supabase stop --no-backup` and start a fresh stack before a pre run. On a fresh volume `supabase start` fails at the cron migration: start with an empty `supabase/migrations`, create the `pg_cron` extension, restore the folder and run `migration up --local`.
- Cases that end in a 502 (or a never-finishing lying Content-Length) are the local gateway reacting to the function's early 413. They print `KNOWN` and are counted apart from real failures.