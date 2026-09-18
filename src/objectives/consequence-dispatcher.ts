/**
 * @file Consequence dispatcher - applies what a decision option does
 * @description Every key on a DecisionConsequence maps onto a subsystem that
 * already exists (fault injector, interference schedule, audit log, objective
 * activation, ops log). Nothing here models anything new; it only routes.
 *
 * A per-scenario budget caps how many injected faults and forced interference
 * events can be live at once, so a run of wrong decisions cannot cascade a
 * maintained objective into an unrecoverable state.
 */

import { FAULT_TEMPLATES, FaultInjector, FaultTemplateKey } from '@app/faults';
import { InterferenceManager } from '@app/interference/interference-manager';
import { OpsLogManager } from '@app/ops-log/ops-log-manager';
import { CampaignDocumentStore } from '@app/scenarios/campaign-document-store';
import { SecurityConsoleCore } from '@app/security-console/security-console-core';
import type { DecisionConsequence } from './objective-types';
import { ObjectivesManager } from './objectives-manager';

export interface ConsequenceContext {
  /** Ground station the deciding objective belongs to (faults need one) */
  groundStationId?: string;
}

export interface ConsequenceResult {
  /** Keys that were applied */
  applied: string[];
  /** Keys skipped, with the reason */
  skipped: { key: string; reason: string }[];
  /** Net point adjustment requested by the option (positive = penalty) */
  pointDelta: number;
}

export const DEFAULT_CONSEQUENCE_BUDGET = 2;

export class ConsequenceDispatcher {
  /** Faults this dispatcher injected and has not cleared */
  private readonly injectedFaultIds_ = new Set<string>();
  /** Interference events this dispatcher forced on and has not released */
  private readonly forcedOnEventIds_ = new Set<string>();

  constructor(private readonly maxLiveInjections_ = DEFAULT_CONSEQUENCE_BUDGET) {}

  /** Injected faults plus forced-on interference currently live */
  get liveInjections(): number {
    return this.injectedFaultIds_.size + this.forcedOnEventIds_.size;
  }

  dispatch(consequence: DecisionConsequence, ctx: ConsequenceContext): ConsequenceResult {
    const result: ConsequenceResult = { applied: [], skipped: [], pointDelta: consequence.pointDelta ?? 0 };

    if (consequence.inject) this.inject_(consequence.inject, ctx, result);
    if (consequence.clearFault) this.clearFault_(consequence.clearFault, result);
    if (consequence.startInterference) this.forceInterference_(consequence.startInterference, true, result);
    if (consequence.stopInterference) this.forceInterference_(consequence.stopInterference, false, result);
    if (consequence.auditEvent) this.auditEvent_(consequence.auditEvent, result);
    if (consequence.destroyEvidence) this.destroyEvidence_(consequence.destroyEvidence, result);
    if (consequence.activateObjective) this.setObjectiveActive_(consequence.activateObjective, true, result);
    if (consequence.deactivateObjective) this.setObjectiveActive_(consequence.deactivateObjective, false, result);
    if (consequence.log && OpsLogManager.isInitialized()) {
      OpsLogManager.getInstance().log(consequence.log, 'system', 'decision');
      result.applied.push('log');
    }

    return result;
  }

  /** Release everything this dispatcher forced or injected (scenario teardown) */
  releaseAll(): void {
    const faults = FaultInjector.getInstance();
    for (const id of this.injectedFaultIds_) faults.clear(id);
    this.injectedFaultIds_.clear();

    if (InterferenceManager.isInitialized()) {
      const interference = InterferenceManager.getInstance();
      for (const id of this.forcedOnEventIds_) interference.forceEvent(id, null);
    }
    this.forcedOnEventIds_.clear();
  }

  private inject_(spec: NonNullable<DecisionConsequence['inject']>, ctx: ConsequenceContext, result: ConsequenceResult): void {
    if (!ctx.groundStationId) {
      result.skipped.push({ key: 'inject', reason: 'objective has no groundStation' });
      return;
    }
    if (!(spec.template in FAULT_TEMPLATES)) {
      result.skipped.push({ key: 'inject', reason: `unknown fault template ${spec.template}` });
      return;
    }
    if (this.liveInjections >= this.maxLiveInjections_) {
      result.skipped.push({ key: 'inject', reason: `consequence budget (${this.maxLiveInjections_}) reached` });
      return;
    }
    const id = FaultInjector.getInstance().injectTemplate(spec.template as FaultTemplateKey, ctx.groundStationId);
    this.injectedFaultIds_.add(id);
    result.applied.push('inject');
  }

  private clearFault_(faultId: string, result: ConsequenceResult): void {
    if (FaultInjector.getInstance().clear(faultId)) {
      this.injectedFaultIds_.delete(faultId);
      result.applied.push('clearFault');
    } else {
      result.skipped.push({ key: 'clearFault', reason: `no active fault ${faultId}` });
    }
  }

  private forceInterference_(eventId: string, active: boolean, result: ConsequenceResult): void {
    const key = active ? 'startInterference' : 'stopInterference';
    if (!InterferenceManager.isInitialized()) {
      result.skipped.push({ key, reason: 'scenario declares no interference events' });
      return;
    }
    const interference = InterferenceManager.getInstance();
    if (!interference.getEvent(eventId)) {
      result.skipped.push({ key, reason: `unknown interference event ${eventId}` });
      return;
    }
    if (active && !this.forcedOnEventIds_.has(eventId) && this.liveInjections >= this.maxLiveInjections_) {
      result.skipped.push({ key, reason: `consequence budget (${this.maxLiveInjections_}) reached` });
      return;
    }
    interference.forceEvent(eventId, active);
    if (active) {
      this.forcedOnEventIds_.add(eventId);
    } else {
      this.forcedOnEventIds_.delete(eventId);
    }
    result.applied.push(key);
  }

  private auditEvent_(event: NonNullable<DecisionConsequence['auditEvent']>, result: ConsequenceResult): void {
    if (!SecurityConsoleCore.isInitialized()) {
      result.skipped.push({ key: 'auditEvent', reason: 'scenario has no security console' });
      return;
    }
    SecurityConsoleCore.getInstance().injectEvent(event);
    result.applied.push('auditEvent');
  }

  private destroyEvidence_(spec: NonNullable<DecisionConsequence['destroyEvidence']>, result: ConsequenceResult): void {
    let removed = false;
    if (spec.auditEventId && SecurityConsoleCore.isInitialized()) {
      removed = SecurityConsoleCore.getInstance().removeEvent(spec.auditEventId) || removed;
    }
    if (spec.faultId) {
      removed = FaultInjector.getInstance().clear(spec.faultId) || removed;
      this.injectedFaultIds_.delete(spec.faultId);
    }
    if (removed) {
      // Remembered in the campaign record: a later scenario carrying this
      // evidence forward (requiresCampaignEvidence) finds it gone.
      if (spec.auditEventId) CampaignDocumentStore.noteDestroyedEvidence(spec.auditEventId);
      result.applied.push('destroyEvidence');
    } else {
      result.skipped.push({ key: 'destroyEvidence', reason: 'nothing matched' });
    }
  }

  private setObjectiveActive_(objectiveId: string, active: boolean, result: ConsequenceResult): void {
    const key = active ? 'activateObjective' : 'deactivateObjective';
    if (!ObjectivesManager.hasInstance()) {
      result.skipped.push({ key, reason: 'no objectives manager' });
      return;
    }
    const ok = active ? ObjectivesManager.getInstance().activateObjective(objectiveId) : ObjectivesManager.getInstance().deactivateObjective(objectiveId);
    if (ok) {
      result.applied.push(key);
    } else {
      result.skipped.push({ key, reason: `objective ${objectiveId} not in a state to ${active ? 'activate' : 'deactivate'}` });
    }
  }
}
