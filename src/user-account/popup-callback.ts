/* eslint-disable camelcase */
/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-client';

// Create isolated Supabase client for popup that won't trigger navigation
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: true, // Let Supabase detect and process the OAuth callback
    flowType: 'implicit', // Use implicit flow for popup-based OAuth
    storage: undefined, // Don't use any storage in popup
  },
});

const handleAuthCallback = async () => {
  try {
    console.log('Current URL:', window.location.href);
    console.log('Hash:', window.location.hash);
    console.log('Search:', window.location.search);

    // Give Supabase a moment to process the OAuth callback automatically
    // With detectSessionInUrl: true, Supabase will parse the hash/query params
    await new Promise(resolve => setTimeout(resolve, 100));

    // Now get the session that Supabase created
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
      console.log('Auth successful:', data.session.user);
      window.opener?.postMessage({
        type: 'SUPABASE_AUTH_SUCCESS',
        user: data.session.user,
        session: data.session,
      }, window.location.origin);
      window.close();
      return;
    }

    // If still no session, there might be an error in the URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const errorParam = hashParams.get('error') || queryParams.get('error');
    const errorDescription = hashParams.get('error_description') || queryParams.get('error_description');

    if (errorParam) {
      console.error('OAuth error:', errorParam, errorDescription);
      window.opener?.postMessage({
        type: 'SUPABASE_AUTH_ERROR',
        error: errorDescription || errorParam,
      }, window.location.origin);
      window.close();
      return;
    }

    // No session and no error - unexpected state
    console.error('No session created and no error found');
    window.opener?.postMessage({
      type: 'SUPABASE_AUTH_ERROR',
      error: 'Authentication did not complete successfully',
    }, window.location.origin);
    window.close();

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
