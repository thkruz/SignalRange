import { vi } from 'vitest';
import type { RFFrontEndCore } from '../../src/equipment/rf-front-end/rf-front-end-core';
import { createRFFrontEnd } from '../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { EventAutoLogger } from '../../src/ops-log/event-auto-logger';
import { OpsLogManager } from '../../src/ops-log/ops-log-manager';

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: () => ({ data: { difficulty: 'beginner' } }),
  },
}));

/**
 * Operator power and level changes the Ops Log used to miss: BUC gain and HPA
 * back-off (nats-r4-s07-F1), LNB and HPA power (nats-r4-s12-F2). The cores
 * report them as EQUIPMENT_ACTION; the EventAutoLogger writes the line.
 */
describe('equipment action log lines (nats-r4-s07-F1, s12-F2)', () => {
  let rf: RFFrontEndCore;

  const messages = () =>
    OpsLogManager.getInstance()
      .getEntries()
      .map((e) => e.message);

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
    EventBus.destroy();
    OpsLogManager.destroy();
    EventAutoLogger.destroy();
    rf = createRFFrontEnd('test-root');
    OpsLogManager.initialize();
    EventAutoLogger.getInstance().initialize();
  });

  afterEach(() => {
    EventAutoLogger.destroy();
    OpsLogManager.destroy();
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  it('logs a BUC gain change with the old and new gain, and nothing when the gain is unchanged', () => {
    rf.bucModule.handleGainChange(50);
    rf.bucModule.handleGainChange(20);
    rf.bucModule.handleGainChange(20);
    rf.bucModule.handleGainChange(23.5);

    const gainLines = messages().filter((m) => m.startsWith('BUC gain'));
    expect(gainLines.slice(-2)).toEqual(['BUC gain set to 20 dB (was 50 dB)', 'BUC gain set to 23.5 dB (was 20 dB)']);
  });

  it('logs an HPA back-off change as applied (clamped)', () => {
    rf.hpaModule.handleBackOffChange(10);
    rf.hpaModule.handleBackOffChange(3);
    rf.hpaModule.handleBackOffChange(3);

    expect(messages().filter((m) => m.startsWith('HPA back-off'))).toContain('HPA back-off set to 3 dB (was 10 dB)');
    expect(messages().filter((m) => m === 'HPA back-off set to 3 dB (was 10 dB)')).toHaveLength(1);
  });

  it('logs LNB power off and on, once per change', () => {
    rf.lnbModule.handlePowerToggle(true);
    rf.lnbModule.handlePowerToggle(false);
    rf.lnbModule.handlePowerToggle(false);
    rf.lnbModule.handlePowerToggle(true);

    expect(
      messages()
        .filter((m) => m.startsWith('LNB Power'))
        .slice(-2)
    ).toEqual(['LNB Power OFF', 'LNB Power ON']);
  });

  it('logs HPA power on only when it takes (the BUC must be powered)', () => {
    rf.hpaModule.handlePowerToggle(false, () => {});
    const before = messages().length;

    rf.bucModule.handlePowerToggle(false);
    rf.hpaModule.handlePowerToggle(true, () => {});
    expect(messages().slice(before)).not.toContain('HPA Power ON');

    rf.bucModule.handlePowerToggle(true);
    rf.hpaModule.handlePowerToggle(true, () => {});
    expect(messages().slice(before)).toContain('HPA Power ON');
  });
});

describe('LNB powered off is a station alarm (nats-r4-s16-F1)', () => {
  it('raises "LNB powered off" on the RX side of the front end, not on the LNB card', () => {
    document.body.innerHTML = '<div id="test-root"></div>';
    const rf = createRFFrontEnd('test-root');
    rf.lnbModule.handlePowerToggle(false);

    expect(rf.getStatusAlarms(2)).toContainEqual({ severity: 'warning', message: 'LNB powered off - no receive path' });
    expect(rf.lnbModule.getAlarms()).toEqual([]);

    rf.lnbModule.handlePowerToggle(true);
    expect(rf.getStatusAlarms(2).map((a) => a.message)).not.toContain('LNB powered off - no receive path');
    document.body.innerHTML = '';
  });
});
