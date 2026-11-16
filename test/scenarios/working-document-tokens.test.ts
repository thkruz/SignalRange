import { vi } from 'vitest';

vi.mock('draggabilly', () => ({
  default: vi.fn(function () {
    return { on: vi.fn() };
  }),
}));

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: () => ({
      settings: { workingDocument: { title: 'Working Document' } },
      data: {
        id: 'nats-eu-scenario20',
        objectives: [
          {
            id: 'report-the-attack',
            conditions: [
              { type: 'security-event-acknowledged', params: {} },
              {
                type: 'status-check',
                params: {
                  documentSection: 'Report',
                  documentLine: 'Reported {{at:cond:report-the-attack.1|99:98}}; skew seen {{at:obj:spot-the-walk|99:97}}',
                },
              },
            ],
          },
        ],
      },
    }),
  },
}));

import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { EventTimeLedger } from '../../src/scenarios/event-time-ledger';
import { WorkingDocumentManager } from '../../src/scenarios/working-document-manager';
import { SimClock } from '../../src/simulation/sim-clock';

function hhmm(ms: number): string {
  const d = new Date(ms);

  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
}

/**
 * rt-s20-F1: the Report line stamped its fallback (05:30) because QUIZ_PASSED
 * fires before the evaluator records the condition, so the line's own
 * `{{at:cond:<obj>.<n>}}` was empty when it was filled.
 */
describe('WorkingDocumentManager documentLine time tokens', () => {
  beforeEach(() => {
    EventBus.destroy();
    WorkingDocumentManager.reset();
    EventTimeLedger.begin();
    document.body.innerHTML = '<div id="root"><div id="app-shell-page"></div><a class="working-doc-icon"></a></div>';
    WorkingDocumentManager.getInstance().initialize();
  });

  afterEach(() => {
    EventTimeLedger.end();
    WorkingDocumentManager.reset();
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  it('resolves an at:obj token to the recorded time and its own at:cond token to the moment of the pass', () => {
    const spotMs = Date.UTC(2027, 3, 21, 5, 8, 0);
    EventTimeLedger.record('obj:spot-the-walk', spotMs);

    EventBus.getInstance().emit(Events.QUIZ_PASSED, { objectiveId: 'report-the-attack', conditionIndex: 1, attempts: 1, pointsDeducted: 0 });
    WorkingDocumentManager.getInstance().open();

    const text = document.getElementById('draggable-html-box-working-document')?.textContent ?? '';
    expect(text).toContain(`skew seen ${hhmm(spotMs)}`);
    expect(text).toContain(`Reported ${hhmm(SimClock.nowMs())}`);
    expect(text).not.toContain('99:');
  });
});
