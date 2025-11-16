/**
 * Example: Using Multiplayer Sync in SignalRange
 *
 * This file demonstrates how to use Cloudflare Durable Objects
 * for real-time multiplayer synchronization.
 */

import { joinRoom, useLocalStorage, WebSocketStorageProvider } from '@app/sync';

// =============================================================================
// Example 1: Basic Usage - Join a Room
// =============================================================================

async function example1_BasicUsage() {
  const workerUrl = 'https://signal-range-multiplayer.YOUR-SUBDOMAIN.workers.dev';

  // Join a specific room
  await joinRoom(workerUrl, 'team-alpha');

  console.log('Connected to multiplayer room: team-alpha');
  // Now all equipment changes sync in real-time with other users in the room!
}

// =============================================================================
// Example 2: Create and Share a Session
// =============================================================================

async function example2_ShareSession() {
  const workerUrl = 'https://your-worker.workers.dev';

  // Create a unique room ID
  const roomId = `session-${Date.now()}`;

  // Join the room
  await joinRoom(workerUrl, roomId);

  // Create shareable link
  const shareLink = `${window.location.origin}?room=${roomId}`;
  console.log('Share this link with your team:', shareLink);

  // Anyone who opens this link will be in the same multiplayer session
}

// =============================================================================
// Example 3: Auto-join from URL Parameter
// =============================================================================

async function example3_AutoJoinFromURL() {
  const workerUrl = 'https://your-worker.workers.dev';

  // Check if URL has room parameter
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');

  if (roomId) {
    // Auto-join the room
    await joinRoom(workerUrl, roomId);
    console.log(`Joined multiplayer room: ${roomId}`);

    // Update UI to show multiplayer mode
    showMultiplayerBanner(roomId);
  } else {
    // Default to local storage
    await useLocalStorage();
    console.log('Using local storage (single-player mode)');
  }
}

function showMultiplayerBanner(roomId: string) {
  // Show a banner indicating multiplayer mode
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#4caf50;color:white;padding:10px;text-align:center;z-index:9999';
  banner.innerHTML = `
    <strong>Multiplayer Mode</strong> - Room: ${roomId}
    <button onclick="this.parentElement.remove()" style="margin-left:20px">×</button>
  `;
  document.body.appendChild(banner);
}

// =============================================================================
// Example 4: Show Connected Users
// =============================================================================

async function example4_ShowConnectedUsers() {
  const workerUrl = 'https://your-worker.workers.dev';

  const provider = new WebSocketStorageProvider(workerUrl, {
    roomId: 'team-room',
  });

  await provider.initialize();

  // Get list of connected clients
  const clients = provider.getConnectedClients();
  console.log('Connected users:', clients);

  // Display in UI
  const userList = document.createElement('div');
  userList.innerHTML = '<h3>Connected Users:</h3>';
  clients.forEach(client => {
    const joinTime = new Date(client.joinedAt).toLocaleTimeString();
    userList.innerHTML += `<div>Client ${client.clientId} (joined at ${joinTime})</div>`;
  });
  document.body.appendChild(userList);
}

// =============================================================================
// Example 5: Room Switcher UI
// =============================================================================

class RoomSwitcher {
  private workerUrl: string;
  private provider: WebSocketStorageProvider | null = null;

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl;
  }

  async createRoomSwitcher() {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;background:white;border:1px solid #ccc;padding:15px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1)';

    container.innerHTML = `
      <h4 style="margin:0 0 10px 0">Multiplayer</h4>
      <input type="text" id="roomIdInput" placeholder="Enter room ID" style="width:200px;margin-bottom:10px;padding:5px">
      <br>
      <button id="joinBtn" style="margin-right:5px;padding:5px 10px">Join Room</button>
      <button id="localBtn" style="padding:5px 10px">Go Local</button>
      <div id="status" style="margin-top:10px;font-size:12px;color:#666"></div>
    `;

    document.body.appendChild(container);

    // Join room button
    document.getElementById('joinBtn')!.addEventListener('click', async () => {
      const roomId = (document.getElementById('roomIdInput') as HTMLInputElement).value;
      if (roomId) {
        await this.joinRoom(roomId);
        this.updateStatus(`Connected to room: ${roomId}`);
      }
    });

    // Go local button
    document.getElementById('localBtn')!.addEventListener('click', async () => {
      await useLocalStorage();
      this.updateStatus('Using local storage');
    });
  }

  async joinRoom(roomId: string) {
    await joinRoom(this.workerUrl, roomId);
    console.log(`Joined room: ${roomId}`);
  }

  updateStatus(message: string) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = message;
    }
  }
}

// Usage:
/*
const switcher = new RoomSwitcher('https://your-worker.workers.dev');
await switcher.createRoomSwitcher();
*/

// =============================================================================
// Example 6: Complete Application Integration
// =============================================================================

export class MultiplayerManager {
  private workerUrl: string;
  private currentRoom: string | null = null;

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl;
  }

  /**
   * Initialize multiplayer - check URL and auto-join if room param exists
   */
  async initialize() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    if (roomId) {
      await this.joinRoom(roomId);
    } else {
      await useLocalStorage();
    }
  }

  /**
   * Join a specific room
   */
  async joinRoom(roomId: string) {
    await joinRoom(this.workerUrl, roomId);
    this.currentRoom = roomId;
    this.updateURL(roomId);
    this.showNotification(`Joined room: ${roomId}`);
  }

  /**
   * Create a new room with a unique ID
   */
  async createNewRoom(): Promise<string> {
    const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await this.joinRoom(roomId);
    return roomId;
  }

  /**
   * Get shareable link for current room
   */
  getShareLink(): string | null {
    if (!this.currentRoom) return null;
    return `${window.location.origin}?room=${this.currentRoom}`;
  }

  /**
   * Switch to local storage mode
   */
  async goLocal() {
    await useLocalStorage();
    this.currentRoom = null;
    this.updateURL(null);
    this.showNotification('Switched to local mode');
  }

  /**
   * Get current room ID
   */
  getCurrentRoom(): string | null {
    return this.currentRoom;
  }

  /**
   * Check if currently in multiplayer mode
   */
  isMultiplayer(): boolean {
    return this.currentRoom !== null;
  }

  /**
   * Update URL without page reload
   */
  private updateURL(roomId: string | null) {
    const url = new URL(window.location.href);
    if (roomId) {
      url.searchParams.set('room', roomId);
    } else {
      url.searchParams.delete('room');
    }
    window.history.pushState({}, '', url.toString());
  }

  /**
   * Show notification to user
   */
  private showNotification(message: string) {
    console.log(message);
    // You can replace this with your app's notification system
    alert(message);
  }
}

// =============================================================================
// Usage in Your App
// =============================================================================

/*
// In your main app initialization:

const multiplayerManager = new MultiplayerManager(
  'https://signal-range-multiplayer.YOUR-SUBDOMAIN.workers.dev'
);

// Initialize on page load
await multiplayerManager.initialize();

// Create UI buttons
document.getElementById('createRoomBtn').addEventListener('click', async () => {
  const roomId = await multiplayerManager.createNewRoom();
  const shareLink = multiplayerManager.getShareLink();
  prompt('Share this link:', shareLink);
});

document.getElementById('goLocalBtn').addEventListener('click', async () => {
  await multiplayerManager.goLocal();
});

// Check if in multiplayer mode
if (multiplayerManager.isMultiplayer()) {
  console.log('Multiplayer mode active');
  console.log('Current room:', multiplayerManager.getCurrentRoom());
  console.log('Share link:', multiplayerManager.getShareLink());
}
*/

// =============================================================================
// Example 7: Local Development
// =============================================================================

async function example7_LocalDevelopment() {
  // For local development, use localhost
  const localWorkerUrl = 'http://localhost:8787';

  // Join a test room
  await joinRoom(localWorkerUrl, 'dev-test-room');

  console.log('Connected to local Durable Object for development');

  // Open multiple browser windows to test multiplayer sync!
}
