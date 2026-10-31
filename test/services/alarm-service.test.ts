import { Mock, vi } from 'vitest';
import { Events } from '../../src/events/events';
import { OpsLogManager } from '../../src/ops-log/ops-log-manager';
import { AlarmService } from '../../src/services/alarm-service';
import { FIXED_STEP_MS, SimClock } from '../../src/simulation/sim-clock';

type AlarmLike = { severity: string; message: string };

type GroundStationLike = {
  state: { id: string; isOperational: boolean };
  antennas: Array<{ getStatusAlarms: () => AlarmLike[] }>;
  rfFrontEnds: Array<{ getStatusAlarms: (rfCase: number) => AlarmLike[] }>;
  transmitters: Array<{ getStatusAlarms: () => AlarmLike[] }>;
  receivers: Array<{ getStatusAlarms: () => AlarmLike[] }>;
};

let updateHandler: ((dt: any) => void) | null = null;

const mockEventBus = {
  on: vi.fn((event: string, cb: (dt: any) => void) => {
    if (event === Events.UPDATE) updateHandler = cb;
  }),
  off: vi.fn(),
  emit: vi.fn(),
  once: vi.fn(),
  clear: vi.fn(),
};

const mockSimulationManager = {
  groundStations: [] as GroundStationLike[],
};

const mockSimulationGetInstance = vi.fn(() => mockSimulationManager);

vi.mock('@app/events/event-bus', () => ({
  EventBus: {
    getInstance: () => mockEventBus,
  },
}));

/**
 * Whether the scenario clock counts as running for raise stamps: most cases
 * stamp on the (mocked) wall clock as before Phase 33 D5, so it reads as
 * running; 'real' defers to OpsLogManager like the app
 */
const clock = vi.hoisted(() => ({ running: true as boolean | 'real' }));

vi.mock('@app/simulation/sim-time', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/simulation/sim-time')>();
  return {
    ...actual,
    isScenarioClockRunning: () => (clock.running === 'real' ? actual.isScenarioClockRunning() : clock.running),
  };
});

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => mockSimulationGetInstance(),
    hasInstance: () => false,
  },
}));

function gs(overrides: Partial<GroundStationLike> = {}): GroundStationLike {
  return {
    state: { id: 'gs-1', isOperational: true },
    antennas: [],
    rfFrontEnds: [],
    transmitters: [],
    receivers: [],
    ...overrides,
  };
}

function alarm(severity: string, message: string): AlarmLike {
  return { severity, message };
}

/** Past the service's start-up settle (Phase 31 D2), so the next UPDATE polls */
function settleService(): void {
  SimClock.advanceRun(AlarmService.STARTUP_SETTLE_MS);
}

/** Run `ms` of fixed steps: run and scenario time both move (Phase 33 D7 polls on the scenario second) */
function runSteps(ms: number): void {
  for (let i = 0; i < Math.round(ms / FIXED_STEP_MS); i++) SimClock.step();
}

describe('AlarmService', () => {
  beforeEach(() => {
    // The poll snapshot and the raise stamps are static: no case reads another's
    AlarmService.destroy();
    (AlarmService as any).instance_ = null;
    updateHandler = null;
    mockSimulationManager.groundStations = [];

    mockEventBus.on.mockClear();
    mockEventBus.off.mockClear();
    mockEventBus.emit.mockClear();

    mockSimulationGetInstance.mockClear();

    vi.spyOn(Date, 'now').mockReturnValue(1000);
    clock.running = true;
  });

  afterEach(() => {
    (Date.now as Mock).mockRestore?.();
    (AlarmService as any).instance_ = null;
    updateHandler = null;
    vi.clearAllMocks();
  });

  it('registers an UPDATE handler and emits every displayable alarm, most severe first (nats-r4-s16-F1)', () => {
    const service = AlarmService.getInstance();
    expect(service).toBeDefined();

    expect(mockEventBus.on).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    expect(typeof updateHandler).toBe('function');

    const operational = gs({
      state: { id: 'alpha', isOperational: true },
      antennas: [
        {
          getStatusAlarms: vi.fn().mockReturnValue([alarm('error', 'ANT FAIL'), alarm('success', 'OK')]),
        },
      ],
      rfFrontEnds: [
        {
          getStatusAlarms: vi.fn().mockImplementation((rfCase: number) => (rfCase === 1 ? [alarm('warning', 'RF WARN')] : [alarm('info', 'RF INFO')])),
        },
      ],
      transmitters: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('info', 'TX INFO')]) }],
      receivers: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'RX WARN')]) }],
    });

    const nonOperational = gs({
      state: { id: 'beta', isOperational: false },
      antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('error', 'NOPE')]) }],
    });

    mockSimulationManager.groundStations = [operational, nonOperational];

    settleService();
    updateHandler?.(16);

    expect(mockSimulationGetInstance).toHaveBeenCalled();
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.ALARM_STATE_CHANGED,
      expect.objectContaining({
        highestSeverity: 'error',
        alarms: [
          expect.objectContaining({
            severity: 'error',
            message: 'ANT FAIL',
            assetId: 'alpha',
            equipmentType: 'ANT',
            equipmentIndex: 0,
          }),
          expect.objectContaining({ severity: 'warning', message: 'RF WARN' }),
          expect.objectContaining({ severity: 'warning', message: 'RX WARN' }),
          expect.objectContaining({ severity: 'info', message: 'RF INFO' }),
          expect.objectContaining({ severity: 'info', message: 'TX INFO' }),
        ],
      })
    );

    // RF front ends should be polled for both cases (1 and 2)
    expect(operational.rfFrontEnds[0].getStatusAlarms).toHaveBeenCalledWith(1);
    expect(operational.rfFrontEnds[0].getStatusAlarms).toHaveBeenCalledWith(2);
  });

  it('does not emit ALARM_STATE_CHANGED when the alarm set is unchanged', () => {
    AlarmService.getInstance();

    const operational = gs({
      state: { id: 'alpha', isOperational: true },
      antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'W')]) }],
    });

    mockSimulationManager.groundStations = [operational];

    settleService();
    updateHandler?.(16);
    runSteps(1500);
    updateHandler?.(16);
    expect(mockSimulationGetInstance).toHaveBeenCalledTimes(2);

    // First tick should emit, second should be suppressed as unchanged
    const emits = mockEventBus.emit.mock.calls.filter(([event]) => event === Events.ALARM_STATE_CHANGED);
    expect(emits.length).toBe(1);
  });

  it('emits success when no displayable alarms exist', () => {
    AlarmService.getInstance();

    const operational = gs({
      state: { id: 'alpha', isOperational: true },
      antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('success', 'OK')]) }],
      transmitters: [{ getStatusAlarms: vi.fn().mockReturnValue([]) }],
      receivers: [{ getStatusAlarms: vi.fn().mockReturnValue([]) }],
    });

    mockSimulationManager.groundStations = [operational];

    settleService();
    updateHandler?.(16);

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.ALARM_STATE_CHANGED,
      expect.objectContaining({
        highestSeverity: 'success',
        alarms: [],
      })
    );
  });

  it('keeps an info alarm on the ticker while a warning is up (nats-r4-s17-F3)', () => {
    AlarmService.getInstance();
    mockSimulationManager.groundStations = [
      gs({
        antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'SUN TRANSIT: ELEVATED SKY NOISE (2.4 dB)')]) }],
        receivers: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('info', 'Signal(s) Detected')]) }],
      }),
    ];

    settleService();
    updateHandler?.(16);

    const [, data] = mockEventBus.emit.mock.calls.find(([event]) => event === Events.ALARM_STATE_CHANGED) ?? [];
    expect(data.highestSeverity).toBe('warning');
    expect(data.alarms.map((a: { message: string }) => a.message)).toEqual(['SUN TRANSIT: ELEVATED SKY NOISE', 'Signal(s) Detected']);
    expect(data.alarms[0].detail).toBe('2.4 dB');
  });

  describe('start-up settle (Phase 31 D2, nats-r6-s01-F1)', () => {
    it('does not poll until 1 s of run time after the service was built', () => {
      SimClock.advanceRun(5_000);
      AlarmService.getInstance();
      mockSimulationManager.groundStations = [gs({ antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'W')]) }] })];
      const emits = () => mockEventBus.emit.mock.calls.filter(([event]) => event === Events.ALARM_STATE_CHANGED).length;

      updateHandler?.(16);
      SimClock.advanceRun(900);
      updateHandler?.(16);
      expect(emits()).toBe(0);
      expect(mockSimulationGetInstance).not.toHaveBeenCalled();

      SimClock.advanceRun(100);
      updateHandler?.(16);
      expect(emits()).toBe(1);
    });

    it('settles again when run time restarts for a new scenario', () => {
      AlarmService.getInstance();
      mockSimulationManager.groundStations = [gs({ antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'W')]) }] })];
      settleService();
      SimClock.advanceRun(5_000);
      updateHandler?.(16);
      expect(mockSimulationGetInstance).toHaveBeenCalledTimes(1);

      SimClock.reset();
      SimClock.advanceRun(500);
      updateHandler?.(16);
      expect(mockSimulationGetInstance).toHaveBeenCalledTimes(1);
      SimClock.advanceRun(1_000);
      updateHandler?.(16);
      expect(mockSimulationGetInstance).toHaveBeenCalledTimes(2);
    });
  });

  describe('raise time (nats-r4-s01-F2)', () => {
    afterEach(() => {
      AlarmService.destroy();
    });

    it('stamps the time an alarm was first polled and keeps it while its live number moves', () => {
      AlarmService.destroy();
      AlarmService.getInstance();
      const rf = { getStatusAlarms: vi.fn((rfCase: number) => (rfCase === 1 ? [alarm('error', 'BUC over-temperature (72.3 °C)')] : [])) };
      const station = gs({ state: { id: 'VT-01', isOperational: true }, rfFrontEnds: [rf] });
      mockSimulationManager.groundStations = [station];

      // A read before any poll collects live and makes no stamp (Phase 34 D8)
      (Date.now as Mock).mockReturnValue(4_000);
      expect(AlarmService.getAlarms(station as any)[0].raisedAtMs).toBeUndefined();

      (Date.now as Mock).mockReturnValue(5_000);
      settleService();
      updateHandler?.(16);
      expect(AlarmService.getAlarms(station as any)[0].raisedAtMs).toBe(5_000);

      // Polled a minute later, the temperature has moved: same alarm, same raise time
      (Date.now as Mock).mockReturnValue(65_000);
      rf.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 1 ? [alarm('error', 'BUC over-temperature (72.0 °C)')] : []));
      runSteps(1_000);
      updateHandler?.(16);
      expect(AlarmService.getAlarms(station as any)[0]).toEqual(expect.objectContaining({ detail: '72.0 °C', raisedAtMs: 5_000 }));
    });

    it('records the raise on the poll, before any Dashboard render, and stamps a re-raise afresh', () => {
      AlarmService.destroy();
      AlarmService.getInstance();
      const antenna = { getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'ACQUIRING LOCK...')]) };
      const station = gs({ state: { id: 'VT-01', isOperational: true }, antennas: [antenna] });
      mockSimulationManager.groundStations = [station];

      (Date.now as Mock).mockReturnValue(1_000);
      settleService();
      updateHandler?.(16);
      const [, polled] = mockEventBus.emit.mock.calls.find(([event]) => event === Events.ALARM_STATE_CHANGED) ?? [];
      expect(polled.alarms[0].raisedAtMs).toBe(1_000);

      // The Dashboard opens later and reads the poll's raise time, not its own
      (Date.now as Mock).mockReturnValue(400_000);
      expect(AlarmService.getAlarms('VT-01')[0].raisedAtMs).toBe(1_000);

      // Cleared on a poll, raised again later: a new raise time
      antenna.getStatusAlarms.mockReturnValue([]);
      runSteps(1_000);
      updateHandler?.(16);
      antenna.getStatusAlarms.mockReturnValue([alarm('warning', 'ACQUIRING LOCK...')]);
      // Between polls the read is the clear poll's snapshot (Phase 34 D8)
      expect(AlarmService.getAlarms('VT-01')).toEqual([]);
      (Date.now as Mock).mockReturnValue(401_000);
      runSteps(1_000);
      updateHandler?.(16);
      expect(AlarmService.getAlarms('VT-01')[0].raisedAtMs).toBe(401_000);
    });
  });

  it('unsubscribes from UPDATE when destroyed', () => {
    AlarmService.getInstance();
    const handler = updateHandler;

    AlarmService.destroy();

    expect(handler).toBeTruthy();
    expect(mockEventBus.off).toHaveBeenCalledWith(Events.UPDATE, handler);

    // Should allow a new instance later
    const next = AlarmService.getInstance();
    expect(next).toBeDefined();
  });

  describe('fixed labels (nats-r5-s05-F1, nats-r5-s14-F2)', () => {
    type ModemInfo = { hasCarrier: boolean; hasLock: boolean; isLowMargin: boolean; effectiveEsN0_dB: number; requiredEsN0_dB: number };
    const receiver = (infos: Record<number, ModemInfo>, powered = true) => ({
      getStatusAlarms: vi.fn().mockReturnValue([alarm('info', 'Signal(s) Detected')]),
      state: { modems: Object.keys(infos).map((n) => ({ modemNumber: Number(n), isPowered: powered })) },
      getSignalsInBandwidth: vi.fn((modem: { modemNumber: number }) => infos[modem.modemNumber]),
    });
    const locked = (esN0: number, isLowMargin: boolean): ModemInfo => ({ hasCarrier: true, hasLock: true, isLowMargin, effectiveEsN0_dB: esN0, requiredEsN0_dB: 5 });

    it('raises "Degraded margin" for a locked modem inside 1 dB of Required, with the Es/N0 in the detail', () => {
      const station = gs({ state: { id: 'VT-01', isOperational: true }, receivers: [receiver({ 1: locked(5.6, true) }) as any] });
      const degraded = AlarmService.getAlarms(station as any).find((a) => a.message === 'Degraded margin');
      expect(degraded).toEqual(expect.objectContaining({ severity: 'warning', equipmentType: 'RX', equipmentIndex: 0 }));
      expect(degraded?.detail).toBe('Modem 1: Es/N0 5.6 dB, need 5.0 dB');
    });

    it('joins the per-modem lock rule into one alarm per label, lost before degraded (Phase 34 D5)', () => {
      const rx = {
        ...receiver({
          1: { ...locked(0, false), hasCarrier: false, hasLock: false },
          2: locked(5.6, true),
          3: { ...locked(5.2, false), hasLock: false },
          4: locked(5.4, true),
        }),
        getLockTransition: vi.fn((modem: { modemNumber: number }) =>
          modem.modemNumber === 1 || modem.modemNumber === 3 ? { hadLock: true, lockLostAtMs: 1, lastSignalId: 'c' } : null
        ),
      };
      const station = gs({ state: { id: 'VT-01', isOperational: true }, receivers: [rx as any] });
      const rxAlarms = AlarmService.getAlarms(station as any).filter((a) => a.message !== 'Signal(s) Detected');
      expect(AlarmService.LOCK_LOST_LABEL).toBe('Carrier lock lost');
      expect(AlarmService.DEGRADED_MARGIN_LABEL).toBe('Degraded margin');
      expect(rxAlarms.map((a) => [a.severity, a.message, a.detail])).toEqual([
        ['error', 'Carrier lock lost', 'Modem 1: no carrier; Modem 3: Es/N0 5.2 dB, locks at 5.5 dB'],
        ['warning', 'Degraded margin', 'Modem 2: Es/N0 5.6 dB, need 5.0 dB; Modem 4: Es/N0 5.4 dB, need 5.0 dB'],
      ]);
    });

    it('raises nothing for a healthy margin, an unlocked modem or a powered-off modem', () => {
      const healthy = gs({ receivers: [receiver({ 1: locked(12, false) }) as any] });
      const unlocked = gs({ receivers: [receiver({ 1: { ...locked(4, false), hasLock: false } }) as any] });
      const off = gs({ receivers: [receiver({ 1: locked(5.6, true) }, false) as any] });
      for (const station of [healthy, unlocked, off]) {
        expect(AlarmService.getAlarms(station as any).map((a) => a.message)).toEqual(['Signal(s) Detected']);
      }
    });

    it('keeps one label while the live value moves, so the raise time holds', () => {
      AlarmService.destroy();
      AlarmService.getInstance();
      const infos = { 1: locked(5.6, true) };
      const station = gs({ state: { id: 'VT-01', isOperational: true }, receivers: [receiver(infos) as any] });
      mockSimulationManager.groundStations = [station];
      (Date.now as Mock).mockReturnValue(5_000);
      settleService();
      updateHandler?.(16);
      expect(AlarmService.getAlarms(station as any)[0].raisedAtMs).toBe(5_000);
      infos[1] = locked(5.3, true);
      (Date.now as Mock).mockReturnValue(9_000);
      runSteps(1_000);
      updateHandler?.(16);
      const [first] = AlarmService.getAlarms(station as any);
      expect(first.message).toBe('Degraded margin');
      expect(first.detail).toBe('Modem 1: Es/N0 5.3 dB, need 5.0 dB');
      expect(first.raisedAtMs).toBe(5_000);
      AlarmService.destroy();
    });

    it('labels the rain-fade alarm "RAIN FADE" for its life and moves the depth into the detail', () => {
      const antenna = { getStatusAlarms: vi.fn().mockReturnValue([alarm('info', 'RAIN FADE (0.5 dB)')]) };
      const station = gs({ antennas: [antenna] });
      expect(AlarmService.getAlarms(station as any)[0]).toEqual(expect.objectContaining({ message: 'RAIN FADE', detail: 'fade 0.5 dB' }));
      antenna.getStatusAlarms.mockReturnValue([alarm('info', 'RAIN FADE (0.7 dB)')]);
      expect(AlarmService.getAlarms(station as any)[0]).toEqual(expect.objectContaining({ message: 'RAIN FADE', detail: 'fade 0.7 dB' }));
    });

    it.each([
      ['BUC high current draw (4.52 A)', 'BUC high current draw', '4.52 A'],
      ['BUC over-temperature (72.0 °C)', 'BUC over-temperature', '72.0 °C'],
      ['BUC approaching saturation (41.3 dBm)', 'BUC approaching saturation', '41.3 dBm'],
      ['HPA over-temperature (71°C)', 'HPA over-temperature', '71°C'],
      ['SUN TRANSIT: ELEVATED SKY NOISE (8.6 dB)', 'SUN TRANSIT: ELEVATED SKY NOISE', '8.6 dB'],
      ['ICE ON FEED (2.6 dB)', 'ICE ON FEED', '2.6 dB'],
      ['HIGH POLARIZATION (12.5°)', 'HIGH POLARIZATION', '12.5°'],
      ['AGC at max gain (29.8 dB) - weak signal', 'AGC at max gain - weak signal', '29.8 dB'],
      ['AGC at min gain (-29.8 dB) - possible interference', 'AGC at min gain - possible interference', '-29.8 dB'],
      ['LNB noise figure degraded (1.20 dB)', 'LNB noise figure degraded', '1.20 dB'],
      ['GPSDO in holdover (1.5 μs error)', 'GPSDO in holdover', '1.5 μs error'],
      ['LNB noise temperature high (131 K)', 'LNB noise temperature high', '131 K'],
      ['HPA overdrive (IM3 -24.8 dBc) - IMD degradation', 'HPA overdrive - IMD degradation', 'IM3 -24.8 dBc'],
      ['LNB input overload (0.7 dB) - gain compression', 'LNB input overload - gain compression', '0.7 dB'],
    ])('moves the live value of "%s" into the detail (Phase 31 D3)', (raw, label, detail) => {
      const station = gs({ antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', raw)]) }] });
      expect(AlarmService.getAlarms(station as any)[0]).toEqual(expect.objectContaining({ message: label, detail }));
    });

    it('leaves a label with no parenthesised value alone', () => {
      const station = gs({
        antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'ACQUIRING LOCK...'), alarm('warning', 'HPA overdrive - IMD degradation')]) }],
      });
      const alarms = AlarmService.getAlarms(station as any);
      expect(alarms.map((a) => a.message)).toEqual(['ACQUIRING LOCK...', 'HPA overdrive - IMD degradation']);
      expect(alarms.map((a) => a.detail)).toEqual([undefined, undefined]);
    });

    it('publishes the moving value on the next poll under the same label and raise time', () => {
      AlarmService.destroy();
      AlarmService.getInstance();
      const rf = { getStatusAlarms: vi.fn((rfCase: number) => (rfCase === 1 ? [alarm('error', 'BUC over-temperature (72.0 °C)')] : [])) };
      mockSimulationManager.groundStations = [gs({ state: { id: 'VT-01', isOperational: true }, rfFrontEnds: [rf] })];
      (Date.now as Mock).mockReturnValue(5_000);
      settleService();
      updateHandler?.(16);
      rf.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 1 ? [alarm('error', 'BUC over-temperature (73.4 °C)')] : []));
      (Date.now as Mock).mockReturnValue(6_000);
      runSteps(1_000);
      updateHandler?.(16);
      const published = mockEventBus.emit.mock.calls.filter(([event]) => event === Events.ALARM_STATE_CHANGED).map(([, data]) => data.alarms[0]);
      expect(published).toHaveLength(2);
      expect(published.map((a) => [a.message, a.detail, a.raisedAtMs])).toEqual([
        ['BUC over-temperature', '72.0 °C', 5_000],
        ['BUC over-temperature', '73.4 °C', 5_000],
      ]);
      AlarmService.destroy();
    });
  });

  describe('live value at the clear (Phase 32 D5, nats-r7-s05-F1, nats-r6-s16-F1)', () => {
    /** Poll once more, past the poll interval, and return the last emitted data */
    const poll = () => {
      runSteps(1_000);
      updateHandler?.(16);
      const calls = mockEventBus.emit.mock.calls.filter(([event]) => event === Events.ALARM_STATE_CHANGED);
      return calls[calls.length - 1]?.[1];
    };

    beforeEach(() => {
      AlarmService.destroy();
      AlarmService.getInstance();
      settleService();
    });

    afterEach(() => {
      AlarmService.destroy();
    });

    it('re-reads the receiver Es/N0 for the modems a cleared Degraded margin named', () => {
      const info = { hasCarrier: true, hasLock: true, isLowMargin: true, effectiveEsN0_dB: 5.5, requiredEsN0_dB: 5 };
      const rx = {
        getStatusAlarms: vi.fn().mockReturnValue([]),
        state: { modems: [{ modemNumber: 1, isPowered: true }] },
        getSignalsInBandwidth: vi.fn(() => info),
      };
      mockSimulationManager.groundStations = [gs({ state: { id: 'VT-01', isOperational: true }, receivers: [rx as any] })];
      updateHandler?.(16);

      // The notch goes in: margin back, the alarm goes on this poll
      info.isLowMargin = false;
      info.effectiveEsN0_dB = 9.9;
      const data = poll();
      expect(data.alarms).toEqual([]);
      expect(data.cleared).toEqual([expect.objectContaining({ message: 'Degraded margin', assetId: 'VT-01', equipmentType: 'RX', detail: 'Modem 1: Es/N0 9.9 dB, need 5.0 dB' })]);
    });

    it('re-reads BUC current, HPA temperature and the antenna weather levels from module state', () => {
      const buc = { currentDraw: 4.6, temperature: 40 };
      const hpa = { temperature: 90 };
      const antennaState = { skyNoiseDegradation_dB: 3.1, iceAccumulation_dB: 2.2, rainRate_mmh: 0 };
      let up = true;
      const rf = {
        getStatusAlarms: vi.fn((rfCase: number) => (up && rfCase === 1 ? [alarm('error', 'BUC high current draw (4.60 A)'), alarm('error', 'HPA over-temperature (90°C)')] : [])),
        bucModule: { state: buc },
        hpaModule: { state: hpa },
      };
      const antenna = {
        getStatusAlarms: vi.fn(() => (up ? [alarm('warning', 'SUN TRANSIT: ELEVATED SKY NOISE (3.1 dB)'), alarm('warning', 'ICE ON FEED (2.2 dB)')] : [])),
        state: antennaState,
      };
      mockSimulationManager.groundStations = [gs({ state: { id: 'VT-01', isOperational: true }, rfFrontEnds: [rf as any], antennas: [antenna as any] })];
      updateHandler?.(16);

      up = false;
      buc.currentDraw = 2.69;
      hpa.temperature = 84.2;
      antennaState.skyNoiseDegradation_dB = 0.4;
      antennaState.iceAccumulation_dB = 0;
      const data = poll();
      expect(Object.fromEntries(data.cleared.map((a: { message: string; detail?: string }) => [a.message, a.detail]))).toEqual({
        'BUC high current draw': '2.69 A',
        'HPA over-temperature': '84°C',
        'SUN TRANSIT: ELEVATED SKY NOISE': '0.4 dB',
        'ICE ON FEED': '0.0 dB',
      });
    });

    describe('LNB compression and HPA IM3 (Phase 33 D6, nats-r8-s07-F1, nats-r7-s12-F2)', () => {
      const lnbModule = { compressionDb: 0.7, state: {} };
      const hpa = { isPowered: true, imdLevel: -24.8, temperature: 40 };
      let up = true;
      const rf = {
        getStatusAlarms: vi.fn((rfCase: number) =>
          up && rfCase === 1 ? [alarm('warning', 'LNB input overload (0.7 dB) - gain compression'), alarm('warning', 'HPA overdrive (IM3 -24.8 dBc) - IMD degradation')] : []
        ),
        lnbModule,
        hpaModule: { state: hpa },
      };
      const clearedDetails = (data: { cleared: { message: string; detail?: string }[] }) => Object.fromEntries(data.cleared.map((a) => [a.message, a.detail]));

      beforeEach(() => {
        up = true;
        lnbModule.compressionDb = 0.7;
        Object.assign(hpa, { isPowered: true, imdLevel: -24.8 });
        mockSimulationManager.groundStations = [gs({ state: { id: 'VT-01', isOperational: true }, rfFrontEnds: [rf as any] })];
        updateHandler?.(16);
      });

      it('re-reads the LNB compression and the HPA IM3 level at the clear', () => {
        up = false;
        lnbModule.compressionDb = 0;
        hpa.imdLevel = -43.1;
        expect(clearedDetails(poll())).toEqual({
          'LNB input overload - gain compression': '0.0 dB',
          'HPA overdrive - IMD degradation': 'IM3 -43.1 dBc',
        });
      });

      it('quotes no IM3 once the HPA is off (its -80 dBc no-IMD floor)', () => {
        up = false;
        Object.assign(hpa, { isPowered: false, imdLevel: -80 });
        const data = poll();
        const overdrive = data.cleared.find((a: { message: string }) => a.message === 'HPA overdrive - IMD degradation');
        expect(overdrive).toBeDefined();
        expect('detail' in overdrive).toBe(false);
      });
    });

    it('sends no detail for an alarm with no live value to re-read', () => {
      let up = true;
      const antenna = { getStatusAlarms: vi.fn(() => (up ? [alarm('warning', 'AUTO TRACK FAILED')] : [])) };
      mockSimulationManager.groundStations = [gs({ antennas: [antenna] })];
      updateHandler?.(16);
      up = false;
      const data = poll();
      expect(data.cleared).toHaveLength(1);
      expect(data.cleared[0].message).toBe('AUTO TRACK FAILED');
      expect('detail' in data.cleared[0]).toBe(false);
    });
  });

  describe('raise time waits for the scenario clock (Phase 33 D5, nats-r8-s03-F1)', () => {
    afterEach(() => {
      OpsLogManager.destroy();
      AlarmService.destroy();
    });

    it('stamps nothing before the Ops Log seeds the clock, then the scenario start, never the wall clock', () => {
      AlarmService.destroy();
      clock.running = 'real';
      const station = gs({ state: { id: 'ME-02', isOperational: true }, antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'ICE ON FEED (0.5 dB)')]) }] });
      mockSimulationManager.groundStations = [station];
      (Date.now as Mock).mockReturnValue(Date.UTC(2026, 9, 16, 4, 21, 50));

      // The Mission Overview renders its station cards before initializeAsync_ seeds the clock
      expect(AlarmService.getAlarms(station as any)[0].raisedAtMs).toBeUndefined();

      OpsLogManager.initialize('12:00:00', '2026-03-15');
      const start = Date.UTC(2026, 2, 15, 12, 0, 0);
      expect(SimClock.nowMs()).toBe(start);
      AlarmService.getInstance();
      settleService();
      // Paused for the brief review: the poll still runs, on run time
      updateHandler?.(16);
      const [, polled] = mockEventBus.emit.mock.calls.find(([event]) => event === Events.ALARM_STATE_CHANGED) ?? [];
      expect(polled.alarms[0].raisedAtMs).toBe(start);
      expect(AlarmService.getAlarms('ME-02')[0].raisedAtMs).toBe(start);
    });
  });

  describe('sampling on the scenario second (Phase 33 D7, nats-r8-s20-F1)', () => {
    afterEach(() => {
      SimClock.resume('scenario');
      mockSimulationGetInstance.mockImplementation(() => mockSimulationManager);
      AlarmService.destroy();
    });

    it('polls on the first tick of each scenario second, and not on run time alone', () => {
      AlarmService.destroy();
      AlarmService.getInstance();
      mockSimulationManager.groundStations = [gs()];
      settleService();
      updateHandler?.(16);
      const pollAtMs: number[] = [];
      mockSimulationGetInstance.mockImplementation(() => {
        pollAtMs.push(SimClock.nowMs());
        return mockSimulationManager;
      });

      // An objective wait fast-forwards run time only: the scenario second has not turned
      SimClock.advanceRun(5_000);
      updateHandler?.(16);
      expect(pollAtMs).toEqual([]);

      for (let i = 0; i < 3 * 60; i++) {
        SimClock.step();
        updateHandler?.(16);
      }
      expect(pollAtMs).toHaveLength(3);
      for (const [i, ms] of pollAtMs.entries()) {
        expect(ms % 1000).toBeLessThan(FIXED_STEP_MS);
        if (i > 0) {
          expect(Math.floor(ms / 1000) - Math.floor(pollAtMs[i - 1] / 1000)).toBe(1);
        }
      }
    });

    it('falls back to one poll per second of run time while the scenario clock is paused', () => {
      AlarmService.destroy();
      AlarmService.getInstance();
      mockSimulationManager.groundStations = [gs()];
      settleService();
      SimClock.pause('scenario');
      const scenarioMs = SimClock.nowMs();

      updateHandler?.(16);
      expect(mockSimulationGetInstance).toHaveBeenCalledTimes(1);
      runSteps(900);
      updateHandler?.(16);
      expect(mockSimulationGetInstance).toHaveBeenCalledTimes(1);
      runSteps(100);
      updateHandler?.(16);
      expect(mockSimulationGetInstance).toHaveBeenCalledTimes(2);
      expect(SimClock.nowMs()).toBe(scenarioMs);
    });

    it('moves its UPDATE handler behind the listeners already subscribed (WeatherManager)', () => {
      AlarmService.destroy();
      AlarmService.subscribeAfterExistingListeners();
      expect(mockEventBus.off).not.toHaveBeenCalled();

      AlarmService.getInstance();
      const handler = updateHandler;
      mockEventBus.on.mockClear();
      AlarmService.subscribeAfterExistingListeners();
      expect(mockEventBus.off).toHaveBeenCalledWith(Events.UPDATE, handler);
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.UPDATE, handler);
      expect(mockEventBus.off.mock.invocationCallOrder[0]).toBeLessThan(mockEventBus.on.mock.invocationCallOrder[0]);
    });
  });

  describe('one alarm snapshot per scenario second (Phase 34 D8, nats-r9-s04-F1, nats-r8-s20-F1)', () => {
    const changes = () => mockEventBus.emit.mock.calls.filter(([event]) => event === Events.ALARM_STATE_CHANGED).map(([, data]) => data);
    /** Step and dispatch UPDATE until the service polls; returns SimClock.nowMs() at that poll */
    const stepToPoll = (): number => {
      const polls = mockSimulationGetInstance.mock.calls.length;
      for (let i = 0; i < 2 * 60; i++) {
        SimClock.step();
        updateHandler?.(16);
        if (mockSimulationGetInstance.mock.calls.length > polls) return SimClock.nowMs();
      }
      throw new Error('no poll within two seconds');
    };

    beforeEach(() => {
      SimClock.resume('scenario');
    });

    afterEach(() => {
      OpsLogManager.destroy();
      AlarmService.destroy();
    });

    it('stamps a mid-second raise on the boundary poll, and getAlarms quotes the stamp the Ops Log line got', () => {
      clock.running = 'real';
      OpsLogManager.initialize('12:00:00', '2026-03-15');
      // The scenario unlocks: its clock runs
      SimClock.resume('scenario');
      let raised: AlarmLike[] = [alarm('warning', 'AUTO TRACK FAILED')];
      const station = gs({ state: { id: 'ME-02', isOperational: true }, antennas: [{ getStatusAlarms: vi.fn(() => raised) }] });
      mockSimulationManager.groundStations = [station];

      // Before the first poll: a live collect, and no stamp
      const [live] = AlarmService.getAlarms('ME-02');
      expect(live.message).toBe('AUTO TRACK FAILED');
      expect(live.raisedAtMs).toBeUndefined();

      AlarmService.getInstance();
      settleService();
      const firstPollMs = stepToPoll();
      expect(AlarmService.getAlarms('ME-02')[0].raisedAtMs).toBe(firstPollMs);

      // Half a second on, the equipment raises a second alarm: the Dashboard's
      // mid-second read still sees the last poll and stamps nothing
      for (let i = 0; i < 30; i++) {
        SimClock.step();
        updateHandler?.(16);
      }
      raised = [...raised, alarm('error', 'ANT FAIL')];
      expect(AlarmService.getAlarms('ME-02').map((a) => a.message)).toEqual(['AUTO TRACK FAILED']);

      const pollMs = stepToPoll();
      expect(Math.floor(pollMs / 1000)).toBe(Math.floor(firstPollMs / 1000) + 1);
      const [fromRead] = AlarmService.getAlarms('ME-02');
      expect(fromRead.message).toBe('ANT FAIL');
      expect(fromRead.raisedAtMs).toBe(pollMs);
      const payload: { alarms: { message: string; raisedAtMs?: number }[] } = changes().at(-1);
      const emitted = payload.alarms.find((a) => a.message === 'ANT FAIL');
      expect(emitted?.raisedAtMs).toBe(fromRead.raisedAtMs);
      // The payload is the poll's set, as before
      expect(payload.alarms.map((a) => a.message)).toEqual(['ANT FAIL', 'AUTO TRACK FAILED']);
    });

    it('serves the last emitted detail between polls while the live value ramps', () => {
      const level = { dB: 1 };
      const antenna = { getStatusAlarms: vi.fn(() => [alarm('warning', `SUN TRANSIT: ELEVATED SKY NOISE (${level.dB.toFixed(1)} dB)`)]) };
      mockSimulationManager.groundStations = [gs({ state: { id: 'VT-01', isOperational: true }, antennas: [antenna] })];
      AlarmService.getInstance();
      settleService();
      stepToPoll();

      for (let second = 0; second < 2; second++) {
        const emittedDetail = changes().at(-1).alarms[0].detail;
        // Every step moves the sky noise 0.05 dB until the second turns
        for (let i = 0; i < 59; i++) {
          level.dB += 0.05;
          SimClock.step();
          updateHandler?.(16);
          if (changes().at(-1).alarms[0].detail !== emittedDetail) {
            break;
          }
          expect(AlarmService.getAlarms('VT-01')[0].detail).toBe(emittedDetail);
        }
        level.dB += 0.05;
        stepToPoll();
        expect(changes().at(-1).alarms[0].detail).not.toBe(emittedDetail);
        expect(AlarmService.getAlarms('VT-01')[0].detail).toBe(changes().at(-1).alarms[0].detail);
      }
    });

    it('hands out copies, so a caller cannot change the snapshot', () => {
      mockSimulationManager.groundStations = [gs({ state: { id: 'VT-01', isOperational: true }, antennas: [{ getStatusAlarms: vi.fn(() => [alarm('warning', 'W')]) }] })];
      AlarmService.getInstance();
      settleService();
      stepToPoll();
      const read = AlarmService.getAlarms('VT-01');
      read[0].message = 'changed';
      read.push(read[0]);
      expect(AlarmService.getAlarms('VT-01').map((a) => a.message)).toEqual(['W']);
    });

    it('drops the snapshot on destroy() and falls back to a live collect', () => {
      let message = 'ICE ON FEED (0.5 dB)';
      mockSimulationManager.groundStations = [gs({ state: { id: 'VT-01', isOperational: true }, antennas: [{ getStatusAlarms: vi.fn(() => [alarm('warning', message)]) }] })];
      AlarmService.getInstance();
      settleService();
      stepToPoll();
      message = 'ICE ON FEED (0.9 dB)';
      expect(AlarmService.getAlarms('VT-01')[0].detail).toBe('0.5 dB');

      AlarmService.destroy();
      expect((AlarmService as any).lastPollAlarms_.size).toBe(0);
      const [live] = AlarmService.getAlarms('VT-01');
      expect(live.detail).toBe('0.9 dB');
      expect(live.raisedAtMs).toBeUndefined();
    });
  });

  describe('getAlarms (per-station, unfiltered)', () => {
    const station = () =>
      gs({
        state: { id: 'alpha', isOperational: true },
        antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('info', 'ANT INFO'), alarm('success', 'LOCKED')]) }],
        rfFrontEnds: [{ getStatusAlarms: vi.fn().mockImplementation((rfCase: number) => (rfCase === 1 ? [alarm('warning', 'RF WARN')] : [])) }],
        transmitters: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'TX WARN')]) }],
        receivers: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('error', 'RX FAIL')]) }],
      });

    it('returns every displayable alarm from every module, most severe first', () => {
      const alarms = AlarmService.getAlarms(station() as any);
      expect(alarms.map((a) => a.message)).toEqual(['RX FAIL', 'RF WARN', 'TX WARN', 'ANT INFO']);
      expect(alarms.map((a) => a.equipmentType)).toEqual(['RX', 'RF', 'TX', 'ANT']);
    });

    it('looks a station up by id and ignores other stations', () => {
      const other = gs({ state: { id: 'beta', isOperational: true }, antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('error', 'BETA FAIL')]) }] });
      mockSimulationManager.groundStations = [station(), other];
      expect(AlarmService.getAlarms('alpha').map((a) => a.message)).not.toContain('BETA FAIL');
      expect(AlarmService.getAlarms('beta').map((a) => a.message)).toEqual(['BETA FAIL']);
      expect(AlarmService.getAlarms('missing')).toEqual([]);
    });

    it('returns nothing for a non-operational station, as the ticker does', () => {
      const offline = station();
      offline.state.isOperational = false;
      expect(AlarmService.getAlarms(offline as any)).toEqual([]);
    });

    it('needs no service instance', () => {
      AlarmService.getAlarms(station() as any);
      expect(mockEventBus.on).not.toHaveBeenCalled();
    });
  });
});
