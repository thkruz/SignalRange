# SignalRange Multiplayer Setup Guide

This guide walks you through setting up real-time multiplayer functionality for SignalRange using Cloudflare Durable Objects.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Local Development](#local-development)
5. [Production Deployment](#production-deployment)
6. [Using Multiplayer in Your App](#using-multiplayer-in-your-app)
7. [Architecture](#architecture)
8. [Troubleshooting](#troubleshooting)

## Overview

SignalRange uses Cloudflare Durable Objects for real-time multiplayer synchronization. This provides:

- **Real-time sync**: WebSocket connections for instant state updates
- **Low latency**: Sub-100ms updates across the globe
- **Scalable**: Each room is a separate Durable Object instance
- **Serverless**: No servers to manage, automatic scaling
- **Cost-effective**: Pay only for what you use

### Why Durable Objects vs D1?

- **Durable Objects**: Perfect for rapidly changing state (multiplayer games, collaboration)
  - WebSocket support for real-time updates
  - In-memory state (microsecond read/write)
  - Strongly consistent

- **D1**: Better for traditional database needs
  - SQL queries
  - Slower but persistent
  - Not ideal for rapidly changing state

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Already included in `package.json`
3. **Node.js**: Version 18 or higher

## Quick Start

### 1. Login to Cloudflare

```bash
npx wrangler login
```

### 2. Get Your Account ID

```bash
npx wrangler whoami
```

Update `wrangler.toml` with your account ID (optional but recommended):

```toml
account_id = "YOUR_ACCOUNT_ID_HERE"
```

### 3. Deploy to Production

```bash
npm run deploy
```

This will output your worker URL:
```
Published signal-range-multiplayer
  https://signal-range-multiplayer.YOUR-SUBDOMAIN.workers.dev
```

### 4. Use in Your App

```typescript
import { joinRoom } from '@app/sync';

// Join a multiplayer room
await joinRoom('https://signal-range-multiplayer.YOUR-SUBDOMAIN.workers.dev', 'team-alpha');
```

That's it! You're now syncing in real-time.

## Local Development

### 1. Start Local Worker

```bash
npx wrangler dev
```

This starts the worker at `http://localhost:8787`

### 2. Use in Your App

```typescript
import { joinRoom } from '@app/sync';

// Connect to local worker
await joinRoom('http://localhost:8787', 'test-room');
```

### 3. Open Multiple Browser Windows

Open your app in multiple browser windows/tabs to see real-time sync in action!

## Production Deployment

### 1. Update CORS Settings

Edit `wrangler.toml` for production:

```toml
[env.production]
vars = { ALLOWED_ORIGINS = "https://yourdomain.com,https://www.yourdomain.com" }
```

### 2. Deploy

```bash
npm run deploy
```

Or with environment:

```bash
npx wrangler deploy --env production
```

### 3. Test

```bash
curl https://signal-range-multiplayer.YOUR-SUBDOMAIN.workers.dev/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "service": "signalrange-multiplayer"
}
```

## Using Multiplayer in Your App

### Basic Usage

```typescript
import { joinRoom, useLocalStorage } from '@app/sync';

// Join a multiplayer room
await joinRoom('https://your-worker.workers.dev', 'room-123');

// All equipment changes are now synced in real-time!
// No additional code needed - it just works

// Switch back to local-only mode
await useLocalStorage();
```

### Create Shareable Sessions

```typescript
import { joinRoom } from '@app/sync';

// Create a unique room
const roomId = `session-${Date.now()}`;
await joinRoom('https://your-worker.workers.dev', roomId);

// Share this URL with your team
const shareLink = `${window.location.origin}?room=${roomId}`;
console.log('Share this link:', shareLink);

// Anyone who opens this link will join the same room
```

### Auto-join from URL

```typescript
import { joinRoom, useLocalStorage } from '@app/sync';

const workerUrl = 'https://your-worker.workers.dev';

// Check URL for room parameter
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

if (roomId) {
  // Auto-join room from URL
  await joinRoom(workerUrl, roomId);
  console.log(`Joined room: ${roomId}`);
} else {
  // Use local storage by default
  await useLocalStorage();
}
```

### Advanced: Access WebSocket Provider Directly

```typescript
import { WebSocketStorageProvider } from '@app/sync';

const provider = new WebSocketStorageProvider('https://your-worker.workers.dev', {
  roomId: 'advanced-room',
  clientId: 'user-123',  // Optional: specify client ID
  onRoomChange: (roomId) => {
    console.log('Switched to room:', roomId);
  },
  onError: (error) => {
    console.error('Connection error:', error);
  },
});

await provider.initialize();

// Get connected clients
const clients = provider.getConnectedClients();
console.log('Connected clients:', clients);

// Switch rooms dynamically
await provider.setRoomId('different-room');
```

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Client Browsers                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Browser 1  │  │  Browser 2  │  │  Browser 3  │     │
│  │   (Alice)   │  │    (Bob)    │  │  (Charlie)  │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┴────────────────┘             │
│                    WebSocket                            │
│                       │                                 │
└───────────────────────┼─────────────────────────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │   Cloudflare Worker Edge    │
          │   (Global Distribution)     │
          └─────────────┬───────────────┘
                        │
                        │ Routes to room
                        ▼
          ┌─────────────────────────────┐
          │   Durable Object: room-123  │
          │                             │
          │  - Maintains WebSocket conns│
          │  - Stores equipment state   │
          │  - Broadcasts updates       │
          │  - Handles join/leave       │
          └─────────────────────────────┘
```

### How It Works

1. **Client connects**: Opens WebSocket to worker with room ID
2. **Worker routes**: Routes connection to appropriate Durable Object
3. **DO accepts**: Durable Object accepts connection, sends current state
4. **Real-time sync**: When any client updates state:
   - Sends update via WebSocket
   - DO updates its state
   - DO broadcasts to all other clients
   - All clients receive update instantly

### Message Protocol

Messages between client and Durable Object:

```typescript
// Client → Server: Update state
{
  type: 'state_update',
  data: { equipment: { ... } }
}

// Server → Client: Broadcast update
{
  type: 'state_update',
  data: { equipment: { ... } },
  timestamp: 1234567890,
  senderId: 'client-abc'
}

// Server → Client: Initial state on connect
{
  type: 'initial_state',
  data: { equipment: { ... } },
  timestamp: 1234567890
}

// Server → Client: Client joined
{
  type: 'client_joined',
  data: { clientId: 'client-xyz', joinedAt: 1234567890 },
  timestamp: 1234567890
}

// Server → Client: Client left
{
  type: 'client_left',
  data: { clientId: 'client-xyz' },
  timestamp: 1234567890
}

// Server → Client: List of all clients
{
  type: 'client_list',
  data: [
    { clientId: 'client-abc', joinedAt: 1234567890 },
    { clientId: 'client-xyz', joinedAt: 1234567891 }
  ],
  timestamp: 1234567890
}
```

## Troubleshooting

### Worker Not Deploying

**Issue**: `wrangler deploy` fails with authentication error

**Solution**:
```bash
npx wrangler logout
npx wrangler login
```

### WebSocket Connection Fails

**Issue**: "WebSocket connection failed" in browser console

**Solution**:
1. Check worker is running: `curl https://your-worker.workers.dev/health`
2. Verify CORS settings in `wrangler.toml`
3. Check browser dev tools Network tab for WebSocket connection
4. Ensure you're using `wss://` for HTTPS sites (not `ws://`)

### CORS Errors

**Issue**: Browser shows CORS errors

**Solution**: Update `ALLOWED_ORIGINS` in `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://yourdomain.com,https://www.yourdomain.com,http://localhost:3000"
```

### State Not Syncing

**Issue**: Changes in one browser don't appear in another

**Solution**:
1. Verify both browsers are in the same room ID
2. Check browser console for errors
3. Verify WebSocket is connected (check Network tab)
4. Try refreshing both browsers

### Local Development Issues

**Issue**: `wrangler dev` fails to start

**Solution**:
```bash
# Clear wrangler cache
rm -rf .wrangler

# Restart
npx wrangler dev
```

### Connection Keeps Dropping

**Issue**: WebSocket disconnects frequently

**Solution**:
- This is normal! The provider auto-reconnects
- Check for network issues
- Verify worker isn't timing out (increase limits in wrangler.toml if needed)

## Performance Considerations

### Latency

- **Local network**: < 10ms
- **Same region**: 20-50ms
- **Cross-continent**: 100-200ms

### Scalability

- Each Durable Object (room) can handle hundreds of concurrent connections
- Durable Objects are distributed globally for low latency
- No practical limit on number of rooms

### Costs

Cloudflare pricing (as of 2024):
- **Requests**: $0.15 per million requests
- **Duration**: $12.50 per million GB-seconds
- **Generous free tier**: 10 million requests/month included

For typical usage:
- 100 concurrent users ≈ $5-10/month
- 1,000 concurrent users ≈ $20-50/month

## Next Steps

- Add authentication to restrict room access
- Implement "read-only" observer mode
- Add chat functionality using the same WebSocket connection
- Set up custom domains for your worker
- Add monitoring with Cloudflare Analytics

## Resources

- [Cloudflare Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [WebSocket API Documentation](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
