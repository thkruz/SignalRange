# SignalRange | Space Electronic Warfare Training

![Latest Version](https://img.shields.io/badge/version-1.0.0-darkgreen?style=flat-square)
[![Discord](https://img.shields.io/discord/1451232817517166816?color=5865F2&label=discord&logo=discord&logoColor=white&style=flat-square)](https://discord.gg/G4tJfSkmzx)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/thkruz/SignalRange?style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/thkruz/SignalRange?style=flat-square)
![License](https://img.shields.io/github/license/thkruz/SignalRange?style=flat-square)

A web-based training simulation for satellite ground station operations, built with TypeScript and vanilla JavaScript.

## Overview

SignalRange simulates a commercial satellite ground station environment where operators learn to configure and troubleshoot RF equipment chains. The training scenarios are set at North Atlantic Teleport Services (NATS), a fictional satellite ground station facility in Vermont serving the TIDEMARK constellation.

## Available Scenarios (UAT)

### Scenario 1: First Day

**Difficulty:** Beginner | **Duration:** 25-35 min

Your first day at NATS. Charlie Brooks walks you through a routine health check on TIDEMARK-1, already online at 53°W. Learn what each equipment panel shows, what the indicators mean, and what "normal" looks like.

### Scenario 2: Scheduled Maintenance

**Difficulty:** Beginner | **Duration:** 20-25 min

Take TIDEMARK-1 offline for antenna feed maintenance, then restore service. Learn the proper power-down sequence (HPA → BUC → LNB → Antenna) and why RF safety protocols matter.

### Scenario 3: Weather Handover

**Difficulty:** Beginner | **Duration:** 25-30 min

*Coming soon*

### Scenario 4: New Bird, No Handbook

**Difficulty:** Intermediate | **Duration:** 30-35 min

TIDEMARK-2 has reached GEO at 45°W. Given only the beacon frequency (3,947.8 MHz), calculate the LNB local oscillator frequency, configure the spectrum analyzer, and acquire the beacon independently.

## Equipment Simulated

- **9m C-band Antenna** - Pointing, tracking modes, polarization control
- **LNB** - Local oscillator, gain, thermal stabilization
- **BUC** - Block upconverter with mute control
- **HPA** - High power amplifier with safety interlocks
- **IF Filter Bank** - Bandwidth selection
- **GPSDO** - GPS-disciplined oscillator for frequency reference
- **Spectrum Analyzer** - Real-time RF visualization
- **Receiver/Transmitter Modems** - Signal demodulation and generation

## 🛠️ Local Development Setup

### Prerequisites

- **Node.js** 18.x or 20.x (LTS recommended)
- **npm** 9.x or later

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/thkruz/SignalRange.git
cd SignalRange

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env

# 4. Pull campaign assets from R2 (audio/images)
npm run r2:pull

# 5. Start the development server
npm run dev
```

The app will be available at `http://localhost:3000` (or the port shown in terminal).

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_SUPABASE_URL` | For auth features | Your Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | For auth features | Supabase anonymous/public key |
| `PUBLIC_USER_API_URL` | No | User API endpoint (has default) |
| `PUBLIC_ASSETS_BASE_URL` | No | Leave empty for local dev |

For local development without authentication features, the default `.env.example` values work out of the box.

### Asset Management

Campaign assets (audio files, character images) are stored in Cloudflare R2 and not committed to the repository.

```bash
# Download assets from R2 (no authentication required)
npm run r2:pull

# Preview what would be downloaded
npm run r2:pull:dry
```

Assets are downloaded to `public/assets/campaigns/` and `public/assets/characters/`.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start webpack dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build with Wrangler |
| `npm run r2:pull` | Download campaign assets from R2 |
| `npm run test` | Run Jest test suite |
| `npm run type-check` | TypeScript type checking |
| `npm run lint` | Run ESLint |

### Troubleshooting

**Assets not loading?**
Run `npm run r2:pull` to download campaign audio and images.

**TypeScript errors?**
Run `npm run type-check` to see detailed type errors.

**Port already in use?**
The dev server defaults to port 3000. Check for other processes or modify `webpack.config.js`.

## 🌐 Deployment

SignalRange is deployed on Cloudflare Workers with static assets. There are two environments:

| Environment    | URL                               | Purpose                                 |
|----------------|-----------------------------------|-----------------------------------------|
| **Production** | <https://app.signalrange.space>   | Live user-facing application            |
| **UAT**        | <https://uat.signalrange.space>   | Pre-production testing and validation   |

### Deploy Commands

```bash
# Deploy to UAT (test changes first)
npx wrangler deploy --env uat

# Deploy to Production (after UAT validation)
npx wrangler deploy --env production
```

Always deploy to UAT first to validate changes before promoting to production.

## 📄 License

AGPLv3 - See LICENSE.md
