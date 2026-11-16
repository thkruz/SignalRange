import { Mock, Mocked, vi } from 'vitest';
import { GroundStation } from '../../../../src/assets/ground-station/ground-station';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { OpsLogManager } from '../../../../src/ops-log/ops-log-manager';
import { DashboardTab } from '../../../../src/pages/mission-control/tabs/dashboard-tab';
import { AlarmService } from '../../../../src/services/alarm-service';
import { FIXED_STEP_MS, SimClock } from '../../../../src/simulation/sim-clock';
import { SimulationManager } from '../../../../src/simulation/simulation-manager';

// Mock dependencies
vi.mock('../../../../src/events/event-bus');
vi.mock('../../../../src/assets/ground-station/ground-station');

// Mock image imports
vi.mock('../../../../src/assets/icons/antenna.png', () => ({ default: 'antenna.png' }));
vi.mock('../../../../src/assets/icons/radio.png', () => ({ default: 'radio.png' }));
vi.mock('../../../../src/assets/icons/arrow-big-down-lines.png', () => ({ default: 'rx.png' }));
vi.mock('../../../../src/assets/icons/arrow-big-up-lines.png', () => ({ default: 'tx.png' }));

describe('DashboardTab', () => {
  let mockGroundStation: Mocked<GroundStation>;
  let containerEl: HTMLElement;
  let tab: DashboardTab;
  let mockEventBus: { on: Mock; off: Mock; emit: Mock };

  const mockLocation = {
    latitude: 38.897,
    longitude: -77.037,
    elevation: 100,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    (EventBus.getInstance as Mock).mockReturnValue(mockEventBus);

    // Setup mock GroundStation
    mockGroundStation = {
      state: {
        id: 'GS-001',
        name: 'Test Ground Station',
        location: mockLocation,
        isOperational: true,
      },
      antennas: [
        {
          state: {
            azimuth: 180,
            elevation: 45,
            trackingMode: 'manual',
            isLocked: false,
            isBeaconLocked: false,
            beaconCN: null,
            hasFault: false,
            isPowered: true,
            isStepTrackEnabled: false,
          },
          getStatusAlarms: vi.fn().mockReturnValue([]),
        },
      ],
      rfFrontEnds: [
        {
          gpsdoModule: {
            state: {
              isLocked: true,
              satelliteCount: 8,
              isInHoldover: false,
              warmupTimeRemaining: 0,
              isPowered: true,
            },
            formatWarmupTime_: vi.fn().mockReturnValue('READY'),
          },
          lnbModule: {
            state: {
              isExtRefLocked: true,
              noiseTemperature: 60,
              isPowered: true,
            },
          },
          filterModule: {
            state: {
              bandwidth: 36,
            },
          },
          bucModule: {
            state: {
              isExtRefLocked: true,
              outputPower: 35,
              isPowered: true,
              isMuted: false,
            },
            outputSignals: [{ power: 35 }],
            hasRfOutput: vi.fn().mockReturnValue(true),
          },
          hpaModule: {
            state: {
              outputPower: 44,
              isOverdriven: false,
              isPowered: true,
              isHpaEnabled: true,
            },
            outputSignals: [{ power: 44 }],
          },
          getStatusAlarms: vi.fn().mockReturnValue([]),
        },
      ],
      transmitters: [
        {
          state: {
            modems: [
              { isPowered: true, isTransmitting: false, isFaulted: false },
              { isPowered: false, isTransmitting: false, isFaulted: false },
            ],
          },
          getPowerPercentage: vi.fn().mockReturnValue(50),
          getStatusAlarms: vi.fn().mockReturnValue([]),
        },
      ],
      receivers: [
        {
          state: {
            modems: [{ isPowered: true }, { isPowered: true }],
            availableSignals: [],
          },
          getSnrForModem: vi.fn().mockReturnValue(15),
          getSignalsInBandwidth: vi.fn().mockReturnValue({ hasCarrier: true, hasLock: true }),
          getStatusAlarms: vi.fn().mockReturnValue([]),
        },
      ],
      initializeEquipment: vi.fn(),
    } as unknown as Mocked<GroundStation>;

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'dashboard-container';
    document.body.appendChild(containerEl);

    tab = new DashboardTab(mockGroundStation, 'dashboard-container');
  });

  afterEach(() => {
    tab.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(tab).toBeInstanceOf(DashboardTab);
    });

    it('should initialize equipment if not already done', () => {
      const emptyGs = {
        ...mockGroundStation,
        antennas: [],
        rfFrontEnds: [],
        transmitters: [],
        receivers: [],
      } as unknown as Mocked<GroundStation>;

      const containerEl2 = document.createElement('div');
      containerEl2.id = 'dashboard-container-2';
      document.body.appendChild(containerEl2);

      new DashboardTab(emptyGs, 'dashboard-container-2');
      expect(emptyGs.initializeEquipment).toHaveBeenCalled();
    });

    it('should register for UPDATE events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    });
  });

  describe('HTML rendering', () => {
    it('should display station name', () => {
      const stationName = document.body.querySelector('h4');
      expect(stationName?.textContent).toContain('Test Ground Station');
    });

    it('should display station location', () => {
      const dashboardEl = document.querySelector('.dashboard-tab');
      expect(dashboardEl?.innerHTML).toContain('38.8970');
      expect(dashboardEl?.innerHTML).toContain('-77.0370');
    });

    it('should display equipment counts', () => {
      const antennaCount = document.querySelector('#antenna-count');
      expect(antennaCount?.textContent).toBe('1');
    });
  });

  describe('clickable cards', () => {
    it('should emit SWITCH_TAB event when card is clicked', () => {
      const card = document.querySelector('[data-target-tab="acu-control"]') as HTMLElement;
      card?.click();

      expect(mockEventBus.emit).toHaveBeenCalledWith(Events.SWITCH_TAB, { tabId: 'acu-control' });
    });
  });

  describe('activate/deactivate', () => {
    it('should show tab on activate', () => {
      tab.activate();
      const dashboardEl = document.querySelector('.dashboard-tab') as HTMLElement;
      expect(dashboardEl?.style.display).toBe('block');
    });

    it('should hide tab on deactivate', () => {
      tab.deactivate();
      const dashboardEl = document.querySelector('.dashboard-tab') as HTMLElement;
      expect(dashboardEl?.style.display).toBe('none');
    });
  });

  describe('dispose', () => {
    it('should unregister from UPDATE events', () => {
      tab.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(Events.UPDATE, expect.any(Function));
    });

    it('should remove DOM element', () => {
      tab.dispose();
      const dashboardEl = document.querySelector('.dashboard-tab');
      expect(dashboardEl).toBeNull();
    });
  });

  describe('state synchronization', () => {
    it('should update station status display', () => {
      const statusEl = document.querySelector('#station-status');
      expect(statusEl?.textContent).toBe('OPERATIONAL');
      expect(statusEl?.classList.contains('status-badge-green')).toBe(true);
    });

    describe('station status (Phase 32 D16, nats-r7-s11-F1)', () => {
      const resync = (now: number) => {
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
        updateHandler();
      };
      const status = () => document.querySelector('#station-status');

      it('reads MAINTENANCE (amber) while the antenna is parked at maintenance', () => {
        (mockGroundStation.antennas[0].state as { trackingMode: string }).trackingMode = 'maintenance';
        resync(70_000_000);
        expect(status()?.textContent).toBe('MAINTENANCE');
        expect(status()?.className).toContain('status-badge-amber');
      });

      it('reads STOWED (grey) while the antenna is stowed', () => {
        (mockGroundStation.antennas[0].state as { trackingMode: string }).trackingMode = 'stow';
        resync(71_000_000);
        expect(status()?.textContent).toBe('STOWED');
        expect(status()?.className).toContain('status-badge-gray');
      });

      it('reads DEGRADED with an error alarm up, and MAINTENANCE still wins over it', () => {
        (mockGroundStation.transmitters[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'error', message: 'Modem 1 Faulted' }]);
        resync(72_000_000);
        expect(status()?.textContent).toBe('DEGRADED');
        expect(status()?.className).toContain('status-badge-amber');

        (mockGroundStation.antennas[0].state as { trackingMode: string }).trackingMode = 'maintenance';
        resync(73_000_000);
        expect(status()?.textContent).toBe('MAINTENANCE');
      });

      it('a warning alone leaves the station OPERATIONAL', () => {
        (mockGroundStation.receivers[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'warning', message: 'RX lost lock' }]);
        resync(74_000_000);
        expect(status()?.textContent).toBe('OPERATIONAL');
      });

      it('reads OFFLINE (red) when the station is not operational', () => {
        (mockGroundStation.state as { isOperational: boolean }).isOperational = false;
        (mockGroundStation.antennas[0].state as { trackingMode: string }).trackingMode = 'maintenance';
        resync(75_000_000);
        expect(status()?.textContent).toBe('OFFLINE');
        expect(status()?.className).toContain('status-badge-red');
      });
    });

    it('should update active receivers count', () => {
      const rxEl = document.querySelector('#active-receivers');
      expect(rxEl?.textContent).toBe('2');
    });

    it("Best SNR is the modem card's Effective C/N, not the raw C/N (Phase 30 D8, nats-r5-s07-F1)", () => {
      tab.dispose();
      document.body.innerHTML = '';
      const rx = mockGroundStation.receivers[0] as unknown as { getSignalsInBandwidth: ReturnType<typeof vi.fn> };
      rx.getSignalsInBandwidth.mockReturnValue({ hasCarrier: true, hasLock: true, cnRatio_dB: 50.7, effectiveCnRatio_dB: 39.5 });
      containerEl = document.createElement('div');
      containerEl.id = 'dashboard-container';
      document.body.appendChild(containerEl);
      tab = new DashboardTab(mockGroundStation, 'dashboard-container');
      expect(document.querySelector('#rx-snr')?.textContent).toBe('39.5 dB');
    });

    it('should update active transmitters count', () => {
      const txEl = document.querySelector('#active-transmitters');
      expect(txEl?.textContent).toBe('1');
    });

    it('Equipment Summary counts installed modems, the same scope as Quick Stats (phase 27, r2-s09-F1)', () => {
      expect(document.querySelector('#tx-count')?.textContent).toBe('2');
      expect(document.querySelector('#rx-count')?.textContent).toBe('2');
      const labels = [...document.querySelectorAll('.equipment-item-label')].map((el) => el.textContent);
      expect(labels).toContain('TX Modems');
      expect(labels).toContain('RX Modems');
    });

    it('labels Quick Stats as powered modems, which is what it counts (s01-F19)', () => {
      const labels = [...document.querySelectorAll('.quick-stat-label')].map((el) => el.textContent);
      expect(labels).toContain('RX Modems On');
      expect(labels).toContain('TX Modems On');
    });

    it('lights the antenna fault LED green when healthy, red on fault, titled (s01-F14, Phase 33 D2)', () => {
      const led = () => document.querySelector('#antenna-fault-led') as HTMLElement;
      expect(led().className).toBe('card-alarm-led success');
      expect(led().title).toBe('No alarms');
      const state = mockGroundStation.antennas[0].state as { hasFault: boolean; faultMessage: string | null; isPowered: boolean };
      state.hasFault = true;
      state.faultMessage = 'Azimuth 400.0° exceeds limit [0°, 360°]';
      vi.spyOn(Date, 'now').mockReturnValue(10_000_000);
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      updateHandler();
      expect(led().className).toBe('card-alarm-led error');
      expect(led().title).toBe('Azimuth 400.0° exceeds limit [0°, 360°]');

      // Grey only when the pedestal is off
      state.isPowered = false;
      vi.spyOn(Date, 'now').mockReturnValue(11_000_000);
      updateHandler();
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('Antenna off');
    });

    it('lights the GPSDO header LED from the GPSDO alarms, grey when off or warming up, titled (Phase 34 D4, nats-r9-s01-F1)', () => {
      const led = () => document.querySelector('#gpsdo-fault-led') as HTMLElement;
      const header = led().closest('.card-header') as HTMLElement;
      expect(header.className).toBe('card-header d-flex justify-content-between align-items-center');
      expect(header.querySelector('h3')?.classList.contains('mb-0')).toBe(true);
      expect(led().className).toBe('card-alarm-led success');
      expect(led().title).toBe('No alarms');

      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      const rfFe = mockGroundStation.rfFrontEnds[0] as any;
      const gpsdo = rfFe.gpsdoModule.state;

      // The module's own labels (gpsdo-module-core.ts getAlarms), RF case 2
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 2 ? [{ severity: 'warning', message: 'GPSDO not locked' }] : []));
      vi.spyOn(Date, 'now').mockReturnValue(12_000_000);
      updateHandler();
      expect(led().className).toBe('card-alarm-led warning');
      expect(led().title).toBe('GPSDO not locked');

      // The holdover error value lands in the title's detail
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 2 ? [{ severity: 'warning', message: 'GPSDO in holdover (12.3 μs error)' }] : []));
      vi.spyOn(Date, 'now').mockReturnValue(12_200_000);
      updateHandler();
      expect(led().className).toBe('card-alarm-led warning');
      expect(led().title).toBe('GPSDO in holdover - 12.3 μs error');

      // An error outranks a warning; GNSS labels are the GPSDO's too
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) =>
        rfCase === 2
          ? [
              { severity: 'warning', message: 'GNSS signal lost' },
              { severity: 'error', message: 'GPSDO self-test failed' },
            ]
          : []
      );
      vi.spyOn(Date, 'now').mockReturnValue(12_500_000);
      updateHandler();
      expect(led().className).toBe('card-alarm-led error');
      expect(led().title).toBe('GPSDO self-test failed');

      // An LNB alarm is the RX chain's, not the GPSDO's
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 2 ? [{ severity: 'warning', message: 'LNB noise temperature high' }] : []));
      vi.spyOn(Date, 'now').mockReturnValue(13_000_000);
      updateHandler();
      expect(led().className).toBe('card-alarm-led success');

      gpsdo.warmupTimeRemaining = 120;
      vi.spyOn(Date, 'now').mockReturnValue(13_500_000);
      updateHandler();
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('Warming up');

      gpsdo.isPowered = false;
      vi.spyOn(Date, 'now').mockReturnValue(14_000_000);
      updateHandler();
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('GPSDO off');
    });

    it('titles every card-alarm-led on the Dashboard after one sync, nested lock and power dots included (Phase 34 D4, nats-r9-s01-F1)', () => {
      const leds = [...document.querySelectorAll<HTMLElement>('.dashboard-tab .card-alarm-led')];
      expect(leds.length).toBeGreaterThanOrEqual(11);
      for (const led of leds) {
        expect(led.title, led.id || led.parentElement?.id).not.toBe('');
      }
      expect((document.querySelector('#antenna-lock .card-alarm-led') as HTMLElement).title).toBe('Antenna lock: UNLOCKED');
      expect((document.querySelector('#gpsdo-lock .card-alarm-led') as HTMLElement).title).toBe('GPSDO lock: LOCKED');
      expect((document.querySelector('#lnb-lock .card-alarm-led') as HTMLElement).title).toBe('LNB lock: LOCKED');
      expect((document.querySelector('#lnb-power') as HTMLElement).title).toBe('LNB power: ON');
      expect((document.querySelector('#buc-lock .card-alarm-led') as HTMLElement).title).toBe('BUC lock: LOCKED');

      // The title follows the class on the same sync
      const rfFe = mockGroundStation.rfFrontEnds[0] as any;
      rfFe.lnbModule.state.isPowered = false;
      rfFe.bucModule.state.isExtRefLocked = false;
      rfFe.gpsdoModule.state.isLocked = false;
      vi.spyOn(Date, 'now').mockReturnValue(15_000_000);
      mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1]();
      expect((document.querySelector('#lnb-lock .card-alarm-led') as HTMLElement).title).toBe('LNB lock: OFF');
      expect((document.querySelector('#lnb-power') as HTMLElement).className).toBe('card-alarm-led off');
      expect((document.querySelector('#lnb-power') as HTMLElement).title).toBe('LNB power: OFF');
      expect((document.querySelector('#buc-lock .card-alarm-led') as HTMLElement).title).toBe('BUC lock: UNLOCKED');
      expect((document.querySelector('#gpsdo-lock .card-alarm-led') as HTMLElement).title).toBe('GPSDO lock: UNLOCKED');
    });

    it('shows step-track on the antenna mode badge (s01-F3)', () => {
      const state = mockGroundStation.antennas[0].state as { trackingMode: string; isStepTrackEnabled: boolean };
      state.trackingMode = 'program-track';
      state.isStepTrackEnabled = true;
      vi.spyOn(Date, 'now').mockReturnValue(20_000_000);
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      updateHandler();
      expect(document.querySelector('#antenna-mode')?.textContent).toBe('PROGRAM TRACK + STEP');
    });

    it('turns the mode badge and the antenna LED red under an ACU automation fault (nats-r3-s23-F1)', () => {
      const state = mockGroundStation.antennas[0].state as { trackingMode: string; isStepTrackEnabled: boolean; isAcuAutomationFaulted: boolean };
      state.trackingMode = 'program-track';
      state.isStepTrackEnabled = false;
      state.isAcuAutomationFaulted = true;
      // The LED reads the antenna's alarm, as the ticker does (Phase 33 D2)
      (mockGroundStation.antennas[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'error', message: 'ACU AUTOMATION FAULT - MANUAL CONTROL ONLY' }]);
      vi.spyOn(Date, 'now').mockReturnValue(30_000_000);
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      updateHandler();
      const mode = document.querySelector('#antenna-mode');
      expect(mode?.textContent).toBe('PROGRAM TRACK (OFFLINE)');
      expect(mode?.className).toContain('status-badge-red');
      expect(mode?.className).not.toContain('status-badge-green');
      expect(document.querySelector('#antenna-fault-led')?.className).toContain('error');
      expect((document.querySelector('#antenna-fault-led') as HTMLElement).title).toBe('ACU AUTOMATION FAULT - MANUAL CONTROL ONLY');
    });
  });

  describe('readouts agree with the equipment tabs (phase 29 D4)', () => {
    const resync = (now: number) => {
      vi.spyOn(Date, 'now').mockReturnValue(now);
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      updateHandler();
    };

    it('RF Chain RX reads LNB OFF and Noise Temp -- while the LNB is powered off (nats-r5-s12-F1)', () => {
      const lnb = (mockGroundStation.rfFrontEnds[0] as any).lnbModule;
      lnb.state.isPowered = false;
      lnb.state.isExtRefLocked = false;
      lnb.state.noiseTemperature = 290;
      resync(45_000_000);
      expect(document.querySelector('#lnb-lock .small')?.textContent).toBe('OFF');
      expect(document.querySelector('#lnb-lock .card-alarm-led')?.className).toContain('off');
      expect(document.querySelector('#lnb-noise')?.textContent).toBe('--');
    });

    it('RF Chain TX reads BUC Lock OFF while the BUC is powered off (phase 31 D6, r6-s12-F1)', () => {
      const buc = (mockGroundStation.rfFrontEnds[0] as any).bucModule;
      buc.state.isPowered = false;
      buc.state.isExtRefLocked = true;
      resync(46_000_000);
      expect(document.querySelector('#buc-lock .small')?.textContent).toBe('OFF');
      expect(document.querySelector('#buc-lock .card-alarm-led')?.className).toContain('off');

      buc.state.isPowered = true;
      resync(47_000_000);
      expect(document.querySelector('#buc-lock .small')?.textContent).toBe('LOCKED');
    });

    it('RF Chain TX reads HPA Status OFF / DISABLED / OVERDRIVE / OK (phase 31 D6, r6-s09-F1)', () => {
      const hpa = (mockGroundStation.rfFrontEnds[0] as any).hpaModule;
      const status = () => document.querySelector('#hpa-status');

      hpa.state.isPowered = false;
      resync(48_000_000);
      expect(status()?.textContent).toBe('OFF');

      hpa.state.isPowered = true;
      hpa.state.isHpaEnabled = false;
      hpa.state.isOverdriven = true;
      resync(49_000_000);
      expect(status()?.textContent).toBe('DISABLED');
      expect(status()?.className).toContain('status-badge-gray');
      // Not radiating: the header LED is grey too, not green (Phase 33 D2, nats-r8-s02-F1)
      const led = document.querySelector('#tx-chain-fault-led') as HTMLElement;
      expect(led.className).toBe('card-alarm-led off');
      expect(led.title).toBe('HPA output disabled');

      hpa.state.isHpaEnabled = true;
      resync(50_000_000);
      expect(status()?.textContent).toBe('OVERDRIVE');
      // Amber: the overdrive alarm is a warning (Phase 32 D14)
      expect(status()?.className).toContain('status-badge-amber');

      hpa.state.isOverdriven = false;
      resync(51_000_000);
      expect(status()?.textContent).toBe('OK');
      expect(status()?.className).toContain('status-badge-green');
    });

    it('RF Chain TX header LED follows the BUC + HPA alarm severity, titled with the top alarm (Phase 32 D14, nats-r7-s13-F1)', () => {
      const led = () => document.querySelector('#tx-chain-fault-led') as HTMLElement;
      const rfFe = mockGroundStation.rfFrontEnds[0] as any;
      expect(led().className).toBe('card-alarm-led success');
      expect(led().title).toBe('No alarms');

      // The warning-level cooling fault is amber, not red
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 1 ? [{ severity: 'warning', message: 'BUC cooling fault - fan/heatsink degraded' }] : []));
      resync(52_000_000);
      expect(led().className).toBe('card-alarm-led warning');
      expect(led().title).toBe('BUC cooling fault - fan/heatsink degraded');

      // An error outranks it; the title is the label, then its live value (Phase 33 D2)
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) =>
        rfCase === 1
          ? [
              { severity: 'warning', message: 'BUC cooling fault - fan/heatsink degraded' },
              { severity: 'error', message: 'HPA over-temperature (95 °C)' },
            ]
          : []
      );
      resync(53_000_000);
      expect(led().className).toBe('card-alarm-led error');
      expect(led().title).toBe('HPA over-temperature - 95 °C');

      // An LNB alarm is not the TX chain's; info is not a fault
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) =>
        rfCase === 1 ? [{ severity: 'info', message: 'BUC acquiring 10 MHz reference' }] : [{ severity: 'warning', message: 'LNB noise temperature high' }]
      );
      resync(54_000_000);
      expect(led().className).toBe('card-alarm-led success');

      // Grey whenever the chain is not radiating, titled with the reason
      // (Phase 33 D2, nats-r8-s02-F1)
      rfFe.bucModule.state.isMuted = true;
      resync(54_500_000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('BUC muted');
      rfFe.bucModule.state.isMuted = false;
      rfFe.bucModule.state.isPowered = false;
      resync(55_000_000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('BUC off');
      rfFe.bucModule.state.isPowered = true;
      rfFe.hpaModule.state.isPowered = false;
      resync(55_500_000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('HPA off');
      // A real alarm still outranks the idle grey
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 1 ? [{ severity: 'error', message: 'BUC not locked to 10 MHz reference' }] : []));
      resync(55_700_000);
      expect(led().className).toBe('card-alarm-led error');
      rfFe.bucModule.state.isPowered = false;
      resync(56_000_000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('BUC and HPA off');
    });

    it('RF Chain RX header LED follows the LNB, AGC, notch and filter alarms, grey with the LNB off (Phase 32 D14, Phase 33 D2)', () => {
      const led = () => document.querySelector('#rx-chain-fault-led') as HTMLElement;
      const rfFe = mockGroundStation.rfFrontEnds[0] as any;
      expect(led().className).toBe('card-alarm-led success');
      expect(led().title).toBe('No alarms');

      // nats-r8-s02-F2: the AGC alarm lights the RX chain, with its value in the title
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 2 ? [{ severity: 'warning', message: 'AGC at max gain (12.0 dB) - weak signal' }] : []));
      resync(56_500_000);
      expect(led().className).toBe('card-alarm-led warning');
      expect(led().title).toBe('AGC at max gain - weak signal - 12.0 dB');

      // A BUC alarm is not the RX chain's
      rfFe.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 1 ? [{ severity: 'error', message: 'BUC not locked to 10 MHz reference' }] : []));
      resync(56_700_000);
      expect(led().className).toBe('card-alarm-led success');

      rfFe.getStatusAlarms.mockImplementation((rfCase: number) => (rfCase === 2 ? [{ severity: 'warning', message: 'LNB noise temperature high' }] : []));
      resync(57_000_000);
      expect(led().className).toBe('card-alarm-led warning');
      expect(led().title).toBe('LNB noise temperature high');

      rfFe.lnbModule.state.isPowered = false;
      resync(58_000_000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('LNB off');
    });

    it('GPSDO warm-up reads what the GPS Timing tab reads (nats-r4-s01-F3)', () => {
      expect(document.querySelector('#gpsdo-warmup')?.textContent).toBe('READY');
    });

    it('RF Chain TX reads the TX Chain levels, and no level when there is no RF (nats-r4-s08-F4)', () => {
      expect(document.querySelector('#buc-output')?.textContent).toBe('35.0 dBm');
      expect(document.querySelector('#hpa-power')?.textContent).toBe('44.0 dBm');

      // A modem dropout: nothing in the BUC passband, the HPA undriven. The
      // modules hold their no-output floors (-120 / -90 dBm), never shown
      const rfFe = mockGroundStation.rfFrontEnds[0] as unknown as {
        bucModule: { state: { outputPower: number }; outputSignals: unknown[]; hasRfOutput: Mock };
        hpaModule: { state: { outputPower: number }; outputSignals: unknown[] };
      };
      rfFe.bucModule.state.outputPower = -120;
      rfFe.bucModule.outputSignals = [];
      rfFe.bucModule.hasRfOutput.mockReturnValue(false);
      rfFe.hpaModule.state.outputPower = -90;
      rfFe.hpaModule.outputSignals = [];
      resync(40_000_000);
      expect(document.querySelector('#buc-output')?.textContent).toBe('-- dBm');
      expect(document.querySelector('#hpa-power')?.textContent).toBe('-- dBm');
    });
  });

  describe('alarms (same source as the ticker)', () => {
    const sync = (now: number) => {
      vi.spyOn(Date, 'now').mockReturnValue(now);
      const updateHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      updateHandler();
    };

    it('lists every module alarm for the station, most severe first, and counts every listed row', () => {
      (mockGroundStation.receivers[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'warning', message: 'RX lost lock' }]);
      (mockGroundStation.antennas[0].getStatusAlarms as Mock).mockReturnValue([
        { severity: 'info', message: 'LOOPBACK ENABLED' },
        { severity: 'success', message: 'LOCKED ON SATELLITE' },
      ]);
      (mockGroundStation.transmitters[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'error', message: 'Modem 1 Faulted' }]);
      (mockGroundStation.rfFrontEnds[0].getStatusAlarms as Mock).mockImplementation((rfCase: number) => (rfCase === 2 ? [{ severity: 'warning', message: 'LNB not locked' }] : []));

      sync(30_000_000);

      const messages = [...document.querySelectorAll('#alarm-list .alarm-message')].map((el) => el.textContent);
      expect(messages).toEqual(['Modem 1 Faulted', 'LNB not locked', 'RX lost lock', 'LOOPBACK ENABLED']);
      expect(document.querySelector('#alarm-count')?.textContent).toBe('4');
      expect(document.querySelector('#alarm-list .no-alarms')).toBeNull();
    });

    it('lists an advisory without the "No active alarms" placeholder and counts it, as the ticker badge does (nats-r5-s01-F1)', () => {
      (mockGroundStation.antennas[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'info', message: 'LOOPBACK ENABLED' }]);

      sync(40_000_000);

      expect(document.querySelector('#alarm-list .no-alarms')).toBeNull();
      expect(document.querySelector('#alarm-list .alarm-message')?.textContent).toBe('LOOPBACK ENABLED');
      expect(document.querySelector('#alarm-count')?.textContent).toBe('1');
    });

    it('marks an error row with the circle glyph and a warning row with the triangle, as the ticker does (Phase 32 D14, nats-r7-s24-F1)', () => {
      (mockGroundStation.receivers[0].getStatusAlarms as Mock).mockReturnValue([
        { severity: 'error', message: 'Carrier lock lost' },
        { severity: 'warning', message: 'AGC on noise only' },
      ]);

      sync(43_000_000);

      const icons = [...document.querySelectorAll('#alarm-list .alarm-icon')];
      expect(icons[0].className).toContain('critical');
      expect(icons[0].querySelector('.alarm-glyph-error[data-glyph="error"] svg')).not.toBeNull();
      expect(icons[1].className).toContain('warning');
      expect(icons[1].querySelector('.alarm-glyph-warning[data-glyph="warning"] svg')).not.toBeNull();
      expect(icons[1].querySelector('.alarm-glyph-error')).toBeNull();
    });

    it('says "No active alarms" only when the card lists no rows', () => {
      sync(41_000_000);

      expect(document.querySelector('#alarm-list .no-alarms')?.textContent).toContain('No active alarms');
      expect(document.querySelector('#alarm-list .alarm-item')).toBeNull();
      expect(document.querySelector('#alarm-count')?.textContent).toBe('0');
    });

    it('shows a fixed-label alarm with its live value in the detail (nats-r5-s14-F2)', () => {
      (mockGroundStation.antennas[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'info', message: 'RAIN FADE (0.6 dB)' }]);

      sync(42_000_000);

      expect(document.querySelector('#alarm-list .alarm-message')?.textContent).toBe('RAIN FADE');
      expect(document.querySelector('#alarm-list .alarm-detail')?.textContent).toBe('fade 0.6 dB');
    });

    it('Receivers Quality reads the RX alarms: red on lock loss, grey with no carrier or no modem (Phase 33 D2, nats-r8-s24-F1)', () => {
      const led = () => document.querySelector('#rx-quality') as HTMLElement;
      const rx = mockGroundStation.receivers[0] as any;
      // Powered modems, no carrier in view
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('No carrier');

      rx.state.availableSignals = [{ isDegraded: false }];
      sync(44_000_000);
      expect(led().className).toBe('card-alarm-led success');
      expect(led().title).toBe('No alarms');

      rx.getStatusAlarms.mockReturnValue([{ severity: 'error', message: 'Carrier lock lost' }]);
      sync(45_000_000);
      expect(led().className).toBe('card-alarm-led error');
      expect(led().title).toBe('Carrier lock lost');

      // An RF or TX alarm is not the receivers'; info never lights
      rx.getStatusAlarms.mockReturnValue([{ severity: 'info', message: 'Signal(s) Detected' }]);
      (mockGroundStation.transmitters[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'error', message: 'Modem 1 Faulted' }]);
      sync(46_000_000);
      expect(led().className).toBe('card-alarm-led success');

      for (const modem of rx.state.modems) {
        modem.isPowered = false;
      }
      sync(47_000_000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('No modem powered');
    });

    it('Transmitters Faults reads the TX alarms: amber on an intermittent fault, grey with no modem (Phase 33 D2, nats-r8-s08-F1)', () => {
      const led = () => document.querySelector('#tx-fault') as HTMLElement;
      const tx = mockGroundStation.transmitters[0] as any;
      expect(led().className).toBe('card-alarm-led success');
      expect(led().title).toBe('No alarms');

      tx.getStatusAlarms.mockReturnValue([{ severity: 'warning', message: 'Modem 1 Intermittent Fault' }]);
      sync(48_000_000);
      expect(led().className).toBe('card-alarm-led warning');
      expect(led().title).toBe('Modem 1 Intermittent Fault');

      tx.getStatusAlarms.mockReturnValue([
        { severity: 'warning', message: 'Modem 1 Intermittent Fault' },
        { severity: 'error', message: 'Modem 1 Faulted' },
      ]);
      sync(49_000_000);
      expect(led().className).toBe('card-alarm-led error');
      expect(led().title).toBe('Modem 1 Faulted');

      for (const modem of tx.state.modems) {
        modem.isPowered = false;
      }
      sync(49_500_000);
      expect(led().className).toBe('card-alarm-led off');
      expect(led().title).toBe('No modem powered');
    });

    it('Antenna LED reads a SUN TRANSIT error red, titled with the alarm (Phase 33 D2, nats-r8-s17-F1)', () => {
      const led = () => document.querySelector('#antenna-fault-led') as HTMLElement;
      (mockGroundStation.antennas[0].getStatusAlarms as Mock).mockReturnValue([
        { severity: 'info', message: 'Manual Tracking Enabled' },
        { severity: 'error', message: 'SUN TRANSIT' },
      ]);
      sync(49_700_000);
      expect(led().className).toBe('card-alarm-led error');
      expect(led().title).toBe('SUN TRANSIT');

      // Info alone never lights it
      (mockGroundStation.antennas[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'info', message: 'Manual Tracking Enabled' }]);
      sync(49_800_000);
      expect(led().className).toBe('card-alarm-led success');
    });

    it('re-collects on ALARM_STATE_CHANGED inside the wall throttle, so a row and the LED title change on the ticker tick (Phase 34 D8, nats-r9-s04-F1)', () => {
      const alarmHandler = mockEventBus.on.mock.calls.find((call: unknown[]) => call[0] === Events.ALARM_STATE_CHANGED)?.[1];
      expect(alarmHandler).toEqual(expect.any(Function));

      sync(70_000_000);
      expect(document.querySelector('#alarm-list .alarm-item')).toBeNull();

      // The poll raises an alarm 200 ms later: the UPDATE throttle skips it...
      (mockGroundStation.rfFrontEnds[0].getStatusAlarms as Mock).mockImplementation((rfCase: number) =>
        rfCase === 2 ? [{ severity: 'warning', message: 'GPSDO not locked' }] : []
      );
      sync(70_000_200);
      expect(document.querySelector('#alarm-list .alarm-item')).toBeNull();

      // ...the poll's ALARM_STATE_CHANGED does not
      alarmHandler({ alarms: [] });
      expect(document.querySelector('#alarm-list .alarm-message')?.textContent).toBe('GPSDO not locked');
      expect(document.querySelector('#alarm-count')?.textContent).toBe('1');
      expect((document.querySelector('#gpsdo-fault-led') as HTMLElement).title).toBe('GPSDO not locked');

      // The bound handler is the one removed on dispose
      tab.dispose();
      expect(mockEventBus.off).toHaveBeenCalledWith(Events.ALARM_STATE_CHANGED, alarmHandler);
    });

    it('stamps each alarm on the station clock when first raised, not the wall clock (nats-r3-s08-F2)', () => {
      OpsLogManager.initialize('02:15:00', '2026-02-14');
      // AlarmService holds the raise times; forget the earlier tests' alarms
      AlarmService.destroy();
      // Only the AlarmService poll creates raisedAtMs (Phase 34 D8): run the
      // service on this station and poll on the scenario-second boundary after
      // each raise, before the Dashboard reads the snapshot
      const simSpy = vi.spyOn(SimulationManager, 'getInstance').mockReturnValue({ groundStations: [mockGroundStation] } as unknown as SimulationManager);
      const updateCallsBefore = mockEventBus.on.mock.calls.length;
      AlarmService.getInstance();
      const serviceUpdate = mockEventBus.on.mock.calls.slice(updateCallsBefore).find((call: unknown[]) => call[0] === Events.UPDATE)?.[1];
      expect(serviceUpdate).toEqual(expect.any(Function));
      const poll = () => {
        // Past the start-up settle and into the next scenario second
        SimClock.advanceRun(AlarmService.STARTUP_SETTLE_MS);
        serviceUpdate(FIXED_STEP_MS);
      };
      // The row reads the alarm's own raisedAtMs, stamped on AlarmService's
      // poll second (Phase 34 D8), never a wall value
      const stampOf = (message: string): string => {
        const alarm = AlarmService.getAlarms(mockGroundStation).find((a) => a.message === message);
        expect(alarm?.raisedAtMs).toBeDefined();
        return new Date(alarm?.raisedAtMs ?? Number.NaN).toISOString().slice(11, 19);
      };
      try {
        (mockGroundStation.receivers[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'warning', message: 'RX lost lock' }]);
        poll();
        sync(50_000_000);
        const firstStamp = document.querySelector('#alarm-list .alarm-time')?.textContent;
        expect(firstStamp).toBe(stampOf('RX lost lock'));
        // The station clock, which started at 02:15:00, not the mocked wall clock
        expect(firstStamp?.startsWith('02:15:')).toBe(true);

        // A minute later the standing alarm keeps its raise time; a new one gets the new time
        SimClock.skip(60_000);
        (mockGroundStation.transmitters[0].getStatusAlarms as Mock).mockReturnValue([{ severity: 'error', message: 'Modem 1 Faulted' }]);
        poll();
        sync(60_000_000);
        const times = [...document.querySelectorAll('#alarm-list .alarm-item')].map((el) => [
          el.querySelector('.alarm-message')?.textContent,
          el.querySelector('.alarm-time')?.textContent,
        ]);
        expect(times).toEqual([
          ['Modem 1 Faulted', stampOf('Modem 1 Faulted')],
          ['RX lost lock', firstStamp],
        ]);
        expect(stampOf('Modem 1 Faulted').startsWith('02:16:')).toBe(true);
      } finally {
        AlarmService.destroy();
        simSpy.mockRestore();
        OpsLogManager.destroy();
        SimClock.reset();
      }
    });
  });
});
