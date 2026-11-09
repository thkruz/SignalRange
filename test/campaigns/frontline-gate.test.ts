import { CampaignManager } from '@app/campaigns/campaign-manager';
import { isFrontlineAllowed, registerFrontlineIfAllowed } from '@app/campaigns/frontline/frontline-gate';
import { SCENARIOS } from '@app/scenario-manager';
import { afterEach, describe, expect, it } from 'vitest';

const inScenarios = () => SCENARIOS.some((s) => s.id === 'frontline-sandbox');

afterEach(() => {
  window.DEVELOPER_MODE = false;
  for (let index = SCENARIOS.length - 1; index >= 0; index--) {
    if (SCENARIOS[index].id.startsWith('frontline-')) {
      SCENARIOS.splice(index, 1);
    }
  }
});

describe('Frontline gate', () => {
  it('registers nothing for a non-developer in a test (production-like) build', () => {
    window.DEVELOPER_MODE = false;

    expect(isFrontlineAllowed()).toBe(false);
    expect(registerFrontlineIfAllowed()).toBe(false);
    expect(inScenarios()).toBe(false);
  });

  it('registers the scenarios once the developer flag is on, and is idempotent', () => {
    window.DEVELOPER_MODE = true;

    expect(registerFrontlineIfAllowed()).toBe(true);
    expect(registerFrontlineIfAllowed()).toBe(true);
    expect(inScenarios()).toBe(true);
    expect(SCENARIOS.filter((s) => s.id === 'frontline-sandbox')).toHaveLength(1);
    expect(SCENARIOS.filter((s) => s.id.startsWith('frontline-scenario'))).toHaveLength(16);
    expect(SCENARIOS.filter((s) => s.id.startsWith('frontline-scenario')).every((s) => s.isDisabled)).toBe(true);
    expect(CampaignManager.getInstance().getCampaign('frontline')).toBeDefined();
  });
});
