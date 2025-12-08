/**
 * Asset URL Helper
 *
 * Provides environment-aware asset URL generation.
 * - Development: Uses local files from public/ directory
 * - Production: Uses R2 CDN URL for large assets
 *
 * Usage:
 *   import { getAssetUrl } from '@app/utils/asset-url';
 *   const audioUrl = getAssetUrl('/assets/campaigns/nats/1/intro.mp3');
 */

import { config } from '@app/config/env';

/**
 * Get the full URL for an asset path.
 * Prepends the PUBLIC_ASSETS_BASE_URL if configured.
 *
 * @param path - Absolute path starting with / (e.g., '/assets/campaigns/nats/1/intro.mp3')
 * @returns Full URL for the asset
 *
 * @example
 * // Development (PUBLIC_ASSETS_BASE_URL = '')
 * getAssetUrl('/assets/campaigns/nats/1/intro.mp3')
 * // Returns: '/assets/campaigns/nats/1/intro.mp3'
 *
 * @example
 * // Production (PUBLIC_ASSETS_BASE_URL = 'https://assets.signalrange.space')
 * getAssetUrl('/assets/campaigns/nats/1/intro.mp3')
 * // Returns: 'https://assets.signalrange.space/assets/campaigns/nats/1/intro.mp3'
 */
export function getAssetUrl(path: string): string {
  // Get base URL from config (empty string in development)
  const baseUrl = config.assets.baseUrl;

  // If no base URL, return path as-is (local development)
  if (!baseUrl) {
    return path;
  }

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Return full URL with base
  return `${baseUrl}${normalizedPath}`;
}
