import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { Mock, vi } from 'vitest';

describe('Auth', () => {
  const mockErrorManager = {
    error: vi.fn(),
    warn: vi.fn(),
  };

  const mockSupabaseAuth = {
    getSession: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
    setSession: vi.fn(),
    refreshSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  };

  const makeUser = (overrides?: Partial<User>): User =>
  ({
    id: 'u1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: 'now',
    ...(overrides ?? {}),
  } as unknown as User);

  const makeSession = (overrides?: Partial<Session>): Session =>
  ({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: makeUser(),
    ...(overrides ?? {}),
  } as unknown as Session);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const loadAuth = async () => {
    vi.unmock('../../src/user-account/auth');

    vi.doMock('../../src/engine/utils/errorManager', () => ({
      errorManagerInstance: mockErrorManager,
    }));

    vi.doMock('../../src/user-account/supabase-client', () => ({
      supabase: {
        auth: mockSupabaseAuth,
      },
    }));

    const { Auth } = await import('../../src/user-account/auth');
    return Auth;
  };

  it('initializeAuth returns user when session exists', async () => {
    const Auth = await loadAuth();
    const session = makeSession({ user: makeUser({ id: 'u123' } as any) });

    mockSupabaseAuth.getSession.mockResolvedValue({ data: { session }, error: null });

    await expect(Auth.initializeAuth()).resolves.toEqual(session.user);
    expect(mockErrorManager.error).not.toHaveBeenCalled();
  });

  it('initializeAuth returns null and logs when getSession errors', async () => {
    const Auth = await loadAuth();

    mockSupabaseAuth.getSession.mockResolvedValue({ data: { session: null }, error: new Error('boom') });

    await expect(Auth.initializeAuth()).resolves.toBeNull();
    expect(mockErrorManager.error).toHaveBeenCalledWith(expect.any(Error), 'Error getting session');
  });

  it('updatePassword rejects short passwords without calling Supabase', async () => {
    const Auth = await loadAuth();

    await expect(Auth.updatePassword('12345')).resolves.toEqual({
      error: expect.any(Error),
    });
    expect(mockErrorManager.warn).toHaveBeenCalled();
    expect(mockSupabaseAuth.updateUser).not.toHaveBeenCalled();
  });

  it('updatePassword logs and returns error when Supabase update fails', async () => {
    const Auth = await loadAuth();

    mockSupabaseAuth.updateUser.mockResolvedValue({ data: { user: null }, error: new Error('bad') });

    const result = await Auth.updatePassword('123456');

    expect(result).toEqual({ error: expect.any(Error) });
    expect(mockErrorManager.error).toHaveBeenCalledWith(expect.any(Error), 'Error updating password');
  });

  it('getUserProfile returns user_metadata or null', async () => {
    const Auth = await loadAuth();

    const user = makeUser({ user_metadata: { full_name: 'Test' } } as any);
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(Auth.getUserProfile()).resolves.toEqual({ full_name: 'Test' });

    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(Auth.getUserProfile()).resolves.toBeNull();
  });

  it('isLoggedIn reflects presence of user', async () => {
    const Auth = await loadAuth();

    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: makeUser() }, error: null });
    await expect(Auth.isLoggedIn()).resolves.toBe(true);

    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(Auth.isLoggedIn()).resolves.toBe(false);
  });

  it('getAccessToken returns null when no session or error', async () => {
    const Auth = await loadAuth();

    mockSupabaseAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(Auth.getAccessToken()).resolves.toBeNull();

    mockSupabaseAuth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: new Error('x') });
    await expect(Auth.getAccessToken()).resolves.toBeNull();
  });

  it('isTokenExpired returns true when no session', async () => {
    const Auth = await loadAuth();

    vi.spyOn(Auth, 'getSession').mockResolvedValueOnce(null);
    await expect(Auth.isTokenExpired()).resolves.toBe(true);
  });

  it('isTokenExpired returns false when expires_at missing', async () => {
    const Auth = await loadAuth();

    vi.spyOn(Auth, 'getSession').mockResolvedValueOnce({ ...(makeSession() as any), expires_at: undefined });
    await expect(Auth.isTokenExpired()).resolves.toBe(false);
  });

  it('isTokenExpired respects buffer seconds', async () => {
    const Auth = await loadAuth();

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const expiresSoon = Math.floor((now + 30_000) / 1000); // 30s
    vi.spyOn(Auth, 'getSession').mockResolvedValueOnce({ ...(makeSession() as any), expires_at: expiresSoon });
    await expect(Auth.isTokenExpired(60)).resolves.toBe(true);

    const expiresLater = Math.floor((now + 120_000) / 1000); // 120s
    vi.spyOn(Auth, 'getSession').mockResolvedValueOnce({ ...(makeSession() as any), expires_at: expiresLater });
    await expect(Auth.isTokenExpired(60)).resolves.toBe(false);
  });

  it('getValidAccessToken refreshes when expired', async () => {
    const Auth = await loadAuth();

    vi.spyOn(Auth, 'isTokenExpired').mockResolvedValueOnce(true);
    vi.spyOn(Auth, 'refreshSession').mockResolvedValueOnce(makeSession({ access_token: 'new-token' } as any));

    await expect(Auth.getValidAccessToken()).resolves.toBe('new-token');
  });

  it('getValidAccessToken returns current token when not expired', async () => {
    const Auth = await loadAuth();

    vi.spyOn(Auth, 'isTokenExpired').mockResolvedValueOnce(false);
    vi.spyOn(Auth, 'getAccessToken').mockResolvedValueOnce('current-token');

    await expect(Auth.getValidAccessToken()).resolves.toBe('current-token');
  });

  it('onAuthStateChange maps session to callback args', async () => {
    const Auth = await loadAuth();

    const user = makeUser({ user_metadata: { hello: 'world' } } as any);
    const session = makeSession({ access_token: 'tok', user } as any);

    const cb = vi.fn();

    mockSupabaseAuth.onAuthStateChange.mockImplementation((handler: any) => {
      handler('SIGNED_IN' as AuthChangeEvent, session);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    Auth.onAuthStateChange(cb);

    expect(cb).toHaveBeenCalledWith('SIGNED_IN', user, { hello: 'world' }, 'tok');
  });

  it('setSession sets tokens and logs errors', async () => {
    const Auth = await loadAuth();

    mockSupabaseAuth.setSession.mockResolvedValue({ data: {}, error: new Error('nope') });

    await Auth.setSession(makeSession({ access_token: 'a', refresh_token: 'r' } as any));

    expect(mockSupabaseAuth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    expect(mockErrorManager.error).toHaveBeenCalledWith(expect.any(Error), 'Error setting session');
  });

  it('setSession does nothing when session is null', async () => {
    const Auth = await loadAuth();

    await Auth.setSession(null);

    expect(mockSupabaseAuth.setSession).not.toHaveBeenCalled();
  });

  it('setSession catches and logs exceptions', async () => {
    const Auth = await loadAuth();

    mockSupabaseAuth.setSession.mockRejectedValue(new Error('thrown'));

    await Auth.setSession(makeSession({ access_token: 'a', refresh_token: 'r' } as any));

    expect(mockErrorManager.error).toHaveBeenCalledWith(expect.any(Error), 'Error setting session');
  });

  describe('signUp', () => {
    it('calls supabase signUp with email, password, and profile', async () => {
      const Auth = await loadAuth();
      const user = makeUser({ id: 'new-user' } as any);

      mockSupabaseAuth.signUp.mockResolvedValue({ data: { user }, error: null });

      const result = await Auth.signUp('test@example.com', 'password123', { full_name: 'Test User' });

      expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: { data: { full_name: 'Test User' } },
      });
      expect(result.user).toEqual(user);
      expect(result.error).toBeNull();
    });

    it('uses empty object for profile when not provided', async () => {
      const Auth = await loadAuth();

      mockSupabaseAuth.signUp.mockResolvedValue({ data: { user: null }, error: null });

      await Auth.signUp('test@example.com', 'password123');

      expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: { data: {} },
      });
    });

    it('returns error when signUp fails', async () => {
      const Auth = await loadAuth();
      const error = new Error('User already registered');

      mockSupabaseAuth.signUp.mockResolvedValue({ data: { user: null }, error });

      const result = await Auth.signUp('test@example.com', 'password123');

      expect(result.user).toBeNull();
      expect(result.error).toBe(error);
    });
  });

  describe('signIn', () => {
    it('calls supabase signInWithPassword and returns user', async () => {
      const Auth = await loadAuth();
      const user = makeUser({ id: 'existing-user' } as any);

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });

      const result = await Auth.signIn('test@example.com', 'password123');

      expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.user).toEqual(user);
      expect(result.error).toBeNull();
    });

    it('returns error when signIn fails', async () => {
      const Auth = await loadAuth();
      const error = new Error('Invalid login credentials');

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({ data: { user: null }, error });

      const result = await Auth.signIn('test@example.com', 'wrong');

      expect(result.user).toBeNull();
      expect(result.error).toBe(error);
    });
  });

  describe('signOut', () => {
    it('calls supabase signOut and returns result', async () => {
      const Auth = await loadAuth();

      mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

      const result = await Auth.signOut();

      expect(mockSupabaseAuth.signOut).toHaveBeenCalled();
      expect(result.error).toBeNull();
    });

    it('returns error when signOut fails', async () => {
      const Auth = await loadAuth();
      const error = new Error('Signout failed');

      mockSupabaseAuth.signOut.mockResolvedValue({ error });

      const result = await Auth.signOut();

      expect(result.error).toBe(error);
    });
  });

  describe('getCurrentUser', () => {
    it('returns user from supabase getUser', async () => {
      const Auth = await loadAuth();
      const user = makeUser({ id: 'u123' } as any);

      mockSupabaseAuth.getUser.mockResolvedValue({ data: { user }, error: null });

      const result = await Auth.getCurrentUser();

      expect(result).toEqual(user);
    });

    it('returns null when no user', async () => {
      const Auth = await loadAuth();

      mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });

      const result = await Auth.getCurrentUser();

      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('calls supabase updateUser with profile data', async () => {
      const Auth = await loadAuth();
      const user = makeUser({ user_metadata: { full_name: 'Updated Name' } } as any);

      mockSupabaseAuth.updateUser.mockResolvedValue({ data: { user }, error: null });

      const result = await Auth.updateProfile({ full_name: 'Updated Name' });

      expect(mockSupabaseAuth.updateUser).toHaveBeenCalledWith({
        data: { full_name: 'Updated Name' },
      });
      expect(result.user).toEqual(user);
      expect(result.error).toBeNull();
    });

    it('returns error when updateProfile fails', async () => {
      const Auth = await loadAuth();
      const error = new Error('Update failed');

      mockSupabaseAuth.updateUser.mockResolvedValue({ data: { user: null }, error });

      const result = await Auth.updateProfile({ full_name: 'Test' });

      expect(result.error).toBe(error);
    });
  });

  describe('updatePassword success', () => {
    it('updates password when valid and returns user', async () => {
      const Auth = await loadAuth();
      const user = makeUser();

      mockSupabaseAuth.updateUser.mockResolvedValue({ data: { user }, error: null });

      const result = await Auth.updatePassword('validpassword');

      expect(mockSupabaseAuth.updateUser).toHaveBeenCalledWith({ password: 'validpassword' });
      expect(result.user).toEqual(user);
      expect(result.error).toBeNull();
    });
  });

  describe('getSession', () => {
    it('returns session when available', async () => {
      const Auth = await loadAuth();
      const session = makeSession();

      mockSupabaseAuth.getSession.mockResolvedValue({ data: { session }, error: null });

      const result = await Auth.getSession();

      expect(result).toEqual(session);
    });

    it('returns null and logs error when getSession fails', async () => {
      const Auth = await loadAuth();

      mockSupabaseAuth.getSession.mockResolvedValue({ data: { session: null }, error: new Error('Session error') });

      const result = await Auth.getSession();

      expect(result).toBeNull();
      expect(mockErrorManager.error).toHaveBeenCalledWith(expect.any(Error), 'Error getting session');
    });
  });

  describe('refreshSession', () => {
    it('returns refreshed session', async () => {
      const Auth = await loadAuth();
      const session = makeSession({ access_token: 'refreshed-token' } as any);

      mockSupabaseAuth.refreshSession.mockResolvedValue({ data: { session }, error: null });

      const result = await Auth.refreshSession();

      expect(result).toEqual(session);
    });

    it('returns null and logs error when refresh fails', async () => {
      const Auth = await loadAuth();

      mockSupabaseAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('Refresh error') });

      const result = await Auth.refreshSession();

      expect(result).toBeNull();
      expect(mockErrorManager.error).toHaveBeenCalledWith(expect.any(Error), 'Error refreshing session');
    });
  });

  describe('getAccessToken success', () => {
    it('returns access token when session exists', async () => {
      const Auth = await loadAuth();
      const session = makeSession({ access_token: 'my-token' } as any);

      mockSupabaseAuth.getSession.mockResolvedValue({ data: { session }, error: null });

      const result = await Auth.getAccessToken();

      expect(result).toBe('my-token');
    });
  });

  describe('signInWithOAuthProvider', () => {
    let originalOpen: typeof window.open;
    let mockPopup: { location: { href: string }; close: Mock; closed: boolean };

    beforeEach(() => {
      originalOpen = window.open;
      mockPopup = {
        location: { href: '' },
        close: vi.fn(),
        closed: false,
      };
    });

    afterEach(() => {
      window.open = originalOpen;
    });

    it('rejects when popup is blocked', async () => {
      const Auth = await loadAuth();

      window.open = vi.fn().mockReturnValue(null);

      await expect(Auth.signInWithOAuthProvider('google')).rejects.toThrow('Popup blocked');
    });

    it('rejects when OAuth call returns error', async () => {
      const Auth = await loadAuth();

      window.open = vi.fn().mockReturnValue(mockPopup);
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        data: { url: null },
        error: new Error('OAuth error'),
      });

      await expect(Auth.signInWithOAuthProvider('github')).rejects.toThrow('OAuth error');
      expect(mockPopup.close).toHaveBeenCalled();
    });

    it('sets popup location on successful OAuth call', async () => {
      const Auth = await loadAuth();

      window.open = vi.fn().mockReturnValue(mockPopup);
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://auth.example.com/oauth' },
        error: null,
      });

      // Start the promise but don't await it yet
      const promise = Auth.signInWithOAuthProvider('google');

      // Wait for OAuth call to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPopup.location.href).toBe('https://auth.example.com/oauth');

      // Clean up by closing popup
      mockPopup.closed = true;

      await expect(promise).rejects.toThrow('google sign-in was cancelled');
    });

    it('resolves with user on SUPABASE_AUTH_SUCCESS message', async () => {
      const Auth = await loadAuth();
      const user = makeUser({ id: 'oauth-user' } as any);

      window.open = vi.fn().mockReturnValue(mockPopup);
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://auth.example.com' },
        error: null,
      });

      const promise = Auth.signInWithOAuthProvider('google');

      // Wait for event listener to be set up
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate auth success message from popup
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'SUPABASE_AUTH_SUCCESS', user },
          source: mockPopup as unknown as Window,
        })
      );

      const result = await promise;

      expect(result.user).toEqual(user);
      expect(result.error).toBeNull();
      expect(mockPopup.close).toHaveBeenCalled();
    });

    it('rejects on SUPABASE_AUTH_ERROR message', async () => {
      const Auth = await loadAuth();

      window.open = vi.fn().mockReturnValue(mockPopup);
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://auth.example.com' },
        error: null,
      });

      const promise = Auth.signInWithOAuthProvider('facebook');

      await new Promise((resolve) => setTimeout(resolve, 10));

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'SUPABASE_AUTH_ERROR', error: 'Auth failed' },
          source: mockPopup as unknown as Window,
        })
      );

      await expect(promise).rejects.toThrow('Auth failed');
      expect(mockPopup.close).toHaveBeenCalled();
    });

    it('ignores messages from other sources', async () => {
      const Auth = await loadAuth();

      window.open = vi.fn().mockReturnValue(mockPopup);
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://auth.example.com' },
        error: null,
      });

      const promise = Auth.signInWithOAuthProvider('google');

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Message from different source should be ignored
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'SUPABASE_AUTH_SUCCESS', user: {} },
          source: window, // Different source, not the popup
        })
      );

      // Close popup to end the promise
      mockPopup.closed = true;

      await expect(promise).rejects.toThrow('google sign-in was cancelled');
    });

    it('uses custom popup name when provided', async () => {
      const Auth = await loadAuth();

      window.open = vi.fn().mockReturnValue(mockPopup);
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://auth.example.com' },
        error: null,
      });

      const promise = Auth.signInWithOAuthProvider('linkedin_oidc', 'Custom Popup');

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(window.open).toHaveBeenCalledWith(
        '',
        'Custom Popup',
        expect.any(String)
      );

      mockPopup.closed = true;
      await expect(promise).rejects.toThrow();
    });
  });

  describe('onAuthStateChange with null session', () => {
    it('passes null values when session is null', async () => {
      const Auth = await loadAuth();
      const cb = vi.fn();

      mockSupabaseAuth.onAuthStateChange.mockImplementation((handler: any) => {
        handler('SIGNED_OUT', null);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      Auth.onAuthStateChange(cb);

      expect(cb).toHaveBeenCalledWith('SIGNED_OUT', null, null, null);
    });
  });
});
