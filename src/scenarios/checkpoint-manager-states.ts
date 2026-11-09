/**
 * @file Checkpoint manager states (Phase 35 rt-s24-F4)
 * @description Gathers and restores the operator-facing state of the scenario
 * managers that a "Restart from Checkpoint" would otherwise rebuild from
 * scratch: ephemeris phase, commanding/COMSEC, working document, audit acks,
 * TRANSEC, contact plan, GNSS threat. Collection is registered into
 * sync-manager through setManagerStateCollector (base-page), so sync-manager
 * never imports these managers. Restore is called only from the checkpoint
 * path, never from SyncManager.syncFromStorage.
 *
 * Every restore section has its own try/catch: one bad section must not stop the
 * rest (or the objectives and ops-log restore that follow in base-page).
 */

import { CommandingManager } from '@app/commanding/commanding-manager';
import { ContactScheduleManager } from '@app/contact-schedule/contact-schedule-manager';
import { CryptoModule } from '@app/equipment/crypto/crypto-module-core';
import { FaultInjector } from '@app/faults/fault-injector';
import { HardwareFaultManager } from '@app/faults/hardware-fault-manager';
import { GnssThreatManager } from '@app/gnss-threat/gnss-threat-manager';
import { InterferenceManager } from '@app/interference/interference-manager';
import { LinkBudgetManager } from '@app/link-budget/link-budget-manager';
import { Logger } from '@app/logging/logger';
import { DecisionManager } from '@app/modal/decision-manager';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { ScenarioManager } from '@app/scenario-manager';
import { SecurityConsoleCore } from '@app/security-console/security-console-core';
import { AlarmService } from '@app/services/alarm-service';
import { SpaceEventManager } from '@app/space-events/space-event-manager';
import type { ManagerStates } from '@app/sync/manager-state-types';
import { TelemetryManager } from '@app/telemetry/telemetry-manager';
import { TransecManager } from '@app/transec/transec-manager';
import { WeatherManager } from '@app/weather/weather-manager';
import { CampaignDocumentStore } from './campaign-document-store';
import { EventTimeLedger } from './event-time-ledger';
import { WorkingDocumentManager } from './working-document-manager';

/** Run one collect step; a failing section is simply left out. */
function section_<T>(name: string, fn: () => T | undefined): T | undefined {
  try {
    return fn();
  } catch (error) {
    Logger.warn(`Checkpoint: could not collect ${name} state:`, error);

    return undefined;
  }
}

/** Snapshot every live, initialized manager (never constructs one). */
export function collectManagerStates(): ManagerStates {
  const states: ManagerStates = { v: 1 };
  states.alarms = section_('alarms', () => AlarmService.getCheckpointState());
  states.spaceEvents = section_('spaceEvents', () => (SpaceEventManager.isInitialized() ? SpaceEventManager.getInstance().getState() : undefined));
  states.commanding = section_('commanding', () => (CommandingManager.isInitialized() ? CommandingManager.getInstance().getState() : undefined));
  states.crypto = section_('crypto', () => (CryptoModule.hasInstance() ? CryptoModule.getInstance().getCheckpointState() : undefined));
  states.workingDocument = section_('workingDocument', () => (WorkingDocumentManager.isEnabled() ? WorkingDocumentManager.getInstance().getState() : undefined));
  states.campaignRun = section_('campaignRun', () => CampaignDocumentStore.getRunState());
  states.eventLedger = section_('eventLedger', () => EventTimeLedger.getState());
  states.security = section_('security', () => (SecurityConsoleCore.isInitialized() ? SecurityConsoleCore.getInstance().getState() : undefined));
  states.transec = section_('transec', () => (TransecManager.isInitialized() ? TransecManager.getInstance().getState() : undefined));
  states.contactSchedule = section_('contactSchedule', () => (ContactScheduleManager.isInitialized() ? ContactScheduleManager.getInstance().getState() : undefined));
  states.gnssThreat = section_('gnssThreat', () => (GnssThreatManager.isInitialized() ? GnssThreatManager.getInstance().getCheckpointState() : undefined));

  states.physicalPlant = section_('physicalPlant', () => (PhysicalPlantService.isInitialized() ? PhysicalPlantService.getInstance().getState() : undefined));
  states.hardwareFaults = section_('hardwareFaults', () => (HardwareFaultManager.isInitialized() ? HardwareFaultManager.getInstance().getState() : undefined));
  states.weather = section_('weather', () => (WeatherManager.hasInstance() ? WeatherManager.getInstance().getCheckpointState() : undefined));
  states.telemetry = section_('telemetry', () => (TelemetryManager.isInitialized() ? TelemetryManager.getInstance().getCheckpointState() : undefined));
  states.interference = section_('interference', () => (InterferenceManager.isInitialized() ? InterferenceManager.getInstance().getState() : undefined));
  states.linkBudget = section_('linkBudget', () => (LinkBudgetManager.isInitialized() ? LinkBudgetManager.getInstance().getCheckpointState() : undefined));
  states.faultInjector = section_('faultInjector', () => (FaultInjector.isInitialized() ? FaultInjector.getInstance().getCheckpointState() : undefined));
  states.decisions = section_('decisions', () => (DecisionManager.hasInstance() ? DecisionManager.getInstance().getCheckpointState() : undefined));

  return states;
}

function restore_(name: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    Logger.error(`Checkpoint: failed to restore ${name} state:`, error);
  }
}

/**
 * Restore every manager except the event-time ledger and the working document
 * (those need the objectives restored first: see restoreLedgerAndDocument).
 * `states` undefined (an older checkpoint) is a no-op, exactly as before.
 * Synchronous on purpose: no await between the clock jump and these restores.
 */
export function restoreManagerStates(states: ManagerStates | undefined): void {
  if (!states || typeof states !== 'object') {
    return;
  }
  restore_('weather', () => {
    if (WeatherManager.hasInstance()) WeatherManager.getInstance().restoreCheckpointState(states.weather);
  });
  restore_('telemetry', () => {
    if (TelemetryManager.isInitialized()) TelemetryManager.getInstance().restoreCheckpointState(states.telemetry);
  });
  restore_('spaceEvents', () => {
    if (states.spaceEvents && SpaceEventManager.isInitialized()) {
      SpaceEventManager.getInstance().restoreState(states.spaceEvents);
    }
  });
  restore_('commanding', () => {
    if (states.commanding && CommandingManager.isInitialized()) {
      CommandingManager.getInstance().restoreState(states.commanding);
    }
  });
  // After commanding: its constructor seeded the crypto unit, the saved state overrides that
  restore_('crypto', () => {
    if (states.crypto && CryptoModule.hasInstance()) {
      CryptoModule.getInstance().restoreCheckpointState(states.crypto);
    }
  });
  restore_('campaignRun', () => CampaignDocumentStore.restoreRunState(states.campaignRun));
  restore_('security', () => {
    if (states.security && SecurityConsoleCore.isInitialized()) {
      SecurityConsoleCore.getInstance().restoreState(states.security);
    }
  });
  restore_('transec', () => {
    if (states.transec && TransecManager.isInitialized()) {
      TransecManager.getInstance().restoreState(states.transec);
    }
  });
  restore_('contactSchedule', () => {
    if (states.contactSchedule && ContactScheduleManager.isInitialized()) {
      ContactScheduleManager.getInstance().restoreState(states.contactSchedule);
    }
  });
  restore_('gnssThreat', () => {
    if (states.gnssThreat && GnssThreatManager.isInitialized()) {
      GnssThreatManager.getInstance().restoreCheckpointState(states.gnssThreat);
    }
  });
  // Faults that already tripped must not trip again after the clock jump that follows
  restore_('physicalPlant', () => {
    if (states.physicalPlant && PhysicalPlantService.isInitialized()) {
      PhysicalPlantService.getInstance().restoreState(states.physicalPlant);
    }
  });
  restore_('hardwareFaults', () => {
    if (states.hardwareFaults && HardwareFaultManager.isInitialized()) {
      HardwareFaultManager.getInstance().restoreState(states.hardwareFaults);
    }
  });
  restore_('interference', () => {
    if (states.interference && InterferenceManager.isInitialized()) {
      InterferenceManager.getInstance().restoreState(states.interference);
    }
  });
  restore_('linkBudget', () => {
    if (states.linkBudget && LinkBudgetManager.isInitialized()) {
      LinkBudgetManager.getInstance().restoreCheckpointState(states.linkBudget);
    }
  });
  restore_('faultInjector', () => {
    if (states.faultInjector && FaultInjector.isInitialized()) {
      FaultInjector.getInstance().restoreCheckpointState(states.faultInjector);
    }
  });
  restore_('decisions', () => {
    if (states.decisions && DecisionManager.hasInstance()) {
      DecisionManager.getInstance().restoreCheckpointState(states.decisions);
    }
  });
}

/**
 * Restore the event-time ledger (saved stamps beat anything the objectives
 * restore re-stamped) and the working document, after the objectives restore.
 */
export function restoreLedgerAndDocument(states: ManagerStates | undefined): void {
  if (!states || typeof states !== 'object') {
    return;
  }
  restore_('eventLedger', () => EventTimeLedger.restoreState(states.eventLedger));
  restore_('workingDocument', () => {
    if (states.workingDocument && ScenarioManager.getInstance().settings.workingDocument) {
      WorkingDocumentManager.getInstance().restoreState(states.workingDocument);
    }
  });
}
