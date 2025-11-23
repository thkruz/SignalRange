import { errorManagerInstance } from '@app/engine/utils/errorManager';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase-client';

/**
 * @deprecated Use User interface from types.ts instead
 * This interface is maintained for backward compatibility during migration
 */
export interface UserProfile {
  avatar_url?: string;
  email?: string;
  email_verified?: boolean;
  full_name?: string;
  iss?: string;
  name?: string;
  picture?: string;
  phone_verified?: boolean;
  preferred_username?: string;
  provider_id?: string;
  sub?: string;
  user_name?: string;
  userType?: string;
  country?: string;
  branch?: string;
  rank?: string;
  organization?: string;
  achievements?: number[];
  emailNotifications?: boolean;
}

export class Auth {
  static async initializeAuth(): Promise<User | null> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      errorManagerInstance.error(error, 'Error getting session');

      return null;
    }

    return session?.user || null;
  }

  // Sign up with email/password and optional profile data
  static async signUp(email: string, password: string, profile?: Partial<UserProfile>) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: profile || {}, // This goes into user_metadata
      },
    });

    return { user: data.user, error };
  }

  // Sign in with email/password
  static async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { user: data.user, error };
  }

  // Sign in with OAuth provider (GitHub, Facebook, Google, LinkedIn)
  static signInWithOAuthProvider(
    provider: 'github' | 'facebook' | 'google' | 'linkedin_oidc',
    popupName?: string,
  ): Promise<{ user: User | null; error: Error | null }> {
    return new Promise((resolve, reject) => {
      const name = popupName || `${provider}-signin`;
      // Calculate center position for the popup
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        '',
        name,
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
      );

      if (!popup) {
        reject(new Error('Popup blocked. Please allow popups for this site.'));

        return;
      }

      supabase.auth
        .signInWithOAuth({
          provider,
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
            skipBrowserRedirect: true,
          },
        })
        .then(({ data, error }) => {
          if (error) {
            popup.close();
            reject(error);

            return;
          }
          popup.location.href = data.url;
        });

      const messageHandler = (event: MessageEvent) => {
        if (event.source !== popup) {
          return;
        }

        if (event.data.type === 'SUPABASE_AUTH_SUCCESS') {
          popup.close();
          window.removeEventListener('message', messageHandler);
          resolve({ user: event.data.user, error: null });
        } else if (event.data.type === 'SUPABASE_AUTH_ERROR') {
          popup.close();
          window.removeEventListener('message', messageHandler);
          reject(new Error(event.data.error));
        }
      };

      window.addEventListener('message', messageHandler);

      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          reject(new Error(`${provider} sign-in was cancelled`));
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(checkClosed);
        popup.close();
        window.removeEventListener('message', messageHandler);
        reject(new Error(`${provider} sign-in timed out`));
      }, 300000);
    });
  }

  static async updatePassword(newPassword: string) {
    // Require the password to be at least 6 characters
    if (newPassword.length < 6) {
      errorManagerInstance.warn('Password must be at least 6 characters long');

      return { error: new Error('Password must be at least 6 characters long') };
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      errorManagerInstance.error(error, 'Error updating password');

      return { error };
    }

    return { user: data.user, error: null };
  }

  // Update user metadata (profile data)
  static async updateProfile(updates: Partial<UserProfile>) {
    const { data, error } = await supabase.auth.updateUser({
      data: updates,
    });

    return { user: data.user, error };
  }

  // Sign out
  static async signOut() {
    const { error } = await supabase.auth.signOut();

    return { error };
  }

  // Get current user
  static async getCurrentUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user;
  }

  // Get user profile from metadata
  static async getUserProfile(): Promise<UserProfile | null> {
    const user = await this.getCurrentUser();

    return (user?.user_metadata as UserProfile) || null;
  }

  // Check if user is logged in
  static async isLoggedIn(): Promise<boolean> {
    const user = await this.getCurrentUser();

    return user !== null;
  }

  static async setSession(session: Session | null): Promise<void> {
    if (session) {
      try {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });

        if (sessionError) {
          errorManagerInstance.error(sessionError, 'Error setting session');
        }
      } catch (err) {
        errorManagerInstance.error(err as Error, 'Error setting session');
      }
    }
  }

  // Listen for auth state changes
  static onAuthStateChange(
    callback: (event: AuthChangeEvent, user: User | null, profile: UserProfile | null, accessToken: string | null) => void,
  ) {
    return supabase.auth.onAuthStateChange((event, session) => {
      const accessToken = session?.access_token || null;
      const user = session?.user || null;
      const profile = (user?.user_metadata as UserProfile) || null;

      callback(event, user, profile, accessToken);
    });
  }

  /**
   * Get current access token for API calls
   * Returns null if user is not authenticated
   */
  static async getAccessToken(): Promise<string | null> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      return null;
    }

    return session.access_token;
  }

  /**
   * Get current session
   */
  static async getSession(): Promise<Session | null> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      errorManagerInstance.error(error, 'Error getting session');

      return null;
    }

    return session;
  }

  /**
   * Refresh the current session
   * Useful for ensuring token is fresh before making API calls
   */
  static async refreshSession(): Promise<Session | null> {
    const {
      data: { session },
      error,
    } = await supabase.auth.refreshSession();

    if (error) {
      errorManagerInstance.error(error, 'Error refreshing session');

      return null;
    }

    return session;
  }

  /**
   * Check if current access token is expired or about to expire
   * @param bufferSeconds - Consider token expired if it expires within this many seconds (default 60)
   */
  static async isTokenExpired(bufferSeconds: number = 60): Promise<boolean> {
    const session = await this.getSession();

    if (!session) {
      return true;
    }

    const expiresAt = session.expires_at;

    if (!expiresAt) {
      return false;
    }

    const expiresAtMs = expiresAt * 1000;
    const nowMs = Date.now();
    const bufferMs = bufferSeconds * 1000;

    return expiresAtMs - nowMs < bufferMs;
  }

  /**
   * Get a valid access token, refreshing if necessary
   * This is the preferred method for getting tokens for API calls
   */
  static async getValidAccessToken(): Promise<string | null> {
    const isExpired = await this.isTokenExpired();

    if (isExpired) {
      const session = await this.refreshSession();

      return session?.access_token || null;
    }

    return this.getAccessToken();
  }
}
