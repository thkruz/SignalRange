# Pending migrations

Files here are not applied by `supabase db push` or `db reset`. Each one waits for a rollout step.

## signalrange_feedback_revoke_old_rpc.sql

Closes the old client write path (`public.submit_signalrange_feedback` and direct table inserts).
Apply it only after all of these are true:

1. The migrations in `supabase/migrations/` are applied.
2. `feedback-submit` is deployed and a real submission has been smoked.
3. The released client sends feedback through the function.

Then copy it into `supabase/migrations/` with a timestamp later than every migration already applied
(the CLI refuses out-of-order files without `--include-all`) and push. Rollback is in the file header.
