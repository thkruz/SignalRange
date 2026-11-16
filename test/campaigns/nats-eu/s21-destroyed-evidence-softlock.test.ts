/**
 * A decision that destroys an audit entry (destroyEvidence) removes the entry
 * and its acknowledgement (SecurityConsoleCore.removeEvent), and a removed entry
 * can never be acknowledged again. So no condition in a later objective may wait
 * on acknowledging that entry, or a player who picked Zeroize in call-the-knock
 * is soft-locked at retain-the-evidence (unit-log-reread).
 */

import { natsEuScenario21Data } from '@app/campaigns/nats-eu/scenario21';
import { describe, expect, it } from 'vitest';

describe('S21 destroyed evidence does not soft-lock later objectives', () => {
  const objectives = natsEuScenario21Data.objectives;

  it('no objective other than the destroying one waits on acknowledging a destroyable entry', () => {
    const destroyers = new Map<string, Set<string>>();
    for (const objective of objectives) {
      for (const condition of objective.conditions ?? []) {
        for (const option of condition.params?.decisionOptions ?? []) {
          const id = option.consequence?.destroyEvidence?.auditEventId;
          if (id) {
            if (!destroyers.has(id)) destroyers.set(id, new Set());
            destroyers.get(id)!.add(objective.id);
          }
        }
      }
    }
    expect(destroyers.has('evt-kg-replay-log')).toBe(true);

    const offenders: string[] = [];
    for (const objective of objectives) {
      for (const condition of objective.conditions ?? []) {
        const eventId = condition.params?.eventId;
        if (condition.type === 'security-event-acknowledged' && eventId && destroyers.has(eventId) && !destroyers.get(eventId)!.has(objective.id)) {
          offenders.push(`${objective.id}:${condition.id ?? condition.description}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('unit-log-reread is an observation of the Security console, which survives the log being cleared', () => {
    const reread = objectives.find((o) => o.id === 'retain-the-evidence')!.conditions!.find((c) => c.id === 'unit-log-reread')!;
    expect(reread.type).toBe('audit-log-reviewed');
    expect(reread.params).toMatchObject({ requiresObservation: true, observationTab: 'security-console' });
  });
});
