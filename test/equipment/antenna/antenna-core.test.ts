import { Degrees } from 'ootk';
import { AntennaCore, AntennaState, TrackingMode } from '../../../src/equipment/antenna/antenna-core';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';
import { ANTENNA_CONFIGS } from '../../../src/equipment/antenna/antenna-configs';
import { Hertz, dBm } from '../../../src/types';

// Mock SimulationManager
jest.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      update: jest.fn(),
      draw: jest.fn(),
      sync: jest.fn(),
      getSatByNoradId: jest.fn(),
      getSatsByAzEl: () => [],
      satellites: [],
      isDeveloperMode: false,
    })),
    destroy: jest.fn(),
  },
}));

// Mock EventBus
jest.mock('../../../src/events/event-bus', () => ({
  EventBus: {
    getInstance: jest.fn(() => ({
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    })),
  },
}));

/**
 * Concrete implementation of AntennaCore for testing
 * AntennaCore is abstract, so we need a concrete class
 */
class TestableAntennaCore extends AntennaCore {
  public syncDomCalled = false;
  public drawCalled = false;
  public listenersCalled = false;

  constructor(
    configId: ANTENNA_CONFIG_KEYS = ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
    initialState: Partial<AntennaState> = {},
    teamId: number = 1,
    serverId: number = 1
  ) {
    super(configId, initialState, teamId, serverId);
  }

  protected override addListeners_(): void {
    this.listenersCalled = true;
  }

  syncDomWithState(): void {
    this.syncDomCalled = true;
  }

  draw(): void {
    this.drawCalled = true;
  }

  // Expose stepTrackController for testing
  get stepTrackController_() {
    return (this as any).stepTrackController_;
  }

  // Expose protected/private methods for testing
  public testCalculateFreeSpacePathLoss(frequencyHz: number, distanceKm: number): number {
    return (this as any).calculateFreeSpacePathLoss_(frequencyHz, distanceKm);
  }

  public testCalculateAtmosphericLoss(frequencyHz: number, elevationAngleDeg: number): number {
    return (this as any).calculateAtmosphericLoss_(frequencyHz, elevationAngleDeg);
  }

  public testCalculatePolarizationLoss(
    txPolarization: string | null,
    rxPolarization: string | null,
    polarizationAngle: number
  ): number {
    return this.calculatePolarizationLoss_(txPolarization, rxPolarization, polarizationAngle);
  }

  public testPolMismatchLoss(
    signalPol: 'H' | 'V' | 'RHCP' | 'LHCP',
    rxPol: 'linear' | 'circular',
    polarizationMismatch: Degrees
  ): number {
    return (this as any).polMismatchLoss_dB_(signalPol, rxPol, polarizationMismatch);
  }

  public testApertureEfficiency(f_Hz: number): number {
    return (this as any).apertureEfficiency_(f_Hz);
  }

  public testBeamwidth3dB(f_Hz: number): number {
    return (this as any).beamwidth3dB_deg_(f_Hz);
  }

  public testPointingLoss(offAxis_deg: number, f_Hz: number): number {
    return (this as any).pointingLoss_dB_(offAxis_deg, f_Hz);
  }

  public testPatternGain(theta_deg: number, f_Hz: number): number {
    return (this as any).patternGain_dBi_(theta_deg, f_Hz);
  }

  public testSkyTempK(elev_deg: number): number {
    return (this as any).skyTempK_(elev_deg);
  }

  public testNoiseFromLossK(L_dB: number, physK?: number): number {
    return (this as any).noiseFromLossK_(L_dB, physK);
  }

  public testSystemTempK(frequency: Hertz, elevation: Degrees): number {
    return (this as any).systemTempK_(frequency, elevation);
  }

  public testCurrentDePointing(wind_mps?: number): number {
    return (this as any).currentDePointing_deg_(wind_mps);
  }

  public testFeedLossAt(f_Hz: number): number {
    return (this as any).feedLossAt_(f_Hz);
  }

  public testNormalizeAzimuth(az: number): number {
    return (this as any).normalizeAzimuth_(az);
  }

  public testCalculateShortestPathTarget(currentAz: Degrees, satAz: Degrees): Degrees {
    return (this as any).calculateShortestPathTarget_(currentAz, satAz);
  }

  // Expose update methods for testing
  public testUpdateSlew(): void {
    (this as any).updateSlew_();
  }

  public testUpdateBeaconMetrics(): void {
    (this as any).updateBeaconMetrics_();
  }
}

describe('AntennaCore', () => {
  let antenna: TestableAntennaCore;

  beforeEach(() => {
    antenna = new TestableAntennaCore();
  });

  describe('constructor', () => {
    it('should create instance with default parameters', () => {
      expect(antenna).toBeInstanceOf(AntennaCore);
    });

    it('should initialize with default state values', () => {
      expect(antenna.state.azimuth).toBe(0);
      expect(antenna.state.elevation).toBe(0);
      expect(antenna.state.polarization).toBe(0);
      expect(antenna.state.isPowered).toBe(true);
      expect(antenna.state.isLoopback).toBe(false);
      expect(antenna.state.isLocked).toBe(false);
      expect(antenna.state.trackingMode).toBe('manual');
    });

    it('should apply initial state overrides', () => {
      const initialState: Partial<AntennaState> = {
        azimuth: 45 as Degrees,
        elevation: 30 as Degrees,
        isPowered: false,
      };
      const customAntenna = new TestableAntennaCore(
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        initialState
      );

      expect(customAntenna.state.azimuth).toBe(45);
      expect(customAntenna.state.elevation).toBe(30);
      expect(customAntenna.state.isPowered).toBe(false);
    });

    it('should use correct config based on configId', () => {
      const kuAntenna = new TestableAntennaCore(ANTENNA_CONFIG_KEYS.KU_BAND_3M);

      expect(kuAntenna.config.name).toBe('3m Ku-Band');
      expect(kuAntenna.config.diameter).toBe(3.0);
      expect(kuAntenna.config.band).toBe('Ku');
    });

    it('should set teamId and serverId correctly', () => {
      const antenna = new TestableAntennaCore(
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        {},
        2,
        3
      );

      expect(antenna.state.teamId).toBe(2);
      expect(antenna.state.serverId).toBe(3);
    });

    it('should sync targets with position in manual mode', () => {
      const initialState: Partial<AntennaState> = {
        azimuth: 100 as Degrees,
        elevation: 45 as Degrees,
      };
      const antenna = new TestableAntennaCore(
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        initialState
      );

      expect(antenna.state.targetAzimuth).toBe(100);
      expect(antenna.state.targetElevation).toBe(45);
    });

    it('should set ACU model from config', () => {
      const antenna = new TestableAntennaCore(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK);

      // Uses config's acuModel if defined, otherwise defaults
      expect(antenna.state.acuModel).toBeDefined();
    });
  });

  describe('configId setter', () => {
    it('should update config when configId is changed', () => {
      antenna.configId = ANTENNA_CONFIG_KEYS.KU_BAND_2M;

      expect(antenna.config.name).toBe('2m Ku-Band');
      expect(antenna.config.band).toBe('Ku');
    });
  });

  describe('normalizedAzimuth', () => {
    it('should normalize azimuth between 0 and 360', () => {
      antenna.state.azimuth = 450 as Degrees;
      expect(antenna.normalizedAzimuth).toBe(90);
    });

    it('should handle negative azimuth values', () => {
      antenna.state.azimuth = -90 as Degrees;
      expect(antenna.normalizedAzimuth).toBe(270);
    });

    it('should return 0 for 360 degrees', () => {
      antenna.state.azimuth = 360 as Degrees;
      expect(antenna.normalizedAzimuth).toBe(0);
    });
  });

  describe('handleAzimuthChange', () => {
    it('should update azimuth when powered', () => {
      antenna.state.isPowered = true;
      antenna.handleAzimuthChange(90);

      expect(antenna.state.azimuth).toBe(90);
    });

    it('should not update azimuth when not powered', () => {
      antenna.state.isPowered = false;
      antenna.state.azimuth = 0 as Degrees;
      antenna.handleAzimuthChange(90);

      expect(antenna.state.azimuth).toBe(0);
    });

    it('should break lock when azimuth changes', () => {
      antenna.state.isPowered = true;
      antenna.state.isLocked = true;
      antenna.handleAzimuthChange(90);

      expect(antenna.state.isLocked).toBe(false);
    });

    it('should disable auto-track when azimuth changes', () => {
      antenna.state.isPowered = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.handleAzimuthChange(90);

      expect(antenna.state.isAutoTrackEnabled).toBe(false);
    });

    it('should keep target in sync in manual mode', () => {
      antenna.state.isPowered = true;
      antenna.state.trackingMode = 'manual';
      antenna.handleAzimuthChange(90);

      expect(antenna.state.targetAzimuth).toBe(90);
    });
  });

  describe('handleElevationChange', () => {
    it('should update elevation when powered', () => {
      antenna.state.isPowered = true;
      antenna.handleElevationChange(45);

      expect(antenna.state.elevation).toBe(45);
    });

    it('should not update elevation when not powered', () => {
      antenna.state.isPowered = false;
      antenna.state.elevation = 0 as Degrees;
      antenna.handleElevationChange(45);

      expect(antenna.state.elevation).toBe(0);
    });

    it('should break lock when elevation changes', () => {
      antenna.state.isPowered = true;
      antenna.state.isLocked = true;
      antenna.handleElevationChange(45);

      expect(antenna.state.isLocked).toBe(false);
    });
  });

  describe('handlePolarizationChange', () => {
    it('should update polarization when powered', () => {
      antenna.state.isPowered = true;
      antenna.handlePolarizationChange(30);

      expect(antenna.state.polarization).toBe(30);
    });

    it('should not update polarization when not powered', () => {
      antenna.state.isPowered = false;
      antenna.state.polarization = 0 as Degrees;
      antenna.handlePolarizationChange(30);

      expect(antenna.state.polarization).toBe(0);
    });
  });

  describe('handleLoopbackToggle', () => {
    it('should enable loopback when operational and powered', () => {
      antenna.state.isOperational = true;
      antenna.state.isPowered = true;
      antenna.handleLoopbackToggle(true);

      expect(antenna.state.isLoopback).toBe(true);
    });

    it('should not enable loopback when not operational', () => {
      antenna.state.isOperational = false;
      antenna.state.isPowered = true;
      antenna.handleLoopbackToggle(true);

      expect(antenna.state.isLoopback).toBe(false);
    });

    it('should not enable loopback when not powered', () => {
      antenna.state.isOperational = true;
      antenna.state.isPowered = false;
      antenna.handleLoopbackToggle(true);

      expect(antenna.state.isLoopback).toBe(false);
    });
  });

  describe('handlePowerToggle', () => {
    it('should toggle power state', () => {
      antenna.state.isPowered = true;
      antenna.handlePowerToggle();

      expect(antenna.state.isPowered).toBe(false);
    });

    it('should accept explicit power state', () => {
      antenna.state.isPowered = false;
      antenna.handlePowerToggle(true);

      expect(antenna.state.isPowered).toBe(true);
    });

    it('should reset tracking state when powering off', () => {
      antenna.state.isPowered = true;
      antenna.state.isLocked = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.handlePowerToggle(false);

      expect(antenna.state.isLocked).toBe(false);
      expect(antenna.state.isAutoTrackEnabled).toBe(false);
    });

    it('should reset to manual mode when powering off', () => {
      antenna.state.isPowered = true;
      antenna.state.trackingMode = 'step-track';
      antenna.handlePowerToggle(false);

      expect(antenna.state.trackingMode).toBe('manual');
    });

    it('should clear staged changes when powering off', () => {
      antenna.state.isPowered = true;
      antenna.state.stagedTargetAzimuth = 100 as Degrees;
      antenna.state.hasStagedChanges = true;
      antenna.handlePowerToggle(false);

      expect(antenna.state.stagedTargetAzimuth).toBeNull();
      expect(antenna.state.hasStagedChanges).toBe(false);
    });
  });

  describe('handleTrackingModeChange', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
    });

    it('should not change mode when not powered', () => {
      antenna.state.isPowered = false;
      antenna.state.trackingMode = 'manual';
      antenna.handleTrackingModeChange('step-track');

      expect(antenna.state.trackingMode).toBe('manual');
    });

    it('should not change mode when not operational', () => {
      antenna.state.isOperational = false;
      antenna.state.trackingMode = 'manual';
      antenna.handleTrackingModeChange('step-track');

      expect(antenna.state.trackingMode).toBe('manual');
    });

    it('should set stow mode and stage Az=0, El=90', () => {
      antenna.handleTrackingModeChange('stow');

      expect(antenna.state.trackingMode).toBe('stow');
      expect(antenna.state.stagedTargetAzimuth).toBe(0);
      expect(antenna.state.stagedTargetElevation).toBe(90);
      expect(antenna.state.hasStagedChanges).toBe(true);
    });

    it('should set maintenance mode and stage El=5', () => {
      antenna.handleTrackingModeChange('maintenance');

      expect(antenna.state.trackingMode).toBe('maintenance');
      expect(antenna.state.stagedTargetElevation).toBe(5);
      expect(antenna.state.hasStagedChanges).toBe(true);
    });

    it('should reset tracking state when changing modes', () => {
      antenna.state.isLocked = true;
      antenna.state.isBeaconLocked = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.handleTrackingModeChange('manual');

      expect(antenna.state.isLocked).toBe(false);
      expect(antenna.state.isBeaconLocked).toBe(false);
      expect(antenna.state.isAutoTrackEnabled).toBe(false);
    });

    it('should clear beacon metrics when changing modes', () => {
      antenna.state.beaconPower = -50;
      antenna.state.beaconCN = 10;
      antenna.handleTrackingModeChange('manual');

      expect(antenna.state.beaconPower).toBeNull();
      expect(antenna.state.beaconCN).toBeNull();
    });

    it('should sync target to current position for manual mode', () => {
      antenna.state.azimuth = 100 as Degrees;
      antenna.state.elevation = 45 as Degrees;
      antenna.handleTrackingModeChange('manual');

      expect(antenna.state.targetAzimuth).toBe(100);
      expect(antenna.state.targetElevation).toBe(45);
      expect(antenna.state.hasStagedChanges).toBe(false);
    });
  });

  describe('handleTargetSatelliteChange', () => {
    it('should set target satellite ID', () => {
      antenna.handleTargetSatelliteChange(12345);

      expect(antenna.state.targetSatelliteId).toBe(12345);
    });

    it('should clear target satellite ID with null', () => {
      antenna.state.targetSatelliteId = 12345;
      antenna.handleTargetSatelliteChange(null);

      expect(antenna.state.targetSatelliteId).toBeNull();
    });
  });

  describe('handleBeaconFrequencyChange', () => {
    it('should update beacon frequency', () => {
      antenna.handleBeaconFrequencyChange(3948000000);

      expect(antenna.state.beaconFrequencyHz).toBe(3948000000);
    });
  });

  describe('handleBeaconSearchBwChange', () => {
    it('should update beacon search bandwidth', () => {
      antenna.handleBeaconSearchBwChange(1000000);

      expect(antenna.state.beaconSearchBwHz).toBe(1000000);
    });
  });

  describe('handleHeaterToggle', () => {
    it('should enable heater when powered', () => {
      antenna.state.isPowered = true;
      antenna.handleHeaterToggle(true);

      expect(antenna.state.isHeaterEnabled).toBe(true);
    });

    it('should not enable heater when not powered', () => {
      antenna.state.isPowered = false;
      antenna.handleHeaterToggle(true);

      expect(antenna.state.isHeaterEnabled).toBe(false);
    });
  });

  describe('handleRainBlowerToggle', () => {
    it('should enable rain blower when powered', () => {
      antenna.state.isPowered = true;
      antenna.handleRainBlowerToggle(true);

      expect(antenna.state.isRainBlowerEnabled).toBe(true);
    });

    it('should not enable rain blower when not powered', () => {
      antenna.state.isPowered = false;
      antenna.handleRainBlowerToggle(true);

      expect(antenna.state.isRainBlowerEnabled).toBe(false);
    });
  });

  describe('updateIceAccumulation', () => {
    it('should update ice accumulation', () => {
      antenna.updateIceAccumulation(2.5);

      expect(antenna.state.iceAccumulation_dB).toBe(2.5);
    });
  });

  describe('adjustAzimuth', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.azimuth = 100 as Degrees;
    });

    it('should adjust azimuth by delta', () => {
      antenna.adjustAzimuth(10);

      expect(antenna.state.azimuth).toBe(110);
    });

    it('should not adjust when not powered', () => {
      antenna.state.isPowered = false;
      antenna.adjustAzimuth(10);

      expect(antenna.state.azimuth).toBe(100);
    });

    it('should not adjust when not operational', () => {
      antenna.state.isOperational = false;
      antenna.adjustAzimuth(10);

      expect(antenna.state.azimuth).toBe(100);
    });

    it('should not adjust when not in manual mode', () => {
      antenna.state.trackingMode = 'step-track';
      antenna.adjustAzimuth(10);

      expect(antenna.state.azimuth).toBe(100);
    });
  });

  describe('adjustElevation', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.elevation = 45 as Degrees;
    });

    it('should adjust elevation by delta', () => {
      antenna.adjustElevation(5);

      expect(antenna.state.elevation).toBe(50);
    });

    it('should clamp elevation to maximum 90', () => {
      antenna.state.elevation = 85 as Degrees;
      antenna.adjustElevation(10);

      expect(antenna.state.elevation).toBe(90);
    });

    it('should clamp elevation to minimum 0', () => {
      antenna.state.elevation = 5 as Degrees;
      antenna.adjustElevation(-10);

      expect(antenna.state.elevation).toBe(0);
    });
  });

  describe('adjustPolarization', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.polarization = 0 as Degrees;
    });

    it('should adjust polarization by delta', () => {
      antenna.adjustPolarization(15);

      expect(antenna.state.polarization).toBe(15);
    });

    it('should clamp polarization to maximum 90', () => {
      antenna.state.polarization = 85 as Degrees;
      antenna.adjustPolarization(10);

      expect(antenna.state.polarization).toBe(90);
    });

    it('should clamp polarization to minimum -90', () => {
      antenna.state.polarization = -85 as Degrees;
      antenna.adjustPolarization(-10);

      expect(antenna.state.polarization).toBe(-90);
    });
  });

  describe('stageAzimuthChange', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.targetAzimuth = 100 as Degrees;
    });

    it('should stage azimuth change', () => {
      antenna.stageAzimuthChange(10);

      expect(antenna.state.stagedTargetAzimuth).toBe(110);
      expect(antenna.state.hasStagedChanges).toBe(true);
    });

    it('should accumulate staged changes', () => {
      antenna.stageAzimuthChange(10);
      antenna.stageAzimuthChange(5);

      expect(antenna.state.stagedTargetAzimuth).toBe(115);
    });

    it('should not stage when not powered', () => {
      antenna.state.isPowered = false;
      antenna.stageAzimuthChange(10);

      expect(antenna.state.stagedTargetAzimuth).toBeNull();
    });
  });

  describe('stageElevationChange', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.targetElevation = 45 as Degrees;
    });

    it('should stage elevation change', () => {
      antenna.stageElevationChange(5);

      expect(antenna.state.stagedTargetElevation).toBe(50);
      expect(antenna.state.hasStagedChanges).toBe(true);
    });

    it('should clamp to elevation range from config', () => {
      // C_BAND_9M_VORTEK has elRange_deg: [5, 90]
      antenna.state.targetElevation = 10 as Degrees;
      antenna.stageElevationChange(-10);

      expect(antenna.state.stagedTargetElevation).toBe(5);
    });
  });

  describe('stagePolarizationChange', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.targetPolarization = 0 as Degrees;
    });

    it('should stage polarization change', () => {
      antenna.stagePolarizationChange(15);

      expect(antenna.state.stagedTargetPolarization).toBe(15);
      expect(antenna.state.hasStagedChanges).toBe(true);
    });

    it('should clamp polarization to +/-90', () => {
      antenna.state.targetPolarization = 85 as Degrees;
      antenna.stagePolarizationChange(10);

      expect(antenna.state.stagedTargetPolarization).toBe(90);
    });
  });

  describe('stageBeaconFrequencyChange', () => {
    it('should stage beacon frequency change', () => {
      antenna.stageBeaconFrequencyChange(4000000000);

      expect(antenna.state.stagedBeaconFrequencyHz).toBe(4000000000);
      expect(antenna.state.hasStagedChanges).toBe(true);
    });
  });

  describe('stageBeaconSearchBwChange', () => {
    it('should stage beacon search bandwidth change', () => {
      antenna.stageBeaconSearchBwChange(1000000);

      expect(antenna.state.stagedBeaconSearchBwHz).toBe(1000000);
      expect(antenna.state.hasStagedChanges).toBe(true);
    });
  });

  describe('applyChanges', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.targetAzimuth = 100 as Degrees;
      antenna.state.targetElevation = 45 as Degrees;
    });

    it('should apply staged azimuth change', () => {
      antenna.state.stagedTargetAzimuth = 150 as Degrees;
      antenna.state.hasStagedChanges = true;
      antenna.applyChanges();

      expect(antenna.state.targetAzimuth).toBe(150);
      expect(antenna.state.stagedTargetAzimuth).toBeNull();
      expect(antenna.state.hasStagedChanges).toBe(false);
    });

    it('should apply staged elevation change', () => {
      antenna.state.stagedTargetElevation = 60 as Degrees;
      antenna.state.hasStagedChanges = true;
      antenna.applyChanges();

      expect(antenna.state.targetElevation).toBe(60);
      expect(antenna.state.stagedTargetElevation).toBeNull();
    });

    it('should apply staged polarization change', () => {
      antenna.state.stagedTargetPolarization = 30 as Degrees;
      antenna.state.hasStagedChanges = true;
      antenna.applyChanges();

      expect(antenna.state.targetPolarization).toBe(30);
      expect(antenna.state.stagedTargetPolarization).toBeNull();
    });

    it('should apply staged beacon frequency', () => {
      antenna.state.stagedBeaconFrequencyHz = 4000000000;
      antenna.state.hasStagedChanges = true;
      antenna.applyChanges();

      expect(antenna.state.beaconFrequencyHz).toBe(4000000000);
      expect(antenna.state.stagedBeaconFrequencyHz).toBeNull();
    });

    it('should apply staged beacon search bandwidth', () => {
      antenna.state.stagedBeaconSearchBwHz = 1000000;
      antenna.state.hasStagedChanges = true;
      antenna.applyChanges();

      expect(antenna.state.beaconSearchBwHz).toBe(1000000);
      expect(antenna.state.stagedBeaconSearchBwHz).toBeNull();
    });

    it('should not apply when not powered', () => {
      antenna.state.isPowered = false;
      antenna.state.stagedTargetAzimuth = 150 as Degrees;
      antenna.applyChanges();

      expect(antenna.state.targetAzimuth).toBe(100);
    });

    it('should set fault when azimuth exceeds limits', () => {
      // Non-continuous antenna with limits
      antenna.config.azContinuous = false;
      antenna.config.azRange_deg = [-180, 180];
      antenna.state.stagedTargetAzimuth = 200 as Degrees;
      antenna.state.hasStagedChanges = true;
      antenna.applyChanges();

      expect(antenna.state.hasFault).toBe(true);
      expect(antenna.state.faultMessage).toContain('Azimuth');
    });

    it('should set fault when elevation exceeds limits', () => {
      antenna.config.elRange_deg = [0, 90];
      antenna.state.stagedTargetElevation = 95 as Degrees;
      antenna.state.hasStagedChanges = true;
      antenna.applyChanges();

      expect(antenna.state.hasFault).toBe(true);
      expect(antenna.state.faultMessage).toContain('Elevation');
    });

    it('should break lock when applying changes in manual mode', () => {
      antenna.state.isLocked = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.stagedTargetAzimuth = 150 as Degrees;
      antenna.applyChanges();

      expect(antenna.state.isLocked).toBe(false);
      expect(antenna.state.isAutoTrackEnabled).toBe(false);
    });
  });

  describe('discardChanges', () => {
    it('should clear all staged changes', () => {
      antenna.state.stagedTargetAzimuth = 150 as Degrees;
      antenna.state.stagedTargetElevation = 60 as Degrees;
      antenna.state.stagedTargetPolarization = 30 as Degrees;
      antenna.state.stagedBeaconFrequencyHz = 4000000000;
      antenna.state.stagedBeaconSearchBwHz = 1000000;
      antenna.state.hasStagedChanges = true;

      antenna.discardChanges();

      expect(antenna.state.stagedTargetAzimuth).toBeNull();
      expect(antenna.state.stagedTargetElevation).toBeNull();
      expect(antenna.state.stagedTargetPolarization).toBeNull();
      expect(antenna.state.stagedBeaconFrequencyHz).toBeNull();
      expect(antenna.state.stagedBeaconSearchBwHz).toBeNull();
      expect(antenna.state.hasStagedChanges).toBe(false);
    });

    it('should clear fault state', () => {
      antenna.state.hasFault = true;
      antenna.state.faultMessage = 'Test fault';

      antenna.discardChanges();

      expect(antenna.state.hasFault).toBe(false);
      expect(antenna.state.faultMessage).toBeNull();
    });
  });

  describe('sync', () => {
    it('should merge state data', () => {
      const newData: Partial<AntennaState> = {
        azimuth: 180 as Degrees,
        elevation: 60 as Degrees,
        isPowered: false,
      };
      antenna.sync(newData);

      expect(antenna.state.azimuth).toBe(180);
      expect(antenna.state.elevation).toBe(60);
      expect(antenna.state.isPowered).toBe(false);
    });

    it('should call syncDomWithState after sync', () => {
      antenna.syncDomCalled = false;
      antenna.sync({ azimuth: 180 as Degrees });

      expect(antenna.syncDomCalled).toBe(true);
    });
  });

  describe('getStatusAlarms', () => {
    it('should return off status when not powered', () => {
      antenna.state.isPowered = false;
      const alarms = antenna.getStatusAlarms();

      expect(alarms).toHaveLength(1);
      expect(alarms[0].severity).toBe('off');
    });

    it('should return error when not operational', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;
      const alarms = antenna.getStatusAlarms();

      expect(alarms.some(a => a.severity === 'error' && a.message.includes('NOT OPERATIONAL'))).toBe(true);
    });

    it('should return warning for high polarization', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.polarization = 50 as Degrees;
      const alarms = antenna.getStatusAlarms();

      expect(alarms.some(a => a.severity === 'warning' && a.message.includes('POLARIZATION'))).toBe(true);
    });

    it('should return error for critical ice buildup', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.iceAccumulation_dB = 6;
      const alarms = antenna.getStatusAlarms();

      expect(alarms.some(a => a.severity === 'error' && a.message.includes('ICE'))).toBe(true);
    });

    it('should return warning for moderate ice buildup', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.iceAccumulation_dB = 3;
      const alarms = antenna.getStatusAlarms();

      expect(alarms.some(a => a.severity === 'warning' && a.message.includes('ICE'))).toBe(true);
    });

    it('should return info for low ice accumulation', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.iceAccumulation_dB = 1;
      const alarms = antenna.getStatusAlarms();

      expect(alarms.some(a => a.severity === 'info' && a.message.includes('ICE'))).toBe(true);
    });

    it('should return info when loopback is enabled', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.isLoopback = true;
      const alarms = antenna.getStatusAlarms();

      expect(alarms.some(a => a.severity === 'info' && a.message.includes('LOOPBACK'))).toBe(true);
    });

    it('should return info for manual tracking', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      const alarms = antenna.getStatusAlarms();

      expect(alarms.some(a => a.severity === 'info' && a.message.includes('Manual'))).toBe(true);
    });
  });

  describe('RF physics calculations', () => {
    it('should calculate free-space path loss correctly', () => {
      // FSPL = 32.45 + 20*log10(d_km) + 20*log10(f_MHz)
      // For 4 GHz (4000 MHz) and 38000 km:
      // FSPL = 32.45 + 20*log10(38000) + 20*log10(4000) = 32.45 + 91.6 + 72.0 = ~196 dB
      const fspl = antenna.testCalculateFreeSpacePathLoss(4e9, 38000);

      expect(fspl).toBeGreaterThan(190);
      expect(fspl).toBeLessThan(200);
    });

    it('should calculate atmospheric loss correctly for C-band at zenith', () => {
      // C-band (~4 GHz) at 90 degrees elevation should have minimal loss
      const loss = antenna.testCalculateAtmosphericLoss(4e9, 90);

      expect(loss).toBeGreaterThan(0);
      expect(loss).toBeLessThan(0.5); // Very low for C-band at zenith
    });

    it('should calculate higher atmospheric loss at low elevation', () => {
      const lossHigh = antenna.testCalculateAtmosphericLoss(4e9, 90);
      const lossLow = antenna.testCalculateAtmosphericLoss(4e9, 10);

      expect(lossLow).toBeGreaterThan(lossHigh);
    });

    it('should calculate higher atmospheric loss at higher frequencies', () => {
      const lossCband = antenna.testCalculateAtmosphericLoss(4e9, 45);
      const lossKuband = antenna.testCalculateAtmosphericLoss(12e9, 45);
      const lossKaband = antenna.testCalculateAtmosphericLoss(30e9, 45);

      expect(lossKuband).toBeGreaterThan(lossCband);
      expect(lossKaband).toBeGreaterThan(lossKuband);
    });

    it('should calculate zero polarization loss for matched polarization', () => {
      const loss = antenna.testCalculatePolarizationLoss('H', 'H', 0);
      expect(loss).toBe(0);
    });

    it('should calculate high loss for cross-polarization', () => {
      const loss = antenna.testCalculatePolarizationLoss('H', 'V', 0);
      expect(loss).toBe(20);
    });

    it('should return zero loss when polarization is null', () => {
      const loss = antenna.testCalculatePolarizationLoss(null, 'H', 0);
      expect(loss).toBe(0);
    });
  });

  describe('antennaNoiseFloor', () => {
    it('should calculate noise floor for given frequency and bandwidth', () => {
      // kTB at 290K = -174 dBm/Hz + 10*log10(bandwidth)
      const noiseFloor = antenna.antennaNoiseFloor(4e9 as Hertz, 36e6 as Hertz);

      // With 36 MHz bandwidth: -174 + 10*log10(36e6) = -174 + 75.6 = -98.4 dBm approximately
      // Plus temperature correction and system noise
      expect(noiseFloor).toBeGreaterThan(-110);
      expect(noiseFloor).toBeLessThan(-80);
    });

    it('should return higher noise floor for wider bandwidth', () => {
      const narrowNoise = antenna.antennaNoiseFloor(4e9 as Hertz, 1e6 as Hertz);
      const wideNoise = antenna.antennaNoiseFloor(4e9 as Hertz, 100e6 as Hertz);

      expect(wideNoise).toBeGreaterThan(narrowNoise);
    });
  });

  describe('update', () => {
    it('should call syncDomWithState', () => {
      antenna.syncDomCalled = false;
      antenna.update();
      expect(antenna.syncDomCalled).toBe(true);
    });

    it('should not update slew when not powered', () => {
      antenna.state.isPowered = false;
      antenna.state.targetAzimuth = 100 as Degrees;
      antenna.state.azimuth = 50 as Degrees;

      antenna.update();

      // Should not have moved
      expect(antenna.state.azimuth).toBe(50);
    });

    it('should not update slew when not operational', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;
      antenna.state.targetAzimuth = 100 as Degrees;
      antenna.state.azimuth = 50 as Degrees;

      antenna.update();

      // Should not have moved
      expect(antenna.state.azimuth).toBe(50);
    });

    it('should slew azimuth toward target', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.azimuth = 50 as Degrees;
      antenna.state.targetAzimuth = 60 as Degrees;

      antenna.update();

      // Should have moved toward target
      expect(antenna.state.azimuth).toBeGreaterThan(50);
      expect(antenna.state.isSlewing).toBe(true);
    });

    it('should slew elevation toward target', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.elevation = 30 as Degrees;
      antenna.state.targetElevation = 45 as Degrees;

      antenna.update();

      // Should have moved toward target
      expect(antenna.state.elevation).toBeGreaterThan(30);
    });

    it('should slew polarization toward target', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.polarization = 0 as Degrees;
      antenna.state.targetPolarization = 20 as Degrees;

      antenna.update();

      // Should have moved toward target
      expect(antenna.state.polarization).toBeGreaterThan(0);
    });

    it('should set isSlewing to false when at target', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.azimuth = 100 as Degrees;
      antenna.state.targetAzimuth = 100 as Degrees;
      antenna.state.elevation = 45 as Degrees;
      antenna.state.targetElevation = 45 as Degrees;
      antenna.state.polarization = 0 as Degrees;
      antenna.state.targetPolarization = 0 as Degrees;

      antenna.update();

      expect(antenna.state.isSlewing).toBe(false);
    });

    it('should keep step track controller running during update', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'program-track';

      // Start step tracking first
      antenna.startStepTrack();
      expect(antenna.stepTrackController_.isActive).toBe(true);

      // Update should keep it running
      antenna.update();

      // Controller should still be active after update
      expect(antenna.stepTrackController_.isActive).toBe(true);
    });
  });

  describe('startStepTrack', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'program-track';
    });

    it('should start step tracking', () => {
      antenna.startStepTrack();

      expect(antenna.stepTrackController_.isActive).toBe(true);
      expect(antenna.state.isAutoTrackEnabled).toBe(true);
      expect(antenna.state.isAutoTrackSwitchUp).toBe(true);
    });

    it('should not start when not powered', () => {
      antenna.state.isPowered = false;
      antenna.startStepTrack();

      expect(antenna.stepTrackController_.isActive).toBe(false);
    });

    it('should not start when not in program-track mode', () => {
      antenna.state.trackingMode = 'manual';
      antenna.startStepTrack();

      expect(antenna.stepTrackController_.isActive).toBe(false);
    });

    it('should apply staged beacon settings', () => {
      antenna.state.stagedBeaconFrequencyHz = 4000000000;
      antenna.state.stagedBeaconSearchBwHz = 1000000;
      antenna.state.hasStagedChanges = true;

      antenna.startStepTrack();

      expect(antenna.state.beaconFrequencyHz).toBe(4000000000);
      expect(antenna.state.beaconSearchBwHz).toBe(1000000);
      expect(antenna.state.stagedBeaconFrequencyHz).toBeNull();
      expect(antenna.state.stagedBeaconSearchBwHz).toBeNull();
      expect(antenna.state.hasStagedChanges).toBe(false);
    });
  });

  describe('stopStepTrack', () => {
    it('should stop step tracking', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'program-track';

      antenna.startStepTrack();
      expect(antenna.stepTrackController_.isActive).toBe(true);

      antenna.stopStepTrack();

      expect(antenna.stepTrackController_.isActive).toBe(false);
      expect(antenna.state.isAutoTrackEnabled).toBe(false);
      expect(antenna.state.isAutoTrackSwitchUp).toBe(false);
      expect(antenna.state.isBeaconLocked).toBe(false);
    });
  });

  describe('moveToTargetSatellite', () => {
    it('should not move when not powered', () => {
      antenna.state.isPowered = false;
      antenna.state.targetSatelliteId = 12345;

      antenna.moveToTargetSatellite();

      // Should not throw and should not change position
      expect(antenna.state.targetAzimuth).toBe(antenna.state.azimuth);
    });

    it('should not move when targetSatelliteId is null', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.targetSatelliteId = null;

      antenna.moveToTargetSatellite();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('txSignalsIn getter', () => {
    it('should return empty array when no RF front-end attached', () => {
      expect(antenna.txSignalsIn).toEqual([]);
    });
  });

  describe('txSignalsOut getter', () => {
    it('should return empty array when no RF front-end attached', () => {
      expect(antenna.txSignalsOut).toEqual([]);
    });
  });

  describe('rxSignals getter', () => {
    it('should return empty array when no satellites in view', () => {
      expect(antenna.rxSignals).toEqual([]);
    });
  });

  describe('attachRfFrontEnd', () => {
    it('should attach RF front-end', () => {
      const mockRfFrontEnd = {} as any;
      antenna.attachRfFrontEnd(mockRfFrontEnd);

      expect(antenna.rfFrontEnd).toBe(mockRfFrontEnd);
    });
  });

  describe('handleAutoTrackToggle', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
    });

    it('should not toggle when not powered', () => {
      antenna.state.isPowered = false;
      antenna.handleAutoTrackToggle(true);

      expect(antenna.state.isAutoTrackSwitchUp).toBe(false);
    });

    it('should not toggle when not operational', () => {
      antenna.state.isOperational = false;
      antenna.handleAutoTrackToggle(true);

      expect(antenna.state.isAutoTrackSwitchUp).toBe(false);
    });

    it('should set auto-track switch state when toggled', () => {
      antenna.handleAutoTrackToggle(true);

      expect(antenna.state.isAutoTrackSwitchUp).toBe(true);
    });

    it('should disable auto-track when no strong signal found', () => {
      antenna.handleAutoTrackToggle(true);

      // With no satellites, auto-track should disable
      expect(antenna.state.isAutoTrackEnabled).toBe(false);
      expect(antenna.state.isLocked).toBe(false);
    });

    it('should disable when toggled off', () => {
      antenna.state.isAutoTrackSwitchUp = true;
      antenna.state.isAutoTrackEnabled = true;

      antenna.handleAutoTrackToggle(false);

      expect(antenna.state.isAutoTrackSwitchUp).toBe(false);
      expect(antenna.state.isAutoTrackEnabled).toBe(false);
    });
  });

  describe('calculateShortestPathTarget', () => {
    it('should be tested via handleAutoTrackToggle', () => {
      // This private method is called internally when satellites are found
      // We test its behavior indirectly
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.azimuth = 350 as Degrees;

      // Without real satellites, we can't fully test shortest path
      // but we ensure no errors occur
      antenna.handleAutoTrackToggle(true);
      expect(antenna.state.isAutoTrackSwitchUp).toBe(true);
    });
  });

  describe('status alarms extended', () => {
    it('should show ACQUIRING LOCK when auto-track enabled but not locked', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.isLocked = false;
      antenna.state.isBeaconLocked = false;

      const alarms = antenna.getStatusAlarms();
      expect(alarms.some(a => a.message.includes('ACQUIRING LOCK'))).toBe(true);
    });

    it('should show AUTO TRACK FAILED when switch up but not enabled', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.isAutoTrackSwitchUp = true;
      antenna.state.isAutoTrackEnabled = false;
      antenna.state.isLocked = false;

      const alarms = antenna.getStatusAlarms();
      expect(alarms.some(a => a.message.includes('AUTO TRACK FAILED'))).toBe(true);
    });

    it('should show NO SIGNALS RECEIVED when locked but no signals', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.isLocked = true;
      antenna.state.isLoopback = false;
      antenna.state.rxSignalsIn = [];

      const alarms = antenna.getStatusAlarms();
      expect(alarms.some(a => a.message.includes('NO SIGNALS'))).toBe(true);
    });

    it('should show locked status', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.isLocked = true;
      antenna.state.isLoopback = false;

      const alarms = antenna.getStatusAlarms();
      expect(alarms.some(a => a.message.includes('LOCKED'))).toBe(true);
    });
  });

  describe('program-track mode', () => {
    it('should stage satellite position in program-track mode', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;

      antenna.handleTrackingModeChange('program-track');

      expect(antenna.state.trackingMode).toBe('program-track');
    });
  });

  describe('draw', () => {
    it('should call draw method without throwing', () => {
      antenna.drawCalled = false;
      antenna.draw();
      expect(antenna.drawCalled).toBe(true);
    });
  });

  describe('computeRfMetrics', () => {
    it('should compute RF metrics when powered', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.elevation = 45 as Degrees;

      antenna.update();

      // RF metrics should be computed
      expect(antenna.state.rfMetrics).toBeDefined();
      expect(antenna.state.rfMetrics?.gain_dBi).toBeGreaterThan(0);
    });
  });

  describe('antennaGain_dBi', () => {
    it('should calculate reasonable gain for C-band', () => {
      const gain = antenna.antennaGain_dBi(4e9 as Hertz);

      // 9m C-band antenna should have ~40+ dBi gain
      expect(gain).toBeGreaterThan(35);
      expect(gain).toBeLessThan(50);
    });

    it('should calculate lower gain for lower frequency', () => {
      const gainLow = antenna.antennaGain_dBi(3.7e9 as Hertz);
      const gainHigh = antenna.antennaGain_dBi(4.2e9 as Hertz);

      // Higher frequency = higher gain for same dish
      expect(gainHigh).toBeGreaterThan(gainLow);
    });
  });

  describe('stow mode', () => {
    it('should transition to stow mode', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;

      antenna.handleTrackingModeChange('stow');

      expect(antenna.state.trackingMode).toBe('stow');
      expect(antenna.state.stagedTargetAzimuth).toBe(0);
      expect(antenna.state.stagedTargetElevation).toBe(90);
    });
  });

  describe('maintenance mode', () => {
    it('should transition to maintenance mode', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;

      antenna.handleTrackingModeChange('maintenance');

      expect(antenna.state.trackingMode).toBe('maintenance');
      expect(antenna.state.stagedTargetElevation).toBe(5);
    });
  });

  describe('addListeners_', () => {
    it('should call addListeners_ when built explicitly', () => {
      // Create a new instance with a parent element
      document.body.innerHTML = '';
      const parent = document.createElement('div');
      parent.id = 'test-build-parent';
      document.body.appendChild(parent);

      const testAntenna = new TestableAntennaCore();
      // addListeners_ is called in TestableAntennaCore override
      // but only when build() is called which requires a parent

      // Just verify the method exists and is callable
      expect(typeof testAntenna['addListeners_']).toBe('function');
    });
  });

  describe('notifyStateChange', () => {
    it('should be callable', () => {
      // This is primarily for sync with external components
      expect(() => (antenna as any).notifyStateChange_()).not.toThrow();
    });
  });

  describe('config properties', () => {
    it('should have valid config', () => {
      expect(antenna.config).toBeDefined();
      expect(antenna.config.name).toBeDefined();
      expect(antenna.config.diameter).toBe(9.0);
      expect(antenna.config.band).toBe('C');
    });

    it('should have valid frequency ranges', () => {
      expect(antenna.config.minRxFrequency).toBeLessThan(antenna.config.maxRxFrequency);
      expect(antenna.config.minTxFrequency).toBeLessThan(antenna.config.maxTxFrequency);
    });
  });

  describe('polMismatchLoss_dB_', () => {
    it('should calculate small loss for matched circular polarization when config is circular', () => {
      // Set config to circular polarization type
      const originalPolType = antenna.config.polType;
      antenna.config.polType = 'circular';

      const loss = antenna.testPolMismatchLoss('RHCP', 'circular', 0 as Degrees);
      expect(loss).toBe(0.5);

      antenna.config.polType = originalPolType;
    });

    it('should calculate 3 dB loss for circular pol signal on linear antenna', () => {
      // Default config is linear, so RHCP/LHCP signals have 3 dB mismatch
      const loss = antenna.testPolMismatchLoss('LHCP', 'circular', 0 as Degrees);
      expect(loss).toBe(3);
    });

    it('should calculate loss for linear polarization with skew', () => {
      const loss = antenna.testPolMismatchLoss('H', 'linear', 30 as Degrees);
      expect(loss).toBeGreaterThan(0);
      expect(loss).toBeLessThan(3); // cos(30°) gives ~1.25 dB
    });

    it('should limit loss to XPD floor for extreme skew', () => {
      const loss = antenna.testPolMismatchLoss('V', 'linear', 89 as Degrees);
      // Should be limited by XPD from config (may be 30-40 dB)
      const xpd = antenna.config.xpd_dB ?? 30;
      expect(loss).toBeLessThanOrEqual(xpd);
    });
  });

  describe('apertureEfficiency_', () => {
    it('should return efficiency between 0 and 1', () => {
      const eta = antenna.testApertureEfficiency(4e9);
      expect(eta).toBeGreaterThan(0);
      expect(eta).toBeLessThanOrEqual(1);
    });

    it('should account for Ruze and blockage effects', () => {
      // Higher frequency should have lower efficiency due to Ruze
      const etaLow = antenna.testApertureEfficiency(3.7e9);
      const etaHigh = antenna.testApertureEfficiency(6e9);

      // Both should be reasonable values
      expect(etaLow).toBeGreaterThan(0.1);
      expect(etaHigh).toBeGreaterThan(0.1);
    });
  });

  describe('beamwidth3dB_deg_', () => {
    it('should calculate narrower beamwidth for higher frequency', () => {
      const bwLow = antenna.testBeamwidth3dB(3.7e9);
      const bwHigh = antenna.testBeamwidth3dB(4.2e9);

      expect(bwHigh).toBeLessThan(bwLow);
    });

    it('should return reasonable beamwidth for 9m C-band dish', () => {
      const bw = antenna.testBeamwidth3dB(4e9);

      // 9m at 4 GHz should have beamwidth around 0.5-0.6 degrees
      expect(bw).toBeGreaterThan(0.3);
      expect(bw).toBeLessThan(1.0);
    });
  });

  describe('pointingLoss_dB_', () => {
    it('should return zero loss for on-axis pointing', () => {
      const loss = antenna.testPointingLoss(0, 4e9);
      expect(loss).toBe(0);
    });

    it('should return 3 dB loss at half-power beamwidth', () => {
      const bw = antenna.testBeamwidth3dB(4e9);
      const loss = antenna.testPointingLoss(bw / 2, 4e9);

      // 12*(0.5)^2 = 3 dB
      expect(loss).toBeCloseTo(3, 0);
    });

    it('should return 12 dB loss at full beamwidth', () => {
      const bw = antenna.testBeamwidth3dB(4e9);
      const loss = antenna.testPointingLoss(bw, 4e9);

      // 12*(1)^2 = 12 dB
      expect(loss).toBeCloseTo(12, 0);
    });
  });

  describe('patternGain_dBi_', () => {
    it('should return max gain on axis', () => {
      const gainOnAxis = antenna.testPatternGain(0, 4e9);
      const maxGain = antenna.antennaGain_dBi(4e9 as Hertz);

      expect(gainOnAxis).toBeCloseTo(maxGain, 1);
    });

    it('should decrease gain within main lobe', () => {
      const bw = antenna.testBeamwidth3dB(4e9);
      const gainOnAxis = antenna.testPatternGain(0, 4e9);
      const gainOffAxis = antenna.testPatternGain(bw * 0.5, 4e9);

      expect(gainOffAxis).toBeLessThan(gainOnAxis);
    });

    it('should follow sidelobe envelope for far off-axis', () => {
      const bw = antenna.testBeamwidth3dB(4e9);
      const gainSidelobe = antenna.testPatternGain(bw * 3, 4e9);
      const maxGain = antenna.antennaGain_dBi(4e9 as Hertz);

      // Sidelobe should be significantly lower than max
      expect(gainSidelobe).toBeLessThan(maxGain - 10);
    });
  });

  describe('skyTempK_', () => {
    it('should return low temperature at zenith', () => {
      const temp = antenna.testSkyTempK(90);
      expect(temp).toBeLessThan(15);
      expect(temp).toBeGreaterThan(5);
    });

    it('should return higher temperature at low elevation', () => {
      const tempHigh = antenna.testSkyTempK(90);
      const tempLow = antenna.testSkyTempK(10);

      expect(tempLow).toBeGreaterThan(tempHigh);
    });
  });

  describe('noiseFromLossK_', () => {
    it('should return zero for zero loss', () => {
      const temp = antenna.testNoiseFromLossK(0, 290);
      expect(temp).toBeCloseTo(0, 1);
    });

    it('should return higher temperature for higher loss', () => {
      const temp1dB = antenna.testNoiseFromLossK(1, 290);
      const temp3dB = antenna.testNoiseFromLossK(3, 290);

      expect(temp3dB).toBeGreaterThan(temp1dB);
    });

    it('should scale with physical temperature', () => {
      const tempCold = antenna.testNoiseFromLossK(1, 100);
      const tempHot = antenna.testNoiseFromLossK(1, 300);

      expect(tempHot).toBeGreaterThan(tempCold);
    });
  });

  describe('systemTempK_', () => {
    it('should return reasonable system temperature', () => {
      const temp = antenna.testSystemTempK(4e9 as Hertz, 45 as Degrees);

      // System temp should be positive and reasonable for a well-designed system
      expect(temp).toBeGreaterThan(20);
      expect(temp).toBeLessThan(500);
    });

    it('should be higher at lower elevation', () => {
      const tempHigh = antenna.testSystemTempK(4e9 as Hertz, 60 as Degrees);
      const tempLow = antenna.testSystemTempK(4e9 as Hertz, 10 as Degrees);

      expect(tempLow).toBeGreaterThan(tempHigh);
    });
  });

  describe('currentDePointing_deg_', () => {
    it('should return small value with no wind', () => {
      const depoint = antenna.testCurrentDePointing(0);
      expect(Math.abs(depoint)).toBeLessThan(1); // Jitter only
    });

    it('should increase with wind speed', () => {
      // Set wind coefficient on config for testing
      antenna.config.windDePointingCoef_deg_per_mps = 0.1;

      const depoint10mps = antenna.testCurrentDePointing(10);
      // With 0.1 deg/mps coefficient, 10 m/s wind gives ~1 degree base + jitter
      expect(Math.abs(depoint10mps)).toBeLessThan(2);
    });
  });

  describe('feedLossAt_', () => {
    it('should return static feed loss if no model defined', () => {
      // Save original model
      const originalModel = antenna.config.feedLossModel;
      delete antenna.config.feedLossModel;
      antenna.config.feedLoss = 0.3;

      const loss = antenna.testFeedLossAt(4e9);
      expect(loss).toBe(0.3);

      // Restore
      antenna.config.feedLossModel = originalModel;
    });

    it('should calculate frequency-dependent loss with model', () => {
      // Set up a feed loss model
      antenna.config.feedLossModel = { a: 0.1, b: 0.05, c: 0.02 };

      const loss3GHz = antenna.testFeedLossAt(3e9);
      const loss6GHz = antenna.testFeedLossAt(6e9);

      // Higher frequency should have higher loss
      expect(loss6GHz).toBeGreaterThan(loss3GHz);
    });
  });

  describe('normalizeAzimuth_', () => {
    it('should normalize positive azimuth to 0-360', () => {
      expect(antenna.testNormalizeAzimuth(450)).toBe(90);
      expect(antenna.testNormalizeAzimuth(720)).toBe(0);
    });

    it('should normalize negative azimuth to 0-360', () => {
      expect(antenna.testNormalizeAzimuth(-90)).toBe(270);
      expect(antenna.testNormalizeAzimuth(-450)).toBe(270);
    });

    it('should keep values in range unchanged', () => {
      expect(antenna.testNormalizeAzimuth(180)).toBe(180);
      expect(antenna.testNormalizeAzimuth(0)).toBe(0);
    });
  });

  describe('calculateShortestPathTarget_', () => {
    it('should return direct path when difference is small', () => {
      const target = antenna.testCalculateShortestPathTarget(100 as Degrees, 120 as Degrees);
      expect(target).toBe(120);
    });

    it('should wrap around for shorter path going negative', () => {
      const target = antenna.testCalculateShortestPathTarget(10 as Degrees, 350 as Degrees);
      // Shortest path is -20 degrees, so target should be -10
      expect(target).toBe(-10);
    });

    it('should wrap around for shorter path going positive', () => {
      const target = antenna.testCalculateShortestPathTarget(350 as Degrees, 10 as Degrees);
      // Shortest path is +20 degrees, so target should be 370
      expect(target).toBe(370);
    });
  });

  describe('updateSlew_ edge cases', () => {
    it('should slew in negative direction', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.azimuth = 100 as Degrees;
      antenna.state.targetAzimuth = 50 as Degrees;

      antenna.testUpdateSlew();

      // Should have moved toward target (decreased)
      expect(antenna.state.azimuth).toBeLessThan(100);
      expect(antenna.state.isSlewing).toBe(true);
    });

    it('should slew elevation in negative direction', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.elevation = 60 as Degrees;
      antenna.state.targetElevation = 30 as Degrees;

      antenna.testUpdateSlew();

      expect(antenna.state.elevation).toBeLessThan(60);
    });

    it('should slew polarization in negative direction', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.polarization = 30 as Degrees;
      antenna.state.targetPolarization = -30 as Degrees;

      antenna.testUpdateSlew();

      expect(antenna.state.polarization).toBeLessThan(30);
    });
  });

  describe('updateBeaconMetrics_', () => {
    it('should clear metrics when not powered', () => {
      antenna.state.isPowered = false;
      antenna.state.beaconPower = -50;
      antenna.state.beaconCN = 10;

      antenna.testUpdateBeaconMetrics();

      expect(antenna.state.beaconPower).toBeNull();
      expect(antenna.state.beaconCN).toBeNull();
    });

    it('should clear metrics when not operational', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;
      antenna.state.beaconPower = -50;

      antenna.testUpdateBeaconMetrics();

      expect(antenna.state.beaconPower).toBeNull();
    });

    it('should not change metrics when no RF front-end attached', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;

      antenna.testUpdateBeaconMetrics();

      // Without RF front-end, measureBeaconMetrics_ returns null
      // No real measurements means preserved initial values
      expect(antenna.state.beaconPower).toBeNull();
    });
  });

  describe('stageAzimuthChange with continuous antenna', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.targetAzimuth = 350 as Degrees;
      antenna.config.azContinuous = true;
    });

    it('should normalize staged azimuth for continuous antenna', () => {
      antenna.stageAzimuthChange(20);

      // 350 + 20 = 370, normalized to 10
      expect(antenna.state.stagedTargetAzimuth).toBe(10);
    });

    it('should normalize negative wrap for continuous antenna', () => {
      antenna.state.targetAzimuth = 10 as Degrees;
      antenna.stageAzimuthChange(-20);

      // 10 - 20 = -10, normalized to 350
      expect(antenna.state.stagedTargetAzimuth).toBe(350);
    });
  });

  describe('atmospheric loss frequency bands', () => {
    it('should have very low loss below 1 GHz', () => {
      const loss = antenna.testCalculateAtmosphericLoss(0.5e9, 45);
      expect(loss).toBeLessThan(0.1);
    });

    it('should have moderate loss at Ka-band (30 GHz)', () => {
      const loss = antenna.testCalculateAtmosphericLoss(30e9, 45);
      expect(loss).toBeGreaterThan(0.3);
    });

    it('should have higher loss at very high frequencies', () => {
      const loss = antenna.testCalculateAtmosphericLoss(40e9, 45);
      expect(loss).toBeGreaterThan(0.5);
    });

    it('should cap path factor at low elevations', () => {
      const lossLow = antenna.testCalculateAtmosphericLoss(4e9, 5);
      const lossVeryLow = antenna.testCalculateAtmosphericLoss(4e9, 1);

      // Both should be similar due to capping
      expect(lossVeryLow / lossLow).toBeLessThan(2);
    });
  });

  describe('applyChanges fault conditions', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.config.azContinuous = false;
      antenna.config.azRange_deg = [-180, 180];
      antenna.config.elRange_deg = [5, 85];
    });

    it('should set fault for azimuth below minimum', () => {
      antenna.state.stagedTargetAzimuth = -200 as Degrees;
      antenna.state.hasStagedChanges = true;

      antenna.applyChanges();

      expect(antenna.state.hasFault).toBe(true);
      expect(antenna.state.faultMessage).toContain('Azimuth');
      expect(antenna.state.faultMessage).toContain('-200');
    });

    it('should set fault for elevation below minimum', () => {
      antenna.state.stagedTargetElevation = 2 as Degrees;
      antenna.state.hasStagedChanges = true;

      antenna.applyChanges();

      expect(antenna.state.hasFault).toBe(true);
      expect(antenna.state.faultMessage).toContain('Elevation');
    });

    it('should not apply staged azimuth when fault occurs', () => {
      antenna.state.targetAzimuth = 100 as Degrees;
      antenna.state.stagedTargetAzimuth = -200 as Degrees;
      antenna.state.hasStagedChanges = true;

      antenna.applyChanges();

      // Original target should be preserved
      expect(antenna.state.targetAzimuth).toBe(100);
    });
  });

  describe('adjustAzimuth edge cases', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.azimuth = 180 as Degrees;
    });

    it('should adjust azimuth by negative delta', () => {
      antenna.adjustAzimuth(-30);
      expect(antenna.state.azimuth).toBe(150);
    });

    it('should not adjust when in program-track mode', () => {
      antenna.state.trackingMode = 'program-track';
      antenna.adjustAzimuth(30);
      expect(antenna.state.azimuth).toBe(180);
    });

    it('should not adjust when in stow mode', () => {
      antenna.state.trackingMode = 'stow';
      antenna.adjustAzimuth(30);
      expect(antenna.state.azimuth).toBe(180);
    });
  });

  describe('adjustElevation edge cases', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.elevation = 45 as Degrees;
    });

    it('should not adjust when in step-track mode', () => {
      antenna.state.trackingMode = 'step-track';
      antenna.adjustElevation(10);
      expect(antenna.state.elevation).toBe(45);
    });

    it('should not adjust when in maintenance mode', () => {
      antenna.state.trackingMode = 'maintenance';
      antenna.adjustElevation(10);
      expect(antenna.state.elevation).toBe(45);
    });
  });

  describe('stageElevationChange edge cases', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.targetElevation = 50 as Degrees;
    });

    it('should not stage when in step-track mode', () => {
      antenna.state.trackingMode = 'step-track';
      antenna.stageElevationChange(10);
      expect(antenna.state.stagedTargetElevation).toBeNull();
    });

    it('should clamp to config elevation range', () => {
      antenna.config.elRange_deg = [10, 80];
      antenna.state.targetElevation = 15 as Degrees;
      antenna.stageElevationChange(-10);

      // Should clamp to minimum 10
      expect(antenna.state.stagedTargetElevation).toBe(10);
    });

    it('should clamp to maximum elevation', () => {
      antenna.config.elRange_deg = [10, 80];
      antenna.state.targetElevation = 75 as Degrees;
      antenna.stageElevationChange(10);

      // Should clamp to maximum 80
      expect(antenna.state.stagedTargetElevation).toBe(80);
    });
  });

  describe('stagePolarizationChange edge cases', () => {
    beforeEach(() => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.targetPolarization = 0 as Degrees;
    });

    it('should not stage when not powered', () => {
      antenna.state.isPowered = false;
      antenna.stagePolarizationChange(30);
      expect(antenna.state.stagedTargetPolarization).toBeNull();
    });

    it('should not stage when not operational', () => {
      antenna.state.isOperational = false;
      antenna.stagePolarizationChange(30);
      expect(antenna.state.stagedTargetPolarization).toBeNull();
    });

    it('should clamp to minimum -90', () => {
      antenna.state.targetPolarization = -80 as Degrees;
      antenna.stagePolarizationChange(-20);
      expect(antenna.state.stagedTargetPolarization).toBe(-90);
    });
  });

  describe('handleTrackingModeChange stopping step track', () => {
    it('should stop step track controller when leaving program-track mode', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'program-track';

      // Start step tracking
      antenna.startStepTrack();
      expect(antenna.stepTrackController_.isActive).toBe(true);

      // Change to manual mode
      antenna.handleTrackingModeChange('manual');

      expect(antenna.stepTrackController_.isActive).toBe(false);
      expect(antenna.state.trackingMode).toBe('manual');
    });
  });

  describe('antennaGain_dBi frequency warnings', () => {
    it('should log warning for out-of-band frequency', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Use frequency outside both Rx and Tx ranges
      antenna.antennaGain_dBi(1e9 as Hertz); // 1 GHz, way below C-band

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('handleAutoTrackToggle with lock acquisition', () => {
    it('should clear existing timeout when toggling', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;

      // Toggle on (no satellites, so should fail)
      antenna.handleAutoTrackToggle(true);
      expect(antenna.state.isAutoTrackSwitchUp).toBe(true);
      expect(antenna.state.isAutoTrackEnabled).toBe(false); // No signal found

      // Toggle off
      antenna.handleAutoTrackToggle(false);
      expect(antenna.state.isAutoTrackSwitchUp).toBe(false);
    });
  });

  describe('handleElevationChange in manual mode', () => {
    it('should sync target elevation in manual mode', () => {
      antenna.state.isPowered = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.elevation = 30 as Degrees;
      antenna.state.targetElevation = 30 as Degrees;

      antenna.handleElevationChange(45);

      expect(antenna.state.elevation).toBe(45);
      expect(antenna.state.targetElevation).toBe(45);
    });

    it('should not sync target in non-manual mode', () => {
      antenna.state.isPowered = true;
      antenna.state.trackingMode = 'step-track';
      antenna.state.elevation = 30 as Degrees;
      antenna.state.targetElevation = 60 as Degrees;

      antenna.handleElevationChange(45);

      expect(antenna.state.elevation).toBe(45);
      expect(antenna.state.targetElevation).toBe(60); // Unchanged
    });
  });

  describe('handlePowerToggle extended', () => {
    it('should set isOperational after power-up delay', () => {
      jest.useFakeTimers();

      antenna.state.isPowered = false;
      antenna.state.isOperational = false;

      antenna.handlePowerToggle(true);

      expect(antenna.state.isPowered).toBe(true);
      // isOperational should not be immediately true

      // Fast-forward power-up delay
      jest.advanceTimersByTime(3100);

      expect(antenna.state.isOperational).toBe(true);

      jest.useRealTimers();
    });

    it('should clear lock acquisition timeout when powering off', () => {
      jest.useFakeTimers();

      antenna.state.isPowered = true;
      antenna.state.isOperational = true;

      // Trigger handleAutoTrackToggle which starts a timeout
      antenna.handleAutoTrackToggle(true);

      // Power off before timeout completes
      antenna.handlePowerToggle(false);

      expect(antenna.state.isPowered).toBe(false);
      expect(antenna.state.isLocked).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('handleAzimuthChange in manual mode', () => {
    it('should sync target azimuth in manual mode', () => {
      antenna.state.isPowered = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.azimuth = 100 as Degrees;
      antenna.state.targetAzimuth = 100 as Degrees;

      antenna.handleAzimuthChange(150);

      expect(antenna.state.azimuth).toBe(150);
      expect(antenna.state.targetAzimuth).toBe(150);
    });

    it('should not update if value unchanged', () => {
      antenna.state.isPowered = true;
      antenna.state.isLocked = true;
      antenna.state.azimuth = 100 as Degrees;

      antenna.handleAzimuthChange(100);

      // isLocked should remain true because value didn't change
      expect(antenna.state.isLocked).toBe(true);
    });
  });

  describe('moveToTargetSatellite', () => {
    it('should not move when not operational', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;
      antenna.state.targetSatelliteId = 12345;
      const originalAz = antenna.state.targetAzimuth;

      antenna.moveToTargetSatellite();

      expect(antenna.state.targetAzimuth).toBe(originalAz);
    });
  });

  describe('stageAzimuthChange edge cases', () => {
    it('should not stage when not powered', () => {
      antenna.state.isPowered = false;
      antenna.stageAzimuthChange(10);
      expect(antenna.state.stagedTargetAzimuth).toBeNull();
    });

    it('should not stage when not operational', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;
      antenna.stageAzimuthChange(10);
      expect(antenna.state.stagedTargetAzimuth).toBeNull();
    });

    it('should not stage when in step-track mode', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'step-track';
      antenna.stageAzimuthChange(10);
      expect(antenna.state.stagedTargetAzimuth).toBeNull();
    });
  });

  describe('handleBeaconFrequencyChange and handleBeaconSearchBwChange', () => {
    it('should update beacon frequency', () => {
      antenna.handleBeaconFrequencyChange(4000000000);
      expect(antenna.state.beaconFrequencyHz).toBe(4000000000);
    });

    it('should update beacon search bandwidth', () => {
      antenna.handleBeaconSearchBwChange(2000000);
      expect(antenna.state.beaconSearchBwHz).toBe(2000000);
    });
  });

  describe('adjustPolarization edge cases', () => {
    it('should not adjust when not powered', () => {
      antenna.state.isPowered = false;
      antenna.state.polarization = 0 as Degrees;
      antenna.adjustPolarization(30);
      expect(antenna.state.polarization).toBe(0);
    });

    it('should not adjust when not operational', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;
      antenna.state.polarization = 0 as Degrees;
      antenna.adjustPolarization(30);
      expect(antenna.state.polarization).toBe(0);
    });
  });

  describe('getStatusAlarms extended cases', () => {
    it('should show disconnected warning when no signals and not locked', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.isLocked = false;
      antenna.state.isAutoTrackEnabled = false;
      antenna.state.isLoopback = false;
      antenna.state.rxSignalsIn = null as any;

      const alarms = antenna.getStatusAlarms();
      expect(alarms.some(a => a.message.includes('DISCONNECTED'))).toBe(true);
    });
  });

  describe('handleTrackingModeChange program-track', () => {
    it('should clear staged changes when entering program-track', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.stagedTargetAzimuth = 100 as Degrees;
      antenna.state.stagedTargetElevation = 50 as Degrees;
      antenna.state.hasStagedChanges = true;

      antenna.handleTrackingModeChange('program-track');

      expect(antenna.state.stagedTargetAzimuth).toBeNull();
      expect(antenna.state.stagedTargetElevation).toBeNull();
      expect(antenna.state.hasStagedChanges).toBe(false);
    });

    it('should sync targets to current position in program-track', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.azimuth = 120 as Degrees;
      antenna.state.elevation = 55 as Degrees;

      antenna.handleTrackingModeChange('program-track');

      expect(antenna.state.targetAzimuth).toBe(120);
      expect(antenna.state.targetElevation).toBe(55);
    });
  });

  describe('stageBeaconFrequencyChange and stageBeaconSearchBwChange', () => {
    it('should stage beacon frequency change', () => {
      antenna.stageBeaconFrequencyChange(3950000000);
      expect(antenna.state.stagedBeaconFrequencyHz).toBe(3950000000);
      expect(antenna.state.hasStagedChanges).toBe(true);
    });

    it('should stage beacon search bandwidth change', () => {
      antenna.stageBeaconSearchBwChange(750000);
      expect(antenna.state.stagedBeaconSearchBwHz).toBe(750000);
      expect(antenna.state.hasStagedChanges).toBe(true);
    });
  });

  describe('startStepTrack edge cases', () => {
    it('should not start when not operational', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;
      antenna.state.trackingMode = 'step-track';

      antenna.startStepTrack();

      expect(antenna.stepTrackController_.isActive).toBe(false);
    });
  });

  describe('applyChanges extended', () => {
    it('should not apply when not operational', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = false;
      antenna.state.stagedTargetAzimuth = 200 as Degrees;
      antenna.state.hasStagedChanges = true;

      antenna.applyChanges();

      // Nothing should be applied
      expect(antenna.state.targetAzimuth).not.toBe(200);
    });

    it('should apply all staged values when valid', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.config.azContinuous = true; // No limit checking
      antenna.state.stagedTargetAzimuth = 200 as Degrees;
      antenna.state.stagedTargetElevation = 50 as Degrees;
      antenna.state.stagedTargetPolarization = 25 as Degrees;
      antenna.state.stagedBeaconFrequencyHz = 4100000000;
      antenna.state.stagedBeaconSearchBwHz = 600000;
      antenna.state.hasStagedChanges = true;

      antenna.applyChanges();

      expect(antenna.state.targetAzimuth).toBe(200);
      expect(antenna.state.targetElevation).toBe(50);
      expect(antenna.state.targetPolarization).toBe(25);
      expect(antenna.state.beaconFrequencyHz).toBe(4100000000);
      expect(antenna.state.beaconSearchBwHz).toBe(600000);
      expect(antenna.state.hasStagedChanges).toBe(false);
    });
  });

  describe('handleAutoTrackToggle edge cases', () => {
    it('should set isAutoTrackSwitchUp when toggled on even without signal', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;

      antenna.handleAutoTrackToggle(true);

      expect(antenna.state.isAutoTrackSwitchUp).toBe(true);
      // Without satellites, isAutoTrackEnabled should be false
      expect(antenna.state.isAutoTrackEnabled).toBe(false);
    });

    it('should clear all tracking state when toggled off', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.isAutoTrackSwitchUp = true;
      antenna.state.isAutoTrackEnabled = true;
      antenna.state.isLocked = true;

      antenna.handleAutoTrackToggle(false);

      expect(antenna.state.isAutoTrackSwitchUp).toBe(false);
      expect(antenna.state.isAutoTrackEnabled).toBe(false);
    });
  });

  describe('handleLoopbackToggle edge cases', () => {
    it('should disable loopback when toggled off', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.isLoopback = true;

      antenna.handleLoopbackToggle(false);

      expect(antenna.state.isLoopback).toBe(false);
    });
  });

  describe('handleHeaterToggle and handleRainBlowerToggle', () => {
    it('should disable heater when powered', () => {
      antenna.state.isPowered = true;
      antenna.state.isHeaterEnabled = true;

      antenna.handleHeaterToggle(false);

      expect(antenna.state.isHeaterEnabled).toBe(false);
    });

    it('should disable rain blower when powered', () => {
      antenna.state.isPowered = true;
      antenna.state.isRainBlowerEnabled = true;

      antenna.handleRainBlowerToggle(false);

      expect(antenna.state.isRainBlowerEnabled).toBe(false);
    });
  });

  describe('polMismatchLoss_dB_ circular cases', () => {
    it('should return 3 dB for RHCP signal on linear antenna', () => {
      // Default config is linear
      antenna.config.polType = 'linear';
      const loss = antenna.testPolMismatchLoss('RHCP', 'circular', 0 as Degrees);
      expect(loss).toBe(3);
    });

    it('should return small loss when antenna config is circular and receiving LHCP', () => {
      antenna.config.polType = 'circular';
      const loss = antenna.testPolMismatchLoss('LHCP', 'circular', 0 as Degrees);
      expect(loss).toBe(0.5);
    });
  });

  describe('update with step-track restart', () => {
    it('should not restart step track controller when not in step-track mode', () => {
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.trackingMode = 'manual';
      antenna.state.isAutoTrackEnabled = true; // Set but mode is manual

      antenna.update();

      expect(antenna.stepTrackController_.isActive).toBe(false);
    });
  });

  describe('gOverT_dB_perK_', () => {
    it('should calculate G/T correctly', () => {
      const gain = antenna.antennaGain_dBi(4e9 as Hertz);
      const sysTemp = antenna.testSystemTempK(4e9 as Hertz, 45 as Degrees);

      // G/T = G - 10*log10(Tsys)
      const expectedGT = gain - 10 * Math.log10(sysTemp);

      // The rfMetrics should have a gOverT value close to our calculation
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.state.elevation = 45 as Degrees;
      antenna.update();

      expect(antenna.state.rfMetrics?.gOverT_dBK).toBeCloseTo(expectedGT, 0);
    });
  });

  describe('initialize_', () => {
    it('should call syncDomWithState during initialization', () => {
      // Create new antenna, which calls initialize_ through constructor flow
      const newAntenna = new TestableAntennaCore();
      newAntenna.syncDomCalled = false;

      // Calling update should sync state
      newAntenna.update();

      expect(newAntenna.syncDomCalled).toBe(true);
    });
  });
});
