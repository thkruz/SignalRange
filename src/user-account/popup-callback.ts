/* eslint-disable camelcase */
/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-client';

// Create isolated Supabase client for popup that won't trigger navigation
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storage: undefined, // Don't use any storage in popup
  },
});

const handleAuthCallback = async () => {
  try {
    console.log('Current URL:', window.location.href);
    console.log('Hash:', window.location.hash);
    console.log('Search:', window.location.search);

    /*
     * Let Supabase automatically handle the OAuth callback
     * This will process the hash parameters and create a session
     */
    const { data, error } = await supabase.auth.getSession();

    console.log('Session data:', data);
    console.log('Session error:', error);

    if (error) {
      console.error('Session error:', error);
      window.opener?.postMessage({
        type: 'SUPABASE_AUTH_ERROR',
        error: error.message,
      }, window.location.origin);
      window.close();

      return;
    }

    if (data.session?.user) {
      console.log('Auth successful:', data.session);
      window.opener?.postMessage({
        type: 'SUPABASE_AUTH_SUCCESS',
        user: data.session.user,
        session: data.session,
      }, window.location.origin);
      window.close();

      return;
    }

    // If no session yet, check if we have OAuth hash parameters
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const expiresIn = hashParams.get('expires_in');
    const tokenType = hashParams.get('token_type');
    const errorParam = hashParams.get('error');
    const errorDescription = hashParams.get('error_description');

    console.log('OAuth params:', { accessToken, refreshToken, expiresIn, tokenType, errorParam });

    if (errorParam) {
      console.error('OAuth error:', errorParam, errorDescription);
      window.opener?.postMessage({
        type: 'SUPABASE_AUTH_ERROR',
        error: errorDescription || errorParam,
      }, window.location.origin);
      window.close();

      return;
    }

    if (accessToken) {
      // We have OAuth tokens, set the session manually
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || '',
      });

      console.log('Set session result:', sessionData, sessionError);

      if (sessionError) {
        console.error('Set session error:', sessionError);
        window.opener?.postMessage({
          type: 'SUPABASE_AUTH_ERROR',
          error: sessionError.message,
        }, window.location.origin);
      } else if (sessionData.session?.user) {
        console.log('Session set successfully:', sessionData.session.user);
        window.opener?.postMessage({
          type: 'SUPABASE_AUTH_SUCCESS',
          user: sessionData.session.user,
        }, window.location.origin);
      } else {
        console.error('Session set but no user found');
        window.opener?.postMessage({
          type: 'SUPABASE_AUTH_ERROR',
          error: 'Authentication succeeded but no user data received',
        }, window.location.origin);
      }

      window.close();
    } else {
      // No OAuth parameters and no session - might still be loading
      console.log('No OAuth parameters found, retrying in 1 second...');
      setTimeout(handleAuthCallback, 1000);
    }

  } catch (err) {
    console.error('Auth callback error:', err);
    window.opener?.postMessage({
      type: 'SUPABASE_AUTH_ERROR',
      error: `Authentication failed: ${(err as Error).message}`,
    }, window.location.origin);
    window.close();
  }
};

// Wait a moment for the page to fully load, then start
setTimeout(() => {
  console.log('Starting auth callback handler...');
  handleAuthCallback();
}, 100);
