import { LocalStorageProvider } from '../../src/sync/local-storage-provider';

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;
  let mockStorage: Record<string, string>;
  let storageEventListeners: ((e: StorageEvent) => void)[];

  beforeEach(() => {
    mockStorage = {};
    storageEventListeners = [];

    // Mock localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => mockStorage[key] ?? null),
        setItem: jest.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete mockStorage[key];
        }),
      },
      writable: true,
    });

    // Mock addEventListener/removeEventListener for storage events
    jest.spyOn(globalThis, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'storage') {
        storageEventListeners.push(handler as (e: StorageEvent) => void);
      }
    });
    jest.spyOn(globalThis, 'removeEventListener').mockImplementation((type, handler) => {
      if (type === 'storage') {
        const index = storageEventListeners.indexOf(handler as (e: StorageEvent) => void);
        if (index > -1) storageEventListeners.splice(index, 1);
      }
    });

    provider = new LocalStorageProvider();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('uses default storage key when no config provided', async () => {
      await provider.write({ test: true });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        '__APP_STORE__',
        expect.any(String)
      );
    });

    it('uses custom storage key from config', async () => {
      provider = new LocalStorageProvider({ storageKey: 'custom-key' });
      await provider.write({ test: true });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'custom-key',
        expect.any(String)
      );
    });
  });

  describe('initialize()', () => {
    it('sets up storage event listener', async () => {
      await provider.initialize();

      expect(globalThis.addEventListener).toHaveBeenCalledWith(
        'storage',
        expect.any(Function)
      );
    });

    it('notifies subscribers when storage event fires for the correct key', async () => {
      await provider.initialize();
      const subscriber = jest.fn();
      provider.subscribe(subscriber);

      // Simulate storage event from another tab
      const event = {
        key: '__APP_STORE__',
        newValue: JSON.stringify({ updated: true }),
      } as StorageEvent;
      storageEventListeners.forEach(listener => listener(event));

      expect(subscriber).toHaveBeenCalledWith({ updated: true });
    });

    it('ignores storage events for different keys', async () => {
      await provider.initialize();
      const subscriber = jest.fn();
      provider.subscribe(subscriber);

      const event = {
        key: 'other-key',
        newValue: JSON.stringify({ other: true }),
      } as StorageEvent;
      storageEventListeners.forEach(listener => listener(event));

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('handles JSON parse errors in storage events', async () => {
      const onError = jest.fn();
      provider = new LocalStorageProvider({ onError });
      await provider.initialize();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const event = {
        key: '__APP_STORE__',
        newValue: 'invalid-json',
      } as StorageEvent;
      storageEventListeners.forEach(listener => listener(event));

      expect(consoleSpy).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('read()', () => {
    it('returns null when storage is empty', async () => {
      const result = await provider.read();

      expect(result).toBeNull();
    });

    it('returns parsed data from storage', async () => {
      mockStorage['__APP_STORE__'] = JSON.stringify({ test: 'value' });

      const result = await provider.read();

      expect(result).toEqual({ test: 'value' });
    });

    it('returns null and calls onError when JSON parsing fails', async () => {
      const onError = jest.fn();
      provider = new LocalStorageProvider({ onError });
      mockStorage['__APP_STORE__'] = 'invalid-json';

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await provider.read();

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('write()', () => {
    it('writes JSON-serialized data to storage', async () => {
      await provider.write({ key: 'value' });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        '__APP_STORE__',
        JSON.stringify({ key: 'value' })
      );
    });

    it('notifies local subscribers after writing', async () => {
      const subscriber = jest.fn();
      provider.subscribe(subscriber);

      await provider.write({ key: 'value' });

      expect(subscriber).toHaveBeenCalledWith({ key: 'value' });
    });

    it('calls onError when write fails', async () => {
      const onError = jest.fn();
      provider = new LocalStorageProvider({ onError });
      (localStorage.setItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage full');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await provider.write({ key: 'value' });

      expect(onError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('clear()', () => {
    it('removes data from storage', async () => {
      mockStorage['__APP_STORE__'] = JSON.stringify({ test: true });

      await provider.clear();

      expect(localStorage.removeItem).toHaveBeenCalledWith('__APP_STORE__');
    });

    it('notifies subscribers with null after clearing', async () => {
      const subscriber = jest.fn();
      provider.subscribe(subscriber);

      await provider.clear();

      expect(subscriber).toHaveBeenCalledWith(null);
    });

    it('calls onError when clear fails', async () => {
      const onError = jest.fn();
      provider = new LocalStorageProvider({ onError });
      (localStorage.removeItem as jest.Mock).mockImplementation(() => {
        throw new Error('Clear failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await provider.clear();

      expect(onError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('subscribe()', () => {
    it('adds callback to subscribers', async () => {
      const subscriber = jest.fn();
      provider.subscribe(subscriber);

      await provider.write({ data: 'test' });

      expect(subscriber).toHaveBeenCalledWith({ data: 'test' });
    });

    it('supports multiple subscribers', async () => {
      const subscriber1 = jest.fn();
      const subscriber2 = jest.fn();
      provider.subscribe(subscriber1);
      provider.subscribe(subscriber2);

      await provider.write({ data: 'test' });

      expect(subscriber1).toHaveBeenCalledWith({ data: 'test' });
      expect(subscriber2).toHaveBeenCalledWith({ data: 'test' });
    });

    it('returns unsubscribe function that removes the callback', async () => {
      const subscriber = jest.fn();
      const unsubscribe = provider.subscribe(subscriber);

      unsubscribe();
      await provider.write({ data: 'test' });

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('handles subscriber errors without affecting others', async () => {
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
    it('returns true when localStorage is available', () => {
      const result = provider.isConnected();

      expect(result).toBe(true);
    });

    it('returns false when localStorage throws', () => {
      (localStorage.setItem as jest.Mock).mockImplementation(() => {
        throw new Error('Not available');
      });

      const result = provider.isConnected();

      expect(result).toBe(false);
    });
  });

  describe('dispose()', () => {
    it('removes storage event listener', async () => {
      await provider.initialize();

      await provider.dispose();

      expect(globalThis.removeEventListener).toHaveBeenCalledWith(
        'storage',
        expect.any(Function)
      );
    });

    it('clears all subscribers', async () => {
      const subscriber = jest.fn();
      provider.subscribe(subscriber);

      await provider.dispose();
      // Try to write after dispose - shouldn't notify
      await provider.write({ data: 'test' });

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('handles dispose when not initialized', async () => {
      // Should not throw
      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });
});
