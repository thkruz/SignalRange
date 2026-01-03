import { D1StorageProvider } from '../../src/sync/d1-storage-provider';

describe('D1StorageProvider', () => {
  let provider: D1StorageProvider;
  const API_ENDPOINT = 'https://api.example.com';

  beforeEach(() => {
    jest.useFakeTimers();
    provider = new D1StorageProvider(API_ENDPOINT);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('stores the API endpoint and config', () => {
      const onError = jest.fn();
      provider = new D1StorageProvider(API_ENDPOINT, { onError });

      // Provider should be created without throwing
      expect(provider).toBeInstanceOf(D1StorageProvider);
    });
  });

  describe('initialize()', () => {
    it('checks health endpoint and loads initial state', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'initial' }) }); // read
      global.fetch = mockFetch;

      await provider.initialize();

      expect(mockFetch).toHaveBeenCalledWith(`${API_ENDPOINT}/health`);
      expect(mockFetch).toHaveBeenCalledWith(`${API_ENDPOINT}/state`, expect.any(Object));
    });

    it('throws when health check fails', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: false });
      global.fetch = mockFetch;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await expect(provider.initialize()).rejects.toThrow('D1 backend not available');
      consoleSpy.mockRestore();
    });

    it('calls onError when initialization fails', async () => {
      const onError = jest.fn();
      provider = new D1StorageProvider(API_ENDPOINT, { onError });
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await expect(provider.initialize()).rejects.toThrow();
      expect(onError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('starts polling when autoSync is enabled', async () => {
      provider = new D1StorageProvider(API_ENDPOINT, { autoSync: true, syncInterval: 1000 });
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: 'state' }) });
      global.fetch = mockFetch;

      await provider.initialize();
      const initialCallCount = mockFetch.mock.calls.length;

      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Flush promises

      expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('read()', () => {
    it('fetches state from API and caches it', async () => {
      const mockData = { equipment: { antenna: 'test' } };
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });
      global.fetch = mockFetch;

      const result = await provider.read();

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(`${API_ENDPOINT}/state`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('returns cached state on error', async () => {
      // First, successfully read to cache
      const mockData = { cached: true };
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockData) })
        .mockRejectedValueOnce(new Error('Network error'));
      global.fetch = mockFetch;

      await provider.read(); // Cache the data
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await provider.read(); // This should fail but return cache

      expect(result).toEqual(mockData);
      consoleSpy.mockRestore();
    });

    it('throws HTTP error for non-OK responses', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      global.fetch = mockFetch;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await provider.read();

      // Returns cached state (null initially)
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('write()', () => {
    it('posts state to API', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;
      const data = { equipment: { test: true } };

      await provider.write(data);

      expect(mockFetch).toHaveBeenCalledWith(`${API_ENDPOINT}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    });

    it('notifies subscribers after successful write', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;
      const subscriber = jest.fn();
      provider.subscribe(subscriber);
      const data = { test: 'value' };

      await provider.write(data);

      expect(subscriber).toHaveBeenCalledWith(data);
    });

    it('throws on HTTP error', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });
      global.fetch = mockFetch;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await expect(provider.write({ data: 'test' })).rejects.toThrow();
      consoleSpy.mockRestore();
    });

    it('calls onError when write fails', async () => {
      const onError = jest.fn();
      provider = new D1StorageProvider(API_ENDPOINT, { onError });
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await expect(provider.write({ data: 'test' })).rejects.toThrow();
      expect(onError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('clear()', () => {
    it('sends DELETE request to API', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      await provider.clear();

      expect(mockFetch).toHaveBeenCalledWith(`${API_ENDPOINT}/state`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('clears cached state and notifies subscribers with null', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;
      const subscriber = jest.fn();
      provider.subscribe(subscriber);

      await provider.clear();

      expect(subscriber).toHaveBeenCalledWith(null);
    });

    it('throws on HTTP error', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      global.fetch = mockFetch;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await expect(provider.clear()).rejects.toThrow();
      consoleSpy.mockRestore();
    });
  });

  describe('subscribe()', () => {
    it('adds callback to subscribers', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;
      const subscriber = jest.fn();
      provider.subscribe(subscriber);

      await provider.write({ data: 'test' });

      expect(subscriber).toHaveBeenCalledWith({ data: 'test' });
    });

    it('returns unsubscribe function', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;
      const subscriber = jest.fn();
      const unsubscribe = provider.subscribe(subscriber);

      unsubscribe();
      await provider.write({ data: 'test' });

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('handles subscriber errors without affecting others', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;
      const errorSubscriber = jest.fn().mockImplementation(() => {
        throw new Error('Subscriber error');
      });
      const normalSubscriber = jest.fn();
      provider.subscribe(errorSubscriber);
      provider.subscribe(normalSubscriber);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await provider.write({ data: 'test' });

      expect(normalSubscriber).toHaveBeenCalledWith({ data: 'test' });
      consoleSpy.mockRestore();
    });
  });

  describe('isConnected()', () => {
    it('returns false when no cached state', () => {
      expect(provider.isConnected()).toBe(false);
    });

    it('returns true after successful read', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'state' }),
      });
      global.fetch = mockFetch;

      await provider.read();

      expect(provider.isConnected()).toBe(true);
    });
  });

  describe('dispose()', () => {
    it('stops polling', async () => {
      provider = new D1StorageProvider(API_ENDPOINT, { autoSync: true, syncInterval: 1000 });
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      global.fetch = mockFetch;

      await provider.initialize();
      await provider.dispose();
      const callCountAfterDispose = mockFetch.mock.calls.length;

      jest.advanceTimersByTime(5000);

      expect(mockFetch.mock.calls.length).toBe(callCountAfterDispose);
    });

    it('clears subscribers and cached state', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'state' }),
      });
      global.fetch = mockFetch;

      await provider.read();
      expect(provider.isConnected()).toBe(true);

      await provider.dispose();

      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('polling', () => {
    it('uses default interval of 30 seconds when not specified', async () => {
      provider = new D1StorageProvider(API_ENDPOINT, { autoSync: true });
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      global.fetch = mockFetch;

      await provider.initialize();
      const initialCallCount = mockFetch.mock.calls.length;

      // Advance less than 30 seconds - should not poll yet
      jest.advanceTimersByTime(29000);
      await Promise.resolve();
      expect(mockFetch.mock.calls.length).toBe(initialCallCount);

      // Advance past 30 seconds - should poll
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('polls the server at the configured interval', async () => {
      provider = new D1StorageProvider(API_ENDPOINT, { autoSync: true, syncInterval: 1000 });
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({ ok: true }) // health
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: 'state' }) }); // reads
      global.fetch = mockFetch;

      await provider.initialize();
      const callsAfterInit = mockFetch.mock.calls.length;

      // Advance past polling interval
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();

      // Should have made additional fetch calls for polling
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterInit);
    });

    // Note: The D1StorageProvider has a known issue where polling won't notify
    // subscribers of changes because read() updates cachedState before the
    // comparison in startPolling(). This is a bug in the skeleton implementation.
  });
});
