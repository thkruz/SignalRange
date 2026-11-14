# feedback-prune

Deletes screenshot objects from the `feedback-screenshots` bucket 30 days after the submission, clears
`screenshot_path` on the row, and removes objects no row references (older than one day). It uses the
Storage API because deleting `storage.objects` rows from SQL leaves the stored file behind.

Needs the migration `20261113130000_signalrange_feedback_screenshot_retention.sql` and the secret
`FEEDBACK_PRUNE_SECRET`. Schedule one daily POST with the header `x-prune-secret: <secret>`
(Supabase scheduled function, or `pg_cron` with `pg_net`). An unset secret rejects every call.

Tests: `pnpm run test:edge`.
