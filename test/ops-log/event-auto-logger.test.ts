import { vi } from 'vitest';
import { Receiver } from '../../src/equipment/receiver/receiver';
import type { TransmitterModem } from '../../src/equipment/transmitter/transmitter';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { EventAutoLogger } from '../../src/ops-log/event-auto-logger';
import { formatAntennaArrival, formatAntennaEvent, formatRxConfigEvent, formatTxConfigEvent } from '../../src/ops-log/event-formatters';
import { OpsLogManager } from '../../src/ops-log/ops-log-manager';
import { SimClock } from '../../src/simulation/sim-clock';

// Advanced: the log runs at every difficulty (nats-r5-s16-F2)
vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: () => ({ data: { difficulty: 'advanced' } }),
  },
}));

const modem = (overrides: Partial<TransmitterModem> = {}): TransmitterModem =>
  ({
    id: 0,
    modem_number: 1,
    antenna_id: 1,
    isPowered: true,
    isLoopback: false,
    isFaulted: false,
    isFaultSwitchUp: false,
    isTransmitting: true,
    isTransmittingSwitchUp: true,
    ifSignal: { frequency: 1057e6, modulation: 'QPSK', fec: '3/4' },
    ...overrides,
  }) as unknown as TransmitterModem;

describe('event formatters (nats-r3-s11-F1, s11-F2)', () => {
  it('names the switched modem and its applied carrier on transmit', () => {
    const msg = formatTxConfigEvent({ uuid: 'tx', modem: 1, config: modem(), action: 'transmit-on' });

    expect(msg).toBe('M1: Transmission STARTED, 1057.00 MHz, QPSK 3/4');
  });

  it('logs a config apply, a stop and a boot as distinct lines', () => {
    expect(formatTxConfigEvent({ uuid: 'tx', modem: 1, config: modem(), action: 'config' })).toBe('M1: Config 1057.00 MHz, QPSK 3/4');
    expect(formatTxConfigEvent({ uuid: 'tx', modem: 1, config: modem(), action: 'transmit-off' })).toBe('M1: Transmission STOPPED');
    expect(formatTxConfigEvent({ uuid: 'tx', modem: 1, config: modem(), action: 'power-on' })).toBe('M1: Power ON, booting');
  });

  it('logs nothing for a state refresh with no action', () => {
    expect(formatTxConfigEvent({ uuid: 'tx', modem: 1, config: modem() })).toBeNull();
  });

  it('logs a staged MAINT as staged, without the momentarily cleared lock flags', () => {
    const msg = formatAntennaEvent({
      trackingMode: 'maintenance',
      hasStagedChanges: true,
      stagedTargetElevation: 5 as never,
      isPowered: true,
      isLocked: false,
      isBeaconLocked: false,
    });

    expect(msg).toBe('Tracking mode: MAINTENANCE staged (El 5.0 pending APPLY)');
  });

  it('logs the applied MAINT with the lock state at that moment', () => {
    const msg = formatAntennaEvent({
      trackingMode: 'maintenance',
      hasStagedChanges: false,
      stagedTargetElevation: null,
      isPowered: true,
      isLocked: false,
      isBeaconLocked: true,
    });

    expect(msg).toBe('Tracking mode: MAINTENANCE, Power ON, Antenna LOCKED');
  });

  it('writes one lock, so the satellite and beacon flags trading places log no contradiction (nats-r4-s10-F1)', () => {
    const base = { trackingMode: 'program-track' as const, isPowered: true, beaconFrequencyHz: 4165e6 };
    const first = formatAntennaEvent({ ...base, isLocked: false, isBeaconLocked: true });
    const second = formatAntennaEvent({ ...base, isLocked: true, isBeaconLocked: false });

    expect(first).toBe('Tracking mode: PROGRAM-TRACK, Power ON, Antenna LOCKED, Beacon freq: 4165.00 MHz');
    expect(second).toBe(first);
    expect(formatAntennaEvent({ ...base, isLocked: false, isBeaconLocked: false })).toContain('Antenna UNLOCKED');
    expect(formatAntennaEvent({ ...base, isLocked: true, isBeaconLocked: true, isAcuAutomationFaulted: true })).toContain('Antenna lock UNKNOWN');
  });

  it('reads UNLOCKED while the dish repositions, whatever the beacon last saw (nats-r6-s03-F1)', () => {
    const base = { isPowered: true, isLocked: false, isBeaconLocked: true };

    expect(formatAntennaEvent({ ...base, trackingMode: 'stow' })).toBe('Tracking mode: STOW, Power ON, Antenna UNLOCKED');
    expect(formatAntennaEvent({ ...base, trackingMode: 'maintenance', isSlewing: true })).toBe('Tracking mode: MAINTENANCE, Power ON, Antenna UNLOCKED');
    // A locked program track is on its bird even while it moves (a LEO pass)
    expect(formatAntennaEvent({ ...base, trackingMode: 'program-track', isLocked: true, isSlewing: true })).toBe('Tracking mode: PROGRAM-TRACK, Power ON, Antenna LOCKED');
  });

  it('formats the arrival line of each mode (nats-r6-s11-F1)', () => {
    const at = { state: {} as never, azimuth: 188.44, elevation: 29.31, targetSatelliteId: null, targetSatelliteName: null };

    expect(formatAntennaArrival({ ...at, mode: 'program-track', targetSatelliteId: 7, targetSatelliteName: 'TIDEMARK-1' })).toBe(
      'PROGRAM: on target TIDEMARK-1 (Az 188.4, El 29.3)'
    );
    expect(formatAntennaArrival({ ...at, mode: 'stow', elevation: 90 })).toBe('STOW: parked (El 90.0)');
    expect(formatAntennaArrival({ ...at, mode: 'maintenance', elevation: 5 })).toBe('MAINTENANCE: parked (El 5.0)');
    // MANUAL prints two decimals, so a 0.01 deg nudge reads as moved (Phase 33 D8, nats-r8-s23-F2)
    expect(formatAntennaArrival({ ...at, mode: 'manual', azimuth: -206.89, elevation: 35.1 })).toBe('MANUAL: at Az 153.11, El 35.10');
  });

  it('names step-track on the tracking line, so engaging it logs (nats-r4-s10-F1)', () => {
    const msg = formatAntennaEvent({ trackingMode: 'program-track', isStepTrackEnabled: true, isPowered: true, isLocked: true, isBeaconLocked: true });

    expect(msg).toBe('Tracking mode: PROGRAM-TRACK + STEP-TRACK, Power ON, Antenna LOCKED');
  });

  it('marks an automatic modem stop with its reason (nats-r4-s11-F3)', () => {
    expect(formatTxConfigEvent({ uuid: 'tx', modem: 1, config: modem(), action: 'transmit-off', reason: 'handover' })).toBe('M1: Transmission STOPPED (handover)');
    expect(formatTxConfigEvent({ uuid: 'tx', modem: 1, config: modem(), reason: 'handover' })).toBeNull();
  });
});

describe('EventAutoLogger antenna lines (nats-r4-s10-F1)', () => {
  beforeEach(() => {
    EventBus.destroy();
    OpsLogManager.destroy();
    EventAutoLogger.destroy();
    OpsLogManager.initialize();
    EventAutoLogger.getInstance().initialize();
  });

  afterEach(() => {
    EventAutoLogger.destroy();
    OpsLogManager.destroy();
    EventBus.destroy();
  });

  it('writes no start-of-shift line, and the step-track switch at once (Phase 32 D2, nats-r7-s04-F1)', () => {
    const state = { trackingMode: 'program-track' as const, isPowered: true, isLocked: false, isBeaconLocked: true, isStepTrackEnabled: false };
    // The start-up state and its lock settling are the silent baseline
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...state } as never);
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...state, isLocked: false, isBeaconLocked: false } as never);
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...state, isLocked: true, isStepTrackEnabled: true } as never);

    expect(
      OpsLogManager.getInstance()
        .getEntries()
        .map((e) => e.message)
    ).toEqual(['Tracking mode: PROGRAM-TRACK + STEP-TRACK, Power ON, Antenna LOCKED']);
  });

  it('takes a running antenna as the baseline, so a first command that is not a mode change still logs (Phase 32 D2)', () => {
    const antennaState = { uuid: 'ant-vt', trackingMode: 'program-track' as const, isPowered: true, isLocked: true, isBeaconLocked: true, isStepTrackEnabled: false };
    (globalThis as unknown as { signalRange?: unknown }).signalRange = {
      simulationManager: { groundStations: [{ state: { id: 'VT-01' }, antennas: [{ state: antennaState }], rfFrontEnds: [], receivers: [], transmitters: [] }] },
    };
    try {
      EventBus.getInstance().emit(Events.UPDATE, 16 as never);
      // A lock flip on the running dish: still the start-up state
      EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...antennaState, isLocked: false, isBeaconLocked: false } as never);
      EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...antennaState, isPowered: false } as never);

      const entries = OpsLogManager.getInstance().getEntries();
      expect(entries.map((e) => e.message)).toEqual(['Tracking mode: PROGRAM-TRACK, Power OFF, Antenna LOCKED']);
      expect(entries[0].source).toBe('VT-01 ANT');
    } finally {
      (globalThis as unknown as { signalRange?: unknown }).signalRange = undefined;
    }
  });

  it('writes a Move to Target to a new bird as one UNLOCKED line from the running baseline (Phase 32 D2, nats-r7-s04-F1)', () => {
    const antennaState = {
      uuid: 'ant-vt',
      trackingMode: 'program-track' as const,
      isPowered: true,
      isLocked: true,
      isBeaconLocked: true,
      isStepTrackEnabled: false,
      targetSatelliteId: 7,
      beaconFrequencyHz: 4175.5e6,
    };
    (globalThis as unknown as { signalRange?: unknown }).signalRange = {
      simulationManager: { groundStations: [{ state: { id: 'VT-01' }, antennas: [{ state: antennaState }], rfFrontEnds: [], receivers: [], transmitters: [] }] },
    };
    try {
      EventBus.getInstance().emit(Events.UPDATE, 16 as never);
      // The target change (new beacon, repositioning) then the Move to Target emission
      const moving = { ...antennaState, targetSatelliteId: 8, beaconFrequencyHz: 4180e6, isSlewing: true, isLocked: false, isBeaconLocked: false };
      EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, moving as never);
      EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, moving as never);

      expect(
        OpsLogManager.getInstance()
          .getEntries()
          .map((e) => e.message)
      ).toEqual(['Tracking mode: PROGRAM-TRACK, Power ON, Antenna UNLOCKED, Beacon freq: 4180.00 MHz']);
    } finally {
      (globalThis as unknown as { signalRange?: unknown }).signalRange = undefined;
    }
  });
});

describe('EventAutoLogger station tags (nats-r3-s11-F1)', () => {
  const vtModem = modem();
  const meModem = modem();

  const setStations = (stations: unknown[] | undefined) => {
    (globalThis as unknown as { signalRange?: unknown }).signalRange = stations ? { simulationManager: { groundStations: stations } } : undefined;
  };

  const station = (id: string, txModem: TransmitterModem) => ({
    state: { id },
    antennas: [],
    rfFrontEnds: [],
    receivers: [],
    transmitters: [{ state: { uuid: `${id}-tx`, modems: [txModem] } }],
  });

  beforeEach(() => {
    EventBus.destroy();
    OpsLogManager.destroy();
    EventAutoLogger.destroy();
    OpsLogManager.initialize();
    EventAutoLogger.getInstance().initialize();
  });

  afterEach(() => {
    EventAutoLogger.destroy();
    OpsLogManager.destroy();
    EventBus.destroy();
    setStations(undefined);
  });

  const lastEntry = () => {
    const entries = OpsLogManager.getInstance().getEntries();

    return entries[entries.length - 1];
  };

  it('tags each entry with its station in a two-station scenario', () => {
    setStations([station('VT-01', vtModem), station('ME-02', meModem)]);

    EventBus.getInstance().emit(Events.TX_CONFIG_CHANGED, { uuid: 'ME-02-tx', modem: 1, config: meModem, action: 'transmit-on' });

    expect(lastEntry().message).toBe('M1: Transmission STARTED, 1057.00 MHz, QPSK 3/4');
    expect(lastEntry().source).toBe('ME-02 TX');
  });

  it('logs the same line once per station instead of deduping across stations', () => {
    setStations([station('VT-01', vtModem), station('ME-02', meModem)]);

    EventBus.getInstance().emit(Events.TX_CONFIG_CHANGED, { uuid: 'VT-01-tx', modem: 1, config: vtModem, action: 'transmit-off' });
    EventBus.getInstance().emit(Events.TX_CONFIG_CHANGED, { uuid: 'ME-02-tx', modem: 1, config: meModem, action: 'transmit-off' });

    const sources = OpsLogManager.getInstance()
      .getEntries()
      .filter((e) => e.message === 'M1: Transmission STOPPED')
      .map((e) => e.source);
    expect(sources).toEqual(['VT-01 TX', 'ME-02 TX']);
  });

  it('tags a single-station scenario too (nats-r6-s15-F1)', () => {
    setStations([station('VT-01', vtModem)]);

    EventBus.getInstance().emit(Events.TX_CONFIG_CHANGED, { uuid: 'VT-01-tx', modem: 1, config: vtModem, action: 'config' });

    expect(lastEntry().source).toBe('VT-01 TX');
  });

  it('tags an RF FE line whose state object a sync replaced (nats-r6-s15-F1)', () => {
    const rf = (uuid: string) => ({ state: { uuid }, bucModule: { state: {} }, lnbModule: { state: {} } });
    setStations([
      { ...station('VT-01', vtModem), rfFrontEnds: [rf('rf-vt')] },
      { ...station('ME-02', meModem), rfFrontEnds: [rf('rf-me')] },
    ]);

    // A whole front-end state matches by its uuid
    EventBus.getInstance().emit(Events.RF_FE_POWER_CHANGED, { uuid: 'rf-me', lnb: { isPowered: false } } as never);
    expect(lastEntry().source).toBe('ME-02 RF FE');

    // A single station owns every RF event, whatever object it carries
    setStations([{ ...station('VT-01', vtModem), rfFrontEnds: [rf('rf-vt')] }]);
    EventBus.getInstance().emit(Events.RF_FE_BUC_CHANGED, { isMuted: true } as never);
    expect(lastEntry().message).toBe('BUC output MUTED');
    expect(lastEntry().source).toBe('VT-01 RF FE');
  });

  it('writes nothing for a TX or RX modem tab selection, a view (nats-r6-s08-F1)', () => {
    setStations([station('VT-01', vtModem)]);

    EventBus.getInstance().emit(Events.TX_ACTIVE_MODEM_CHANGED, { uuid: 'VT-01-tx', activeModem: 2 });
    EventBus.getInstance().emit(Events.RX_ACTIVE_MODEM_CHANGED, { uuid: 'VT-01-rx', activeModem: 2 });

    expect(OpsLogManager.getInstance().getEntries()).toEqual([]);
  });

  it('writes one arrival line per commanded move, station-tagged (nats-r6-s11-F1)', () => {
    const antennaState = { uuid: 'ant-vt' };
    setStations([{ ...station('VT-01', vtModem), antennas: [{ state: antennaState }] }]);

    EventBus.getInstance().emit(Events.ANTENNA_SLEW_COMPLETE, {
      state: antennaState as never,
      mode: 'stow',
      azimuth: 153.1,
      elevation: 90,
      targetSatelliteId: null,
      targetSatelliteName: null,
    });

    expect(lastEntry().message).toBe('STOW: parked (El 90.0)');
    expect(lastEntry().source).toBe('VT-01 ANT');
  });

  it('tags a tune on a receiver built from getDefaultState() with its own station (Phase 33 D9, nats-r7-s03-F1)', () => {
    // As S3 builds its stations: VT-01 from the defaults, ME-02 spread over
    // them. Each built alone: the modem buttons' fixed ids would collide in
    // jsdom's id lookup
    document.body.innerHTML = '<div id="rx-vt"></div>';
    const rxVt = new Receiver('rx-vt', [], Receiver.getDefaultState());
    document.body.innerHTML = '<div id="rx-me"></div>';
    const rxMe = new Receiver('rx-me', [], { ...Receiver.getDefaultState(), activeModem: 1 });
    expect(rxVt.state.uuid).not.toBe('default');
    expect(rxMe.state.uuid).not.toBe(rxVt.state.uuid);
    setStations([
      { ...station('VT-01', vtModem), receivers: [rxVt] },
      { ...station('ME-02', meModem), receivers: [rxMe] },
    ]);

    rxMe.applyChanges();

    expect(lastEntry().message).toMatch(/^M1: Tuned to /u);
    expect(lastEntry().source).toBe('ME-02 RX');
    document.body.innerHTML = '';
  });

  it('logAction writes an automatic action like a manual one, station-tagged', () => {
    EventAutoLogger.getInstance().logAction('HPA disabled (handover)', 'RF FE', 'VT-01');

    expect(lastEntry().message).toBe('HPA disabled (handover)');
    expect(lastEntry().source).toBe('VT-01 RF FE');
  });
});

describe('Phase 30 Ops Log (nats-r5 D1, D2, D3)', () => {
  beforeEach(() => {
    EventBus.destroy();
    OpsLogManager.destroy();
    EventAutoLogger.destroy();
    OpsLogManager.initialize();
    EventAutoLogger.getInstance().initialize();
  });

  afterEach(() => {
    EventAutoLogger.destroy();
    OpsLogManager.destroy();
    EventBus.destroy();
  });

  const messages = () =>
    OpsLogManager.getInstance()
      .getEntries()
      .map((e) => e.message);

  const programTrack = { trackingMode: 'program-track' as const, isPowered: true, isLocked: false, isBeaconLocked: false, isStepTrackEnabled: false, beaconFrequencyHz: 4175.5e6 };

  it('logs at advanced difficulty (nats-r5-s16-F2)', () => {
    EventAutoLogger.getInstance().logAction('HPA disabled', 'RF FE');

    expect(messages()).toEqual(['HPA disabled']);
  });

  it('restores the alarm baseline silently and logs a genuine later clear once', () => {
    const bus = EventBus.getInstance();
    const alarms = [{ assetId: 'VT-01', equipmentType: 'ANT', equipmentIndex: 0, severity: 'warning', message: 'Ephemeris stale' }] as const;
    bus.emit(Events.ALARM_STATE_CHANGED, { alarms: [...alarms], highestSeverity: 'warning', restored: true });
    bus.emit(Events.ALARM_STATE_CHANGED, { alarms: [...alarms], highestSeverity: 'warning', restored: true });
    bus.emit(Events.ALARM_STATE_CHANGED, { alarms: [...alarms], highestSeverity: 'warning' });
    expect(messages()).toEqual([]);
    bus.emit(Events.ALARM_STATE_CHANGED, { alarms: [], highestSeverity: 'success' });
    expect(messages()).toEqual(['ALARM cleared: Ephemeris stale']);
    bus.emit(Events.ALARM_STATE_CHANGED, { alarms: [], highestSeverity: 'success' });
    expect(messages()).toHaveLength(1);
  });

  it('writes one line per mode command, completed by the target beacon (nats-r5-s02-F1)', () => {
    const bus = EventBus.getInstance();
    // PROGRAM: no target yet, so no beacon frequency
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, targetSatelliteId: null } as never);
    // Move to Target: the target, then the slew, each emit the state
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, targetSatelliteId: 7 } as never);
    EventAutoLogger.getInstance().logAction('PROGRAM: slewing to TIDEMARK-1', 'ANT');
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, targetSatelliteId: 7 } as never);

    expect(messages()).toEqual(['Tracking mode: PROGRAM-TRACK, Power ON, Antenna UNLOCKED, Beacon freq: 4175.50 MHz', 'PROGRAM: slewing to TIDEMARK-1']);
  });

  it('does not write the last antenna line again when the logger is rebuilt (nats-r5-s10-F1)', () => {
    const locked = { ...programTrack, isLocked: true, targetSatelliteId: 7 };
    // Start-up baseline, then the Move to Target command writes the line
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, targetSatelliteId: null } as never);
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, locked as never);
    EventAutoLogger.destroy();
    EventAutoLogger.getInstance().initialize();
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, locked as never);

    expect(messages()).toEqual(['Tracking mode: PROGRAM-TRACK, Power ON, Antenna LOCKED, Beacon freq: 4175.50 MHz']);
  });

  it('writes no line when only the lock word flips: mode, power and beacon do (nats-r6-s03-F1, s11-F1)', () => {
    const bus = EventBus.getInstance();
    const maint = { ...programTrack, trackingMode: 'maintenance' as const, targetSatelliteId: null };
    // Start-up baseline, then the MAINT command
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, targetSatelliteId: null } as never);
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...maint, isBeaconLocked: true } as never);
    SimClock.advanceRun(5_000);
    // Weather ticks and syncs re-emit as the beacon comes and goes
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...maint, isBeaconLocked: false } as never);
    SimClock.advanceRun(5_000);
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...maint, isBeaconLocked: true } as never);
    SimClock.advanceRun(5_000);
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...maint, isBeaconLocked: true, isPowered: false } as never);

    expect(messages()).toEqual(['Tracking mode: MAINTENANCE, Power ON, Antenna LOCKED', 'Tracking mode: MAINTENANCE, Power OFF, Antenna LOCKED']);
  });

  it('completes a line with a beacon that arrives after a lock flip, keeping its lock word', () => {
    const bus = EventBus.getInstance();
    // Start-up baseline in MANUAL, then PROGRAM picked
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, trackingMode: 'manual', targetSatelliteId: null } as never);
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, targetSatelliteId: null } as never);
    bus.emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, isLocked: true, targetSatelliteId: 7 } as never);

    expect(messages()).toEqual(['Tracking mode: PROGRAM-TRACK, Power ON, Antenna UNLOCKED, Beacon freq: 4175.50 MHz']);
  });

  it('logs a new beacon frequency on the same mode', () => {
    const manual = { ...programTrack, trackingMode: 'manual' as const, targetSatelliteId: null };
    // Start-up baseline in PROGRAM, then MANUAL picked
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, targetSatelliteId: null } as never);
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, manual as never);
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...manual, beaconFrequencyHz: 4165e6 } as never);

    expect(messages()).toEqual([
      'Tracking mode: MANUAL, Power ON, Antenna UNLOCKED, Beacon freq: 4175.50 MHz',
      'Tracking mode: MANUAL, Power ON, Antenna UNLOCKED, Beacon freq: 4165.00 MHz',
    ]);
  });

  it('logs nothing emitted inside runWithoutLogging (a tab open, nats-r5-s07-F2)', () => {
    EventAutoLogger.getInstance().runWithoutLogging(() => {
      EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, isLocked: true, targetSatelliteId: 7 } as never);
    });
    expect(messages()).toEqual([]);

    // A real mode change afterwards still logs
    EventBus.getInstance().emit(Events.ANTENNA_STATE_CHANGED, { ...programTrack, isStepTrackEnabled: true, isLocked: true, targetSatelliteId: 7 } as never);
    expect(messages()).toEqual(['Tracking mode: PROGRAM-TRACK + STEP-TRACK, Power ON, Antenna LOCKED, Beacon freq: 4175.50 MHz']);
  });

  it('writes the RX modulation and FEC like the TX line (nats-r5-s06-F3)', () => {
    const config = { antenna_id: 1, modemNumber: 1, frequency: 1422, bandwidth: 24, modulation: 'QPSK', fec: '3/4', isPowered: true };

    expect(formatRxConfigEvent({ uuid: 'rx', modem: 1, config } as never)).toBe('M1: Tuned to 1422.00 MHz, BW 24.0 MHz, QPSK 3/4');
  });

  describe('alarm lines (nats-r5-s17-F1)', () => {
    const sun = { severity: 'warning' as const, message: 'SUN TRANSIT: ELEVATED SKY NOISE (3.1 dB)', assetId: 'VT-01', equipmentType: 'ANT', equipmentIndex: 0 };
    const signal = { severity: 'info' as const, message: 'Signal(s) Detected', assetId: 'VT-01', equipmentType: 'RX', equipmentIndex: 0 };
    const emitAlarms = (alarms: unknown[]) => EventBus.getInstance().emit(Events.ALARM_STATE_CHANGED, { alarms, highestSeverity: 'warning' } as never);

    it('logs a raise and a clear once each, stamped as SYSTEM lines with the ticker source, and skips info', () => {
      emitAlarms([sun, signal]);
      emitAlarms([{ ...sun, message: 'SUN TRANSIT: ELEVATED SKY NOISE (4.0 dB)' }, signal]);
      emitAlarms([]);

      const entries = OpsLogManager.getInstance().getEntries();
      // A label still carrying its value: the clear writes the last one seen
      expect(entries.map((e) => e.message)).toEqual(['ALARM raised: SUN TRANSIT: ELEVATED SKY NOISE (3.1 dB)', 'ALARM cleared: SUN TRANSIT: ELEVATED SKY NOISE (4.0 dB)']);
      expect(entries.map((e) => e.source)).toEqual(['VT-01(ANT1)', 'VT-01(ANT1)']);
      expect(entries.map((e) => e.category)).toEqual(['system', 'system']);
    });

    const emitWithClears = (alarms: unknown[], cleared: unknown[]) =>
      EventBus.getInstance().emit(Events.ALARM_STATE_CHANGED, { alarms, cleared, highestSeverity: 'warning' } as never);

    it('writes the live detail at the raise and the live value at the clear, with the peak while up (Phase 32 D5/D9, nats-r6-s16-F1, nats-r7-s05-F1)', () => {
      const buc = { severity: 'warning' as const, message: 'BUC high current draw', detail: '4.52 A', assetId: 'VT-01', equipmentType: 'RF', equipmentIndex: 0 };
      emitAlarms([buc]);
      emitAlarms([{ ...buc, detail: '4.61 A' }]);
      emitAlarms([{ ...buc, detail: '4.31 A' }]);
      // AlarmService re-reads the value as the alarm goes
      emitWithClears([], [{ ...buc, detail: '2.69 A' }]);

      expect(messages()).toEqual(['ALARM raised: BUC high current draw (4.52 A)', 'ALARM cleared: BUC high current draw (2.69 A, peak 4.61 A)']);
    });

    it('writes no stale value on a clear with no live value, only the peak (Phase 32 D5)', () => {
      const buc = { severity: 'warning' as const, message: 'BUC high current draw', detail: '4.52 A', assetId: 'VT-01', equipmentType: 'RF', equipmentIndex: 0 };
      emitAlarms([buc]);
      emitAlarms([{ ...buc, detail: '4.61 A' }]);
      emitAlarms([]);

      expect(messages()).toEqual(['ALARM raised: BUC high current draw (4.52 A)', 'ALARM cleared: BUC high current draw (peak 4.61 A)']);
    });

    it('keeps the peak of an IM3 and an LNB compression detail (Phase 33 D6, nats-r7-s12-F2, nats-r8-s07-F1)', () => {
      const overdrive = {
        severity: 'warning' as const,
        message: 'HPA overdrive - IMD degradation',
        detail: 'IM3 -30.2 dBc',
        assetId: 'VT-01',
        equipmentType: 'RF',
        equipmentIndex: 0,
      };
      const overload = {
        severity: 'warning' as const,
        message: 'LNB input overload - gain compression',
        detail: '0.6 dB',
        assetId: 'VT-01',
        equipmentType: 'RF',
        equipmentIndex: 0,
      };
      emitAlarms([overdrive, overload]);
      emitAlarms([
        { ...overdrive, detail: 'IM3 -24.8 dBc' },
        { ...overload, detail: '0.7 dB' },
      ]);
      emitAlarms([
        { ...overdrive, detail: 'IM3 -27.5 dBc' },
        { ...overload, detail: '0.5 dB' },
      ]);
      emitWithClears(
        [],
        [
          { ...overdrive, detail: 'IM3 -43.1 dBc' },
          { ...overload, detail: '0.0 dB' },
        ]
      );

      expect(messages()).toEqual([
        'ALARM raised: HPA overdrive - IMD degradation (IM3 -30.2 dBc)',
        'ALARM raised: LNB input overload - gain compression (0.6 dB)',
        'ALARM cleared: HPA overdrive - IMD degradation (IM3 -43.1 dBc, peak -24.8 dBc)',
        'ALARM cleared: LNB input overload - gain compression (0.0 dB, peak 0.7 dB)',
      ]);
    });

    it('writes only the IM3 peak when the HPA went off with the alarm (no live IM3)', () => {
      const overdrive = {
        severity: 'warning' as const,
        message: 'HPA overdrive - IMD degradation',
        detail: 'IM3 -24.8 dBc',
        assetId: 'VT-01',
        equipmentType: 'RF',
        equipmentIndex: 0,
      };
      emitAlarms([overdrive]);
      emitWithClears([], [{ ...overdrive, detail: undefined }]);

      expect(messages()).toEqual(['ALARM raised: HPA overdrive - IMD degradation (IM3 -24.8 dBc)', 'ALARM cleared: HPA overdrive - IMD degradation (peak -24.8 dBc)']);
    });

    it('keeps a text detail as it is and adds no peak to it (Phase 32 D9)', () => {
      const margin = {
        severity: 'warning' as const,
        message: 'Degraded margin',
        detail: 'Modem 1: Es/N0 5.5 dB, need 5.0 dB',
        assetId: 'VT-01',
        equipmentType: 'RX',
        equipmentIndex: 0,
      };
      emitAlarms([margin]);
      emitWithClears([], [{ ...margin, detail: 'Modem 1: Es/N0 9.9 dB, need 5.0 dB' }]);

      expect(messages()).toEqual(['ALARM raised: Degraded margin (Modem 1: Es/N0 5.5 dB, need 5.0 dB)', 'ALARM cleared: Degraded margin (Modem 1: Es/N0 9.9 dB, need 5.0 dB)']);
    });

    it('writes escalated only from a logged warning to an error, and a fall as nothing (Phase 32 D6)', () => {
      const sunAlarm = { severity: 'warning' as const, message: 'SUN TRANSIT: ELEVATED SKY NOISE', detail: '3.1 dB', assetId: 'VT-01', equipmentType: 'ANT', equipmentIndex: 0 };
      emitAlarms([sunAlarm]);
      emitAlarms([{ ...sunAlarm, severity: 'error', detail: '16.0 dB' }]);
      emitAlarms([{ ...sunAlarm, detail: '2.0 dB' }]);
      emitAlarms([{ ...sunAlarm, severity: 'info', detail: '0.6 dB' }]);
      emitWithClears([], [{ ...sunAlarm, detail: '0.5 dB' }]);

      expect(messages()).toEqual([
        'ALARM raised: SUN TRANSIT: ELEVATED SKY NOISE (3.1 dB)',
        'ALARM escalated: SUN TRANSIT: ELEVATED SKY NOISE (16.0 dB)',
        'ALARM cleared: SUN TRANSIT: ELEVATED SKY NOISE (0.5 dB, peak 16.0 dB)',
      ]);
    });

    it('writes an info alarm rising to a warning as raised, and an info-only alarm never (Phase 32 D6, nats-r7-s03-F2)', () => {
      const rain = { severity: 'info' as const, message: 'RAIN FADE', detail: 'fade 0.3 dB', assetId: 'VT-01', equipmentType: 'ANT', equipmentIndex: 0 };
      emitAlarms([rain, signal]);
      emitAlarms([{ ...rain, severity: 'warning', detail: 'fade 1.2 dB' }, signal]);
      emitWithClears([signal], [{ ...rain, detail: 'fade 0.2 dB' }]);

      expect(messages()).toEqual(['ALARM raised: RAIN FADE (fade 1.2 dB)', 'ALARM cleared: RAIN FADE (fade 0.2 dB, peak 1.2 dB)']);
    });

    it('writes an info alarm jumping straight to an error as raised', () => {
      const ice = { severity: 'info' as const, message: 'ICE ON FEED', detail: '0.4 dB', assetId: 'VT-01', equipmentType: 'ANT', equipmentIndex: 0 };
      emitAlarms([ice]);
      emitAlarms([{ ...ice, severity: 'error', detail: '5.1 dB' }]);

      expect(messages()).toEqual(['ALARM raised: ICE ON FEED (5.1 dB)']);
    });

    it('writes every raise/clear pair of an error alarm, inside the relog window too (Phase 32 D4, nats-r7-s08-F1)', () => {
      const lost = { severity: 'error' as const, message: 'Carrier lock lost', detail: 'Modem 1: no carrier', assetId: 'VT-01', equipmentType: 'RX', equipmentIndex: 0 };
      emitAlarms([lost]);
      emitAlarms([]);
      SimClock.advanceRun(3_000);
      emitAlarms([lost]);
      emitAlarms([]);

      expect(messages()).toEqual([
        'ALARM raised: Carrier lock lost (Modem 1: no carrier)',
        'ALARM cleared: Carrier lock lost',
        'ALARM raised: Carrier lock lost (Modem 1: no carrier)',
        'ALARM cleared: Carrier lock lost',
      ]);
    });

    it('writes a warning re-raised inside the window as "up since" when the window closes, never with a late stamp alone (Phase 32 D4)', () => {
      const margin = {
        severity: 'warning' as const,
        message: 'Degraded margin',
        detail: 'Modem 1: Es/N0 5.6 dB, need 5.0 dB',
        assetId: 'VT-01',
        equipmentType: 'RX',
        equipmentIndex: 0,
      };
      const clock = (ms: number) => {
        const d = new Date(ms);
        return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => n.toString().padStart(2, '0')).join(':');
      };
      emitAlarms([margin]);
      emitAlarms([]);
      SimClock.advanceRun(5_000);
      const upSince = clock(SimClock.nowMs());
      emitAlarms([margin]);
      expect(messages()).toHaveLength(2);

      // Still up when the window closes: written then, with when it came up
      SimClock.advanceRun(25_000);
      EventBus.getInstance().emit(Events.UPDATE, 16 as never);
      expect(messages()[2]).toBe(`ALARM raised: Degraded margin (Modem 1: Es/N0 5.6 dB, need 5.0 dB, up since ${upSince})`);
      emitAlarms([]);
      expect(messages()).toHaveLength(4);
    });

    it('logs a flapping alarm once per 30 s', () => {
      emitAlarms([sun]);
      emitAlarms([]);
      SimClock.advanceRun(5_000);
      emitAlarms([sun]);
      emitAlarms([]);
      expect(messages()).toHaveLength(2);

      SimClock.advanceRun(30_000);
      emitAlarms([sun]);
      expect(messages()).toHaveLength(3);
    });
  });
});
