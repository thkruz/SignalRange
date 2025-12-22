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

## Syncing with R2

Assets are stored in Cloudflare R2 and served publicly at `https://assets.signalrange.space`.

### Uploading to R2 (maintainers only)

Requires wrangler CLI to be installed and authenticated:

```bash
npm run r2:sync              # Upload all assets to R2
npm run r2:sync:dry          # Preview what would be uploaded (dry run)
npm run r2:sync -- --verbose # Upload with detailed logging
```

This also generates a `manifest.json` that lists all assets for the pull command.

### Downloading Assets (all developers)

New developers can pull existing assets from the public URL (no authentication needed):

```bash
npm run r2:pull              # Download assets from public URL
npm run r2:pull:dry          # Preview what would be downloaded (dry run)
```

Files that already exist locally are skipped.

### Options

| Option      | Description                                              |
|-------------|----------------------------------------------------------|
| `--pull`    | Download assets from public URL (skips existing files)   |
| `--dry-run` | Show what would be uploaded/downloaded without doing it  |
| `--delete`  | Remove files from R2 that don't exist locally (dangerous!) |
| `--verbose` | Show detailed progress information                       |
| `--help`    | Show help message                                        |

### Notes

- Directories named `wip` are automatically skipped during upload
- Pull uses the public URL - no wrangler authentication required
- Upload requires wrangler CLI to be installed and authenticated
- Files are synced with paths like `assets/campaigns/...` and `assets/characters/...`
