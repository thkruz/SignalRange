import { GroundStation } from '@app/assets/ground-station/ground-station';
import { AlarmStatus } from '@app/equipment/base-equipment';
import { EventBus } from '@app/events/event-bus';
import { AggregatedAlarm, AlarmStateChangedData, Events } from '@app/events/events';
import { SimClock } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { Milliseconds } from 'ootk';

/**
 * AlarmService - Centralized alarm aggregation service
 *
 * Polls all equipment for alarms every second, aggregates them by severity,
 * and emits ALARM_STATE_CHANGED events when the alarm state changes.
 *
 * Display logic:
 * - If any error alarms exist, show ALL errors (red)
 * - Else if any warning alarms, show ALL warnings (yellow)
 * - Else if any info alarms, show ALL info (blue)
 * - Else show "SYSTEM STABLE" (green)
 */
export class AlarmService {
  private static instance_: AlarmService | null = null;
  private previousAlarmsHash_ = '';
  private lastPollTime_ = -Infinity;
  private readonly pollInterval_ = 1000; // 1 second
  private readonly boundOnUpdate_: (dt: Milliseconds) => void;

  private constructor() {
    this.boundOnUpdate_ = this.onUpdate_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundOnUpdate_);
  }

  static getInstance(): AlarmService {
    if (!AlarmService.instance_) {
      AlarmService.instance_ = new AlarmService();
    }
    return AlarmService.instance_;
  }

  private onUpdate_(_dt: Milliseconds): void {
    const now = SimClock.runMs();
    // Run time restarts at 0 each scenario, so a later stamp is from an earlier run
    if (now >= this.lastPollTime_ && now - this.lastPollTime_ < this.pollInterval_) return;
    this.lastPollTime_ = now;
    this.pollAndAggregate_();
  }

  private pollAndAggregate_(): void {
    const alarms: AggregatedAlarm[] = [];
    const sim = SimulationManager.getInstance();

    for (const gs of sim.groundStations) {
      alarms.push(...AlarmService.collectGroundStationAlarms_(gs));
    }

    // Future: for (const sat of sim.satellites) { ... }

    this.emitIfChanged_(alarms);
  }

  /**
   * Every displayable alarm (error, warning, info) for one station, most
   * severe first, unfiltered by the ticker's highest-tier rule. Built from the
   * same module getStatusAlarms() the ticker polls, so the Dashboard alarm
   * list and its Quick Stats count agree with the ticker for that station
   * (s08-F2, s16-F2, s17-F2, s23-F2). A non-operational station has none,
   * as on the ticker.
   * @param station the ground station, or its state.id
   */
  static getAlarms(station: GroundStation | string): AggregatedAlarm[] {
    const gs = typeof station === 'string' ? SimulationManager.getInstance().groundStations.find((g) => g.state.id === station) : station;
    if (!gs) return [];
    return AlarmService.sortBySeverity_(AlarmService.collectGroundStationAlarms_(gs));
  }

  /** Stable sort: error, warning, info (success last; never collected). */
  private static sortBySeverity_(alarms: AggregatedAlarm[]): AggregatedAlarm[] {
    const rank: Record<AggregatedAlarm['severity'], number> = { error: 0, warning: 1, info: 2, success: 3 };
    return alarms
      .map((alarm, index) => ({ alarm, index }))
      .sort((a, b) => rank[a.alarm.severity] - rank[b.alarm.severity] || a.index - b.index)
      .map(({ alarm }) => alarm);
  }

  private static collectGroundStationAlarms_(gs: GroundStation): AggregatedAlarm[] {
    // Skip non-operational locations
    if (!gs.state.isOperational) return [];

    const alarms: AggregatedAlarm[] = [];
    const assetId = gs.state.id;

    // Antennas
    gs.antennas.forEach((antenna, idx) => {
      for (const alarm of antenna.getStatusAlarms()) {
        if (AlarmService.isDisplayableAlarm_(alarm)) {
          alarms.push({
            severity: alarm.severity as AggregatedAlarm['severity'],
            message: alarm.message,
            assetId,
            equipmentType: 'ANT',
            equipmentIndex: idx,
          });
        }
      }
    });

    // RF Front Ends
    gs.rfFrontEnds.forEach((rfFe, idx) => {
      for (const rfCase of [1, 2]) {
        for (const alarm of rfFe.getStatusAlarms(rfCase)) {
          if (AlarmService.isDisplayableAlarm_(alarm)) {
            alarms.push({
              severity: alarm.severity as AggregatedAlarm['severity'],
              message: alarm.message,
              assetId,
              equipmentType: 'RF',
              equipmentIndex: idx,
            });
          }
        }
      }
    });

    // Transmitters
    gs.transmitters.forEach((tx, idx) => {
      for (const alarm of tx.getStatusAlarms()) {
        if (AlarmService.isDisplayableAlarm_(alarm)) {
          alarms.push({
            severity: alarm.severity as AggregatedAlarm['severity'],
            message: alarm.message,
            assetId,
            equipmentType: 'TX',
            equipmentIndex: idx,
          });
        }
      }
    });

    // Receivers
    gs.receivers.forEach((rx, idx) => {
      for (const alarm of rx.getStatusAlarms()) {
        if (AlarmService.isDisplayableAlarm_(alarm)) {
          alarms.push({
            severity: alarm.severity as AggregatedAlarm['severity'],
            message: alarm.message,
            assetId,
            equipmentType: 'RX',
            equipmentIndex: idx,
          });
        }
      }
    });

    return alarms;
  }

  private static isDisplayableAlarm_(alarm: AlarmStatus): boolean {
    return alarm.severity === 'error' || alarm.severity === 'warning' || alarm.severity === 'info';
  }

  private filterToHighestSeverity_(alarms: AggregatedAlarm[]): {
    filtered: AggregatedAlarm[];
    severity: 'error' | 'warning' | 'info' | 'success';
  } {
    const errors = alarms.filter((a) => a.severity === 'error');
    if (errors.length > 0) return { filtered: errors, severity: 'error' };

    const warnings = alarms.filter((a) => a.severity === 'warning');
    if (warnings.length > 0) return { filtered: warnings, severity: 'warning' };

    const infos = alarms.filter((a) => a.severity === 'info');
    if (infos.length > 0) return { filtered: infos, severity: 'info' };

    return { filtered: [], severity: 'success' };
  }

  private emitIfChanged_(alarms: AggregatedAlarm[]): void {
    const { filtered, severity } = this.filterToHighestSeverity_(alarms);
    const hash = JSON.stringify(filtered);
    if (hash === this.previousAlarmsHash_) return;
    this.previousAlarmsHash_ = hash;

    const data: AlarmStateChangedData = {
      alarms: filtered,
      highestSeverity: severity,
    };

    EventBus.getInstance().emit(Events.ALARM_STATE_CHANGED, data);
  }

  static destroy(): void {
    if (AlarmService.instance_) {
      EventBus.getInstance().off(Events.UPDATE, AlarmService.instance_.boundOnUpdate_);
      AlarmService.instance_ = null;
    }
  }
}
