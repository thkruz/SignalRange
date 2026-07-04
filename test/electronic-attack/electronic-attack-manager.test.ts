import { ElectronicAttackManager, type ElectronicAttackConfig, type JamAntennaState, type JamOutput } from '../../src/electronic-attack/electronic-attack-manager';

/**
 * Unit coverage for the pure J/S / pointing / in-band assessment that drives
 * the jamming-uplink-active and jamming-effective objective conditions.
 */
describe('ElectronicAttackManager.assess', () => {
  const config: ElectronicAttackConfig = {
    groundStationId: 'SS-01',
    targetNoradId: 90042,
    jamAntennaIndex: 0,
    victimCarrierPowerDbm: 6,
    targetUplinkLowHz: 8100e6,
    targetUplinkHighHz: 8150e6,
    targetPolarization: 'H',
    jamPathGainDb: -20,
    pointingToleranceDeg: 5,
    effectiveJtoSDb: 6,
  };

  const onTarget: JamAntennaState = { isPowered: true, azimuthDeg: 175, elevationDeg: 30 };
  const target = { azimuthDeg: 175, elevationDeg: 30 };
  const inBandJam: JamOutput = { frequency: 8125e6, bandwidth: 5e6, power: 50 };

  it('reports no jam when there are no outputs', () => {
    const a = ElectronicAttackManager.assess([], onTarget, target, config);

    expect(a.isRadiatingInBand).toBe(false);
    expect(a.jamPowerDbm).toBeNull();
    expect(a.jToSDb).toBeNull();
    expect(a.isEffective).toBe(false);
  });

  it('computes J/S and denies the link when on target with sufficient power', () => {
    const a = ElectronicAttackManager.assess([inBandJam], onTarget, target, config);

    expect(a.isRadiatingInBand).toBe(true);
    expect(a.isOnTarget).toBe(true);
    // jamPowerDbm = 50 + (-20) = 30; J/S = 30 - 6 = 24
    expect(a.jamPowerDbm).toBe(30);
    expect(a.jToSDb).toBe(24);
    expect(a.isEffective).toBe(true);
  });

  it('is radiating but not effective when the antenna is off target', () => {
    const offTarget: JamAntennaState = { isPowered: true, azimuthDeg: 175, elevationDeg: 10 };
    const a = ElectronicAttackManager.assess([inBandJam], offTarget, target, config);

    expect(a.isRadiatingInBand).toBe(true);
    expect(a.isOnTarget).toBe(false);
    expect(a.jToSDb).toBe(24); // still computed
    expect(a.isEffective).toBe(false); // gated by pointing
  });

  it('does not radiate when the jam is out of the target uplink band', () => {
    const outOfBand: JamOutput = { frequency: 8200e6, bandwidth: 5e6, power: 50 };
    const a = ElectronicAttackManager.assess([outOfBand], onTarget, target, config);

    expect(a.isRadiatingInBand).toBe(false);
    expect(a.isEffective).toBe(false);
  });

  it('ignores jam output below the radiating floor', () => {
    const weak: JamOutput = { frequency: 8125e6, bandwidth: 5e6, power: -60 };
    const a = ElectronicAttackManager.assess([weak], onTarget, target, config);

    expect(a.isRadiatingInBand).toBe(false);
  });

  it('is on target but not effective when J/S is below threshold', () => {
    const lowPower: JamOutput = { frequency: 8125e6, bandwidth: 5e6, power: 25 };
    const a = ElectronicAttackManager.assess([lowPower], onTarget, target, config);

    // jamPowerDbm = 25 - 20 = 5; J/S = 5 - 6 = -1 < 6
    expect(a.isRadiatingInBand).toBe(true);
    expect(a.isOnTarget).toBe(true);
    expect(a.jToSDb).toBe(-1);
    expect(a.isEffective).toBe(false);
  });

  it('handles azimuth wrap-around when checking pointing', () => {
    const nearNorth: JamAntennaState = { isPowered: true, azimuthDeg: 358, elevationDeg: 30 };
    const targetNorth = { azimuthDeg: 1, elevationDeg: 30 };
    const a = ElectronicAttackManager.assess([{ frequency: 8125e6, bandwidth: 5e6, power: 50 }], nearNorth, targetNorth, config);

    // 358 vs 1 deg is a 3 deg separation, inside the 5 deg tolerance
    expect(a.pointingErrorDeg).toBeCloseTo(3, 5);
    expect(a.isOnTarget).toBe(true);
  });

  it('picks the strongest in-band jam when several are present', () => {
    const jams: JamOutput[] = [
      { frequency: 8110e6, bandwidth: 2e6, power: 20 },
      { frequency: 8125e6, bandwidth: 5e6, power: 45 },
      { frequency: 8140e6, bandwidth: 2e6, power: 10 },
    ];
    const a = ElectronicAttackManager.assess(jams, onTarget, target, config);

    // strongest is 45 dBm -> jamPowerDbm = 25, J/S = 19
    expect(a.jamPowerDbm).toBe(25);
    expect(a.jToSDb).toBe(19);
    expect(a.activeJam?.frequency).toBe(8125e6);
  });

  it('is not on target when the jam antenna is unpowered', () => {
    const unpowered: JamAntennaState = { isPowered: false, azimuthDeg: 175, elevationDeg: 30 };
    const a = ElectronicAttackManager.assess([inBandJam], unpowered, target, config);

    expect(a.isOnTarget).toBe(false);
    expect(a.isEffective).toBe(false);
  });
});
