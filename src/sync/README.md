# Sync Module

The sync module provides flexible, provider-based state synchronization for SignalRange with real-time multiplayer support.

## Features

- **Multiple Storage Backends**: LocalStorage and Cloudflare Durable Objects
- **Real-time Multiplayer**: WebSocket-based sync for instant collaboration
- **Hot-swappable Providers**: Switch between local and multiplayer modes seamlessly
- **Automatic Sync**: Changes propagate instantly across all connected clients
- **Type-safe**: Full TypeScript support with comprehensive type definitions

## Quick Start

### Single-Player Mode (Default)

LocalStorage is enabled by default - no setup required!

```typescript
import { syncEquipmentWithStore } from '@app/sync';

// Automatically uses LocalStorage
await syncEquipmentWithStore(equipment);
```

### Multiplayer Mode

```typescript
import { joinRoom } from '@app/sync';

// Join a multiplayer room
await joinRoom('https://your-worker.workers.dev', 'team-alpha');

// Now all changes sync in real-time with other users!
```

### Switching Modes

```typescript
import { joinRoom, useLocalStorage } from '@app/sync';

// Switch to multiplayer
await joinRoom('https://your-worker.workers.dev', 'room-123');

// Switch back to local
await useLocalStorage();
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Application                      │
│              (Your React/TS App)                  │
└────────────────────┬─────────────────────────────┘
                     │
                     │ Uses storage API
                     ▼
┌──────────────────────────────────────────────────┐
│              storage.ts (API)                     │
│  getStore, updateStore, joinRoom, etc.           │
└────────────────────┬─────────────────────────────┘
                     │
                     │ Manages
                     ▼
┌──────────────────────────────────────────────────┐
│              SyncManager                          │
│  Handles bidirectional sync and subscriptions    │
└────────────────────┬─────────────────────────────┘
                     │
                     │ Uses provider
                     ▼
┌──────────────────────────────────────────────────┐
│           StorageProvider Interface               │
├──────────────────────┬───────────────────────────┤
│   LocalStorage       │   Durable Objects         │
│     Provider         │     Provider              │
│                      │   (WebSocket-based)       │
└──────────────────────┴───────────────────────────┘
```

## Storage Providers

### LocalStorageProvider

- **Use case**: Single-player, offline-first
- **Pros**: No setup, works offline, fast, free
- **Cons**: No multiplayer, limited storage size (~5MB)

### WebSocketStorageProvider (Durable Objects)

- **Use case**: Real-time multiplayer collaboration
- **Pros**: True real-time sync (<100ms), globally distributed, serverless
- **Cons**: Requires Cloudflare account, internet connection

## File Structure

```
src/sync/
├── index.ts                      # Public API exports
├── storage.ts                    # Main storage API
├── sync-manager.ts               # Orchestrates sync between equipment and storage
├── storage-provider.ts           # Provider interface
├── storage-provider-factory.ts   # Factory for creating providers
├── local-storage-provider.ts     # LocalStorage implementation
├── websocket-storage-provider.ts # WebSocket/Durable Objects implementation
└── webpack-hot-module.ts         # Hot reload support

worker/
├── index.ts                      # Cloudflare Worker entry point
└── room.ts                       # Durable Object class (room logic)
```

## API Reference

### High-Level API (Recommended)

```typescript
// Get current state
const state = await getStore();

// Update state
await updateStore({ equipment: { ... } });

// Clear state
await clearPersistedStore();

// Join multiplayer room
await joinRoom(workerUrl, roomId);

// Switch to local mode
await useLocalStorage();

// Check connection status
const connected = isStorageConnected();
```

### Advanced API

```typescript
import { swapStorageProvider, StorageProviderType } from '@app/sync';

// Custom configuration
await swapStorageProvider(StorageProviderType.DURABLE_OBJECTS, {
  workerUrl: 'https://your-worker.workers.dev',
  roomId: 'custom-room',
  clientId: 'user-123',
  onError: (error) => console.error(error),
  onRoomChange: (roomId) => console.log('Room:', roomId),
});
```

### Direct Provider Usage

```typescript
import { WebSocketStorageProvider } from '@app/sync';

const provider = new WebSocketStorageProvider('https://worker.dev', {
  roomId: 'room-1',
});

await provider.initialize();
const clients = provider.getConnectedClients();
await provider.setRoomId('room-2');
```

## Multiplayer Setup

See the full setup guide: [docs/MULTIPLAYER_SETUP.md](../../docs/MULTIPLAYER_SETUP.md)

### Quick Setup

```bash
# 1. Login to Cloudflare
npx wrangler login

# 2. Deploy worker
npm run deploy

# 3. Use in your app
await joinRoom('https://your-worker.workers.dev', 'room-123');
```

## Events

The sync module emits events through the EventBus:

```typescript
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';

EventBus.getInstance().on(Events.STORAGE_ERROR, (error) => {
  console.error('Storage error:', error);
});
```

## Testing

### Testing LocalStorage

```typescript
import { useLocalStorage, getStore, updateStore } from '@app/sync';

await useLocalStorage();
await updateStore({ equipment: { ... } });
const state = await getStore();
```

### Testing Multiplayer (Local)

```bash
# Start local worker
npx wrangler dev
```

```typescript
// In your app
await joinRoom('http://localhost:8787', 'test-room');

// Open multiple browser windows to test multiplayer sync!
```

## Performance Considerations

### LocalStorage
- **Write latency**: <1ms
- **Read latency**: <1ms
- **Storage limit**: ~5-10MB
- **Sync**: Cross-tab only (same browser)

### Durable Objects
- **Write latency**: 10-50ms (WebSocket)
- **Read latency**: 10-50ms (WebSocket)
- **Sync latency**: Real-time (<100ms globally)
- **Storage limit**: No practical limit
- **Cost**: ~$5-50/month for typical usage

## Examples

See [examples/multiplayer-example.ts](../../examples/multiplayer-example.ts) for:
- Basic room joining
- Create shareable sessions
- Auto-join from URL
- Show connected users
- Room switcher UI
- Complete application integration

## Contributing

When adding new storage providers:

1. Implement the `StorageProvider` interface
2. Add to `StorageProviderType` enum
3. Update `StorageProviderFactory.create()`
4. Export from `index.ts`
5. Add tests
6. Update documentation

## License

See [LICENSE](../../LICENSE) for details.
