/**
 * Range Watch constellation sandboxes: both scenarios are registered, reachable
 * from the campaign list, wired to real TLE sets and structurally valid.
 */

import { CampaignManager } from '@app/campaigns/campaign-manager';
import { rangeWatchCampaignData } from '@app/campaigns/constellation-sandbox/campaign-data';
import { geoSurveyData } from '@app/campaigns/constellation-sandbox/geo-survey';
import { cedarMesaGroundStation, highDesertGroundStation } from '@app/campaigns/constellation-sandbox/ground-stations';
import { KU_SAT_NORAD, kuSat1 } from '@app/campaigns/constellation-sandbox/satellites';
import { starlinkSandboxData } from '@app/campaigns/constellation-sandbox/starlink-sandbox';
import { SCENARIOS } from '@app/scenario-manager';
import { describe, expect, it } from 'vitest';

const BANNED = ['honestly', 'frankly', 'crucial', 'pivotal', 'trade-off', 'load-bearing', 'landed', 'underscores', 'friction', 'worth noting'];
const scenarios = [starlinkSandboxData, geoSurveyData];

describe('range watch: wiring', () => {
  it('registers a campaign with two unlocked sandboxes and no missions', () => {
    expect(rangeWatchCampaignData.isLocked).toBe(false);
    expect(rangeWatchCampaignData.scenarios.map((s) => s.id)).toEqual(['starlink-interference', 'geo-belt-survey']);
    for (const s of scenarios) {
      expect(s.missionType).toBe('Sandbox');
      expect(s.number).toBe(0);
      expect(s.duration).toBe('Unlimited');
      expect(s.prerequisiteScenarioIds ?? []).toEqual([]);
      expect(SCENARIOS.filter((x) => x.id === s.id)).toHaveLength(1);
    }
  });

  it('the campaign manager can resolve it', () => {
    const cm = CampaignManager.getInstance();

    cm.registerCampaign(rangeWatchCampaignData);
    expect(cm.getCampaign('range-watch')?.scenarios).toHaveLength(2);
  });

  it('each scenario url sits under the campaign id', () => {
    for (const s of scenarios) expect(s.url).toBe(`range-watch/scenarios/${s.id}`);
  });
});

describe('range watch: constellations', () => {
  it('starlink loads the full set, not operated', () => {
    const refs = starlinkSandboxData.settings.constellations ?? [];

    expect(refs).toHaveLength(1);
    expect(refs[0].tleSet).toBe('starlink-2026-11');
    expect(refs[0].operated).toBeFalsy();
    expect(starlinkSandboxData.settings.satellites).toHaveLength(1);
  });

  it('survey loads GEO payloads only, not operated', () => {
    const refs = geoSurveyData.settings.constellations ?? [];

    expect(refs).toHaveLength(1);
    expect(refs[0].tleSet).toBe('geo-belt-2026-11');
    expect(refs[0].include?.groups).toEqual(['geo-payload']);
    expect(refs[0].operated).toBeFalsy();
  });
});

describe('range watch: authored geometry and RF', () => {
  it('KU-SAT 1 has four V-pol Ku carriers inside the analyzer window', () => {
    const tps = (kuSat1 as unknown as { transponders?: Array<{ beacon: { frequency: number; polarization: string } }> }).transponders ?? [];
    const station = cedarMesaGroundStation as unknown as { spectrumAnalyzers: Array<{ centerFrequency: number; span: number }> };
    const { centerFrequency, span } = station.spectrumAnalyzers[0];

    expect(kuSat1.noradId).toBe(KU_SAT_NORAD);
    expect(tps.length).toBe(4);
    for (const tp of tps) {
      const ifHz = 13100e6 - tp.beacon.frequency;

      expect(tp.beacon.polarization).toBe('V');
      expect(Math.abs(ifHz - centerFrequency)).toBeLessThan(span / 2);
    }
  });

  it('stations are distinct objects with their own antenna state and V-pol receive', () => {
    expect(cedarMesaGroundStation.antennasState).not.toBe(highDesertGroundStation.antennasState);
    for (const gs of [cedarMesaGroundStation, highDesertGroundStation]) {
      const fe = (gs as unknown as { rfFrontEnds: Array<{ omt: { rxPolarization: string }; lnb: { loFrequency: number } }> }).rfFrontEnds[0];

      expect(fe.omt.rxPolarization).toBe('V');
      expect(fe.lnb.loFrequency).toBe(13100);
    }
  });

  it('survey modem IF matches the first V-pol GEO template Ku carrier (11800 MHz)', () => {
    const rx = (highDesertGroundStation as unknown as { receivers: Array<{ modems: Array<{ frequency: number }> }> }).receivers[0].modems[0];

    expect(13100 - rx.frequency).toBe(11800);
  });
});

describe('range watch: objectives', () => {
  for (const s of scenarios) {
    describe(s.id, () => {
      const ids = s.objectives.map((o) => o.id);

      it('has unique ids, valid prerequisites and a World Map first objective', () => {
        expect(new Set(ids).size).toBe(ids.length);
        for (const o of s.objectives) {
          for (const p of o.prerequisiteObjectiveIds ?? []) expect(ids).toContain(p);
          expect(o.conditions.length).toBeGreaterThan(0);
        }
        expect(s.objectives[0].prerequisiteObjectiveIds ?? []).toEqual([]);
        expect(s.objectives[0].conditions[0].type).toBe('tab-active');
        expect((s.objectives[0].conditions[0].params as { tab: string }).tab).toBe('ground-track');
      });

      it('references only its own ground station and uses plain wording', () => {
        const gsId = (s.settings.groundStations?.[0] as { id: string } | undefined)?.id ?? '';
        const text = JSON.stringify(s, (_k, v) => (typeof v === 'function' ? '' : v)).toLowerCase();

        for (const o of s.objectives) expect(o.groundStation).toBe(gsId);
        for (const w of BANNED) expect(text).not.toContain(w);
      });

      it('status-check answers are in range', () => {
        for (const o of s.objectives) {
          for (const c of o.conditions) {
            if (c.type !== 'status-check') continue;
            const p = c.params as { options: string[]; correctIndex: number };

            expect(p.correctIndex).toBeGreaterThanOrEqual(0);
            expect(p.correctIndex).toBeLessThan(p.options.length);
          }
        }
      });
    });
  }
});
