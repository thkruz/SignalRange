# Phase 7: Cloudflare Deploy Pipeline Fix - Retrospective

## Summary
Fixed GitHub Actions deployment to Cloudflare Workers that was failing with authentication and configuration errors.

## What Worked

- **Incremental debugging approach**: Adding a `whoami` step isolated that authentication worked but deploy failed, narrowing down the issue
- **Local testing**: Running `wrangler whoami` locally with the API token quickly confirmed the token was valid, avoiding more GitHub Actions round-trips
- **Checking environment secrets**: Verified the secret was correctly placed in the GitHub environment (production) rather than just repository-level

## What Didn't

- **Assuming wrangler version compatibility**: The workflow was using wrangler 3.90.0 (action default) while the project config (`wrangler.jsonc`) used wrangler 4 features. This caused both config parsing issues and the strange auth failure on `/memberships`
- **Missing explicit config file path**: Wrangler defaulted to looking for `wrangler.toml` but the project uses `wrangler.jsonc`
- **Implicit account resolution**: Wrangler 3's `/memberships` API call failed even with valid auth; explicitly passing `accountId` bypassed this

## What to Change Next Time

1. **Pin wrangler version in CI**: Always specify `wranglerVersion` in the wrangler-action to match what's used locally/in development
2. **Always specify config file explicitly**: Use `--config wrangler.jsonc` when not using the default `wrangler.toml` filename
3. **Always specify accountId**: Even with a single account, explicitly passing the account ID avoids API lookup issues
4. **Test deployments locally first**: Run `npx wrangler deploy --config wrangler.jsonc --env production --dry-run` locally before pushing CI changes

## Final Fix

Three changes to `.github/workflows/deploy-pipeline.yml`:

```yaml
- name: Deploy to Cloudflare Workers
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}  # Added
    wranglerVersion: "4"                              # Added
    command: deploy --config wrangler.jsonc --env production  # Added --config
```

## Secrets Required

- `CLOUDFLARE_API_TOKEN` - API token with Workers Scripts Edit permission
- `CLOUDFLARE_ACCOUNT_ID` - Account ID (found via `wrangler whoami`)

Both secrets must be added to the GitHub environment (production/uat) or at repository level.
