import type { CampaignData } from '../campaign-types';
import { scenario1Data } from './scenario1';
import { scenario2Data } from './scenario2';
import { scenario3Data } from './scenario3';

/**
 * NATS Campaign: North Atlantic Teleport Services
 *
 * A beginner-friendly campaign introducing students to commercial satellite
 * ground station operations. Follow the story of bringing MARINER-1 and other
 * GEO communications satellites into operational service from a ground facility
 * in rural Vermont.
 */
export const natsCampaignData: CampaignData = {
  id: 'nats',
  title: 'North Atlantic Teleport Services',
  subtitle: 'Commercial Ground Station Operations',
  description: `Welcome to North Atlantic Teleport Services, a commercial satellite ground station facility in rural Vermont. In this campaign, you'll learn the fundamentals of satellite communications by conducting first light tests, tracking satellites, and establishing reliable RF links for GEO communication satellites serving the North Atlantic region.<br><br>Through a series of progressively challenging scenarios, you'll master ground station equipment operation, signal acquisition techniques, and RF link analysis while following the story of bringing multiple communication satellites into operational service.`,
  imageUrl: 'nats/north-atlantic-teleport-services.png',
  difficulty: 'beginner',
  totalDuration: '105-130 min',
  campaignType: 'Commercial Communications',
  scenarios: [
    scenario1Data,
    scenario2Data,
    scenario3Data,
  ],
  isLocked: false,
  isDisabled: false,
};
