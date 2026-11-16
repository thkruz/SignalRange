/**
 * C6 gap package A2: report forms and hypothesis checks in S1-S16 judge typed evidence, not citation counts.
 * Every evidence field is read straight from the authored scenario data, so a form that goes back to
 * "N arbitrary observations" or an answer-key choice list fails here.
 */

import type { FrontlineScenarioData } from '@app/campaigns/frontline/scenario-support';
import { frontlineScenario1Data } from '@app/campaigns/frontline/scenario1';
import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { frontlineScenario3Data } from '@app/campaigns/frontline/scenario3';
import { frontlineScenario4Data } from '@app/campaigns/frontline/scenario4';
import { frontlineScenario5Data } from '@app/campaigns/frontline/scenario5';
import { frontlineScenario6Data } from '@app/campaigns/frontline/scenario6';
import { frontlineScenario7Data } from '@app/campaigns/frontline/scenario7';
import { frontlineScenario8Data } from '@app/campaigns/frontline/scenario8';
import { frontlineScenario9Data } from '@app/campaigns/frontline/scenario9';
import { frontlineScenario10Data } from '@app/campaigns/frontline/scenario10';
import { frontlineScenario11Data } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario12Data } from '@app/campaigns/frontline/scenario12';
import { frontlineScenario13Data } from '@app/campaigns/frontline/scenario13';
import { frontlineScenario14Data } from '@app/campaigns/frontline/scenario14';
import { frontlineScenario15Data } from '@app/campaigns/frontline/scenario15';
import { frontlineScenario16Data } from '@app/campaigns/frontline/scenario16';
import type { EvidenceEntry } from '@app/physical/evidence-log';
import { assessEvidence, type EvidenceGroup, type EvidencePredicate, hypothesisFeedback } from '@app/physical/evidence-predicates';
import type { HandoverFieldConfig } from '@app/physical/field-records';
import { describe, expect, it } from 'vitest';

const frontlineScenarios: FrontlineScenarioData[] = [
  frontlineScenario1Data,
  frontlineScenario2Data,
  frontlineScenario3Data,
  frontlineScenario4Data,
  frontlineScenario5Data,
  frontlineScenario6Data,
  frontlineScenario7Data,
  frontlineScenario8Data,
  frontlineScenario9Data,
  frontlineScenario10Data,
  frontlineScenario11Data,
  frontlineScenario12Data,
  frontlineScenario13Data,
  frontlineScenario14Data,
  frontlineScenario15Data,
  frontlineScenario16Data,
];
const FIRED_AT = 1000;
const ctx = { eventFiredAtS: (_id: string) => FIRED_AT as number | null };

let seq = 0;
/** A notebook entry that satisfies one predicate and nothing more */
function entryFor(p: EvidencePredicate): EvidenceEntry {
  seq += 1;
  const after = p.afterEvent !== undefined || p.afterFirstFix === true;
  const e: EvidenceEntry = {
    id: `ev-${seq}`,
    kind: p.kind ?? 'observation',
    tS: after ? FIRED_AT + 50 : p.beforeEvent !== undefined ? FIRED_AT - 50 : FIRED_AT,
    subject: p.subjectIn?.[0] ?? p.serviceId ?? 'subject',
    source: p.eventId !== undefined ? { eventId: p.eventId } : { sampleId: `s-${seq}` },
    facts: [],
    text: 'entry',
  };
  if (p.serviceId !== undefined || p.layer !== undefined || p.metric !== undefined || p.valueIn !== undefined) {
    e.sample = {
      serviceId: p.serviceId ?? 'svc',
      layer: p.layer ?? 'application',
      metric: p.metric ?? 'status',
      value: p.valueIn?.[0] ?? 'up',
      unit: 'state',
      provenance: 'probe',
    } as EvidenceEntry['sample'];
  }
  if (p.verbIn) e.verb = p.verbIn[0];
  if (p.effective === true) e.effective = true;
  if (p.negative === true) e.positive = false;

  return e;
}

/** The first matching entry for each group id plus a repair so "after the first fix" can hold */
const fillFor = (groups: EvidenceGroup[], pick: (g: EvidenceGroup) => EvidencePredicate): EvidenceEntry[] =>
  groups.flatMap((g) => Array.from({ length: g.min ?? 1 }, () => entryFor(pick(g))));

const evidenceFields = (data: FrontlineScenarioData): Array<{ form: string; field: HandoverFieldConfig; groups: EvidenceGroup[] }> =>
  (data.settings?.physicalPlant?.handovers ?? []).flatMap((form) =>
    form.fields.flatMap((field) => ('evidence' in field.rule ? [{ form: form.id, field, groups: field.rule.evidence }] : []))
  );

const distractor = (): EvidenceEntry => {
  seq += 1;

  return { id: `noise-${seq}`, kind: 'observation', tS: FIRED_AT + 10, subject: 'service-path', source: {}, facts: [], text: 'marked the path', verb: 'diagram-select' };
};

describe('C6 A2: typed evidence in the report forms', () => {
  frontlineScenarios.forEach((data, i) => {
    const name = `S${i + 1}`;
    const fields = evidenceFields(data);

    it(`${name}: no evidence field is a bare citation count`, () => {
      const counted = (data.settings?.physicalPlant?.handovers ?? []).flatMap((f) => f.fields.filter((x) => 'cites' in x.rule && x.rule.cites !== undefined));
      // S15 and S16 keep their action/observation fields typed too; nothing may fall back to a count
      expect(counted.map((c) => c.key)).toEqual([]);
    });

    it(`${name}: every choice field lists more than its accepted answers`, () => {
      const choices = (data.settings?.physicalPlant?.handovers ?? []).flatMap((f) =>
        f.fields.filter((x) => 'choice' in x.rule).map((x) => ({ form: f.id, key: x.key, rule: x.rule as { choice: string[]; accept?: string[] } }))
      );
      for (const c of choices) {
        const accepted = c.rule.accept ?? c.rule.choice;
        expect(c.rule.choice.length, `${c.form}.${c.key} offers only its answer`).toBeGreaterThan(accepted.length);
      }
    });

    it(`${name}: irrelevant citations are rejected and the group's own evidence is accepted`, () => {
      for (const { form, field, groups } of fields) {
        const label = `${form}.${field.key}`;
        const noise = [distractor(), distractor(), distractor(), distractor()];
        const rejected = assessEvidence(
          noise.map((n) => n.id),
          groups,
          noise,
          ctx
        );
        expect(rejected.ok, `${label} accepted unrelated entries`).toBe(false);
        const mine = fillFor(groups, (g) => g.match);
        const accepted = assessEvidence(
          mine.map((n) => n.id),
          groups,
          [...mine, ...noise],
          ctx
        );
        expect(accepted.ok, `${label} rejected its own evidence: ${accepted.missing.join('; ')}`).toBe(true);
      }
    });

    it(`${name}: every alternate route fills its group on its own`, () => {
      for (const { form, field, groups } of fields) {
        for (const g of groups.filter((x) => x.orMatch?.length)) {
          for (const alt of g.orMatch ?? []) {
            const others = fillFor(
              groups.filter((x) => x !== g),
              (x) => x.match
            );
            const via = Array.from({ length: g.min ?? 1 }, () => entryFor(alt));
            const all = [...others, ...via];
            const v = assessEvidence(
              all.map((n) => n.id),
              groups,
              all,
              ctx
            );
            expect(v.ok, `${form}.${field.key} group ${g.id} rejected an alternate route: ${v.missing.join('; ')}`).toBe(true);
          }
        }
      }
    });
  });

  it('S1 to S16 together carry typed evidence fields and alternate routes', () => {
    const all = frontlineScenarios.flatMap((d) => evidenceFields(d));
    expect(all.length).toBeGreaterThan(25);
    expect(all.flatMap((f) => f.groups).filter((g) => g.orMatch?.length).length).toBeGreaterThanOrEqual(6);
  });
});

describe('C6 A2: the notebook tells the player when a saved hypothesis does not hold up', () => {
  const specs = [{ causes: ['connector-moisture'], minCited: 2, targets: ['skylink'] }];
  const e1 = entryFor({ serviceId: 'skylink', layer: 'registration', valueIn: ['down'] });
  const e2 = entryFor({ serviceId: 'skylink', layer: 'local', valueIn: ['up'] });
  const base = { claim: { scope: 'segment', targetId: 'skylink', cause: 'connector-moisture' }, citedEntryIds: [e1.id, e2.id] };

  it('says nothing when it holds up, when no cause was chosen and when the scenario authored no specs', () => {
    expect(hypothesisFeedback(base, specs, [e1, e2], ctx)).toBeNull();
    expect(hypothesisFeedback({ ...base, claim: { scope: 'segment', targetId: 'skylink' } }, specs, [e1, e2], ctx)).toBeNull();
    expect(hypothesisFeedback({ ...base, citedEntryIds: [] }, [], [e1, e2], ctx)).toBeNull();
  });

  it('gives the reason for an under-cited, mis-targeted or unsupported hypothesis', () => {
    expect(hypothesisFeedback({ ...base, citedEntryIds: [e1.id] }, specs, [e1, e2], ctx)).toContain('Too few');
    expect(hypothesisFeedback({ ...base, claim: { ...base.claim, targetId: 'router' } }, specs, [e1, e2], ctx)).toContain('wrong target');
    expect(hypothesisFeedback({ ...base, claim: { ...base.claim, cause: 'router' } }, specs, [e1, e2], ctx)).toContain('cause');
  });
});
