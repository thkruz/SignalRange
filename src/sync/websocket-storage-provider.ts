import type { StorageProvider, StorageProviderConfig } from './storage-provider';

/**
 * WebSocket implementation of StorageProvider (skeleton for future use)
 *
 * This will sync state in real-time with a WebSocket server.
 * Currently a placeholder - implement when ready to use WebSockets.
 */
export class WebSocketStorageProvider implements StorageProvider {
  private ws: WebSocket | null = null;
  private readonly wsUrl: string;
  private readonly config: StorageProviderConfig;
  private readonly subscribers: Set<(data: any) => void> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private cachedState: any = null;

  constructor(wsUrl: string, config: StorageProviderConfig = {}) {
    this.wsUrl = wsUrl;
    this.config = config;
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          if (this.config.onReconnect) {
            this.config.onReconnect();
          }
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.cachedState = data;
            this.notifySubscribers(data);
          } catch (error) {
            this.handleError(new Error('Failed to parse WebSocket message data: ' + error));
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

  async read<T>(): Promise<T | null> {
    // Return cached state or request from server
    if (this.cachedState) {
      return this.cachedState;
    }

    // Send a request to server for current state
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'GET_STATE' }));

      // Wait for response (simplified - in production use proper promise handling)
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 5000);
        const handler = (data: any) => {
          clearTimeout(timeout);
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
        type: 'UPDATE_STATE',
        data
      }));
      this.cachedState = data;
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  async clear(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'CLEAR_STATE' }));
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