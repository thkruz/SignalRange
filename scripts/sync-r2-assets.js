#!/usr/bin/env node

/**
 * R2 Asset Sync Script
 *
 * Synchronizes campaign assets (audio and image files) between local directory and Cloudflare R2 bucket.
 * Uses wrangler CLI to upload/download files to/from the signal-range-assets bucket.
 *
 * Usage:
 *   node scripts/sync-r2-assets.js [options]
 *
 * Options:
 *   --pull       Download assets from R2 (skips files that exist locally)
 *   --dry-run    Show what would be uploaded/downloaded without actually doing it
 *   --delete     Remove files from R2 that don't exist locally (dangerous!)
 *   --verbose    Show detailed progress information
 *   --help       Show this help message
 *
 * Examples:
 *   npm run r2:sync              # Upload new/changed files to R2
 *   npm run r2:sync:dry          # Preview what would be uploaded
 *   npm run r2:pull              # Download assets from R2
 *   npm run r2:pull:dry          # Preview what would be downloaded
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');

// Configuration
const BUCKET_NAME = 'signal-range-assets';
const PUBLIC_ASSETS_URL = 'https://assets.signalrange.space';
const ASSET_DIRS = [
  {
    localDir: path.join(__dirname, '..', 'public', 'assets', 'campaigns'),
    r2Prefix: 'assets/campaigns',
  },
  {
    localDir: path.join(__dirname, '..', 'public', 'assets', 'characters'),
    r2Prefix: 'assets/characters',
  },
];

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldDelete = args.includes('--delete');
const isVerbose = true; // args.includes('--verbose');
const showHelp = args.includes('--help') || args.includes('-h');
const isPull = args.includes('--pull');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function verbose(message) {
  if (isVerbose) {
    log(`  ${message}`, 'cyan');
  }
}

function showHelpMessage() {
  console.log(`
${colors.bright}R2 Asset Sync Script${colors.reset}

Synchronizes campaign assets (audio and image files) with Cloudflare R2 bucket.

${colors.bright}Usage:${colors.reset}
  node scripts/sync-r2-assets.js [options]

${colors.bright}Options:${colors.reset}
  --pull       Download assets from R2 (skips files that exist locally)
  --dry-run    Show what would be uploaded/downloaded without actually doing it
  --delete     Remove files from R2 that don't exist locally (dangerous!)
  --verbose    Show detailed progress information
  --help       Show this help message

${colors.bright}Examples:${colors.reset}
  npm run r2:sync              # Upload new/changed files to R2
  npm run r2:sync:dry          # Preview what would be uploaded
  npm run r2:pull              # Download assets from R2
  npm run r2:pull:dry          # Preview what would be downloaded

${colors.bright}Notes:${colors.reset}
  - Syncs audio files: .mp3, .wav, .ogg
  - Syncs image files: .png, .jpg, .jpeg
  - Pull downloads from public URL (no auth needed)
  - Sync/upload requires wrangler to be installed and authenticated
  `);
}

/**
 * Calculate MD5 hash of a file
 */
function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('md5');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Get all asset files (audio and images) in a directory recursively
 */
function getAssetFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip "wip" directories
      if (file.toLowerCase() === 'wip') {
        return;
      }
      getAssetFiles(filePath, fileList);
    } else if (/\.(mp3|wav|ogg|png|jpe?g)$/i.test(file)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Execute wrangler command
 */
function runWranglerCommand(command, options = {}) {
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message, output: error.stdout };
  }
}

/**
 * Upload a file to R2
 */
function uploadToR2(localPath, r2Key) {
  const command = `wrangler r2 object put ${BUCKET_NAME}/${r2Key} --file="${localPath}" --remote`;

  verbose(`Uploading: ${localPath} → ${r2Key}`);

  if (isDryRun) {
    log(`  [DRY RUN] Would upload: ${r2Key}`, 'yellow');
    return { success: true };
  }

  return runWranglerCommand(command, { silent: !isVerbose });
}

/**
 * Fetch the asset manifest from the public URL
 * Returns array of asset keys or null on error
 */
async function fetchManifest() {
  const manifestUrl = `${PUBLIC_ASSETS_URL}/manifest.json`;
  verbose(`Fetching manifest from: ${manifestUrl}`);

  return new Promise(resolve => {
    https.get(manifestUrl, res => {
      if (res.statusCode !== 200) {
        verbose(`Failed to fetch manifest: HTTP ${res.statusCode}`);
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const manifest = JSON.parse(data);
          resolve(manifest.files || []);
        } catch {
          verbose('Failed to parse manifest JSON');
          resolve(null);
        }
      });
    }).on('error', err => {
      verbose(`Failed to fetch manifest: ${err.message}`);
      resolve(null);
    });
  });
}

/**
 * Download a file from the public assets URL
 */
function downloadFromPublicUrl(r2Key, localPath) {
  const fileUrl = `${PUBLIC_ASSETS_URL}/${r2Key}`;

  verbose(`Downloading: ${fileUrl} → ${localPath}`);

  if (isDryRun) {
    log(`  [DRY RUN] Would download: ${r2Key}`, 'yellow');
    return Promise.resolve({ success: true });
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(localPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  return new Promise(resolve => {
    const file = fs.createWriteStream(localPath);
    https.get(fileUrl, res => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(localPath);
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve({ success: true });
      });
    }).on('error', err => {
      file.close();
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Main sync function
 */
async function syncAssets() {
  log('\n' + '='.repeat(60), 'bright');
  log('  R2 Asset Sync', 'bright');
  log('='.repeat(60) + '\n', 'bright');

  // Collect all files from all configured directories
  const allFiles = [];

  for (const { localDir, r2Prefix } of ASSET_DIRS) {
    if (!fs.existsSync(localDir)) {
      log(`⚠️  Directory not found (skipping): ${localDir}`, 'yellow');
      continue;
    }

    log(`📂 Scanning ${path.basename(localDir)}...`, 'blue');
    const files = getAssetFiles(localDir);

    for (const filePath of files) {
      allFiles.push({ filePath, localDir, r2Prefix });
    }

    log(`   Found ${files.length} file(s)`, 'green');
  }

  if (allFiles.length === 0) {
    log('\n   No asset files found to sync.', 'yellow');
    log('   Add audio (.mp3, .wav, .ogg) or image (.png, .jpg) files to the asset directories.\n', 'yellow');
    process.exit(0);
  }

  log(`\n📊 Total: ${allFiles.length} asset file(s)\n`, 'green');

  // Upload files
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const { filePath, localDir, r2Prefix } of allFiles) {
    const relativePath = path.relative(localDir, filePath);
    const r2Key = `${r2Prefix}/${relativePath.replace(/\\/g, '/')}`;
    const fileSize = fs.statSync(filePath).size;
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);

    log(`📤 ${r2Key} (${fileSizeMB} MB)`, 'bright');

    const result = uploadToR2(filePath, r2Key);

    if (result.success) {
      uploaded++;
      log(`   ✓ Uploaded successfully`, 'green');
    } else {
      failed++;
      log(`   ✗ Upload failed: ${result.error}`, 'red');
    }
  }

  // Generate and upload manifest for pull functionality
  const manifestKeys = allFiles.map(({ filePath, localDir, r2Prefix }) => {
    const relativePath = path.relative(localDir, filePath);
    return `${r2Prefix}/${relativePath.replace(/\\/g, '/')}`;
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    files: manifestKeys,
  };

  const manifestPath = path.join(__dirname, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  log(`\n📋 Uploading manifest (${manifestKeys.length} files)...`, 'blue');
  const manifestResult = uploadToR2(manifestPath, 'manifest.json');

  if (manifestResult.success) {
    log(`   ✓ Manifest uploaded`, 'green');
  } else {
    log(`   ✗ Manifest upload failed: ${manifestResult.error}`, 'red');
    failed++;
  }

  // Clean up local manifest file
  fs.unlinkSync(manifestPath);

  // Summary
  log('\n' + '='.repeat(60), 'bright');
  log('  Sync Complete', 'bright');
  log('='.repeat(60), 'bright');

  if (isDryRun) {
    log(`\n🔍 DRY RUN MODE - No files were actually uploaded`, 'yellow');
  }

  log(`\n📊 Summary:`, 'bright');
  log(`   Total files:    ${allFiles.length}`);
  log(`   Uploaded:       ${uploaded}`, uploaded > 0 ? 'green' : 'reset');
  log(`   Skipped:        ${skipped}`, skipped > 0 ? 'yellow' : 'reset');
  log(`   Failed:         ${failed}`, failed > 0 ? 'red' : 'reset');

  if (isDryRun) {
    log(`\n💡 Run without --dry-run to actually upload files`, 'cyan');
  }

  if (failed > 0) {
    log(`\n⚠️  Some uploads failed. Check errors above.`, 'red');
    process.exit(1);
  }

  log('');
  process.exit(0);
}

/**
 * Main pull function - downloads assets from public URL to local
 */
async function pullAssets() {
  log('\n' + '='.repeat(60), 'bright');
  log('  R2 Asset Pull', 'bright');
  log('='.repeat(60) + '\n', 'bright');

  log(`📂 Fetching manifest from ${PUBLIC_ASSETS_URL}...`, 'blue');

  const r2Keys = await fetchManifest();

  if (!r2Keys) {
    log(`\n❌ Failed to fetch manifest. Run 'npm run r2:sync' first to generate it.`, 'red');
    process.exit(1);
  }

  if (r2Keys.length === 0) {
    log(`   No files found in manifest.`, 'yellow');
    process.exit(0);
  }

  log(`   Found ${r2Keys.length} file(s) in manifest`, 'green');

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const r2Key of r2Keys) {
    // Find matching ASSET_DIR config for this key
    const config = ASSET_DIRS.find(({ r2Prefix }) => r2Key.startsWith(r2Prefix + '/'));

    if (!config) {
      verbose(`Skipping unknown prefix: ${r2Key}`);
      continue;
    }

    // Convert R2 key to local path
    const relativePath = r2Key.slice(config.r2Prefix.length + 1);
    const localPath = path.join(config.localDir, relativePath);

    // Check if file already exists locally
    if (fs.existsSync(localPath)) {
      verbose(`Skipping (exists): ${relativePath}`);
      skipped++;
      continue;
    }

    log(`📥 ${r2Key}`, 'bright');

    const result = await downloadFromPublicUrl(r2Key, localPath);

    if (result.success) {
      downloaded++;
      log(`   ✓ Downloaded successfully`, 'green');
    } else {
      failed++;
      log(`   ✗ Download failed: ${result.error}`, 'red');
    }
  }

  // Summary
  log('\n' + '='.repeat(60), 'bright');
  log('  Pull Complete', 'bright');
  log('='.repeat(60), 'bright');

  if (isDryRun) {
    log(`\n🔍 DRY RUN MODE - No files were actually downloaded`, 'yellow');
  }

  log(`\n📊 Summary:`, 'bright');
  log(`   Total in manifest: ${r2Keys.length}`);
  log(`   Downloaded:        ${downloaded}`, downloaded > 0 ? 'green' : 'reset');
  log(`   Skipped:           ${skipped}`, skipped > 0 ? 'yellow' : 'reset');
  log(`   Failed:            ${failed}`, failed > 0 ? 'red' : 'reset');

  if (isDryRun) {
    log(`\n💡 Run without --dry-run to actually download files`, 'cyan');
  }

  if (failed > 0) {
    log(`\n⚠️  Some downloads failed. Check errors above.`, 'red');
    process.exit(1);
  }

  log('');
  process.exit(0);
}

// Main execution
if (showHelp) {
  showHelpMessage();
  process.exit(0);
}

// Check if wrangler is installed
try {
  execSync('wrangler --version', { stdio: 'pipe' });
} catch (error) {
  log('❌ Error: wrangler CLI not found', 'red');
  log('   Install it with: npm install -g wrangler', 'yellow');
  log('   Or use npx: npx wrangler ...', 'yellow');
  process.exit(1);
}

// Run sync or pull based on --pull flag
const mainFn = isPull ? pullAssets : syncAssets;
mainFn().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  if (isVerbose) {
    console.error(error);
  }
  process.exit(1);
});
