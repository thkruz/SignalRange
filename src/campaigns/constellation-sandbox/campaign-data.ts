import type { CampaignData } from '../campaign-types';
import { geoSurveyData } from './geo-survey';
import { starlinkSandboxData } from './starlink-sandbox';

/**
 * Range Watch: open-play constellation sandboxes. No missions, no progression,
 * nothing locked. Each scenario loads a real two-line-element set (Starlink or the
 * GEO belt) and lets the player explore.
 */
export const rangeWatchCampaignData: CampaignData = {
  id: 'range-watch',
  title: 'Range Watch',
  subtitle: 'Constellation Sandboxes',
  description:
    'Open-play scenarios with real satellite catalogs. Watch Starlink cross a GEO link, or survey the geostationary belt from a ground station. No objectives to fail and no timer.',
  imageUrl: 'range-watch/range-watch.png',
  difficulty: 'intermediate',
  totalDuration: 'Unlimited',
  campaignType: 'Sandbox',
  headerIdentity: {
    name: 'RANGE',
    nameAccent: 'WATCH',
    icon: 'dish',
  },
  chromeVariant: 'astro',
  releaseStage: 'alpha',
  scenarios: [starlinkSandboxData, geoSurveyData],
  isLocked: false,
  isDisabled: false,
};
