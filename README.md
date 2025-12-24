# SignalRange | Space Electronic Warfare Training

![Latest Version](https://img.shields.io/badge/version-1.1.0-darkgreen?style=flat-square)
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

## 🏗️ Architecture

### Tech Stack

- **TypeScript** - Type-safe code throughout
- **Webpack** - Module bundling and development server
- **Canvas API** - Spectrum analyzer visualization

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
