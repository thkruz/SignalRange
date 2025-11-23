// Polyfill for structuredClone in Jest environment
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
  };
}

// Mock Supabase client
jest.mock('./src/user-account/supabase-client', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-key',
  isSupabaseApprovedDomain: true,
  getSupabaseClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } }
      })),
    },
  })),
}));

// Mock Auth module
jest.mock('./src/user-account/auth', () => ({
  Auth: {
    initializeAuth: jest.fn().mockResolvedValue(null),
    signUp: jest.fn().mockResolvedValue({ data: null, error: null }),
    signIn: jest.fn().mockResolvedValue({ data: null, error: null }),
    signInWithOAuthProvider: jest.fn(),
    updatePassword: jest.fn().mockResolvedValue({ error: null }),
    updateProfile: jest.fn().mockResolvedValue(null),
    signOut: jest.fn().mockResolvedValue(undefined),
    getCurrentUser: jest.fn().mockResolvedValue(null),
    getUserProfile: jest.fn().mockResolvedValue(null),
    isLoggedIn: jest.fn().mockResolvedValue(false),
    setSession: jest.fn().mockResolvedValue(undefined),
    onAuthStateChange: jest.fn(),
    getAccessToken: jest.fn().mockResolvedValue(null),
    getSession: jest.fn().mockResolvedValue(null),
    refreshSession: jest.fn().mockResolvedValue(null),
    isTokenExpired: jest.fn().mockResolvedValue(false),
    getValidAccessToken: jest.fn().mockResolvedValue(null),
  },
}));

// Mock UserDataService
jest.mock('./src/user-account/user-data-service', () => ({
  initUserDataService: jest.fn(),
  getUserDataService: jest.fn(() => ({
    getProgressData: jest.fn().mockResolvedValue(null),
    saveProgressData: jest.fn().mockResolvedValue(undefined),
    isInitialized: true,
  })),
}));