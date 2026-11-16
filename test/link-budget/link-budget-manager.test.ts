/**
 * Phase 19.3 link-budget worksheet math: the uplink half, the composite
 * (C/N)^-1 = (C/N_up)^-1 + (C/N_down)^-1 + (C/IM)^-1, and backward-compatible
 * grading of downlink-only worksheets.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { natsEuSandboxData } from '../../src/campaigns/nats-eu/sandbox';
import { EventBus } from '../../src/events/event-bus';
import { type LinkBudgetInputs, LinkBudgetManager, type UplinkBudgetInputs } from '../../src/link-budget/link-budget-manager';
import { ScenarioManager } from '../../src/scenario-manager';

const downlink: LinkBudgetInputs = { eirpDbm: 50, fsplDb: 180.7, rxGainDbi: 44.5, systemNoiseTempK: 120, bandwidthHz: 36e6, miscLossDb: 2 };
const uplink: UplinkBudgetInputs = { uplinkEirpDbw: 70, uplinkFsplDb: 200, satGOverTDbK: 0, bandwidthHz: 36e6 };

beforeEach(() => {
  ScenarioManager.getInstance().settings = natsEuSandboxData.settings;
});

afterEach(() => {
  LinkBudgetManager.destroy();
  EventBus.destroy();
});

describe('LinkBudgetManager.combineCnDb', () => {
  it('matches the textbook two-hop result: 20 dB up and 15 dB down give 13.81 dB', () => {
    expect(LinkBudgetManager.combineCnDb(20, 15)).toBeCloseTo(13.81, 2);
  });

  it('two equal terms lose 3.01 dB and the order does not matter', () => {
    expect(LinkBudgetManager.combineCnDb(15, 15)).toBeCloseTo(15 - 3.0103, 3);
    expect(LinkBudgetManager.combineCnDb(15, 20, 25)).toBeCloseTo(LinkBudgetManager.combineCnDb(25, 15, 20), 9);
  });

  it('treats +Infinity as an absent impairment and -Infinity as a dead link', () => {
    expect(LinkBudgetManager.combineCnDb(15, Number.POSITIVE_INFINITY)).toBeCloseTo(15, 9);
    expect(LinkBudgetManager.combineCnDb()).toBe(Number.POSITIVE_INFINITY);
    expect(LinkBudgetManager.combineCnDb(15, Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('LinkBudgetManager.computeUplinkCNRDb', () => {
  it('C/N_up = EIRP - FSPL + G/T + 228.6 - 10log10(B)', () => {
    // 70 - 200 + 0 + 228.60 - 75.56 = 23.04 dB
    expect(LinkBudgetManager.computeUplinkCNRDb(uplink)).toBeCloseTo(23.04, 2);
  });

  it('extra uplink loss and a better G/T move it dB for dB', () => {
    const base = LinkBudgetManager.computeUplinkCNRDb(uplink);

    expect(LinkBudgetManager.computeUplinkCNRDb({ ...uplink, miscLossDb: 2 })).toBeCloseTo(base - 2, 9);
    expect(LinkBudgetManager.computeUplinkCNRDb({ ...uplink, satGOverTDbK: 3 })).toBeCloseTo(base + 3, 9);
  });

  it('agrees with the downlink Friis budget for the same hop (G/T form vs gain + Tsys form)', () => {
    // RX gain 44.5 dBi at 120 K is G/T = 44.5 - 10log10(120) dB/K; EIRP 50 dBm = 20 dBW
    const viaGt = LinkBudgetManager.computeUplinkCNRDb({
      uplinkEirpDbw: 20,
      uplinkFsplDb: 180.7,
      satGOverTDbK: 44.5 - 10 * Math.log10(120),
      bandwidthHz: 36e6,
      miscLossDb: 2,
    });

    expect(viaGt).toBeCloseTo(LinkBudgetManager.computeCNRDb(downlink), 9);
  });
});

describe('LinkBudgetManager composite grading', () => {
  it('computeCompositeCNRDb folds in the uplink, the downlink and C/IM', () => {
    const r = LinkBudgetManager.computeCompositeCNRDb(downlink, { ...uplink, carrierToImDb: 20 });

    expect(r.downlinkCNRDb).toBeCloseTo(LinkBudgetManager.computeCNRDb(downlink), 9);
    expect(r.uplinkCNRDb).toBeCloseTo(LinkBudgetManager.computeUplinkCNRDb(uplink), 9);
    expect(r.compositeCNRDb).toBeCloseTo(LinkBudgetManager.combineCnDb(r.uplinkCNRDb, r.downlinkCNRDb, 20), 9);
    expect(r.compositeCNRDb).toBeLessThan(Math.min(r.uplinkCNRDb, r.downlinkCNRDb, 20));
  });

  it('a downlink-only worksheet grades exactly as before (no uplink terms)', () => {
    const mgr = LinkBudgetManager.getInstance();
    const cnr = mgr.computeCNR(downlink);

    expect(cnr).toBe(LinkBudgetManager.computeCNRDb(downlink));
    expect(mgr.state.computedCNRDb).toBe(cnr);
    expect(mgr.state.computedDownlinkCNRDb).toBe(cnr);
    expect(mgr.state.computedUplinkCNRDb).toBeNull();
    expect(mgr.state.computedCompositeCNRDb).toBeNull();
    // Sandbox authors expectedCNRDb 14 with tolerance 1.5
    expect(mgr.isBudgetComputedCorrectly()).toBe(true);
  });

  it('with the uplink half the composite is the graded value', () => {
    const { expectedCNRDb: _authored, ...rest } = natsEuSandboxData.settings.linkBudget!;
    ScenarioManager.getInstance().settings = { ...natsEuSandboxData.settings, linkBudget: { ...rest, toleranceDb: 0.5 } };
    const mgr = LinkBudgetManager.getInstance();
    // A weak uplink (C/N_up about 13 dB) pulls the ~14 dB downlink down to about 10.5 dB
    const weakUplink = { ...uplink, uplinkEirpDbw: 60 };
    const composite = mgr.computeCNR(downlink, weakUplink);
    const downOnly = LinkBudgetManager.computeCNRDb(downlink);

    expect(mgr.state.computedCNRDb).toBe(composite);
    expect(mgr.state.computedCompositeCNRDb).toBe(composite);
    expect(mgr.state.computedDownlinkCNRDb).toBe(downOnly);
    expect(composite).toBeLessThan(downOnly - 2);

    // The engine measures the composite on a transponded carrier
    mgr.setEnginePrediction(() => composite);
    expect(mgr.isBudgetComputedCorrectly()).toBe(true);
    // The downlink alone is now out of family
    mgr.computeCNR(downlink);
    expect(mgr.isBudgetComputedCorrectly()).toBe(false);
    expect(mgr.state.computedUplinkCNRDb).toBeNull();
  });
});
