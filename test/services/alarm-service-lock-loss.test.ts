import { dBm, FECType, Hertz, IfSignal, ModulationType } from '@app/types';
import { vi } from 'vitest';
import { Receiver } from '../../src/equipment/receiver/receiver';
import { TapPoint } from '../../src/equipment/rf-front-end/coupler-module/tap-points';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { OpsLogManager } from '../../src/ops-log/ops-log-manager';
import { AlarmService } from '../../src/services/alarm-service';
import { SimClock } from '../../src/simulation/sim-clock';
import { SimulationManager } from '../../src/simulation/simulation-manager';
import { advanceSimTime } from '../helpers/sim-time';

Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

/** Noise fixed at -37 dBm in every bandwidth with no chain gain: Es/N0 = carrier + 37 */
const NOISE_DBM = -37;
/** QPSK 1/2: 1.0 dB Table 13 + 1.0 dB implementation loss */
const REQUIRED_DB = 2.0;

function carrier(): IfSignal {
  return {
    signalId: 'payload-1',
    serverId: 1,
    noradId: 12345,
    power: -30 as dBm,
    bandwidth: 20e6 as Hertz,
    modulation: 'QPSK' as ModulationType,
    fec: '1/2' as FECType,
    polarization: 'V',
    feed: '',
    isDegraded: false,
    origin: 'satellite-rx' as never,
    noiseFloor: -100 as dBm,
    gainInPath: 0 as never,
    frequency: 1400e6 as never,
  };
}

function rfFrontEnd(signals: IfSignal[]) {
  return {
    externalNoise: -120,
    agcModule: { outputSignals: signals, state: { outputPower: -30 } },
    couplerModule: {
      signalPathManager: {
        getTotalRxGain: () => 0,
        getNoiseFloorAt: (_tap: TapPoint, _bw: Hertz) => ({ noiseFloorNoGain: NOISE_DBM, noiseFloor: NOISE_DBM, isInternalNoiseGreater: false }),
      },
    },
    notchFilterModule: null,
  };
}

describe('AlarmService: Carrier lock lost (Phase 31 D1, nats-r6-s17-F1)', () => {
  let rx: Receiver;
  let signal: IfSignal;
  let signals: IfSignal[];
  let station: { state: { id: string; isOperational: boolean }; antennas: never[]; rfFrontEnds: never[]; transmitters: never[]; receivers: Receiver[] };

  const atMargin = (marginDb: number) => {
    signal.power = (NOISE_DBM + REQUIRED_DB + marginDb) as dBm;
  };
  /** Run the receiver the way the sim does, every step, for `ms` */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      advanceSimTime(100);
      rx.update();
    }
  };
  const rxAlarms = () => AlarmService.getAlarms(station as never).filter((a) => a.equipmentType === 'RX' && a.message !== 'Signal(s) Detected');

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
    rx = new Receiver('test-root', []);
    for (const modem of rx.state.modems) modem.isPowered = modem.modemNumber === 1;
    signal = carrier();
    signals = [signal];
    rx.connectRfFrontEnd(rfFrontEnd(signals) as never);
    station = { state: { id: 'VT-01', isOperational: true }, antennas: [], rfFrontEnds: [], transmitters: [], receivers: [rx] };
  });

  afterEach(() => {
    AlarmService.destroy();
    document.body.innerHTML = '';
  });

  it('reads Degraded margin, then Carrier lock lost, then clean as a fade comes and goes', () => {
    atMargin(3);
    run(11_000);
    expect(rx.getSignalsInBandwidth(rx.state.modems[0]).hasLock).toBe(true);
    expect(rxAlarms()).toEqual([]);

    atMargin(0.6);
    run(200);
    expect(rxAlarms().map((a) => a.message)).toEqual(['Degraded margin']);

    // Below the hold threshold (Required - 0.5 dB): the modem drops lock
    atMargin(-0.8);
    run(200);
    const alarms = rxAlarms();
    expect(alarms.map((a) => a.message)).toEqual(['Carrier lock lost']);
    expect(alarms[0]).toEqual(expect.objectContaining({ severity: 'error', assetId: 'VT-01', equipmentType: 'RX', equipmentIndex: 0 }));
    expect(alarms[0].detail).toBe('Modem 1: Es/N0 1.2 dB, locks at 2.5 dB');
    expect(rx.getLockTransition(rx.state.modems[0])).toEqual(expect.objectContaining({ hadLock: true, lastSignalId: 'payload-1' }));

    // Still out: the label holds, the Es/N0 in the detail moves
    atMargin(-1.5);
    run(200);
    expect(rxAlarms()[0].detail).toBe('Modem 1: Es/N0 0.5 dB, locks at 2.5 dB');

    // Relock: clean
    atMargin(3);
    run(11_000);
    expect(rxAlarms()).toEqual([]);
    expect(rx.getLockTransition(rx.state.modems[0])?.lockLostAtMs).toBeNull();
  });

  it('says "no carrier" when the carrier is gone and holds until it relocks', () => {
    atMargin(3);
    run(11_000);
    signals.length = 0;
    run(200);
    expect(rxAlarms()).toEqual([expect.objectContaining({ message: 'Carrier lock lost', severity: 'error', detail: 'Modem 1: no carrier' })]);
    signals.push(signal);
    run(11_000);
    expect(rxAlarms()).toEqual([]);
  });

  it('clears when the modem is powered off while the lock is lost', () => {
    atMargin(3);
    run(11_000);
    atMargin(-1);
    run(200);
    expect(rxAlarms().map((a) => a.message)).toEqual(['Carrier lock lost']);
    rx.state.modems[0].isPowered = false;
    run(200);
    expect(rxAlarms()).toEqual([]);
    // Powered back on below threshold: it has not had lock since, so nothing
    rx.state.modems[0].isPowered = true;
    run(2_000);
    expect(rxAlarms()).toEqual([]);
  });

  it('clears when the modem is retuned', () => {
    atMargin(3);
    run(11_000);
    atMargin(-1);
    run(200);
    expect(rxAlarms().map((a) => a.message)).toEqual(['Carrier lock lost']);
    rx.state.modems[0].fec = '3/4' as FECType;
    run(200);
    expect(rxAlarms()).toEqual([]);
  });

  it('raises nothing for a modem that never had lock (searching)', () => {
    atMargin(0.3);
    run(11_000);
    const info = rx.getSignalsInBandwidth(rx.state.modems[0]);
    expect(info.hasCarrier).toBe(true);
    expect(info.hasLock).toBe(false);
    expect(rxAlarms()).toEqual([]);
    expect(rx.getLockTransition(rx.state.modems[0])).toBeNull();
  });

  it('a sidelobe copy renaming the carrier raises no Carrier lock lost (Phase 32 D3, nats-r7-s04-F2)', () => {
    atMargin(3);
    run(11_000);
    signal.signalId = 'payload-1#2';
    run(200);
    signal.signalId = 'payload-1';
    run(200);
    expect(rxAlarms()).toEqual([]);
    expect(rx.getSignalsInBandwidth(rx.state.modems[0]).hasLock).toBe(true);
  });

  it('keeps the Signal(s) Detected raise time across a modem tab switch (Phase 32 D15, nats-r7-s14-F2)', () => {
    const sim = vi.spyOn(SimulationManager, 'getInstance').mockReturnValue({ groundStations: [station] } as never);
    try {
      atMargin(3);
      run(11_000);
      // Raise times are scenario-clock stamps once the Ops Log seeds the clock (Phase 33 D5)
      OpsLogManager.initialize();
      OpsLogManager.getInstance().resume();
      AlarmService.getInstance();
      SimClock.advanceRun(AlarmService.STARTUP_SETTLE_MS);
      // One scenario second of steps, so the poll (on the scenario second, Phase 33 D7) runs
      const poll = () => {
        run(1_000);
        EventBus.getInstance().emit(Events.UPDATE, 16 as never);
        return AlarmService.getAlarms(station as never).find((a) => a.message === 'Signal(s) Detected');
      };
      const raisedAtMs = poll()?.raisedAtMs;
      expect(raisedAtMs).toBe(SimClock.nowMs());

      // RX 2 (powered, no carrier) then back to RX 1, each across a poll
      rx.state.modems[1].isPowered = true;
      rx.state.modems[1].frequency = 1500 as never;
      rx.setActiveModem(2);
      expect(poll()?.raisedAtMs).toBe(raisedAtMs);
      rx.setActiveModem(1);
      expect(poll()?.raisedAtMs).toBe(raisedAtMs);
    } finally {
      sim.mockRestore();
      OpsLogManager.destroy();
    }
  });
});
