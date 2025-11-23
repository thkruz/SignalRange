import type { StorageProvider, StorageProviderConfig } from './storage-provider';

/**
 * Cloudflare D1 implementation of StorageProvider (skeleton for future use)
 *
 * This will sync state with a Cloudflare D1 database using Cloudflare Workers.
 * Currently a placeholder - implement when ready to use D1.
 *
 * Note: This would typically be used with a Cloudflare Worker as a backend API.
 */
export class D1StorageProvider implements StorageProvider {
  private readonly apiEndpoint: string;
  private readonly config: StorageProviderConfig;
  private readonly subscribers: Set<(data: any) => void> = new Set();
  private cachedState: any = null;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(apiEndpoint: string, config: StorageProviderConfig = {}) {
    this.apiEndpoint = apiEndpoint;
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Test connection to D1 backend
    try {
      const response = await fetch(`${this.apiEndpoint}/health`);
      if (!response.ok) {
        throw new Error('D1 backend not available');
      }

      // Load initial state
      const initialState = await this.read();
      this.cachedState = initialState;

      // Set up polling for changes if autoSync is enabled
      if (this.config.autoSync) {
        this.startPolling();
      }
    } catch (error) {
      this.handleError(new Error('Failed to initialize D1 storage'));
      throw error;
    }
  }

  async read<T>(): Promise<T | null> {
    try {
      const response = await fetch(`${this.apiEndpoint}/state`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.cachedState = data;
      return data;
    } catch (error) {
      this.handleError(new Error('Failed to read from D1: ' + error));
      return this.cachedState; // Return cached state as fallback
    }
  }

  async write<T>(data: T): Promise<void> {
    try {
      const response = await fetch(`${this.apiEndpoint}/state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.cachedState = data;
      this.notifySubscribers(data);
    } catch (error) {
      this.handleError(new Error('Failed to write to D1'));
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      const response = await fetch(`${this.apiEndpoint}/state`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.cachedState = null;
      this.notifySubscribers(null);
    } catch (error) {
      this.handleError(new Error('Failed to clear D1 state'));
      throw error;
    }
  }

  subscribe<T>(callback: (data: T) => void): () => void {
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  isConnected(): boolean {
    // Simple check - could be enhanced with actual health checks
    return this.cachedState !== null;
  }

  async dispose(): Promise<void> {
    this.stopPolling();
    this.subscribers.clear();
    this.cachedState = null;
  }

  private startPolling(): void {
    if (this.pollInterval) return;

    const interval = this.config.syncInterval || 30000; // Default 30 seconds

    this.pollInterval = setInterval(async () => {
      try {
        const newState = await this.read();
        // Only notify if state actually changed
        if (JSON.stringify(newState) !== JSON.stringify(this.cachedState)) {
          this.notifySubscribers(newState);
        }
      } catch (error) {
        console.error('Error polling D1 state:', error);
      }
    }, interval);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
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
    console.error('D1StorageProvider error:', error);
    if (this.config.onError) {
      this.config.onError(error);
    }
  }
}

/**
 * Example Cloudflare Worker backend structure for reference:
 *
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     const url = new URL(request.url);
 *
 *     // Health check
 *     if (url.pathname === '/health') {
 *       return new Response(JSON.stringify({ status: 'ok' }), {
 *         headers: { 'Content-Type': 'application/json' }
 *       });
 *     }
 *
 *     // Get state
 *     if (url.pathname === '/state' && request.method === 'GET') {
 *       const result = await env.DB.prepare('SELECT data FROM app_state WHERE id = ?').bind(1).first();
 *       return new Response(result?.data || '{}', {
 *         headers: { 'Content-Type': 'application/json' }
 *       });
 *     }
 *
 *     // Update state
 *     if (url.pathname === '/state' && request.method === 'POST') {
 *       const data = await request.json();
 *       await env.DB.prepare('INSERT OR REPLACE INTO app_state (id, data) VALUES (?, ?)').bind(1, JSON.stringify(data)).run();
 *       return new Response(JSON.stringify({ success: true }), {
 *         headers: { 'Content-Type': 'application/json' }
 *       });
 *     }
 *
 *     // Clear state
 *     if (url.pathname === '/state' && request.method === 'DELETE') {
 *       await env.DB.prepare('DELETE FROM app_state WHERE id = ?').bind(1).run();
 *       return new Response(JSON.stringify({ success: true }), {
 *         headers: { 'Content-Type': 'application/json' }
 *       });
 *     }
 *
 *     return new Response('Not found', { status: 404 });
 *   }
 * };
 */