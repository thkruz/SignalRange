# User Account System for SignalRange

This directory contains the user account and authentication system for SignalRange, based on the KeepTrack user account system. SignalRange shares the same Supabase backend with KeepTrack, allowing users to have a unified account across both applications.

## Features

- **OAuth Authentication**: Sign in with Google, GitHub, LinkedIn, or Facebook
- **User Profiles**: Store user information and preferences
- **Shared Backend**: Uses the same Supabase instance as KeepTrack
- **Secure Session Management**: Multi-layer storage with fallback for privacy-focused browsers
- **Modal-Based UI**: Login and profile modals with draggable interface

## Setup

### 1. Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

Then fill in your Supabase credentials:

```env
PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PUBLIC_USER_API_URL=https://user.keeptrack.space
```

Get these values from the [Supabase Dashboard](https://app.supabase.com/project/_/settings/api).

### 2. Webpack Configuration

The webpack configuration has been updated to:
- Handle environment variables via `webpack.DefinePlugin`
- Build the OAuth callback handler as a separate entry point
- Copy the callback HTML to the dist folder

### 3. Domain Approval

The authentication system only activates on approved domains:
- `localhost` (for development)
- `*.signalrange.space`
- `*.keeptrack.space`

This is configured in [supabase-client.ts](./supabase-client.ts#L7-L10).

## Architecture

### Files

- **types.ts**: TypeScript type definitions for user data structures
- **supabase-client.ts**: Supabase client initialization with resilient storage
- **auth.ts**: Authentication service (sign in, sign out, OAuth, etc.)
- **user-data-service.ts**: API service for user data operations
- **user-data-service-error.ts**: Custom error class for API errors
- **modal-login.ts**: Login modal component
- **modal-profile.ts**: User profile modal component
- **popup-callback.ts**: OAuth callback handler
- **user-account.css**: Styles for user account components

### Integration

The user account system is integrated into the Header component ([header.ts](../pages/layout/header/header.ts)):

```typescript
import { Auth } from "@app/user-account/auth";
import { ModalLogin } from "@app/user-account/modal-login";
import { ModalProfile } from "@app/user-account/modal-profile";
```

The header displays:
- A login button (user icon) when not authenticated
- A profile button (user initials) when authenticated

### OAuth Flow

1. User clicks OAuth provider button (Google, GitHub, etc.)
2. Popup window opens with provider's login page
3. After authentication, provider redirects to `/auth/callback`
4. Callback handler processes the OAuth response
5. Session is saved to local storage, session storage, and cookies
6. User is logged in and modal closes

### Data Storage

The system uses a multi-layer storage approach for resilience:
1. **Memory cache** (fastest, lost on page refresh)
2. **localStorage** (persistent across sessions)
3. **sessionStorage** (lasts for browser session)
4. **Cookies** (most resistant to privacy browser clearing)

This ensures the session persists even in privacy-focused browsers like Brave.

## API Integration

SignalRange uses the shared KeepTrack user API server for backend operations:

- **Base URL**: `https://user.keeptrack.space`
- **Authentication**: Bearer token (Supabase JWT)
- **Endpoints**: See [KeepTrack API docs](../../docs/user-account/ARCHITECTURE.md)

## Development

### Testing Locally

1. Start the dev server:
```bash
npm run dev
```

2. Navigate to `http://localhost:3000`

3. Click the user icon in the header

4. Test OAuth login (opens in popup)

### Adding New OAuth Providers

To add a new OAuth provider:

1. Configure the provider in Supabase Dashboard
2. Add provider to `oauthButtons` array in [modal-login.ts](./modal-login.ts#L32-L46)
3. Add provider styles to [user-account.css](./user-account.css)

### Customizing User Data

SignalRange uses simplified user data compared to KeepTrack:

- **Preferences**: Sound, theme, units, etc.
- **Progress**: Completed scenarios, scores
- **Data**: Last played scenario, favorites

See [types.ts](./types.ts) for the full data structures.

## Troubleshooting

### "User not authenticated" error

- Check that environment variables are set correctly
- Verify Supabase URL and anon key
- Check browser console for auth errors

### OAuth popup blocked

- Allow popups for localhost/your domain
- Check browser popup settings

### Session not persisting

- Check localStorage/sessionStorage in browser dev tools
- Verify cookies are enabled
- Try clearing browser cache

## Future Enhancements

- Email/password authentication (currently disabled)
- Achievement system integration
- Leaderboards and social features
- Multi-tab session sync
- Offline support

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [KeepTrack User Account Architecture](../../docs/user-account/ARCHITECTURE.md)
- [OAuth 2.0 Flow](https://oauth.net/2/)
