import { createRfFrontEnd, DeepPartial, RfFrontEndConfig } from '../../src/campaigns/rf-front-end-factory';
import type { MHz, dB } from '../../src/types';

describe('rf-front-end-factory', () => {
  describe('createRfFrontEnd', () => {
    const createBaseConfig = (): Partial<RfFrontEndConfig> => ({
      omt: {
        polarization: 'V',
        isMotorized: true,
      },
      buc: {
        isPowered: false,
        loFrequency: 7000 as MHz,
        gain: 30 as dB,
      },
      hpa: {
        isHpaSwitchEnabled: false,
        isHpaEnabled: false,
        outputPower: 100,
      },
      lnb: {
        isPowered: false,
        loFrequency: 5250 as MHz,
        gain: 50 as dB,
      },
      filter: {
        bandwidthIndex: 0,
        centerFrequency: 1200 as MHz,
      },
    });

    describe('without overrides', () => {
      it('should return base config unchanged', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base);

        expect(result).toEqual(base);
      });

      it('should create a new object (not mutate base)', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base);

        expect(result).not.toBe(base);
      });
    });

    describe('with shallow overrides', () => {
      it('should override entire nested object when replaced', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base, {
          buc: {
            isPowered: true,
            loFrequency: 7100 as MHz,
            gain: 35 as dB,
          },
        });

        expect(result.buc).toEqual({
          isPowered: true,
          loFrequency: 7100,
          gain: 35,
        });
      });
    });

    describe('with deep partial overrides', () => {
      it('should merge nested object properties', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base, {
          buc: { isPowered: true },
        });

        expect(result.buc).toEqual({
          isPowered: true,
          loFrequency: 7000,
          gain: 30,
        });
      });

      it('should merge multiple nested properties', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base, {
          hpa: { isHpaSwitchEnabled: true, isHpaEnabled: true },
          lnb: { isPowered: true },
        });

        expect(result.hpa).toEqual({
          isHpaSwitchEnabled: true,
          isHpaEnabled: true,
          outputPower: 100,
        });
        expect(result.lnb).toEqual({
          isPowered: true,
          loFrequency: 5250,
          gain: 50,
        });
      });

      it('should preserve unmentioned properties', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base, {
          buc: { isPowered: true },
        });

        expect(result.omt).toEqual(base.omt);
        expect(result.hpa).toEqual(base.hpa);
        expect(result.lnb).toEqual(base.lnb);
        expect(result.filter).toEqual(base.filter);
      });
    });

    describe('with array values', () => {
      it('should replace arrays entirely (not merge)', () => {
        const base = {
          someArray: [1, 2, 3],
          nested: {
            items: ['a', 'b', 'c'],
          },
        };
        const result = createRfFrontEnd(base as any, {
          someArray: [4, 5],
          nested: {
            items: ['x'],
          },
        } as any);

        expect(result.someArray).toEqual([4, 5]);
        expect((result.nested as any).items).toEqual(['x']);
      });
    });

    describe('with null values', () => {
      it('should replace with null values', () => {
        const base = {
          omt: { polarization: 'V' },
          buc: { isPowered: true },
        };
        const result = createRfFrontEnd(base as any, {
          buc: null,
        } as any);

        expect(result.buc).toBeNull();
      });
    });

    describe('with undefined values', () => {
      it('should ignore undefined values in overrides', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base, {
          buc: { isPowered: undefined },
        } as DeepPartial<RfFrontEndConfig>);

        // isPowered should remain unchanged since override was undefined
        expect(result.buc!.isPowered).toBe(false);
      });
    });

    describe('primitive value overrides', () => {
      it('should override primitive values directly', () => {
        const base = {
          topLevelValue: 42,
          nested: {
            value: 100,
          },
        };
        const result = createRfFrontEnd(base as any, {
          topLevelValue: 99,
          nested: {
            value: 200,
          },
        } as any);

        expect(result.topLevelValue).toBe(99);
        expect((result.nested as any).value).toBe(200);
      });
    });

    describe('real-world scenarios', () => {
      it('should enable HPA for transmission scenario', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base, {
          hpa: { isHpaSwitchEnabled: true, isHpaEnabled: true },
        });

        expect(result.hpa!.isHpaSwitchEnabled).toBe(true);
        expect(result.hpa!.isHpaEnabled).toBe(true);
        expect(result.hpa!.outputPower).toBe(100); // Preserved from base
      });

      it('should configure cold-start LNB scenario', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base, {
          lnb: { isPowered: false, loFrequency: 0 as MHz, gain: 0 as dB },
          filter: { bandwidthIndex: 0 },
        });

        expect(result.lnb).toEqual({
          isPowered: false,
          loFrequency: 0,
          gain: 0,
        });
        expect(result.filter!.bandwidthIndex).toBe(0);
      });

      it('should configure BUC LO frequency for satellite', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base, {
          buc: { loFrequency: 7043 as MHz },
        });

        expect(result.buc!.loFrequency).toBe(7043);
        expect(result.buc!.isPowered).toBe(false); // Preserved from base
        expect(result.buc!.gain).toBe(30); // Preserved from base
      });
    });

    describe('edge cases', () => {
      it('should handle empty base config', () => {
        const base = {};
        const result = createRfFrontEnd(base, {
          buc: { isPowered: true },
        });

        expect(result.buc).toEqual({ isPowered: true });
      });

      it('should handle empty overrides', () => {
        const base = createBaseConfig();
        const result = createRfFrontEnd(base, {});

        expect(result).toEqual(base);
      });

      it('should handle deeply nested objects', () => {
        const base = {
          level1: {
            level2: {
              level3: {
                value: 'original',
              },
            },
          },
        };
        const result = createRfFrontEnd(base as any, {
          level1: {
            level2: {
              level3: {
                value: 'modified',
              },
            },
          },
        } as any);

        expect((result.level1 as any).level2.level3.value).toBe('modified');
      });

      it('should handle adding new properties', () => {
        const base = {
          existing: { value: 1 },
        };
        const result = createRfFrontEnd(base as any, {
          existing: { value: 1, newProp: 'added' },
          newTopLevel: { data: 'new' },
        } as any);

        expect((result.existing as any).newProp).toBe('added');
        expect((result as any).newTopLevel).toEqual({ data: 'new' });
      });
    });
  });
});
