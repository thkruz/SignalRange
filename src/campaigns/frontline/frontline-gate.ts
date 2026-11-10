/**
 * @file frontline-gate - Who may see Campaign 6 (Frontline Signals)
 * @description The campaign is public as an alpha (releaseStage 'alpha' badges it).
 * FRONTLINE_PUBLIC switches it back to developer-only: `window.DEVELOPER_MODE`, a
 * whitelisted signed-in user (DevMenuService, which can flip after auth resolves)
 * or the local dev server. Registration is idempotent, so the router can call it
 * at start-up and again when the developer flag flips.
 */

import { CampaignManager } from '@app/campaigns/campaign-manager';
import { DevMenuService } from '@app/dev-menu/dev-menu-service';
import { SCENARIOS } from '@app/scenario-manager';
import { frontlineCampaignData } from './campaign-data';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** True on the local dev server (development build served from this machine) */
export function isLocalDevServer(): boolean {
  return process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && LOCAL_HOSTS.has(window.location.hostname);
}

/** Campaign 6 is open to every player as an alpha (2026-11-09); false restores the developer-only gate */
export const FRONTLINE_PUBLIC = true;

export function isFrontlineAllowed(): boolean {
  return FRONTLINE_PUBLIC || isLocalDevServer() || window.DEVELOPER_MODE === true || DevMenuService.getInstance().isDev();
}

/** Register the campaign and its scenarios once, when the viewer is allowed to see them */
export function registerFrontlineIfAllowed(): boolean {
  if (!isFrontlineAllowed()) {
    return false;
  }
  const campaigns = CampaignManager.getInstance();
  if (!campaigns.getCampaign(frontlineCampaignData.id)) {
    campaigns.registerCampaign(frontlineCampaignData);
  }
  for (const scenario of frontlineCampaignData.scenarios ?? []) {
    if (!SCENARIOS.some((s) => s.id === scenario.id)) {
      SCENARIOS.push(scenario);
    }
  }

  return true;
}

/** Register now, and again if the developer flag flips on after sign-in resolves */
export function watchFrontlineGate(onRegistered?: () => void): void {
  registerFrontlineIfAllowed();
  DevMenuService.getInstance().onChange((isDev) => {
    if (isDev && registerFrontlineIfAllowed()) {
      onRegistered?.();
    }
  });
}
