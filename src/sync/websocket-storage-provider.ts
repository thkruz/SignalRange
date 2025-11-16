import type { StorageProvider, StorageProviderConfig } from './storage-provider';

/**
 * Configuration specific to WebSocket/Durable Object storage provider
 */
export interface WebSocketProviderConfig extends StorageProviderConfig {
  /** The room ID to join (for Durable Objects) */
  roomId?: string;
  /** Callback when room ID changes */
  onRoomChange?: (roomId: string) => void;
  /** Client ID (auto-generated if not provided) */
  clientId?: string;
}

/**
 * WebSocket/Durable Object implementation of StorageProvider
 *
 * This syncs state in real-time with a Cloudflare Durable Object via WebSocket.
 * Perfect for multiplayer/collaborative scenarios with rapidly changing state.
 *
 * Usage:
 * ```typescript
 * const provider = new WebSocketStorageProvider('wss://your-worker.workers.dev', {
 *   roomId: 'team-alpha',
 *   clientId: 'user-123',
 * });
 * ```
 */
export class WebSocketStorageProvider implements StorageProvider {
  private ws: WebSocket | null = null;
  private readonly baseUrl: string;
  private readonly config: WebSocketProviderConfig;
  private readonly subscribers: Set<(data: any) => void> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private cachedState: any = null;
  private roomId: string;
  private clientId: string;
  private connectedClients: Array<{ clientId: string; joinedAt: number }> = [];

  constructor(baseUrl: string, config: WebSocketProviderConfig = {}) {
    // Convert HTTP URLs to WebSocket URLs
    this.baseUrl = baseUrl.replace(/^http/, 'ws');
    this.config = config;
    this.roomId = config.roomId || 'default';
    this.clientId = config.clientId || this.generateClientId();
  }

  /**
   * Generate a unique client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get the current room ID
   */
  getRoomId(): string {
    return this.roomId;
  }

  /**
   * Get the current client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Get list of connected clients in the room
   */
  getConnectedClients(): Array<{ clientId: string; joinedAt: number }> {
    return this.connectedClients;
  }

  /**
   * Change the room (disconnect and reconnect to a different room)
   */
  async setRoomId(roomId: string): Promise<void> {
    if (this.roomId === roomId) return;

    this.roomId = roomId;
    this.cachedState = null;
    this.connectedClients = [];

    // Reconnect to new room
    await this.dispose();
    await this.initialize();

    // Notify about room change
    if (this.config.onRoomChange) {
      this.config.onRoomChange(roomId);
    }
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL with room ID and client ID
        const wsUrl = `${this.baseUrl}/room/${this.roomId}?clientId=${this.clientId}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log(`WebSocket connected to room: ${this.roomId}`);
          if (this.config.onReconnect) {
            this.config.onReconnect();
          }
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            this.handleError(new Error('Failed to parse WebSocket message: ' + error));
          }
        };

        this.ws.onerror = (error) => {
          this.handleError(new Error('WebSocket error'));
          const errorMessage = error instanceof Error ? error.message : 'WebSocket error';
          reject(new Error(typeof error === 'string' ? error : errorMessage));
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages from Durable Object
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'initial_state':
      case 'current_state':
        // Received initial state upon connection
        this.cachedState = message.data;
        if (message.data) {
          this.notifySubscribers(message.data);
        }
        break;

      case 'state_update':
        // Received state update from another client
        this.cachedState = message.data;
        this.notifySubscribers(message.data);
        break;

      case 'client_joined':
        // Another client joined the room
        console.log('Client joined:', message.data.clientId);
        this.connectedClients.push(message.data);
        break;

      case 'client_left':
        // Another client left the room
        console.log('Client left:', message.data.clientId);
        this.connectedClients = this.connectedClients.filter(
          c => c.clientId !== message.data.clientId
        );
        break;

      case 'client_list':
        // Received list of all connected clients
        this.connectedClients = message.data;
        break;

      case 'pong':
        // Heartbeat response (no action needed)
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  async read<T>(): Promise<T | null> {
    // Return cached state or request from server
    if (this.cachedState) {
      return this.cachedState;
    }

    // Send a request to server for current state
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'request_state' }));

      // Wait for response
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 5000);
        const handler = (data: any) => {
          clearTimeout(timeout);
          this.subscribers.delete(handler);
          resolve(data);
        };
        this.subscribers.add(handler);
      });
    }

    return null;
  }

  async write<T>(data: T): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'state_update',
        data
      }));
      this.cachedState = data;
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  async clear(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send empty state as "clear"
      this.ws.send(JSON.stringify({
        type: 'state_update',
        data: null
      }));
      this.cachedState = null;
      this.notifySubscribers(null);
    }
  }

  subscribe<T>(callback: (data: T) => void): () => void {
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async dispose(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscribers.clear();
    this.cachedState = null;
  }

  private attemptReconnect(): void {
    if (this.reconnectTimer) return;

    const reconnectDelay = 5000; // 5 seconds
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.initialize();
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }, reconnectDelay);
  }

  private notifySubscribers(data: any): void {
    this.subscribers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in storage subscriber:', error);
      }
    });
  }

  private handleError(error: Error): void {
    console.error('WebSocketStorageProvider error:', error);
    if (this.config.onError) {
      this.config.onError(error);
    }
  }
}