# feedback-prune

Deletes screenshot objects from the `feedback-screenshots` bucket 30 days after the submission, clears
`screenshot_path` on the row, and removes objects no row references (older than one day). It uses the
Storage API because deleting `storage.objects` rows from SQL leaves the stored file behind.

Needs the migration `20261113130000_signalrange_feedback_screenshot_retention.sql` and the secret
`FEEDBACK_PRUNE_SECRET`. An unset secret rejects every call.

## Calling it

JWT verification stays on (the platform default). Never deploy this function with `--no-verify-jwt` and never
set `verify_jwt = false` for it in `config.toml`. The gateway therefore refuses any request without a valid
`Authorization` header before the function runs, and the function then checks the shared secret. Schedule one
daily POST that sends both:

```
POST https://<project-ref>.supabase.co/functions/v1/feedback-prune
Authorization: Bearer <service role key>
x-prune-secret: <FEEDBACK_PRUNE_SECRET>
```

Use the service role key as the bearer token, not the anon key: with an anon or player token the gateway lets
the call through and the secret would be the only gate. Keep both values in the scheduler's secret store
(Supabase scheduled function, or `pg_cron` with `pg_net` reading them from Vault).

Tests: `pnpm run test:edge`.
