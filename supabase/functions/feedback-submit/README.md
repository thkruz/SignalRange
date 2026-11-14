# feedback-submit

Validated write path for in-game feedback. Verifies the caller, rate limits, re-runs the shared
rules, re-encodes screenshots and inserts with the service role.

Files: `handler.ts` (policy, injected dependencies), `index.ts` (real wiring), `jpeg.ts`,
`jpeg-codec.ts` (jpeg-js), `risk-flags.ts`. `../_shared/feedback-rules.ts` is a copy of
`src/feedback/feedback-rules.ts` and `scenario-ids.json` a snapshot of the registered scenario
ids; `pnpm exec vitest run test/feedback/edge-drift.test.ts` fails when either drifts. Refresh with
`cp src/feedback/feedback-rules.ts supabase/functions/_shared/feedback-rules.ts`.

## Tests (no network, no Docker)

    pnpm run test:edge

## Run locally (needs Docker)

    npx supabase start
    npx supabase db reset            # applies every migration, including the revoke (fine locally; the client must then use the function)
    npx supabase functions serve feedback-submit

Get a user token from the local Auth (sign up through the local Studio or
`POST http://127.0.0.1:54321/auth/v1/signup`), then:

    curl -s -X POST http://127.0.0.1:54321/functions/v1/feedback-submit \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"id":"<uuid>","category":"bug","message":"test","screenshot":null,"snapshot":{...}}'

The migration `20261113999999_signalrange_feedback_revoke_old_rpc.sql` must NOT be applied to
production before the function is deployed and the client uses it.

## Production smoke (once, after Ted's OK; one test account)

1. No Authorization header: 401.
2. Garbage token: 401.
3. Anonymous-session token: 403.
4. Valid text-only report: 200, row appears with `risk_flags = {}`.
5. Same id again: 200 `duplicate: true`, still one row.
6. Report containing "ignore previous instructions" and a URL: 200, row has the flags.
7. Report with tag characters: 200, stored text clean, `hidden-characters` flag.
8. Small real JPEG screenshot: 200, `screenshot_path` set, object exists in `feedback-screenshots`.
9. PNG bytes behind a JPEG data-URL prefix: 400, no object.
10. Fifth then sixth quick submission with new ids: sixth is 429 with `Retry-After`.

Afterwards delete the test rows, `feedback_rate` entries and storage objects.
