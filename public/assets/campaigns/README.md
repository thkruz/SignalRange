# Campaign Audio Assets

This directory contains audio files for scenario campaigns. Audio files are stored in Cloudflare R2 for production and served from this local directory during development.

## Directory Structure

```
campaigns/
├── nats/                    # North Atlantic Teleport Services campaign
│   └── 1/                   # Scenario 1
│       ├── intro.mp3        # Intro dialog
│       ├── obj-phase-1-gpsdo.mp3
│       ├── obj-phase-1-lnb.mp3
│       └── obj-acquire-lock-satellite-1.mp3
└── README.md               # This file
```

## Local Development Setup

### Getting Audio Files

Audio files are **not tracked in git** to avoid bloating the repository. To develop locally:

1. **Option A**: Download from R2 (for existing files)
   ```bash
   # List available files
   wrangler r2 object list signal-range-assets --prefix="assets/campaigns"

   # Download a specific file
   wrangler r2 object get signal-range-assets/assets/campaigns/nats/1/intro.mp3 --file="public/assets/campaigns/nats/1/intro.mp3"
   ```

2. **Option B**: Create placeholder files for testing
   ```bash
   # Create directory structure
   mkdir -p public/assets/campaigns/nats/1

   # Use silent audio or test MP3s during development
   # The app will still function, just without audio playback
   ```

3. **Option C**: Use actual audio recordings
   - Record new audio files and place them in the appropriate subdirectory
   - Follow the naming convention from scenario data files
   - Keep files reasonably compressed (target: 200-500 KB for 30-second clips)

### Audio File Guidelines

- **Format**: MP3 (recommended), WAV, or OGG
- **Bitrate**: 128 kbps (sufficient for voice)
- **Sample Rate**: 44.1 kHz or 48 kHz
- **Channels**: Mono (recommended for voice) or Stereo
- **Length**: Keep clips concise (typically 10-60 seconds)
- **File Size**: Target 200-500 KB per file

## Production Deployment

### Uploading to R2

Audio files are uploaded to Cloudflare R2 storage:

```bash
# Preview what will be uploaded
npm run r2:sync:dry

# Upload new/changed files
npm run r2:sync

# Upload with detailed logging
npm run r2:sync:verbose

# Full deployment (build + sync + deploy)
npm run deploy:full
```

### R2 Configuration

- **Bucket**: `signal-range-assets`
- **Preview Bucket**: `signal-range-assets-preview`
- **Custom Domain**: `assets.signalrange.space` (configure in R2 settings)
- **Path Prefix**: `/assets/campaigns/`

### Environment Variables

Set `PUBLIC_ASSETS_BASE_URL` in `.env` for production:

```env
# Development (leave empty to use local files)
PUBLIC_ASSETS_BASE_URL=

# Production (use R2 custom domain)
PUBLIC_ASSETS_BASE_URL=https://assets.signalrange.space
```

## Adding New Audio

1. **Record/create the audio file**
   - Follow audio guidelines above
   - Use descriptive filenames (e.g., `obj-phase-2-complete.mp3`)

2. **Place in correct directory**
   ```
   public/assets/campaigns/{campaign}/{scenario}/{filename}.mp3
   ```

3. **Reference in scenario data**
   ```typescript
   import { getAssetUrl } from '@app/utils/asset-url';

   dialogClips: {
     objectives: {
       'phase-2-complete': {
         text: 'Great work!',
         character: Character.TECHNICIAN,
         audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-2-complete.mp3'),
       },
     },
   }
   ```

4. **Sync to R2 before deploying**
   ```bash
   npm run r2:sync
   ```

## Troubleshooting

### Files not loading in development

- Check that files exist in `public/assets/campaigns/`
- Verify file paths match scenario data exactly
- Look for errors in browser console

### Files not loading in production

- Confirm `PUBLIC_ASSETS_BASE_URL` is set correctly
- Verify files were uploaded to R2: `wrangler r2 object list signal-range-assets --prefix="assets/campaigns"`
- Check that custom domain is configured and DNS is propagated
- Inspect network requests in browser DevTools

### Audio not playing

- Check browser console for errors
- Verify audio format is supported (MP3 is most compatible)
- Test with different browsers
- Ensure file isn't corrupted (try playing locally)

## Git Configuration

Audio files are ignored via `.gitignore`:

```gitignore
# Large audio assets (stored in R2, not in git)
public/assets/campaigns/**/*.mp3
public/assets/campaigns/**/*.wav
public/assets/campaigns/**/*.ogg

# Keep directory structure
!public/assets/campaigns/**/.gitkeep
!public/assets/campaigns/**/README.md
```

This ensures:
- Audio binaries don't bloat the git repository
- Directory structure is preserved
- Documentation remains tracked
- Local development files stay local

## Questions?

- **R2 Setup**: See `wrangler.jsonc` for bucket configuration
- **Asset URLs**: See `src/utils/asset-url.ts` for URL helper
- **Sync Script**: See `scripts/sync-r2-assets.js` for upload logic
- **Scenario Integration**: See `src/scenarios/scenario1.ts` for example usage
