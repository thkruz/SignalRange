# UAT Environment Setup Guide

This guide explains how to set up and deploy the UAT (User Acceptance Testing) environment for SignalRange.

## Overview

The UAT environment allows you to test changes before deploying to production. It:
- Uses the same codebase as production
- Points to the same Supabase project initially (for verification)
- Displays an "UAT" badge to distinguish it from production
- Is accessible at `uat.signalrange.space`

## Prerequisites

1. Cloudflare account with `signalrange.space` domain configured
2. DNS access to create subdomain records
3. Wrangler CLI installed and authenticated

## Setup Steps

### 1. Configure DNS

In Cloudflare Dashboard:

1. Go to **DNS** → **Records**
2. Add a new **CNAME** record:
   - **Name**: `uat`
   - **Target**: `signalrange.workers.dev` (or your worker subdomain)
   - **Proxy status**: Proxied (orange cloud)
3. Save the record

### 2. Create UAT Environment File

Since environment variables are injected at **build time** (not runtime), create a `.env.uat` file:

```bash
# .env.uat
PUBLIC_ENVIRONMENT=uat
PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PUBLIC_USER_API_URL=https://user.keeptrack.space
PUBLIC_ASSETS_BASE_URL=https://assets.signalrange.space
```

**Note**: Initially, use the same Supabase credentials as production for verification. Later, you'll create a separate UAT Supabase project.

**Important**: Add `.env.uat` to `.gitignore` to keep credentials secure.

### 3. Deploy to UAT

The deployment script automatically:
- Sets `PUBLIC_ENVIRONMENT=uat` during build
- Loads `.env.uat` for environment variables
- Builds with UAT configuration
- Deploys to the UAT environment

```bash
# Build and deploy to UAT
npm run deploy:uat

# Or with R2 asset sync
npm run deploy:full:uat
```

### 4. Verify Deployment

1. Visit `https://uat.signalrange.space`
2. You should see:
   - The SignalRange application
   - An orange "UAT" badge in the top-right corner
   - Same functionality as production (since using same Supabase)

## Environment Variables

### Required for UAT

- `PUBLIC_ENVIRONMENT=uat` - Shows UAT badge
- `PUBLIC_SUPABASE_URL` - Supabase project URL (initially same as prod)
- `PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key (initially same as prod)
- `PUBLIC_USER_API_URL` - User API URL (defaults to https://user.keeptrack.space)
- `PUBLIC_ASSETS_BASE_URL` - Assets base URL (optional)

### Setting Variables

**Important**: Environment variables are injected at **build time** by webpack, not at runtime. They must be in `.env.uat` file.

**For UAT, use `.env.uat` file:**
```bash
# Create .env.uat with your UAT configuration
PUBLIC_ENVIRONMENT=uat
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
# etc.
```

**Note**: Wrangler secrets/vars are for runtime variables in Worker scripts. Since this app uses static assets with build-time variable injection, use `.env.uat` instead.

## Deployment Commands

### Production
```bash
npm run deploy:prod          # Build and deploy to production
npm run deploy:full:prod     # Build, sync R2 assets, and deploy
```

### UAT
```bash
npm run deploy:uat           # Build and deploy to UAT
npm run deploy:full:uat      # Build, sync R2 assets, and deploy to UAT
```

## Verification Checklist

After deploying to UAT, verify:

- [ ] `https://uat.signalrange.space` loads correctly
- [ ] Orange "UAT" badge is visible in top-right corner
- [ ] Application functionality works (same as prod)
- [ ] Authentication works (using same Supabase)
- [ ] Assets load correctly
- [ ] No console errors in browser DevTools

## Next Steps

Once UAT is verified:

1. **Split Supabase Projects** (Future PR):
   - Create separate UAT Supabase project
   - Update UAT environment variables
   - Test data isolation

2. **CI/CD Integration**:
   - Set up automated deployments
   - Deploy to UAT on pull requests
   - Deploy to prod on main branch merge

## Troubleshooting

### UAT badge not showing

- Verify `PUBLIC_ENVIRONMENT=uat` is set correctly
- Check browser console for errors
- Rebuild and redeploy

### Domain not resolving

- Verify DNS CNAME record is created
- Check DNS propagation (can take 5-15 minutes)
- Verify Cloudflare proxy is enabled (orange cloud)

### SSL certificate issues

- Cloudflare automatically provisions SSL for proxied domains
- Wait a few minutes after DNS setup
- Check SSL/TLS settings in Cloudflare Dashboard

### Environment variables not working

- Verify variables are set for the correct environment (`--env uat`)
- Check variable names match exactly (case-sensitive)
- Rebuild after setting variables (webpack injects at build time)

## Notes

- **Initial Setup**: UAT uses the same Supabase as production for verification
- **Future**: UAT will have its own Supabase project for data isolation
- **Badge**: The UAT badge helps prevent confusion between environments
- **Routes**: Both prod (`app.signalrange.space`) and UAT (`uat.signalrange.space`) are configured in `wrangler.jsonc`

