import type { CampaignData } from '@app/campaigns/campaign-types';
import { frontlineSandboxData } from './sandbox';

/**
 * Frontline Signals (Campaign 6). Dev-only while the physical layer is built:
 * the router registers it only when window.DEVELOPER_MODE is on, and the home
 * catalog export leaves it out.
 */
export const frontlineCampaignData: CampaignData = {
  id: 'frontline',
  title: 'Frontline Signals',
  subtitle: 'Field Communications Under Pressure',
  description: `A small team keeps a field training post online with whatever the supply truck brought: a generator, a battery, a SpaceY terminal and a Ku VSAT.<br><br>This early build holds the physical-layer sandbox only. Find the loose connector, the crushed cable and the dead brick before the link does.`,
  imageUrl: 'frontline/frontline.png',
  difficulty: 'intermediate',
  totalDuration: '0 min',
  campaignType: 'Field Communications',
  headerIdentity: {
    name: 'FRONTLINE',
    nameAccent: 'SIGNALS',
    icon: 'dish',
  },
  chromeVariant: 'standard',
  releaseStage: 'alpha',
  scenarios: [frontlineSandboxData],
  isLocked: false,
  isDisabled: false,
};
