import { config } from '@app/config/env';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = config.supabase.url;
export const SUPABASE_ANON_KEY = config.supabase.anonKey;

export const isSupabaseApprovedDomain =
  window.location.hostname === 'localhost' ||
  window.location.hostname.endsWith('signalrange.space') ||
  window.location.hostname.endsWith('keeptrack.space') ||
  window.location.hostname.endsWith('workers.dev');

/**
 * Custom storage adapter with multi-layer fallback for Brave and other privacy-focused browsers.
 * Uses localStorage, sessionStorage, cookies, and in-memory cache to resist aggressive clearing.
 */
const createResilientStorage = () => {
  const PRIMARY_KEY = 'sb-auth';
  const COOKIE_NAME = 'sr_auth_session';
  const memoryCache = new Map<string, string>();

  // Helper: Escape special regex characters in a string
  const escapeRegExp = (string: string): string => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // Helper: Get from cookie
  const getCookie = (name: string): string | null => {
    try {
      // Escape the cookie name to prevent regex injection
      const escapedName = escapeRegExp(name);
      const pattern = new RegExp(`(^| )${escapedName}=([^;]+)`, 'u');
      const match = pattern.exec(document.cookie);

      return match ? decodeURIComponent(match[2]) : null;
    } catch {
      return null;
    }
  };

  // Helper: Set cookie with 30-day expiration
  const setCookie = (name: string, value: string): void => {
    try {
      const expires = new Date();

      expires.setDate(expires.getDate() + 30);
      document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
    } catch {
      // Ignore cookie errors
    }
  };

  // Helper: Remove cookie
  const removeCookie = (name: string): void => {
    try {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    } catch {
      // Ignore cookie errors
    }
  };

  // PROACTIVE RESTORATION: Check cookie on init and restore to localStorage
  // This runs BEFORE Supabase tries to read the session
  const initRestore = (): void => {
    try {
      const cookieValue = getCookie(COOKIE_NAME);

      if (cookieValue) {
        const storageKey = `${PRIMARY_KEY}-token`;
        const hasLocalStorage = localStorage.getItem(storageKey);

        if (!hasLocalStorage) {
          // Restore from cookie to all storage layers
          localStorage.setItem(storageKey, cookieValue);
          sessionStorage.setItem(storageKey, cookieValue);
          memoryCache.set(storageKey, cookieValue);
        }
      }
    } catch {
      // Ignore errors
    }
  };

  // Run restoration immediately when storage adapter is created
  initRestore();

  return {
    getItem: (key: string): string | null => {
      try {
        // Priority 1: Memory cache (fastest)
        if (memoryCache.has(key)) {
          return memoryCache.get(key)!;
        }

        // Priority 2: localStorage
        let value = localStorage.getItem(key);

        if (value) {
          return value;
        }

        // Priority 3: sessionStorage
        value = sessionStorage.getItem(key);
        if (value) {
          // Restore to other layers
          memoryCache.set(key, value);
          try {
            localStorage.setItem(key, value);
          } catch {
            // Storage might be full
          }

          return value;
        }

        // Priority 4: Cookie (most persistent against Brave clearing)
        if (!value && key.startsWith(PRIMARY_KEY)) {
          value = getCookie(COOKIE_NAME);
          if (value) {
            // Restore to all storage layers
            memoryCache.set(key, value);
            try {
              localStorage.setItem(key, value);
              sessionStorage.setItem(key, value);
            } catch {
              // Some storage might be full or disabled
            }
          }
        }

        return value;
      } catch {
        return null;
      }
    },

    setItem: (key: string, value: string): void => {
      try {
        // Store in memory cache
        memoryCache.set(key, value);

        // Store in all available storage mechanisms
        try {
          localStorage.setItem(key, value);
        } catch {
          // localStorage might be full or disabled
        }

        try {
          sessionStorage.setItem(key, value);
        } catch {
          // sessionStorage might be full or disabled
        }

        // Store in cookie for persistence (Brave is less aggressive with cookies)
        if (key.startsWith(PRIMARY_KEY)) {
          setCookie(COOKIE_NAME, value);
        }
      } catch {
        // Ignore storage errors
      }
    },

    removeItem: (key: string): void => {
      try {
        // Remove from all storage layers
        memoryCache.delete(key);
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);

        if (key.startsWith(PRIMARY_KEY)) {
          removeCookie(COOKIE_NAME);
        }
      } catch {
        // Ignore storage errors
      }
    },
  };
};

const supabaseClient = (): SupabaseClient | null => {
  if (isSupabaseApprovedDomain) {
    try {
      return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'sb-auth',
          storage: createResilientStorage(),
        },
      });
    } catch {
      // Ignore errors
    }
  }

  return null;
};

export const supabase = isSupabaseApprovedDomain ? supabaseClient() : (null as unknown as SupabaseClient);
