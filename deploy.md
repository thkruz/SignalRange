# Deployment Guide

This guide covers deploying SignalRange to Cloudflare Workers with R2 asset storage.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Environment Configuration](#environment-configuration)
4. [Building the Application](#building-the-application)
5. [R2 Asset Management](#r2-asset-management)
6. [Deploying to Cloudflare Workers](#deploying-to-cloudflare-workers)
7. [Domain Configuration](#domain-configuration)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **Node.js** (v20+ recommended)
- **npm** (comes with Node.js)
- **Wrangler CLI** (Cloudflare Workers CLI)
  ```bash
  npm install -g wrangler
  # Or use npx: npx wrangler
  ```

### Cloudflare Account Setup

1. **Create a Cloudflare account** at [cloudflare.com](https://www.cloudflare.com)
2. **Verify your email** and complete account setup
3. **Get your API token**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Create a token with:
     - **Account** permissions: `Cloudflare Workers:Edit`
     - **Zone** permissions: `Zone:Read`, `Zone Settings:Edit` (if using custom domain)
   - Or use `wrangler login` for interactive authentication

### Authenticate Wrangler

```bash
# Interactive login (recommended for first-time setup)
wrangler login

# Or use API token
wrangler config
```

---

## Initial Setup

### 1. Create R2 Buckets

SignalRange uses Cloudflare R2 for storing large audio and image assets.

```bash
# Create production bucket
wrangler r2 bucket create signal-range-assets

# Create preview bucket (optional, for staging)
wrangler r2 bucket create signal-range-assets-preview
```

**Note**: Bucket names are configured in `wrangler.jsonc`. If you change bucket names, update the configuration file.

### 2. Configure R2 Custom Domain (Optional)

For better performance and custom URLs, set up a custom domain for R2:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → Your bucket
2. Click **Settings** → **Public Access** → **Connect Domain**
3. Add your domain (e.g., `assets.signalrange.space`)
4. Update DNS records as instructed
5. Wait for DNS propagation (usually 5-15 minutes)

### 3. Verify Wrangler Configuration

Check your `wrangler.jsonc` file:

```jsonc
{
  "name": "signal-range",
  "compatibility_date": "2025-11-01",
  "r2_buckets": [
    {
      "binding": "ASSETS",
      "bucket_name": "signal-range-assets",
      "preview_bucket_name": "signal-range-assets-preview"
    }
  ],
  "assets": {
    "directory": "./dist",
    "html_handling": "force-trailing-slash",
    "not_found_handling": "single-page-application"
  },
  "routes": [
    "app.signalrange.space/*"
  ]
}
```

**Important**: Update the `routes` array with your actual domain.

---

## Environment Configuration

### Production Environment Variables

Create a `.env.production` file in the project root:

```env
# Supabase Configuration (Required)
PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# User API URL
PUBLIC_USER_API_URL=https://user.keeptrack.space

# Assets Base URL (Required for production)
# Use your R2 custom domain or Cloudflare R2 public URL
PUBLIC_ASSETS_BASE_URL=https://assets.signalrange.space
```

**Note**: Environment variables are injected at build time via webpack. Make sure `.env.production` is in your `.gitignore`.

### Getting Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `PUBLIC_SUPABASE_URL`
   - **anon/public key** → `PUBLIC_SUPABASE_ANON_KEY`

---

## Building the Application

### Development Build

For local testing:

```bash
npm run build
```

This creates a production build in the `dist/` directory without deploying.

### Production Build

The build process is automatically handled by deployment scripts, but you can build manually:

```bash
# Build for production
npm run build

# Verify build output
ls -la dist/
```

**Build Output**:
- `dist/index.html` - Main HTML file
- `dist/main.[hash].js` - Bundled JavaScript
- `dist/popup-callback.[hash].js` - OAuth callback handler
- `dist/auth/callback.html` - OAuth callback page
- `dist/images/` - Static images
- `dist/assets/` - Static assets

---

## R2 Asset Management

### Understanding R2 Asset Sync

Large audio and image files are stored in Cloudflare R2, not in the Worker bundle. The sync script uploads files from `public/assets/campaigns/` to the R2 bucket.

### Syncing Assets

```bash
# Preview what would be uploaded (dry run)
npm run r2:sync:dry

# Upload new/changed files
npm run r2:sync

# Upload with verbose logging
npm run r2:sync -- --verbose
```

**What Gets Synced**:
- Audio files: `.mp3`, `.wav`, `.ogg`
- Image files: `.png`, `.jpg`, `.jpeg`
- Location: `public/assets/campaigns/` → R2 bucket `assets/campaigns/`

**Sync Behavior**:
- Files are uploaded based on MD5 hash comparison
- Only new or changed files are uploaded
- Existing files are skipped

### Verifying Uploaded Assets

```bash
# List all objects in R2 bucket
wrangler r2 object list signal-range-assets --prefix="assets/campaigns"

# Get details of a specific object
wrangler r2 object get signal-range-assets/assets/campaigns/nats/1/audio.mp3
```

### Asset URL Configuration

Make sure `PUBLIC_ASSETS_BASE_URL` in `.env.production` matches your R2 custom domain:

```env
# If using custom domain
PUBLIC_ASSETS_BASE_URL=https://assets.signalrange.space

# If using R2 public URL (not recommended for production)
PUBLIC_ASSETS_BASE_URL=https://pub-xxxxx.r2.dev
```

---

## Deploying to Cloudflare Workers

### Quick Deploy

Deploy everything in one command:

```bash
npm run deploy:full
```

This command:
1. Builds the application (`npm run build`)
2. Syncs R2 assets (`npm run r2:sync`)
3. Deploys to Cloudflare Workers (`wrangler deploy`)

### Step-by-Step Deploy

For more control, deploy in steps:

```bash
# 1. Build the application
npm run build

# 2. Sync R2 assets (if you have new/changed assets)
npm run r2:sync

# 3. Deploy to Cloudflare Workers
npm run deploy
```

### Dry Run Deployment

Test deployment without actually deploying:

```bash
npm run deploy:dry-run
```

This builds and validates the deployment without pushing to Cloudflare.

### Preview Deployment

Test your deployment locally with Wrangler:

```bash
npm run preview
```

This runs a local Cloudflare Workers environment that mimics production.

---

## Domain Configuration

### Using Custom Domain

1. **Add Domain to Cloudflare**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Add your domain (e.g., `signalrange.space`)
   - Update nameservers as instructed

2. **Configure Worker Route**:
   - Update `wrangler.jsonc` with your domain:
     ```jsonc
     "routes": [
       "app.signalrange.space/*"
     ]
     ```
   - Or use `wrangler.toml` for more advanced routing

3. **Deploy**:
   ```bash
   npm run deploy:full
   ```

4. **Verify DNS**:
   ```bash
   # Check if domain resolves
   dig app.signalrange.space
   
   # Or use online tools like:
   # https://dnschecker.org
   ```

### Using workers.dev Subdomain

If you don't have a custom domain, Cloudflare provides a free subdomain:

1. **Deploy without routes**:
   - Remove or comment out `routes` in `wrangler.jsonc`
   - Deploy: `npm run deploy`
   - Your app will be available at: `signal-range.your-subdomain.workers.dev`

2. **Update Supabase Allowed Domains**:
   - Add `*.workers.dev` to your Supabase allowed domains
   - Or add your specific subdomain

---

## Troubleshooting

### Build Errors

**Problem**: Build fails with TypeScript errors
```bash
# Solution: Run type checking first
npm run type-check

# Fix any TypeScript errors before building
```

**Problem**: Webpack build fails
```bash
# Solution: Clean and rebuild
npm run clean
npm run build
```

### Deployment Errors

**Problem**: `wrangler: command not found`
```bash
# Solution: Install wrangler globally or use npx
npm install -g wrangler
# Or
npx wrangler deploy
```

**Problem**: Authentication errors
```bash
# Solution: Re-authenticate
wrangler login
# Or configure API token
wrangler config
```

**Problem**: R2 bucket not found
```bash
# Solution: Create the bucket first
wrangler r2 bucket create signal-range-assets
```

### R2 Sync Issues

**Problem**: Files not uploading
```bash
# Solution: Check file paths and permissions
npm run r2:sync:dry  # Preview what would be uploaded
npm run r2:sync -- --verbose  # See detailed output
```

**Problem**: Wrong files being uploaded
- Check that files are in `public/assets/campaigns/`
- Verify file extensions match (`.mp3`, `.wav`, `.png`, `.jpg`)
- Check the sync script logs

### Runtime Issues

**Problem**: Assets not loading in production
- Verify `PUBLIC_ASSETS_BASE_URL` is set correctly in `.env.production`
- Check R2 bucket public access settings
- Verify custom domain DNS is configured correctly
- Check browser console for 404 errors

**Problem**: Authentication not working
- Verify Supabase credentials in `.env.production`
- Check that your domain is in Supabase allowed domains list
- Verify `PUBLIC_USER_API_URL` is correct
- Check browser console for auth errors

**Problem**: 404 errors on routes
- Verify `not_found_handling: "single-page-application"` in `wrangler.jsonc`
- Check that `dist/index.html` exists after build
- Ensure routes are configured correctly

### Performance Issues

**Problem**: Slow asset loading
- Use R2 custom domain instead of public URL
- Enable Cloudflare CDN caching
- Optimize asset file sizes
- Check R2 bucket region (should be close to users)

**Problem**: Large bundle size
- Check webpack bundle analyzer
- Ensure large assets are in R2, not in bundle
- Verify tree-shaking is working

---

## Deployment Checklist

Before deploying to production:

- [ ] All environment variables set in `.env.production`
- [ ] R2 buckets created and configured
- [ ] R2 custom domain configured (if using)
- [ ] Assets synced to R2 (`npm run r2:sync`)
- [ ] Build succeeds without errors (`npm run build`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] Linting passes (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] Wrangler authenticated (`wrangler login`)
- [ ] Routes configured in `wrangler.jsonc`
- [ ] Domain DNS configured (if using custom domain)
- [ ] Supabase allowed domains updated
- [ ] Dry run successful (`npm run deploy:dry-run`)

---

## Continuous Deployment

### GitHub Actions (Example)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          PUBLIC_SUPABASE_URL: ${{ secrets.PUBLIC_SUPABASE_URL }}
          PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.PUBLIC_SUPABASE_ANON_KEY }}
          PUBLIC_USER_API_URL: ${{ secrets.PUBLIC_USER_API_URL }}
          PUBLIC_ASSETS_BASE_URL: ${{ secrets.PUBLIC_ASSETS_BASE_URL }}
      
      - name: Sync R2 Assets
        run: npm run r2:sync
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      
      - name: Deploy to Cloudflare
        run: npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**Required GitHub Secrets**:
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token
- `PUBLIC_SUPABASE_URL` - Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `PUBLIC_USER_API_URL` - User API URL
- `PUBLIC_ASSETS_BASE_URL` - Assets base URL

---

## Rollback

If something goes wrong, you can rollback:

### Rollback Worker Deployment

```bash
# List recent deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback [deployment-id]
```

### Rollback R2 Assets

R2 doesn't have built-in versioning, but you can:

1. Keep backups of important assets
2. Re-upload previous versions manually
3. Use R2 lifecycle policies for automatic backups

---

## Monitoring

### View Logs

```bash
# Real-time logs
wrangler tail

# Filter logs
wrangler tail --format pretty
```

### Analytics

- **Cloudflare Dashboard** → **Workers** → Your worker → **Analytics**
- View requests, errors, CPU time, and more

### Error Tracking

Monitor errors in:
- Cloudflare Dashboard → Workers → Logs
- Browser console (client-side errors)
- Supabase Dashboard (database/auth errors)

---

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Supabase Documentation](https://supabase.com/docs)

---

## Support

If you encounter issues not covered here:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review Cloudflare Workers logs: `wrangler tail`
3. Check browser console for client-side errors
4. Verify all environment variables are set correctly
5. Ensure all prerequisites are installed and configured

