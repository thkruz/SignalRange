/**
 * Environment Configuration
 * 
 * Centralized configuration for environment variables.
 * This module provides a single source of truth for environment-specific settings.
 */

export type Environment = 'production' | 'uat' | 'local';

/**
 * Get the current environment from environment variables.
 * Defaults to 'production' if not specified.
 */
const ENVIRONMENT = (process.env.PUBLIC_ENVIRONMENT ?? 'production') as Environment;

/**
 * Application configuration object.
 * All environment-specific settings should be accessed through this object.
 */
export const config = {
  environment: ENVIRONMENT,

  supabase: {
    url: process.env.PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
  },

  ai: {
    mode: (process.env.PUBLIC_AI_MODE ?? 'cloud') as 'cloud' | 'local' | 'none',
    endpoint: process.env.PUBLIC_AI_ENDPOINT ?? '',
  },

  userApi: {
    url: process.env.PUBLIC_USER_API_URL ?? 'https://user.keeptrack.space',
  },

  assets: {
    baseUrl: process.env.PUBLIC_ASSETS_BASE_URL ?? '',
  },
};

/**
 * Check if the current environment is production
 */
export const isProduction = (): boolean => config.environment === 'production';

/**
 * Check if the current environment is UAT
 */
export const isUAT = (): boolean => config.environment === 'uat';

/**
 * Check if the current environment is local development
 */
export const isLocal = (): boolean => config.environment === 'local';


