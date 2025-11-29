# Assets Directory

This directory contains campaign and character assets that are synced to Cloudflare R2 for production use.

## Directory Structure

```
public/assets/
├── campaigns/     # Campaign-specific audio and images
└── characters/    # Character portrait images
```

## Supported File Types

- **Audio**: `.mp3`, `.wav`, `.ogg`
- **Images**: `.png`, `.jpg`, `.jpeg`

## Syncing to R2

Assets are uploaded to the `signal-range-assets` R2 bucket using the sync script.

### Commands

```bash
npm run r2:sync              # Upload all assets to R2
npm run r2:sync:dry          # Preview what would be uploaded (dry run)
npm run r2:sync -- --verbose # Upload with detailed logging
```

### Options

| Option      | Description                                          |
|-------------|------------------------------------------------------|
| `--dry-run` | Show what would be uploaded without actually uploading |
| `--delete`  | Remove files from R2 that don't exist locally (dangerous!) |
| `--verbose` | Show detailed progress information                   |
| `--help`    | Show help message                                    |

### Notes

- Directories named `wip` are automatically skipped
- The script requires `wrangler` CLI to be installed and authenticated
- Files are uploaded to R2 with paths like `assets/campaigns/...` and `assets/characters/...`
