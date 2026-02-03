import { Mock, vi } from 'vitest';
import { WebSocketStorageProvider } from '../../src/sync/websocket-storage-provider';

describe('WebSocketStorageProvider', () => {
  let provider: WebSocketStorageProvider;
  let mockWs: {
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onerror?: (error: unknown) => void;
    onclose?: () => void;
    send: Mock;
    close: Mock;
    readyState: number;
  };
  const WS_URL = 'ws://localhost:8080';

  beforeEach(() => {
    vi.useFakeTimers();

    mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN,
    };

    // Mock WebSocket constructor
    (global as any).WebSocket = vi.fn(function () { return mockWs; });
    (global as any).WebSocket.OPEN = 1;
    (global as any).WebSocket.CLOSED = 3;

    provider = new WebSocketStorageProvider(WS_URL);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('stores the WebSocket URL and config', () => {
      const onReconnect = vi.fn();
      provider = new WebSocketStorageProvider(WS_URL, { onReconnect });

      expect(provider).toBeInstanceOf(WebSocketStorageProvider);
    });
  });

  describe('initialize()', () => {
    it('creates WebSocket connection', async () => {
      const initPromise = provider.initialize();

      // Simulate successful connection
      mockWs.onopen?.();
      await initPromise;

      expect(global.WebSocket).toHaveBeenCalledWith(WS_URL);
    });

    it('resolves when connection opens', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();

      await expect(initPromise).resolves.toBeUndefined();
    });

    it('calls onReconnect callback when connection opens', async () => {
      const onReconnect = vi.fn();
      provider = new WebSocketStorageProvider(WS_URL, { onReconnect });
      const initPromise = provider.initialize();

      // Need to get the new mock ws
      mockWs = (global.WebSocket as Mock).mock.results[0].value;
      mockWs.onopen?.();
      await initPromise;

      expect(onReconnect).toHaveBeenCalled();
    });

    it('rejects on WebSocket error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      const initPromise = provider.initialize();
      mockWs.onerror?.(new Error('Connection failed'));

      await expect(initPromise).rejects.toThrow();
      consoleSpy.mockRestore();
    });

    it('calls onError callback on error', async () => {
      const onError = vi.fn();
      provider = new WebSocketStorageProvider(WS_URL, { onError });
      const initPromise = provider.initialize();

      mockWs = (global.WebSocket as Mock).mock.results[0].value;
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      mockWs.onerror?.(new Error('Connection failed'));

      try {
        await initPromise;
      } catch {
        // Expected to fail
      }

      expect(onError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('attempts reconnect on close', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();

      // Simulate disconnect
      mockWs.onclose?.();

      // Should attempt reconnect after 5 seconds
      expect((global.WebSocket as Mock).mock.calls.length).toBe(1);

      vi.advanceTimersByTime(5000);

      expect((global.WebSocket as Mock).mock.calls.length).toBe(2);
      consoleSpy.mockRestore();
    });
  });

  describe('onmessage handler', () => {
    it('parses JSON messages and caches state', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const data = { equipment: { test: true } };
      mockWs.onmessage?.({ data: JSON.stringify(data) });

      // State should be cached - verify via read
      const result = await provider.read();
      expect(result).toEqual(data);
    });

    it('notifies subscribers on message', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const subscriber = vi.fn();
      provider.subscribe(subscriber);

      const data = { updated: true };
      mockWs.onmessage?.({ data: JSON.stringify(data) });

      expect(subscriber).toHaveBeenCalledWith(data);
    });

    it('calls onError for invalid JSON', async () => {
      const onError = vi.fn();
      provider = new WebSocketStorageProvider(WS_URL, { onError });
      const initPromise = provider.initialize();
      mockWs = (global.WebSocket as Mock).mock.results[0].value;
      mockWs.onopen?.();
      await initPromise;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      mockWs.onmessage?.({ data: 'invalid-json' });

      expect(onError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('read()', () => {
    it('returns cached state if available', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const data = { cached: true };
      mockWs.onmessage?.({ data: JSON.stringify(data) });

      const result = await provider.read();
      expect(result).toEqual(data);
    });

    it('sends GET_STATE message when no cached state', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const readPromise = provider.read();

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'GET_STATE' })
      );

      // Simulate response
      const data = { fromServer: true };
      mockWs.onmessage?.({ data: JSON.stringify(data) });

      const result = await readPromise;
      expect(result).toEqual(data);
    });

    it('returns null when not connected', async () => {
      mockWs.readyState = (global as any).WebSocket.CLOSED;
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      mockWs.readyState = (global as any).WebSocket.CLOSED;

      const result = await provider.read();
      expect(result).toBeNull();
    });

    it('times out after 5 seconds if no response', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const readPromise = provider.read();

      vi.advanceTimersByTime(5000);

      const result = await readPromise;
      expect(result).toBeNull();
    });
  });

  describe('write()', () => {
    it('sends UPDATE_STATE message with data', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const data = { equipment: { updated: true } };
      await provider.write(data);

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'UPDATE_STATE', data })
      );
    });

    it('caches the written state', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const data = { equipment: { test: true } };
      await provider.write(data);

      const result = await provider.read();
      expect(result).toEqual(data);
    });

    it('throws when not connected', async () => {
      mockWs.readyState = (global as any).WebSocket.CLOSED;
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      mockWs.readyState = (global as any).WebSocket.CLOSED;

      await expect(provider.write({ data: 'test' })).rejects.toThrow(
        'WebSocket not connected'
      );
    });
  });

  describe('clear()', () => {
    it('sends CLEAR_STATE message', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      await provider.clear();

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'CLEAR_STATE' })
      );
    });

    it('clears cached state', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      // First cache some state
      mockWs.onmessage?.({ data: JSON.stringify({ cached: true }) });

      // Clear the send mock to check for GET_STATE
      mockWs.send.mockClear();

      await provider.clear();

      // Start the read but don't await immediately
      const readPromise = provider.read();

      // Should send GET_STATE since cache is cleared
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'GET_STATE' })
      );

      // Advance timers to let the timeout resolve
      vi.advanceTimersByTime(5000);
      await readPromise;
    });

    it('notifies subscribers with null', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const subscriber = vi.fn();
      provider.subscribe(subscriber);

      await provider.clear();

      expect(subscriber).toHaveBeenCalledWith(null);
    });

    it('does nothing when not connected', async () => {
      mockWs.readyState = (global as any).WebSocket.CLOSED;
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      mockWs.readyState = (global as any).WebSocket.CLOSED;

      // Should not throw
      await expect(provider.clear()).resolves.toBeUndefined();
      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('subscribe()', () => {
    it('adds callback to subscribers', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const subscriber = vi.fn();
      provider.subscribe(subscriber);

      const data = { test: true };
      mockWs.onmessage?.({ data: JSON.stringify(data) });

      expect(subscriber).toHaveBeenCalledWith(data);
    });

    it('returns unsubscribe function', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const subscriber = vi.fn();
      const unsubscribe = provider.subscribe(subscriber);

      unsubscribe();

      mockWs.onmessage?.({ data: JSON.stringify({ test: true }) });

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('handles subscriber errors without affecting others', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const errorSubscriber = vi.fn(function () {
        throw new Error('Subscriber error');
      });
      const normalSubscriber = vi.fn();
      provider.subscribe(errorSubscriber);
      provider.subscribe(normalSubscriber);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      mockWs.onmessage?.({ data: JSON.stringify({ test: true }) });

      expect(normalSubscriber).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('isConnected()', () => {
    it('returns false before initialization', () => {
      expect(provider.isConnected()).toBe(false);
    });

    it('returns true when WebSocket is open', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      expect(provider.isConnected()).toBe(true);
    });

    it('returns false when WebSocket is closed', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      mockWs.readyState = (global as any).WebSocket.CLOSED;

      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('dispose()', () => {
    it('closes WebSocket connection', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      await provider.dispose();

      expect(mockWs.close).toHaveBeenCalled();
    });

    it('clears reconnect timer', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      mockWs.onclose?.(); // Trigger reconnect timer

      await provider.dispose();

      // Advancing time should not trigger reconnect
      const callCountBeforeAdvance = (global.WebSocket as Mock).mock.calls.length;
      vi.advanceTimersByTime(10000);
      expect((global.WebSocket as Mock).mock.calls.length).toBe(callCountBeforeAdvance);

      consoleSpy.mockRestore();
    });

    it('clears subscribers and cached state', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const subscriber = vi.fn();
      provider.subscribe(subscriber);

      await provider.dispose();

      expect(provider.isConnected()).toBe(false);
    });

    it('handles dispose when not initialized', async () => {
      // Should not throw
      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });

  describe('reconnection', () => {
    it('does not start multiple reconnect attempts', async () => {
      const initPromise = provider.initialize();
      mockWs.onopen?.();
      await initPromise;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();

      // Trigger multiple close events
      mockWs.onclose?.();
      mockWs.onclose?.();
      mockWs.onclose?.();

      vi.advanceTimersByTime(5000);

      // Should only have one reconnect attempt (2 total calls including initial)
      expect((global.WebSocket as Mock).mock.calls.length).toBe(2);

      consoleSpy.mockRestore();
    });
  });
});
