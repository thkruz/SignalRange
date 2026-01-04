// NOTE: jest.setup.js globally mocks user-account modules.
// These tests explicitly unmock to validate the real implementation.

const mockErrorManager = {
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../src/engine/utils/errorManager', () => ({
  errorManagerInstance: mockErrorManager,
}));

type MockResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get: (key: string) => string | null };
  json: () => Promise<any>;
};

const makeJsonResponse = (opts: {
  ok: boolean;
  status?: number;
  statusText?: string;
  body?: any;
  contentLength?: string | null;
}): MockResponse => {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const statusText = opts.statusText ?? (opts.ok ? 'OK' : 'ERR');
  return {
    ok: opts.ok,
    status,
    statusText,
    headers: {
      get: (key: string) => (key.toLowerCase() === 'content-length' ? (opts.contentLength ?? null) : null),
    },
    json: async () => opts.body,
  };
};

describe('UserDataService', () => {
  const apiBaseUrl = 'https://api.example';

  const loadReal = async () => {
    jest.resetModules();
    jest.unmock('../../src/user-account/user-data-service');
    jest.unmock('../../src/user-account/user-data-service-error');

    const { UserDataService, getUserDataService, initUserDataService } = await import(
      '../../src/user-account/user-data-service'
    );
    const { UserDataServiceError } = await import('../../src/user-account/user-data-service-error');

    return { UserDataService, getUserDataService, initUserDataService, UserDataServiceError };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).fetch = jest.fn();
  });

  it('throws if singleton is not initialized', () => {
    // Use isolated import so previous tests don't initialize the singleton.
    jest.isolateModules(() => {
      jest.unmock('../../src/user-account/user-data-service');
      const { getUserDataService } = require('../../src/user-account/user-data-service');
      expect(() => getUserDataService()).toThrow('UserDataService not initialized. Call initUserDataService() first.');
    });
  });

  it('initializes and returns singleton', () => {
    jest.isolateModules(() => {
      jest.unmock('../../src/user-account/user-data-service');
      const { initUserDataService, getUserDataService } = require('../../src/user-account/user-data-service');

      const svc = initUserDataService({ apiBaseUrl, getAccessToken: () => 't' });
      expect(getUserDataService()).toBe(svc);
    });
  });

  it('adds Authorization header and JSON body', async () => {
    const { UserDataService } = await loadReal();
    const svc = new UserDataService({ apiBaseUrl, getAccessToken: () => 'token' });
    (globalThis.fetch as jest.Mock).mockResolvedValue(makeJsonResponse({ ok: true, body: { ok: 1 } }));

    await expect((svc as any).request('/x', 'PUT', { a: 1 })).resolves.toEqual({ ok: 1 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example/x',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        body: JSON.stringify({ a: 1 }),
      }),
    );
  });

  it('returns undefined for HEAD and DELETE', async () => {
    const { UserDataService } = await loadReal();
    const svc = new UserDataService({ apiBaseUrl, getAccessToken: () => 'token' });
    (globalThis.fetch as jest.Mock).mockResolvedValue(makeJsonResponse({ ok: true, body: { ignored: true } }));

    await expect((svc as any).request('/x', 'HEAD')).resolves.toBeUndefined();
    await expect((svc as any).request('/x', 'DELETE')).resolves.toBeUndefined();
  });

  it('returns undefined for 204 or content-length 0', async () => {
    const { UserDataService } = await loadReal();
    const svc = new UserDataService({ apiBaseUrl, getAccessToken: () => 'token' });

    (globalThis.fetch as jest.Mock).mockResolvedValue(makeJsonResponse({ ok: true, status: 204, body: null }));
    await expect((svc as any).request('/x', 'GET')).resolves.toBeUndefined();

    (globalThis.fetch as jest.Mock).mockResolvedValue(makeJsonResponse({ ok: true, status: 200, body: null, contentLength: '0' }));
    await expect((svc as any).request('/x', 'GET')).resolves.toBeUndefined();
  });

  it('throws UserDataServiceError for API error response', async () => {
    const { UserDataService, UserDataServiceError } = await loadReal();
    const svc = new UserDataService({ apiBaseUrl, getAccessToken: () => 'token', enableRetry: false });

    (globalThis.fetch as jest.Mock).mockResolvedValue(
      makeJsonResponse({ ok: false, status: 400, statusText: 'Bad', body: { error: 'Nope', code: 'X', details: { a: 1 } } }),
    );

    await expect((svc as any).request('/x', 'GET')).rejects.toMatchObject({
      name: 'UserDataServiceError',
      statusCode: 400,
      code: 'X',
      details: { a: 1 },
    });
    await expect((svc as any).request('/x', 'GET')).rejects.toBeInstanceOf(UserDataServiceError);
  });

  it('retries on network errors with exponential backoff', async () => {
    jest.useFakeTimers();

    const { UserDataService } = await loadReal();
    const svc = new UserDataService({ apiBaseUrl, getAccessToken: () => 'token', maxRetries: 2, retryDelay: 10 });

    (globalThis.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net2'))
      .mockResolvedValueOnce(makeJsonResponse({ ok: true, body: { ok: true } }));

    const promise = (svc as any).request('/x', 'GET');

    // 10ms then 20ms
    await jest.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(20);

    await expect(promise).resolves.toEqual({ ok: true });
    expect(mockErrorManager.warn).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('retries on 429 but not on 400', async () => {
    jest.useFakeTimers();

    const { UserDataService, UserDataServiceError } = await loadReal();
    const svc = new UserDataService({ apiBaseUrl, getAccessToken: () => 'token', maxRetries: 1, retryDelay: 5 });

    // 400 should not retry
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(
      makeJsonResponse({ ok: false, status: 400, statusText: 'Bad', body: { error: 'bad' } }),
    );

    await expect((svc as any).request('/bad', 'GET')).rejects.toBeInstanceOf(UserDataServiceError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // 429 retries then succeeds
    (globalThis.fetch as jest.Mock).mockReset();
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(makeJsonResponse({ ok: false, status: 429, statusText: 'Too Many', body: { error: 'rate limited' } }))
      .mockResolvedValueOnce(makeJsonResponse({ ok: true, body: { ok: 1 } }));

    const p = (svc as any).request('/rl', 'GET');
    await jest.advanceTimersByTimeAsync(5);
    await expect(p).resolves.toEqual({ ok: 1 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('getScenarioProgress returns null on 404', async () => {
    const { UserDataService } = await loadReal();
    const svc = new UserDataService({ apiBaseUrl, getAccessToken: () => 'token', enableRetry: false, appId: 'signalrange' });

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(
      makeJsonResponse({ ok: false, status: 404, statusText: 'Not Found', body: { error: 'missing' } }),
    );

    await expect(svc.getScenarioProgress('s1')).resolves.toBeNull();
  });

  it('updateUserProfile maps camelCase to snake_case', async () => {
    const { UserDataService } = await loadReal();
    const svc = new UserDataService({ apiBaseUrl, getAccessToken: () => 'token', enableRetry: false });

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(
      makeJsonResponse({
        ok: true,
        body: {
          id: 'u1',
          email: 'e',
          display_name: 'Name',
          avatar_url: 'a',
          user_type: 'civilian',
          country: 'US',
          organization: 'Org',
          branch: 'N',
          rank: 'R',
          email_notifications: false,
          created_at: 'c',
          updated_at: 'u',
        },
      }),
    );

    await svc.updateUserProfile({
      fullName: 'Name',
      avatarUrl: 'a',
      userType: 'civilian',
      country: 'US',
      organization: 'Org',
      branch: 'N',
      rank: 'R',
      emailNotifications: false,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          display_name: 'Name',
          avatar_url: 'a',
          user_type: 'civilian',
          country: 'US',
          organization: 'Org',
          branch: 'N',
          rank: 'R',
          email_notifications: false,
        }),
      }),
    );
  });

  it('getFullUserData maps profile->user and preserves lists', async () => {
    const { UserDataService } = await loadReal();
    const svc = new UserDataService({ apiBaseUrl, getAccessToken: () => 'token', enableRetry: false });

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(
      makeJsonResponse({
        ok: true,
        body: {
          profile: { id: 'u1', email: 'e', display_name: 'D', email_notifications: true, created_at: 'c', updated_at: 'u' },
          preferences: { id: 1, user_id: 'u1', isSoundEnabled: true, soundVolume: 0.5, theme: 'dark', autoSaveProgress: true, defaultFrequencyUnits: 'MHz', defaultPowerUnits: 'dBm' },
          data: { id: 2, user_id: 'u1', lastPlayedScenario: 1 },
          progress: { id: 3, user_id: 'u1', completedScenarios: [1], totalScore: 10 },
          achievements: [{ id: 'ua1', achievementId: 1, unlockedAt: 't' }],
        },
      }),
    );

    const result = await svc.getFullUserData();
    expect(result.user.id).toBe('u1');
    expect(result.user.fullName).toBe('D');
    expect(result.achievements).toHaveLength(1);
  });
});
