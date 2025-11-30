# User-Friendly Deployment Configuration Strategy

## Overview

This document outlines the strategy for making Cloudflare deployment intuitive and user-friendly for a public repository, allowing users to deploy without modifying hardcoded values.

## Current Issues

1. **Hardcoded Worker Name**: `"name": "signal-range"` in `wrangler.jsonc`
2. **Hardcoded Routes**: Domain-specific routes that require manual editing
3. **Hardcoded R2 Bucket Names**: `signal-range-assets` hardcoded in multiple places
4. **Manual Configuration Required**: Users must edit config files to customize

## Proposed Solution

### Strategy: Environment Variables + Defaults + Optional Overrides

Use a multi-layered approach:
1. **Environment Variables** for user-specific configuration
2. **Default Values** that work out-of-the-box (workers.dev)
3. **CLI Flags** for one-off deployments
4. **Optional Config Files** for advanced users

---

## Implementation Approach

### 1. Worker Name Configuration

**Current**: Hardcoded in `wrangler.jsonc`
```jsonc
"name": "signal-range"
```

**Proposed**: Support multiple methods (priority order):

#### Option A: Environment Variable (Recommended)
```bash
# .env.production or environment
CLOUDFLARE_WORKER_NAME=my-signal-range-app
```

#### Option B: CLI Flag Override
```bash
npm run deploy -- --name my-signal-range-app
```

#### Option C: Package.json Name (Fallback)
Use `package.json` name as default, but allow override

**Implementation**:
- Wrangler automatically uses `--name` flag if provided
- Can read from `process.env.CLOUDFLARE_WORKER_NAME`
- Default to `package.json` name or "signal-range"

### 2. Routes Configuration (Custom Domain)

**Current**: Hardcoded routes that break if domain not configured
```jsonc
"routes": ["app.signalrange.space/*"]
```

**Proposed**: Make routes completely optional

#### Default Behavior: workers.dev (No Routes Needed)
- **No routes in config** = Deploys to `https://YOUR_WORKER_NAME.YOUR_SUBDOMAIN.workers.dev`
- Works immediately, no domain setup required
- Cloudflare automatically provides the URL

#### Optional: Custom Domain via Environment Variable
```bash
# .env.production
CLOUDFLARE_ROUTES=app.mydomain.com/*
# Or multiple routes
CLOUDFLARE_ROUTES=app.mydomain.com/*,www.mydomain.com/*
```

**Implementation Strategy**:
1. Remove routes from `wrangler.jsonc` (or make them conditional)
2. Use wrangler CLI `--routes` flag if env var is set
3. Document that routes are optional

### 3. R2 Bucket Names

**Current**: Hardcoded in `wrangler.jsonc` and `sync-r2-assets.js`
```jsonc
"bucket_name": "signal-range-assets"
```

**Proposed**: Environment-based naming with defaults

```bash
# .env.production
CLOUDFLARE_R2_BUCKET=my-signal-range-assets
CLOUDFLARE_R2_BUCKET_PREVIEW=my-signal-range-assets-preview
```

**Implementation**:
- Default to `${WORKER_NAME}-assets` pattern
- Allow override via environment variables
- Update sync script to read from env or use pattern

### 4. Configuration File Strategy

**Option 1: Keep `wrangler.jsonc` with Smart Defaults** (Recommended)
- Remove hardcoded values
- Use environment variable substitution where possible
- Document environment variables in comments

**Option 2: Use `wrangler.toml` with Environments**
```toml
name = "signal-range"  # Can be overridden

[env.production]
routes = []  # Empty = use workers.dev

[env.production.vars]
# Environment variables here
```

**Option 3: Generate Config Dynamically**
- Create a setup script that generates `wrangler.jsonc` from templates
- Use `.wrangler.jsonc.example` as template

---

## Recommended Implementation

### Phase 1: Minimal Changes (Quick Win)

1. **Remove Routes from `wrangler.jsonc`**
   - Default to workers.dev (no routes needed)
   - Document how to add custom domain later

2. **Make Worker Name Configurable via CLI**
   ```json
   // package.json
   "scripts": {
     "deploy": "npm run build && wrangler deploy --name ${CLOUDFLARE_WORKER_NAME:-signal-range}"
   }
   ```

3. **Update R2 Sync Script**
   - Read bucket name from env: `process.env.CLOUDFLARE_R2_BUCKET || 'signal-range-assets'`
   - Use worker name pattern: `${workerName}-assets`

### Phase 2: Enhanced Configuration

1. **Create Setup Script** (`scripts/setup-cloudflare.js`)
   ```javascript
   // Interactive setup that:
   // - Asks for worker name
   // - Asks for R2 bucket name (suggests default)
   // - Optionally asks for custom domain
   // - Generates .env.production with values
   // - Creates wrangler.jsonc from template
   ```

2. **Environment Variable Support**
   - `.env.production.example` with all options documented
   - Scripts read from environment variables
   - Fallback to sensible defaults

3. **Documentation**
   - Clear setup guide in README
   - Quick start: "Just run `npm run deploy`"
   - Advanced: Custom domain setup guide

---

## File Structure Proposal

```
SignalRange/
├── wrangler.jsonc              # Base config (no hardcoded user values)
├── wrangler.jsonc.example     # Example with comments
├── .env.production.example     # All configurable variables
├── scripts/
│   ├── setup-cloudflare.js    # Interactive setup (optional)
│   ├── sync-r2-assets.js      # Updated to use env vars
│   └── deploy.js               # Enhanced deploy script
└── README.md                   # Updated with setup instructions
```

---

## Configuration Variables

### Required (with defaults)
- `CLOUDFLARE_WORKER_NAME` → Default: `signal-range` or package.json name
- `CLOUDFLARE_R2_BUCKET` → Default: `${WORKER_NAME}-assets`

### Optional
- `CLOUDFLARE_ROUTES` → Default: empty (use workers.dev)
- `CLOUDFLARE_R2_BUCKET_PREVIEW` → Default: `${BUCKET}-preview`
- `CLOUDFLARE_ACCOUNT_ID` → Auto-detected by wrangler
- `CLOUDFLARE_ZONE_ID` → Only needed for custom domain routes

### Application Variables (existing)
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `PUBLIC_USER_API_URL`
- `PUBLIC_ASSETS_BASE_URL`

---

## User Experience Flow

### First-Time User (Simplest Path)

1. **Clone repository**
   ```bash
   git clone <repo>
   cd SignalRange
   npm install
   ```

2. **Set application environment variables**
   ```bash
   cp .env.production.example .env.production
   # Edit .env.production with Supabase credentials
   ```

3. **Deploy (uses defaults)**
   ```bash
   npm run deploy
   # Deploys to: https://signal-range.YOUR_SUBDOMAIN.workers.dev
   ```

4. **Get deployment URL**
   - Wrangler outputs the URL after deployment
   - Or check Cloudflare Dashboard

### Advanced User (Custom Configuration)

1. **Set Cloudflare-specific variables**
   ```bash
   # .env.production
   CLOUDFLARE_WORKER_NAME=my-custom-name
   CLOUDFLARE_R2_BUCKET=my-custom-assets
   CLOUDFLARE_ROUTES=app.mydomain.com/*
   ```

2. **Deploy with custom config**
   ```bash
   npm run deploy
   ```

### One-Off Deployment (CLI Flags)

```bash
# Deploy with custom name without editing files
npm run deploy -- --name my-temp-deployment
```

---

## Implementation Details

### 1. Updated `wrangler.jsonc`

```jsonc
{
  // Base configuration - no user-specific values
  "compatibility_date": "2025-11-01",
  
  // R2 buckets - names can be overridden via env vars
  // Default pattern: ${WORKER_NAME}-assets
  "r2_buckets": [
    {
      "binding": "ASSETS",
      "bucket_name": "${CLOUDFLARE_R2_BUCKET:-signal-range-assets}",
      "preview_bucket_name": "${CLOUDFLARE_R2_BUCKET_PREVIEW:-signal-range-assets-preview}"
    }
  ],
  
  // Static assets
  "assets": {
    "directory": "./dist",
    "html_handling": "force-trailing-slash",
    "not_found_handling": "single-page-application"
  }
  
  // Routes: Omit entirely for workers.dev
  // Add via CLI: wrangler deploy --routes "domain.com/*"
  // Or env var: CLOUDFLARE_ROUTES
}
```

**Note**: Wrangler doesn't support env var substitution in JSONC directly, so we need a different approach:

**Alternative**: Use wrangler CLI flags or a wrapper script

### 2. Enhanced Deploy Script

Create `scripts/deploy.js`:

```javascript
#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
require('dotenv').config({ path: '.env.production' });

const workerName = process.env.CLOUDFLARE_WORKER_NAME || 'signal-range';
const routes = process.env.CLOUDFLARE_ROUTES;

let deployCmd = `wrangler deploy --name ${workerName}`;

if (routes) {
  deployCmd += ` --routes ${routes}`;
}

execSync(deployCmd, { stdio: 'inherit' });
```

Update `package.json`:
```json
"deploy": "npm run build && node scripts/deploy.js"
```

### 3. Updated R2 Sync Script

Modify `scripts/sync-r2-assets.js`:

```javascript
// At top of file
require('dotenv').config({ path: '.env.production' });

// Configuration - read from env or use defaults
const WORKER_NAME = process.env.CLOUDFLARE_WORKER_NAME || 'signal-range';
const BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET || `${WORKER_NAME}-assets`;
```

### 4. Environment File Template

Create `.env.production.example`:

```bash
# Application Configuration (Required)
PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PUBLIC_USER_API_URL=https://user.keeptrack.space
PUBLIC_ASSETS_BASE_URL=

# Cloudflare Configuration (Optional - defaults provided)
# Worker name (default: signal-range)
CLOUDFLARE_WORKER_NAME=signal-range

# R2 bucket name (default: ${CLOUDFLARE_WORKER_NAME}-assets)
CLOUDFLARE_R2_BUCKET=signal-range-assets
CLOUDFLARE_R2_BUCKET_PREVIEW=signal-range-assets-preview

# Custom domain routes (optional - omit for workers.dev)
# Format: domain.com/* or multiple: domain1.com/*,domain2.com/*
# CLOUDFLARE_ROUTES=app.mydomain.com/*
```

---

## Migration Path

### For Existing Users

1. **No breaking changes** - defaults maintain current behavior
2. **Optional migration** - users can set env vars if they want customization
3. **Documentation update** - explain new options

### For New Users

1. **Zero configuration** - works with defaults
2. **Progressive enhancement** - add custom config as needed

---

## Benefits

✅ **No Hardcoded Values**: Users don't need to edit config files  
✅ **Works Out-of-the-Box**: Defaults to workers.dev (no domain setup)  
✅ **Flexible**: Environment variables for customization  
✅ **CLI Override**: One-off deployments with flags  
✅ **Clear Documentation**: `.example` files show all options  
✅ **Backward Compatible**: Existing deployments continue working  

---

## Alternative: Wrangler TOML with Environments

If JSONC limitations are an issue, consider `wrangler.toml`:

```toml
name = "signal-range"  # Can be overridden via --name flag

compatibility_date = "2025-11-01"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "signal-range-assets"  # Can be overridden

[assets]
directory = "./dist"
html_handling = "force-trailing-slash"
not_found_handling = "single-page-application"

# No routes = defaults to workers.dev
# Routes can be added via CLI: --routes "domain.com/*"
```

**Advantages**:
- More flexible than JSONC
- Better environment support
- Can use TOML variable substitution

**Disadvantages**:
- Need to migrate from JSONC
- Slightly different syntax

---

## Recommended Next Steps

1. **Immediate (Low Risk)**:
   - Remove routes from `wrangler.jsonc` (already done)
   - Update deploy script to support `--name` flag
   - Create `.env.production.example`

2. **Short Term**:
   - Update R2 sync script to read from env vars
   - Create enhanced deploy script
   - Update documentation

3. **Long Term**:
   - Consider interactive setup script
   - Add validation for configuration
   - Create deployment wizard/CLI tool

---

## Example: Complete User Journey

### Scenario: New User Deploying for First Time

```bash
# 1. Clone and install
git clone https://github.com/user/SignalRange.git
cd SignalRange
npm install

# 2. Copy environment template
cp .env.production.example .env.production

# 3. Edit only application variables (Supabase)
nano .env.production
# Add: PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY

# 4. Deploy (uses all defaults)
npm run deploy

# Output:
# ✨ Deployed to: https://signal-range.username.workers.dev
# ✅ Your app is live!
```

**No Cloudflare-specific configuration needed!**

### Scenario: User Wants Custom Name

```bash
# Option 1: Environment variable
echo "CLOUDFLARE_WORKER_NAME=my-app" >> .env.production
npm run deploy

# Option 2: CLI flag (one-time)
npm run deploy -- --name my-app
```

### Scenario: User Has Custom Domain

```bash
# 1. Set up domain in Cloudflare Dashboard
# 2. Add route to .env.production
echo "CLOUDFLARE_ROUTES=app.mydomain.com/*" >> .env.production
npm run deploy
```

---

## Conclusion

This approach provides:
- **Zero-configuration** deployment for most users
- **Flexible customization** for advanced users
- **No hardcoded values** that users must edit
- **Clear documentation** via example files
- **Backward compatibility** with existing setups

The key is using **environment variables with sensible defaults** and **removing routes entirely** to default to workers.dev, which requires no domain setup.

