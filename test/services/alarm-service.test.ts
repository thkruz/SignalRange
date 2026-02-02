import { Mock, vi } from 'vitest';
import { Events } from '../../src/events/events';
import { AlarmService } from '../../src/services/alarm-service';

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

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => mockSimulationGetInstance(),
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

describe('AlarmService', () => {
  beforeEach(() => {
    (AlarmService as any).instance_ = null;
    updateHandler = null;
    mockSimulationManager.groundStations = [];

    mockEventBus.on.mockClear();
    mockEventBus.off.mockClear();
    mockEventBus.emit.mockClear();

    mockSimulationGetInstance.mockClear();

    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    (Date.now as Mock).mockRestore?.();
    (AlarmService as any).instance_ = null;
    updateHandler = null;
    vi.clearAllMocks();
  });

  it('registers an UPDATE handler and aggregates alarms by highest severity', () => {
    const service = AlarmService.getInstance();
    expect(service).toBeDefined();

    expect(mockEventBus.on).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    expect(typeof updateHandler).toBe('function');

    const operational = gs({
      state: { id: 'alpha', isOperational: true },
      antennas: [
        {
          getStatusAlarms: vi
            .fn()
            .mockReturnValue([alarm('error', 'ANT FAIL'), alarm('success', 'OK')]),
        },
      ],
      rfFrontEnds: [
        {
          getStatusAlarms: vi
            .fn()
            .mockImplementation((rfCase: number) =>
              rfCase === 1 ? [alarm('warning', 'RF WARN')] : [alarm('info', 'RF INFO')]
            ),
        },
      ],
      transmitters: [
        { getStatusAlarms: vi.fn().mockReturnValue([alarm('info', 'TX INFO')]) },
      ],
      receivers: [
        { getStatusAlarms: vi.fn().mockReturnValue([alarm('warning', 'RX WARN')]) },
      ],
    });

    const nonOperational = gs({
      state: { id: 'beta', isOperational: false },
      antennas: [{ getStatusAlarms: vi.fn().mockReturnValue([alarm('error', 'NOPE')]) }],
    });

    mockSimulationManager.groundStations = [operational, nonOperational];

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

    (Date.now as Mock).mockReturnValueOnce(1000).mockReturnValueOnce(2500);

    updateHandler?.(16);
    updateHandler?.(16);

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

    updateHandler?.(16);

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.ALARM_STATE_CHANGED,
      expect.objectContaining({
        highestSeverity: 'success',
        alarms: [],
      })
    );
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
});
