import type { CampaignData } from '@app/campaigns/campaign-types';
import { frontlineForwardEurosatSandboxData, frontlineForwardSandboxData, frontlineSandboxData } from './sandbox';
import { frontlineScenarios } from './scenarios';

/**
 * Frontline Signals (Campaign 6). Dev-only while the physical layer is built:
 * the router registers it only when window.DEVELOPER_MODE is on, and the home
 * catalog export leaves it out.
 */
export const frontlineCampaignData: CampaignData = {
  id: 'frontline',
  title: 'Frontline Signals',
  subtitle: 'Field Communications Under Pressure',
  description: `Learn to diagnose field communications at Kivilahti training camp, then join Ola and Irena at the Rautala post. Establish what the equipment can support, distinguish local faults from service limitations, and leave a reliable handover.<br><br>The curriculum spans sixteen scenarios, alongside the physical-layer sandbox.`,
  imageUrl: 'frontline/frontline.png',
  difficulty: 'intermediate',
  totalDuration: '415-575 min',
  campaignType: 'Field Communications',
  headerIdentity: {
    name: 'FRONTLINE',
    nameAccent: 'SIGNALS',
    icon: 'dish',
  },
  chromeVariant: 'standard',
  releaseStage: 'alpha',
  scenarios: [frontlineSandboxData, frontlineForwardSandboxData, frontlineForwardEurosatSandboxData, ...frontlineScenarios],
  isLocked: false,
  isDisabled: false,
};
