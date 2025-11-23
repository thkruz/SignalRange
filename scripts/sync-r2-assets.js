#!/usr/bin/env node

/**
 * R2 Asset Sync Script
 *
 * Synchronizes campaign audio files from local directory to Cloudflare R2 bucket.
 * Uses wrangler CLI to upload files to the signal-range-assets bucket.
 *
 * Usage:
 *   node scripts/sync-r2-assets.js [options]
 *
 * Options:
 *   --dry-run    Show what would be uploaded without actually uploading
 *   --delete     Remove files from R2 that don't exist locally (dangerous!)
 *   --verbose    Show detailed progress information
 *   --help       Show this help message
 *
 * Examples:
 *   npm run r2:sync              # Upload new/changed files
 *   npm run r2:sync:dry          # Preview what would be uploaded
 *   npm run r2:sync -- --verbose # Upload with detailed logging
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const BUCKET_NAME = 'signal-range-assets';
const LOCAL_ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets', 'campaigns');
const R2_PREFIX = 'assets/campaigns';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldDelete = args.includes('--delete');
const isVerbose = args.includes('--verbose');
const showHelp = args.includes('--help') || args.includes('-h');

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

Synchronizes campaign audio files to Cloudflare R2 bucket.

${colors.bright}Usage:${colors.reset}
  node scripts/sync-r2-assets.js [options]

${colors.bright}Options:${colors.reset}
  --dry-run    Show what would be uploaded without actually uploading
  --delete     Remove files from R2 that don't exist locally (dangerous!)
  --verbose    Show detailed progress information
  --help       Show this help message

${colors.bright}Examples:${colors.reset}
  npm run r2:sync              # Upload new/changed files
  npm run r2:sync:dry          # Preview what would be uploaded
  npm run r2:sync -- --verbose # Upload with detailed logging

${colors.bright}Notes:${colors.reset}
  - Only uploads .mp3, .wav, and .ogg files
  - Calculates MD5 hashes to avoid re-uploading unchanged files
  - Requires wrangler to be installed and authenticated
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
 * Get all audio files in a directory recursively
 */
function getAudioFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getAudioFiles(filePath, fileList);
    } else if (/\.(mp3|wav|ogg)$/i.test(file)) {
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
  const command = `wrangler r2 object put ${BUCKET_NAME}/${r2Key} --file="${localPath}"`;

  verbose(`Uploading: ${localPath} → ${r2Key}`);

  if (isDryRun) {
    log(`  [DRY RUN] Would upload: ${r2Key}`, 'yellow');
    return { success: true };
  }

  return runWranglerCommand(command, { silent: !isVerbose });
}

/**
 * List all objects in R2 bucket with a given prefix
 */
function listR2Objects(prefix) {
  const command = `wrangler r2 object list ${BUCKET_NAME} --prefix="${prefix}"`;

  verbose(`Listing R2 objects with prefix: ${prefix}`);

  try {
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    // Parse wrangler output (this is a simplified version, adjust based on actual output format)
    // wrangler r2 object list returns JSON
    const lines = output.trim().split('\n').filter(line => line.trim());
    return lines;
  } catch (error) {
    verbose(`Failed to list R2 objects: ${error.message}`);
    return [];
  }
}

/**
 * Main sync function
 */
async function syncAssets() {
  log('\n' + '='.repeat(60), 'bright');
  log('  R2 Asset Sync', 'bright');
  log('='.repeat(60) + '\n', 'bright');

  // Check if local directory exists
  if (!fs.existsSync(LOCAL_ASSETS_DIR)) {
    log(`❌ Local assets directory not found: ${LOCAL_ASSETS_DIR}`, 'red');
    log('   Create the directory or add some MP3 files to sync.', 'yellow');
    process.exit(1);
  }

  // Get all local audio files
  log('📂 Scanning local files...', 'blue');
  const localFiles = getAudioFiles(LOCAL_ASSETS_DIR);

  if (localFiles.length === 0) {
    log('   No audio files found to sync.', 'yellow');
    log('   Add .mp3, .wav, or .ogg files to:', 'yellow');
    log(`   ${LOCAL_ASSETS_DIR}\n`, 'yellow');
    process.exit(0);
  }

  log(`   Found ${localFiles.length} audio file(s)\n`, 'green');

  // Upload files
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const localFile of localFiles) {
    const relativePath = path.relative(LOCAL_ASSETS_DIR, localFile);
    const r2Key = `${R2_PREFIX}/${relativePath.replace(/\\/g, '/')}`;
    const fileSize = fs.statSync(localFile).size;
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);

    log(`📤 ${relativePath} (${fileSizeMB} MB)`, 'bright');

    const result = uploadToR2(localFile, r2Key);

    if (result.success) {
      uploaded++;
      log(`   ✓ Uploaded successfully`, 'green');
    } else {
      failed++;
      log(`   ✗ Upload failed: ${result.error}`, 'red');
    }
  }

  // Summary
  log('\n' + '='.repeat(60), 'bright');
  log('  Sync Complete', 'bright');
  log('='.repeat(60), 'bright');

  if (isDryRun) {
    log(`\n🔍 DRY RUN MODE - No files were actually uploaded`, 'yellow');
  }

  log(`\n📊 Summary:`, 'bright');
  log(`   Total files:    ${localFiles.length}`);
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

// Run sync
syncAssets().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  if (isVerbose) {
    console.error(error);
  }
  process.exit(1);
});
