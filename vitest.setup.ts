import { vi } from 'vitest';
import 'vitest-canvas-mock';

// Polyfill for structuredClone in test environment
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
  };
}

// Mock performance API (needed before modules are imported)
globalThis.performance = {
  now: () => Date.now(),
  timing: {},
  navigation: {},
  timeOrigin: Date.now(),
  mark: () => undefined,
  measure: () => undefined,
  clearMarks: () => undefined,
  clearMeasures: () => undefined,
  getEntries: () => [],
  getEntriesByName: () => [],
  getEntriesByType: () => [],
} as unknown as Performance;

// Mock fetch API (jsdom does not provide it)
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.reject(new Error('fetch not mocked'));
}

// Mock Supabase client
vi.mock('./src/user-account/supabase-client', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-key',
  isSupabaseApprovedDomain: true,
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  })),
}));

// Mock Auth module
vi.mock('./src/user-account/auth', () => ({
  Auth: {
    initializeAuth: vi.fn().mockResolvedValue(null),
    signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
    signIn: vi.fn().mockResolvedValue({ data: null, error: null }),
    signInWithOAuthProvider: vi.fn(),
    updatePassword: vi.fn().mockResolvedValue({ error: null }),
    updateProfile: vi.fn().mockResolvedValue(null),
    signOut: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(null),
    getUserProfile: vi.fn().mockResolvedValue(null),
    isLoggedIn: vi.fn().mockResolvedValue(false),
    setSession: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue(null),
    getSession: vi.fn().mockResolvedValue(null),
    refreshSession: vi.fn().mockResolvedValue(null),
    isTokenExpired: vi.fn().mockResolvedValue(false),
    getValidAccessToken: vi.fn().mockResolvedValue(null),
  },
}));

// Mock UserDataService
vi.mock('./src/user-account/user-data-service', () => ({
  initUserDataService: vi.fn(),
  getUserDataService: vi.fn(() => ({
    getProgressData: vi.fn().mockResolvedValue(null),
    saveProgressData: vi.fn().mockResolvedValue(undefined),
    isInitialized: true,
  })),
}));
