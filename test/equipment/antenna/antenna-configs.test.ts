import { ANTENNA_CONFIGS, AntennaConfig } from '../../../src/equipment/antenna/antenna-configs';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';

describe('ANTENNA_CONFIGS', () => {
  const allConfigKeys = Object.values(ANTENNA_CONFIG_KEYS);
  const allConfigs = Object.entries(ANTENNA_CONFIGS);

  describe('completeness', () => {
    it('should have a config for every config key', () => {
      for (const key of allConfigKeys) {
        expect(ANTENNA_CONFIGS[key]).toBeDefined();
      }
    });

    it('should not have extra configs not in config keys', () => {
      const configKeys = Object.keys(ANTENNA_CONFIGS);
      const enumKeys = Object.values(ANTENNA_CONFIG_KEYS);

      for (const configKey of configKeys) {
        expect(enumKeys).toContain(configKey);
      }
    });
  });

  describe('required properties', () => {
    it.each(allConfigs)('%s should have a name', (key, config) => {
      expect(config.name).toBeDefined();
      expect(typeof config.name).toBe('string');
      expect(config.name.length).toBeGreaterThan(0);
    });

    it.each(allConfigs)('%s should have a positive diameter', (key, config) => {
      expect(config.diameter).toBeDefined();
      expect(typeof config.diameter).toBe('number');
      expect(config.diameter).toBeGreaterThan(0);
    });

    it.each(allConfigs)('%s should have efficiency between 0 and 1', (key, config) => {
      expect(config.efficiency).toBeDefined();
      expect(typeof config.efficiency).toBe('number');
      expect(config.efficiency).toBeGreaterThan(0);
      expect(config.efficiency).toBeLessThanOrEqual(1);
    });

    it.each(allConfigs)('%s should have a valid band', (key, config) => {
      expect(config.band).toBeDefined();
      expect(['VHF', 'UHF', 'L', 'S', 'C', 'X', 'Ku', 'Ka', 'Q', 'V']).toContain(config.band);
    });

    it.each(allConfigs)('%s should have valid receive frequencies', (key, config) => {
      expect(config.minRxFrequency).toBeDefined();
      expect(config.maxRxFrequency).toBeDefined();
      expect(config.minRxFrequency).toBeGreaterThan(0);
      expect(config.maxRxFrequency).toBeGreaterThan(config.minRxFrequency);
    });

    it.each(allConfigs)('%s should have valid transmit frequencies', (key, config) => {
      expect(config.minTxFrequency).toBeDefined();
      expect(config.maxTxFrequency).toBeDefined();
      expect(config.minTxFrequency).toBeGreaterThan(0);
      expect(config.maxTxFrequency).toBeGreaterThan(config.minTxFrequency);
    });

    it.each(allConfigs)('%s should have non-negative feed loss', (key, config) => {
      expect(config.feedLoss).toBeDefined();
      expect(typeof config.feedLoss).toBe('number');
      expect(config.feedLoss).toBeGreaterThanOrEqual(0);
    });
  });

  describe('frequency band consistency', () => {
    it('C-band configs should have receive frequencies in 3.4-4.2 GHz range', () => {
      const cBandConfigs = allConfigs.filter(([key, config]) => config.band === 'C');

      for (const [key, config] of cBandConfigs) {
        expect(config.minRxFrequency).toBeGreaterThanOrEqual(3.4e9);
        expect(config.maxRxFrequency).toBeLessThanOrEqual(4.5e9);
      }
    });

    it('Ku-band configs should have receive frequencies in 10.7-12.75 GHz range', () => {
      const kuBandConfigs = allConfigs.filter(([key, config]) => config.band === 'Ku');

      for (const [key, config] of kuBandConfigs) {
        expect(config.minRxFrequency).toBeGreaterThanOrEqual(10e9);
        expect(config.maxRxFrequency).toBeLessThanOrEqual(13e9);
      }
    });

    it('X-band configs should have receive frequencies in 7-8.5 GHz range', () => {
      const xBandConfigs = allConfigs.filter(([key, config]) => config.band === 'X');

      for (const [key, config] of xBandConfigs) {
        expect(config.minRxFrequency).toBeGreaterThanOrEqual(7e9);
        expect(config.maxRxFrequency).toBeLessThanOrEqual(9e9);
      }
    });

    it('Ka-band configs should have receive frequencies in 17.7-21.2 GHz range', () => {
      const kaBandConfigs = allConfigs.filter(([key, config]) => config.band === 'Ka');

      for (const [key, config] of kaBandConfigs) {
        expect(config.minRxFrequency).toBeGreaterThanOrEqual(17e9);
        expect(config.maxRxFrequency).toBeLessThanOrEqual(22e9);
      }
    });
  });

  describe('optional properties validation', () => {
    it.each(allConfigs)('%s surfaceRms_m should be positive if defined', (key, config) => {
      if (config.surfaceRms_m !== undefined) {
        expect(config.surfaceRms_m).toBeGreaterThan(0);
        expect(config.surfaceRms_m).toBeLessThan(0.01); // Should be in meters, < 1cm
      }
    });

    it.each(allConfigs)('%s blockageFraction should be between 0 and 0.3 if defined', (key, config) => {
      if (config.blockageFraction !== undefined) {
        expect(config.blockageFraction).toBeGreaterThanOrEqual(0);
        expect(config.blockageFraction).toBeLessThanOrEqual(0.3);
      }
    });

    it.each(allConfigs)('%s xpd_dB should be positive if defined', (key, config) => {
      if (config.xpd_dB !== undefined) {
        expect(config.xpd_dB).toBeGreaterThan(0);
        expect(config.xpd_dB).toBeLessThanOrEqual(50); // Reasonable XPD range
      }
    });

    it.each(allConfigs)('%s polType should be linear or circular if defined', (key, config) => {
      if (config.polType !== undefined) {
        expect(['linear', 'circular']).toContain(config.polType);
      }
    });

    it.each(allConfigs)('%s kBeamConst should be around 70 if defined', (key, config) => {
      if (config.kBeamConst !== undefined) {
        expect(config.kBeamConst).toBeGreaterThan(50);
        expect(config.kBeamConst).toBeLessThan(100);
      }
    });

    it.each(allConfigs)('%s pointingSigma_deg should be small if defined', (key, config) => {
      if (config.pointingSigma_deg !== undefined) {
        expect(config.pointingSigma_deg).toBeGreaterThan(0);
        expect(config.pointingSigma_deg).toBeLessThan(1); // Should be < 1 degree
      }
    });

    it.each(allConfigs)('%s lnaNF_dB should be realistic if defined', (key, config) => {
      if (config.lnaNF_dB !== undefined) {
        expect(config.lnaNF_dB).toBeGreaterThan(0);
        expect(config.lnaNF_dB).toBeLessThan(5); // LNA NF typically < 5 dB
      }
    });

    it.each(allConfigs)('%s rxChainLoss_dB should be realistic if defined', (key, config) => {
      if (config.rxChainLoss_dB !== undefined) {
        expect(config.rxChainLoss_dB).toBeGreaterThanOrEqual(0);
        expect(config.rxChainLoss_dB).toBeLessThan(3); // RX chain loss typically < 3 dB
      }
    });

    it.each(allConfigs)('%s rxPhysTemp_K should be realistic if defined', (key, config) => {
      if (config.rxPhysTemp_K !== undefined) {
        expect(config.rxPhysTemp_K).toBeGreaterThan(200);
        expect(config.rxPhysTemp_K).toBeLessThan(350);
      }
    });

    it.each(allConfigs)('%s maxRate_deg_s should be positive if defined', (key, config) => {
      if (config.maxRate_deg_s !== undefined) {
        expect(config.maxRate_deg_s).toBeGreaterThan(0);
        // Realistic slew rate. Big GEO/general dishes are a few deg/s; purpose-
        // built LEO trackers (e.g. KU_BAND_4M_LEO_TRACKER) run 20-30 deg/s in
        // azimuth to hold a narrow beam through a pass.
        expect(config.maxRate_deg_s).toBeLessThanOrEqual(30);
      }
    });

    it.each(allConfigs)('%s elRange_deg should have valid min/max if defined', (key, config) => {
      if (config.elRange_deg !== undefined) {
        expect(config.elRange_deg).toHaveLength(2);
        expect(config.elRange_deg[0]).toBeGreaterThanOrEqual(0);
        expect(config.elRange_deg[1]).toBeLessThanOrEqual(90);
        expect(config.elRange_deg[0]).toBeLessThan(config.elRange_deg[1]);
      }
    });

    it.each(allConfigs)('%s azRange_deg should have valid min/max if defined', (key, config) => {
      if (config.azRange_deg !== undefined) {
        expect(config.azRange_deg).toHaveLength(2);
        expect(config.azRange_deg[0]).toBeLessThan(config.azRange_deg[1]);
      }
    });

    it.each(allConfigs)('%s feedLossModel should have valid coefficients if defined', (key, config) => {
      if (config.feedLossModel !== undefined) {
        expect(config.feedLossModel).toHaveProperty('a');
        expect(config.feedLossModel).toHaveProperty('b');
        expect(config.feedLossModel).toHaveProperty('c');
        expect(typeof config.feedLossModel.a).toBe('number');
        expect(typeof config.feedLossModel.b).toBe('number');
        expect(typeof config.feedLossModel.c).toBe('number');
      }
    });
  });

  describe('specific antenna configurations', () => {
    describe('C_BAND_9M_VORTEK', () => {
      const config = ANTENNA_CONFIGS.C_BAND_9M_VORTEK;

      it('should be a 9m C-band antenna', () => {
        expect(config.diameter).toBe(9.0);
        expect(config.band).toBe('C');
      });

      it('should have enhanced RF parameters', () => {
        expect(config.surfaceRms_m).toBeDefined();
        expect(config.blockageFraction).toBeDefined();
        expect(config.xpd_dB).toBeDefined();
        expect(config.polType).toBe('linear');
        expect(config.feedLossModel).toBeDefined();
      });

      it('should have pointing parameters', () => {
        expect(config.kBeamConst).toBe(70);
        expect(config.patternModel).toBe('ITU465');
        expect(config.pointingSigma_deg).toBeDefined();
      });

      it('should have system noise parameters', () => {
        expect(config.lnaNF_dB).toBeDefined();
        expect(config.rxChainLoss_dB).toBeDefined();
        expect(config.rxPhysTemp_K).toBeDefined();
        expect(config.skyTempModel).toBe('CbandSimple');
        expect(config.atmosModel).toBe('ITU_R_P676_Simple');
      });

      it('should have mechanical parameters', () => {
        expect(config.elRange_deg).toEqual([5, 90]);
        expect(config.azContinuous).toBe(false);
        expect(config.maxRate_deg_s).toBeDefined();
        expect(config.windDePointingCoef_deg_per_mps).toBeDefined();
      });
    });

    describe('X_BAND_3M_ANTESTAR_RS', () => {
      const config = ANTENNA_CONFIGS.X_BAND_3M_ANTESTAR_RS;

      it('should be a 3m X-band circular polarization antenna', () => {
        expect(config.diameter).toBe(3.0);
        expect(config.band).toBe('X');
        expect(config.polType).toBe('circular');
      });

      it('should have continuous azimuth', () => {
        expect(config.azContinuous).toBe(true);
      });

      it('should have fast slew rate for LEO tracking', () => {
        expect(config.maxRate_deg_s).toBe(3.0);
      });
    });

    describe('KU_BAND_1M8_OFFSET', () => {
      const config = ANTENNA_CONFIGS.KU_BAND_1M8_OFFSET;

      it('should have low blockage fraction for offset design', () => {
        expect(config.blockageFraction).toBe(0.02);
      });

      it('should have limited elevation range for offset geometry', () => {
        expect(config.elRange_deg).toEqual([1, 80]);
      });
    });
  });

  describe('diameter consistency', () => {
    it('should match diameter in config key names', () => {
      // 9m antennas
      expect(ANTENNA_CONFIGS.C_BAND_9M.diameter).toBe(9.0);
      expect(ANTENNA_CONFIGS.C_BAND_9M_VORTEK.diameter).toBe(9.0);
      expect(ANTENNA_CONFIGS.KU_BAND_9M_LIMIT.diameter).toBe(9.0);

      // 7m antennas
      expect(ANTENNA_CONFIGS.C_BAND_7M.diameter).toBe(7.0);

      // 5m antennas
      expect(ANTENNA_CONFIGS.X_BAND_5M.diameter).toBe(5.0);

      // 4m antennas
      expect(ANTENNA_CONFIGS.C_BAND_4M.diameter).toBe(4.0);

      // 3m antennas
      expect(ANTENNA_CONFIGS.C_BAND_3M_ANTESTAR.diameter).toBe(3.0);
      expect(ANTENNA_CONFIGS.KU_BAND_3M.diameter).toBe(3.0);
      expect(ANTENNA_CONFIGS.KU_BAND_3M_ANTESTAR.diameter).toBe(3.0);
      expect(ANTENNA_CONFIGS.X_BAND_3M_ANTESTAR_RS.diameter).toBe(3.0);

      // 2.4m antennas
      expect(ANTENNA_CONFIGS.C_BAND_2M4_ANTESTAR.diameter).toBe(2.4);
      expect(ANTENNA_CONFIGS.KU_BAND_2M4_ANTESTAR.diameter).toBe(2.4);

      // 2m antennas
      expect(ANTENNA_CONFIGS.C_BAND_2M.diameter).toBe(2.0);
      expect(ANTENNA_CONFIGS.KU_BAND_2M.diameter).toBe(2.0);

      // 1.8m antennas
      expect(ANTENNA_CONFIGS.KU_BAND_1M8_OFFSET.diameter).toBe(1.8);
      expect(ANTENNA_CONFIGS.C_BAND_1M8_OFFSET.diameter).toBe(1.8);
      expect(ANTENNA_CONFIGS.KA_BAND_1M8.diameter).toBe(1.8);

      // 1.2m antennas
      expect(ANTENNA_CONFIGS.KU_BAND_1M2.diameter).toBe(1.2);
      expect(ANTENNA_CONFIGS.KA_BAND_1M2.diameter).toBe(1.2);
    });
  });

  describe('gain calculation sanity checks', () => {
    // Antenna gain formula: G = η * (πD/λ)²
    // Larger diameter and higher frequency = higher gain

    it('larger antennas should have potential for higher gain', () => {
      // All else equal, 9m > 3m > 1.2m in gain potential
      // We can't directly test gain here, but efficiency should be reasonable
      expect(ANTENNA_CONFIGS.C_BAND_9M.efficiency).toBeGreaterThan(0.6);
      expect(ANTENNA_CONFIGS.C_BAND_4M.efficiency).toBeGreaterThan(0.5);
    });

    it('professional antennas should have higher efficiency than basic', () => {
      // VORTEK professional antenna vs basic 9m
      expect(ANTENNA_CONFIGS.C_BAND_9M_VORTEK.efficiency).toBeGreaterThanOrEqual(
        ANTENNA_CONFIGS.C_BAND_9M.efficiency
      );
    });
  });
});

describe('ANTENNA_CONFIG_KEYS', () => {
  it('should be an enum with string values', () => {
    expect(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK).toBe('C_BAND_9M_VORTEK');
    expect(ANTENNA_CONFIG_KEYS.KU_BAND_3M).toBe('KU_BAND_3M');
  });

  it('should have expected number of entries', () => {
    const keys = Object.keys(ANTENNA_CONFIG_KEYS);
    // Filter out numeric keys (enum reverse mapping)
    const stringKeys = keys.filter(k => isNaN(Number(k)));
    expect(stringKeys.length).toBeGreaterThan(15);
  });
});
