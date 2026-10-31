import { GroundStation } from '@app/assets/ground-station/ground-station';
import { AlarmStatus } from '@app/equipment/base-equipment';
import { DEGRADED_MARGIN_LABEL, LOCK_LOST_LABEL, modemLiveDetail, modemLockAlarm } from '@app/equipment/receiver/rx-signal-quality';
import { EventBus } from '@app/events/event-bus';
import { AggregatedAlarm, AlarmStateChangedData, Events } from '@app/events/events';
import { SimClock } from '@app/simulation/sim-clock';
import { getSimulatedNowMs, isScenarioClockRunning } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { Milliseconds } from 'ootk';
import { collectStationServiceAlarms } from './station-service-alarms';

/**
 * An alarm with a fixed label and a live value beside it: `message` names
 * the alarm for its whole life, `detail` carries the number that moves
 * (Dashboard detail text, ticker tooltip)
 */
export interface AlarmWithDetail extends AggregatedAlarm {
  detail?: string;
}

/**
 * ALARM_STATE_CHANGED as AlarmService emits it: the active alarms, plus the
 * alarms that went since the last emit, each with the live value AlarmService
 * re-read at the moment it went (Phase 32 D5, nats-r7-s05-F1). `detail` is
 * absent when the alarm has no live value to quote. The Ops Log writes it on
 * the clear line instead of the value of the poll before.
 */
export interface AlarmStateChangedWithClears extends AlarmStateChangedData {
  cleared?: AlarmWithDetail[];
}

/**
 * AlarmService - Centralized alarm aggregation service
 *
 * Polls all equipment for alarms every second and emits ALARM_STATE_CHANGED
 * with EVERY active alarm, most severe first, when the set changes. The ticker
 * used to get only the highest tier, so a warning hid behind an error and an
 * info entry vanished whenever a warning was up (nats-r4-s16-F1, s17-F3).
 *
 * Each alarm carries the station-clock time it was raised (first seen by the
 * service), kept for its whole life, so the Dashboard stamps the raise time
 * rather than the moment the list was first rendered (nats-r4-s01-F2).
 */
export class AlarmService {
  private static instance_: AlarmService | null = null;
  private previousAlarmsHash_ = '';
  private lastPollTime_ = -Infinity;
  /** Run time between polls while the scenario clock is paused, ms */
  private readonly pollInterval_ = 1000;
  /** Scenario-clock second (floor of SimClock.nowMs() / 1000) of the last poll */
  private lastPollSecond_: number | null = null;
  /**
   * Run time the service started counting from: no poll until
   * STARTUP_SETTLE_MS after it (Phase 31 D2, nats-r6-s01-F1), so the store
   * and checkpoint sync and the RF chain's first settled frames come before
   * the first alarm set, and no raise/clear pair is written at scenario start
   */
  private settleFromRunMs_: number;
  /** Run time the service waits before its first poll, ms */
  static readonly STARTUP_SETTLE_MS = 1000;
  private readonly boundOnUpdate_: (dt: Milliseconds) => void;
  /** Station-clock ms each live alarm was first seen, by raiseKey_ */
  private static readonly raisedAtMs_ = new Map<string, number>();
  /**
   * Each station's alarms as the last poll saw them, most severe first, by
   * the station's state.id (Phase 34 D8, nats-r9-s04-F1, nats-r8-s20-F1).
   * `getAlarms` serves this snapshot, so the Dashboard rows, the LED titles,
   * the ticker tooltip and the Ops Log line share one stamp and one detail
   * per scenario second
   */
  private static readonly lastPollAlarms_ = new Map<string, AlarmWithDetail[]>();
  /** The last poll's alarms and their stations, by raiseKey_, to re-read a cleared alarm's value */
  private previousAlarms_ = new Map<string, { alarm: AlarmWithDetail; gs: GroundStation }>();

  private constructor() {
    this.settleFromRunMs_ = SimClock.runMs();
    this.boundOnUpdate_ = this.onUpdate_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundOnUpdate_);
  }

  static getInstance(): AlarmService {
    if (!AlarmService.instance_) {
      AlarmService.instance_ = new AlarmService();
    }
    return AlarmService.instance_;
  }

  /**
   * Move the UPDATE handler behind every listener subscribed so far, so a
   * poll reads the state they wrote on the same tick. The page calls it once
   * WeatherManager exists (Phase 33 D7, nats-r8-s20-F1): ice, rain and sun
   * levels are written on UPDATE, and a poll that ran first quoted the value
   * one tick old. No-op without an instance.
   */
  static subscribeAfterExistingListeners(): void {
    const service = AlarmService.instance_;
    if (!service) return;
    const bus = EventBus.getInstance();
    bus.off(Events.UPDATE, service.boundOnUpdate_);
    bus.on(Events.UPDATE, service.boundOnUpdate_);
  }

  /**
   * Poll once per scenario-clock second, on the tick the second turns
   * (Phase 33 D7, nats-r8-s20-F1), so the raise/clear line, the peak and the
   * ACU card's once-a-second readout sample the same moment. While the
   * scenario clock is paused (brief review, a passed quiz) it does not turn,
   * so the poll falls back to once per second of run time and the board
   * still follows the equipment.
   */
  private onUpdate_(_dt: Milliseconds): void {
    const now = SimClock.runMs();
    // Run time restarts at 0 each scenario, so a later stamp is from an
    // earlier run: settle again from the new start
    if (now < this.settleFromRunMs_ || now < this.lastPollTime_) {
      this.settleFromRunMs_ = now;
      this.lastPollTime_ = -Infinity;
      this.lastPollSecond_ = null;
      this.previousAlarms_.clear();
      AlarmService.lastPollAlarms_.clear();
    }
    if (now - this.settleFromRunMs_ < AlarmService.STARTUP_SETTLE_MS) return;
    const second = Math.floor(SimClock.nowMs() / 1000);
    const due = SimClock.isPaused('scenario') ? now - this.lastPollTime_ >= this.pollInterval_ : second !== this.lastPollSecond_;
    if (!due) return;
    this.lastPollTime_ = now;
    this.lastPollSecond_ = second;
    this.pollAndAggregate_();
  }

  /** The antenna's no-signal warning, which waits one poll to be believed (see `settleNoSignals_`) */
  private static readonly NO_SIGNALS_MESSAGE_ = 'NO SIGNALS RECEIVED';

  /** Keys of NO SIGNALS warnings seen once and not yet raised */
  private pendingNoSignals_ = new Set<string>();

  /**
   * A NO SIGNALS warning is raised on its second consecutive sighting. The
   * antenna locks the moment the pass starts and its received-signal list
   * fills on the same tick or the next, so a first sighting at carrier arrival
   * raised and cleared within a second (nats-eu-r1 s22-F5). A warning that is
   * already raised stays; one that goes clears at once.
   */
  private settleNoSignals_(alarms: AlarmWithDetail[]): AlarmWithDetail[] {
    const pending = new Set<string>();
    const settled = alarms.filter((alarm) => {
      if (alarm.message !== AlarmService.NO_SIGNALS_MESSAGE_) return true;
      const key = AlarmService.raiseKey_(alarm);
      if (this.previousAlarms_.has(key) || this.pendingNoSignals_.has(key)) return true;
      pending.add(key);

      return false;
    });
    // Pending keys carry over only while the condition keeps being seen
    this.pendingNoSignals_ = pending;

    return settled;
  }

  private pollAndAggregate_(): void {
    const alarms: AlarmWithDetail[] = [];
    const sim = SimulationManager.getInstance();
    const present = new Map<string, { alarm: AlarmWithDetail; gs: GroundStation }>();
    const byStation = new Map<string, AlarmWithDetail[]>();

    for (const gs of sim.groundStations) {
      const stationAlarms = this.settleNoSignals_(AlarmService.collectGroundStationAlarms_(gs));
      byStation.set(gs.state.id, stationAlarms);
      for (const alarm of stationAlarms) {
        alarms.push(alarm);
        present.set(AlarmService.raiseKey_(alarm), { alarm, gs });
      }
    }

    // Future: for (const sat of sim.satellites) { ... }

    // An alarm in the last poll and not in this one has gone: quote the value
    // its source reads now, not the one from the poll before it went
    const cleared: AlarmWithDetail[] = [];
    for (const [key, { alarm, gs }] of this.previousAlarms_) {
      if (present.has(key)) continue;
      const { raisedAtMs: _raisedAtMs, detail: _lastDetail, ...gone } = alarm;
      const detail = AlarmService.liveDetailOf_(gs, alarm);
      cleared.push(detail === undefined ? gone : { ...gone, detail });
    }
    this.previousAlarms_ = present;

    // The poll sees every station, so an alarm missing here has cleared:
    // forget its raise time, so a re-raise stamps afresh
    AlarmService.stampRaisedAt_(alarms);
    // The snapshot getAlarms serves until the next poll, stamped above
    AlarmService.lastPollAlarms_.clear();
    for (const [stationId, stationAlarms] of byStation) {
      AlarmService.lastPollAlarms_.set(
        stationId,
        AlarmService.sortBySeverity_(stationAlarms).map((alarm) => ({ ...alarm }))
      );
    }
    this.emitIfChanged_(AlarmService.sortBySeverity_(alarms), cleared);
  }

  /**
   * The live value behind a known alarm label as its source reads it now
   * (Phase 32 D5): the receiver's Es/N0 for each modem the alarm named, BUC
   * current and temperature, HPA temperature and IM3 level, LNB noise
   * temperature and compression (Phase 33 D6), and the antenna's ICE, RAIN
   * FADE and SUN TRANSIT levels, in the detail format the raise used. Undefined for any other alarm, or when the source is gone.
   */
  private static liveDetailOf_(gs: GroundStation, alarm: AlarmWithDetail): string | undefined {
    const index = alarm.equipmentIndex;
    switch (alarm.equipmentType) {
      case 'RX': {
        if (alarm.message !== AlarmService.DEGRADED_MARGIN_LABEL && alarm.message !== AlarmService.LOCK_LOST_LABEL) return undefined;
        const rx = gs.receivers?.[index];
        if (typeof rx?.getSignalsInBandwidth !== 'function') return undefined;
        const named = new Set([...(alarm.detail ?? '').matchAll(/Modem (\d+)/gu)].map((m) => Number(m[1])));
        const parts: string[] = [];
        for (const modem of rx.state?.modems ?? []) {
          if (!named.has(modem.modemNumber) || !modem.isPowered) continue;
          const info = rx.getSignalsInBandwidth(modem);
          parts.push(modemLiveDetail(modem.modemNumber, info));
        }
        return parts.length > 0 ? parts.join('; ') : undefined;
      }
      case 'ANT': {
        const antenna = gs.antennas?.[index];
        const state = antenna?.state;
        if (!state) return undefined;
        if (alarm.message === 'SUN TRANSIT: ELEVATED SKY NOISE') return AlarmService.dbText_(state.skyNoiseDegradation_dB);
        if (alarm.message === 'ICE ON FEED') return AlarmService.dbText_(state.iceAccumulation_dB);
        if (alarm.message === AlarmService.RAIN_FADE_LABEL) {
          const fade = state.rainRate_mmh > 0 && typeof antenna.rainCnLossDb === 'function' ? antenna.rainCnLossDb() : 0;
          const text = AlarmService.dbText_(fade);
          return text === undefined ? undefined : `fade ${text}`;
        }
        return undefined;
      }
      case 'RF': {
        const rf = gs.rfFrontEnds?.[index];
        if (!rf) return undefined;
        const buc = rf.bucModule?.state;
        const hpa = rf.hpaModule?.state;
        const lnb = rf.lnbModule?.state;
        if (alarm.message === 'BUC high current draw' && Number.isFinite(buc?.currentDraw)) return `${buc.currentDraw.toFixed(2)} A`;
        if (alarm.message === 'BUC over-temperature' && Number.isFinite(buc?.temperature)) return `${buc.temperature.toFixed(1)} °C`;
        if (alarm.message === 'HPA over-temperature' && Number.isFinite(hpa?.temperature)) return `${hpa.temperature.toFixed(0)}°C`;
        if (alarm.message === 'LNB noise temperature high' && Number.isFinite(lnb?.noiseTemperature)) return `${lnb.noiseTemperature.toFixed(0)} K`;
        // Phase 33 D6 (nats-r8-s07-F1, nats-r7-s12-F2)
        if (alarm.message === AlarmService.LNB_OVERLOAD_LABEL) {
          const compression = rf.lnbModule?.compressionDb;
          return typeof compression === 'number' && Number.isFinite(compression) ? `${compression.toFixed(1)} dB` : undefined;
        }
        if (alarm.message === AlarmService.HPA_OVERDRIVE_LABEL) {
          const imd = hpa?.imdLevel;
          // -80 dBc is the HPA's "no IMD" floor (off, or no drive)
          return hpa?.isPowered && typeof imd === 'number' && Number.isFinite(imd) && imd > AlarmService.NO_IMD_DBC_ ? `IM3 ${imd.toFixed(1)} dBc` : undefined;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  /** "0.5 dB", or undefined for a missing level */
  private static dbText_(value: number | undefined): string | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} dB` : undefined;
  }

  /**
   * Identity of one alarm for its raise time: station, equipment and the text
   * with its live numbers masked, so "BUC over-temperature (72.3 °C)" is the
   * same alarm at 72.0 °C
   */
  private static raiseKey_(alarm: AggregatedAlarm): string {
    return `${alarm.assetId}|${alarm.equipmentType}|${alarm.equipmentIndex}|${alarm.message.replace(/-?\d+(?:\.\d+)?/gu, '#')}`;
  }

  /**
   * Set `raisedAtMs` on each alarm: the station-clock time it was first seen.
   * Nothing is recorded until the scenario clock runs (Phase 33 D5,
   * nats-r8-s03-F1): the Mission Overview renders station cards before the
   * Ops Log seeds the clock, and a stamp taken then was the wall clock, kept
   * for the alarm's life. The first poll after the clock starts stamps the
   * scenario start; until then the alarm carries no raise time.
   * Only the poll calls it (Phase 34 D8): `alarms` is every station's full
   * set, so an alarm missing from it has cleared and its stamp goes.
   */
  private static stampRaisedAt_(alarms: AggregatedAlarm[]): void {
    if (!isScenarioClockRunning()) return;
    const nowMs = getSimulatedNowMs();
    const seen = new Set<string>();
    for (const alarm of alarms) {
      const key = AlarmService.raiseKey_(alarm);
      seen.add(key);
      const raisedAtMs = AlarmService.raisedAtMs_.get(key) ?? nowMs;
      AlarmService.raisedAtMs_.set(key, raisedAtMs);
      alarm.raisedAtMs = raisedAtMs;
    }
    for (const key of [...AlarmService.raisedAtMs_.keys()]) {
      if (!seen.has(key)) AlarmService.raisedAtMs_.delete(key);
    }
  }

  /**
   * Every displayable alarm (error, warning, info) for one station, most
   * severe first, unfiltered by the ticker's highest-tier rule. Built from the
   * same module getStatusAlarms() the ticker polls, so the Dashboard alarm
   * list and its Quick Stats count agree with the ticker for that station
   * (s08-F2, s16-F2, s17-F2, s23-F2). A non-operational station has none,
   * as on the ticker.
   *
   * Returns the LAST POLL's set for the station (Phase 34 D8,
   * nats-r9-s04-F1, nats-r8-s20-F1): a read between polls sees the
   * scenario-second snapshot the ticker and the Ops Log got, with the same
   * raise stamp and the same detail, not a live mid-second value. Before the
   * first poll for the station, or after destroy(), it collects live and
   * quotes only stamps the poll already made; only the poll creates one.
   * Each call returns fresh copies, so a caller cannot change the snapshot.
   * @param station the ground station, or its state.id
   */
  static getAlarms(station: GroundStation | string): AlarmWithDetail[] {
    const stationId = typeof station === 'string' ? station : station.state.id;
    const snapshot = AlarmService.lastPollAlarms_.get(stationId);
    if (snapshot) {
      return snapshot.map((alarm) => ({ ...alarm }));
    }
    const gs = typeof station === 'string' ? SimulationManager.getInstance().groundStations.find((g) => g.state.id === station) : station;
    if (!gs) return [];
    const alarms = AlarmService.collectGroundStationAlarms_(gs);
    for (const alarm of alarms) {
      const raisedAtMs = AlarmService.raisedAtMs_.get(AlarmService.raiseKey_(alarm));
      if (raisedAtMs !== undefined) {
        alarm.raisedAtMs = raisedAtMs;
      }
    }
    return AlarmService.sortBySeverity_(alarms);
  }

  /** Stable sort: error, warning, info (success last; never collected). */
  private static sortBySeverity_<T extends AggregatedAlarm>(alarms: T[]): T[] {
    const rank: Record<AggregatedAlarm['severity'], number> = { error: 0, warning: 1, info: 2, success: 3 };
    return alarms
      .map((alarm, index) => ({ alarm, index }))
      .sort((a, b) => rank[a.alarm.severity] - rank[b.alarm.severity] || a.index - b.index)
      .map(({ alarm }) => alarm);
  }

  private static collectGroundStationAlarms_(gs: GroundStation): AlarmWithDetail[] {
    // Skip non-operational locations
    if (!gs.state.isOperational) return [];

    const alarms: AlarmWithDetail[] = [];
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
      for (const rxAlarm of AlarmService.modemLockAlarms_(rx)) {
        alarms.push({ ...rxAlarm, assetId, equipmentType: 'RX', equipmentIndex: idx });
      }
    });

    alarms.push(...collectStationServiceAlarms(assetId));

    return alarms.map(AlarmService.fixLabel_);
  }

  /**
   * The receiver's modem alarms, each one alarm per receiver with every
   * affected modem in the detail:
   * - "Degraded margin" (warning) for a powered modem locked with less than
   *   1 dB of Es/N0 over Required (nats-r5-s05-F1). Uses the lock tracker's
   *   own low-margin flag, so it raises below 1.0 dB of margin and clears at
   *   1.5 dB, the same hysteresis as the modem's status bar.
   * - "Carrier lock lost" (error) for a powered modem that had lock on its
   *   current tuning and has dropped it (Phase 31 D1, nats-r6-s17-F1): up from
   *   the loss until it relocks, is retuned or is powered off, so the board
   *   reads Degraded -> Lock lost -> (Degraded) -> clean as a fade comes and
   *   goes. A modem that never had lock raises nothing.
   * Labels are fixed for their life; the live Es/N0 rides in the detail.
   * The per-modem rule is `modemLockAlarm` (Phase 34 D5), which the RX modem
   * card reads too.
   */
  private static modemLockAlarms_(rx: GroundStation['receivers'][number]): Pick<AlarmWithDetail, 'severity' | 'message' | 'detail'>[] {
    const modems = rx.state?.modems ?? [];
    if (typeof rx.getSignalsInBandwidth !== 'function') return [];
    const degraded: string[] = [];
    const lost: string[] = [];
    for (const modem of modems) {
      if (!modem.isPowered) continue;
      // Advances the lazy lock tracker to now, as the Dashboard does
      const info = rx.getSignalsInBandwidth(modem);
      const transition = typeof rx.getLockTransition === 'function' ? rx.getLockTransition(modem) : null;
      const alarm = modemLockAlarm(modem.modemNumber, info, transition);
      if (alarm?.label === LOCK_LOST_LABEL) {
        lost.push(alarm.detail);
      } else if (alarm?.label === DEGRADED_MARGIN_LABEL) {
        degraded.push(alarm.detail);
      }
    }
    const alarms: Pick<AlarmWithDetail, 'severity' | 'message' | 'detail'>[] = [];
    if (lost.length > 0) alarms.push({ severity: 'error', message: AlarmService.LOCK_LOST_LABEL, detail: lost.join('; ') });
    if (degraded.length > 0) alarms.push({ severity: 'warning', message: AlarmService.DEGRADED_MARGIN_LABEL, detail: degraded.join('; ') });
    return alarms;
  }

  /**
   * Alarms whose label must not move while they are up (nats-r5-s14-F2,
   * Phase 31 D3): an equipment message carrying a live value in parentheses,
   * "BUC over-temperature (72.0 °C)" or "AGC at max gain (12.0 dB) - weak
   * signal", becomes the label without the parenthesis ("BUC
   * over-temperature", "AGC at max gain - weak signal") with the inner text
   * ("72.0 °C") in the detail, so the ticker, the Dashboard and the Ops Log
   * keep one name for it while the value refreshes. RAIN FADE keeps its
   * "fade 0.6 dB" detail wording.
   */
  private static fixLabel_(alarm: AlarmWithDetail): AlarmWithDetail {
    const rain = /^RAIN FADE \((.+)\)$/u.exec(alarm.message);
    if (rain) return { ...alarm, message: AlarmService.RAIN_FADE_LABEL, detail: `fade ${rain[1]}` };
    const valued = AlarmService.VALUE_IN_PARENS_.exec(alarm.message);
    if (valued) {
      const label = `${valued[1]}${valued[3]}`.trim();
      if (label.length > 0) return { ...alarm, message: label, detail: valued[2] };
    }
    return alarm;
  }

  /**
   * "<label> (<number><unit>)<suffix>": the first parenthesis holding a
   * number followed by a unit (dB, A, °C, °, μs error), optionally named by
   * one word before it ("IM3 -24.8 dBc", Phase 32 D7); the suffix is kept in
   * the label ("AGC at max gain (12.0 dB) - weak signal", "HPA overdrive
   * (IM3 -24.8 dBc) - IMD degradation")
   */
  private static readonly VALUE_IN_PARENS_ = /^(.*?)\s*\(((?:[A-Za-z][A-Za-z0-9/]*\s+)?-?\d+(?:\.\d+)?\s*[^\s\d()][^()]*)\)(.*)$/u;

  /** Fixed label of the receiver low-margin warning */
  static readonly DEGRADED_MARGIN_LABEL = DEGRADED_MARGIN_LABEL;
  /** Fixed label of the receiver lock-loss error (Phase 31 D1) */
  static readonly LOCK_LOST_LABEL = LOCK_LOST_LABEL;
  /** Fixed label of the antenna rain-fade alarm */
  static readonly RAIN_FADE_LABEL = 'RAIN FADE';
  /** Fixed label of the LNB compression alarm, "(0.7 dB)" split into the detail (Phase 33 D6) */
  static readonly LNB_OVERLOAD_LABEL = 'LNB input overload - gain compression';
  /** Fixed label of the HPA overdrive alarm, "(IM3 -24.8 dBc)" split into the detail */
  static readonly HPA_OVERDRIVE_LABEL = 'HPA overdrive - IMD degradation';
  /** The HPA's IM3 reading with no intermodulation (powered off, no drive), dBc */
  private static readonly NO_IMD_DBC_ = -80;

  /** The live value behind an alarm's fixed label ("Modem 1: Es/N0 5.6 dB, need 5.0 dB"), if it has one */
  static detailOf(alarm: AggregatedAlarm): string | undefined {
    return 'detail' in alarm && typeof alarm.detail === 'string' ? alarm.detail : undefined;
  }

  private static isDisplayableAlarm_(alarm: AlarmStatus): boolean {
    return alarm.severity === 'error' || alarm.severity === 'warning' || alarm.severity === 'info';
  }

  /**
   * @param alarms every active alarm, most severe first
   * @param cleared the alarms that went on this poll, with their live value
   */
  private emitIfChanged_(alarms: AggregatedAlarm[], cleared: AlarmWithDetail[] = []): void {
    const hash = JSON.stringify(alarms);
    if (hash === this.previousAlarmsHash_) return;
    this.previousAlarmsHash_ = hash;

    const data: AlarmStateChangedWithClears = {
      alarms,
      highestSeverity: alarms[0]?.severity ?? 'success',
    };
    if (cleared.length > 0) data.cleared = cleared;

    EventBus.getInstance().emit(Events.ALARM_STATE_CHANGED, data);
  }

  static destroy(): void {
    if (AlarmService.instance_) {
      EventBus.getInstance().off(Events.UPDATE, AlarmService.instance_.boundOnUpdate_);
      AlarmService.instance_ = null;
    }
    AlarmService.raisedAtMs_.clear();
    AlarmService.lastPollAlarms_.clear();
  }
}
