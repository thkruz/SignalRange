import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVIDENCE_FACT_IDS, EvidenceFactId } from '../../src/objectives/objective-types';

// Every subsystem a fact reads is a singleton with an isInitialized() guard;
// each mock starts "absent" and a test switches on what it needs.
const interference = { initialized: false, anyActive: false };
const faults = { has: false };
const crypto = { has: false, rx: { decryptionMode: 'ACTIVE', decryptionKeyStatus: 'Valid', decryptionAuthTagVerified: true } };
const gnss = { initialized: false, exposed: false };
const weather = { events: [] as { linkMarginDegradation: number }[] };
const security = {
  initialized: false,
  anomaly: false,
  log: [] as { id: string; category: string; isAnomaly?: boolean }[],
  acked: new Set<string>(),
  dropped: [] as { id: string }[],
};
const commanding = { initialized: false, windowOpen: false, jammed: false };

vi.mock('../../src/interference/interference-manager', () => ({
  InterferenceManager: {
    isInitialized: () => interference.initialized,
    // The fact reads the envelope (in progress), not the instantaneous radiating state.
    getInstance: () => ({ isAnyEventInEnvelope: () => interference.anyActive, isAnyEventActive: () => false }),
  },
}));
vi.mock('../../src/faults', () => ({
  FaultInjector: { getInstance: () => ({ hasFaults: () => faults.has }) },
}));
vi.mock('../../src/equipment/crypto', () => ({
  CryptoModule: { hasInstance: () => crypto.has, getInstance: () => ({ getRxState: () => crypto.rx }) },
}));
vi.mock('../../src/gnss-threat/gnss-threat-manager', () => ({
  GnssThreatManager: {
    isInitialized: () => gnss.initialized,
    getInstance: () => ({
      get isExposedToSpoof() {
        return gnss.exposed;
      },
    }),
  },
}));
vi.mock('../../src/weather/weather-manager', () => ({
  WeatherManager: { hasInstance: () => true, getInstance: () => ({ getActiveWeatherEvents: () => weather.events }) },
}));
vi.mock('../../src/security-console/security-console-core', () => ({
  SecurityConsoleCore: {
    isInitialized: () => security.initialized,
    getInstance: () => ({
      hasUnacknowledgedAnomaly: () => security.anomaly,
      getVisibleLog: () => security.log,
      isEventAcknowledged: (id: string) => security.acked.has(id),
      get droppedEvidence() {
        return security.dropped;
      },
    }),
  },
}));
vi.mock('../../src/commanding/commanding-manager', () => ({
  CommandingManager: {
    isInitialized: () => commanding.initialized,
    getInstance: () => ({ isWindowOpen: () => commanding.windowOpen, isUplinkJammed: () => commanding.jammed }),
  },
}));

const { EVIDENCE_FACTS, EvidenceFactRegistry, evaluateFactRule, WEATHER_DOMINANT_DB } = await import('../../src/objectives/evidence-facts');

const gpsdo = (overrides = {}) => ({ isPowered: true, gnssSignalPresent: true, satelliteCount: 6, isInHoldover: false, ...overrides });
const station = (gpsdoState = gpsdo()) => ({ state: { id: 'gs-1' }, rfFrontEnds: [{ gpsdoModule: { state: gpsdoState } }] }) as never;
const ctx = (gs: unknown = station()) => ({ gs }) as never;

beforeEach(() => {
  interference.initialized = false;
  interference.anyActive = false;
  faults.has = false;
  crypto.has = false;
  crypto.rx = { decryptionMode: 'ACTIVE', decryptionKeyStatus: 'Valid', decryptionAuthTagVerified: true };
  gnss.initialized = false;
  gnss.exposed = false;
  weather.events = [];
  security.initialized = false;
  security.anomaly = false;
  security.log = [];
  security.acked = new Set();
  commanding.initialized = false;
  commanding.windowOpen = false;
  commanding.jammed = false;
});

describe('evidence facts - resolvers', () => {
  it('reads "nothing wrong" when a subsystem is absent', () => {
    for (const id of EVIDENCE_FACT_IDS) {
      const expected = id === 'crypto-intact' || id === 'gnss-constellation-healthy' || id === 'evidence-chain-intact';
      expect(EVIDENCE_FACTS[id](ctx()), id).toBe(expected);
    }
  });

  it('interference-active follows the interference manager', () => {
    interference.initialized = true;
    interference.anyActive = true;
    expect(EVIDENCE_FACTS['interference-active'](ctx())).toBe(true);
    interference.anyActive = false;
    expect(EVIDENCE_FACTS['interference-active'](ctx())).toBe(false);
  });

  it('equipment-fault-active needs a station and a live fault', () => {
    faults.has = true;
    expect(EVIDENCE_FACTS['equipment-fault-active'](ctx())).toBe(true);
    expect(EVIDENCE_FACTS['equipment-fault-active'](ctx(null))).toBe(false);
  });

  it('crypto-intact checks the auth tag only while decryption is active', () => {
    crypto.has = true;
    expect(EVIDENCE_FACTS['crypto-intact'](ctx())).toBe(true);
    crypto.rx = { ...crypto.rx, decryptionAuthTagVerified: false };
    expect(EVIDENCE_FACTS['crypto-intact'](ctx())).toBe(false);
    crypto.rx = { decryptionMode: 'BYPASSED', decryptionKeyStatus: 'Valid', decryptionAuthTagVerified: false };
    expect(EVIDENCE_FACTS['crypto-intact'](ctx())).toBe(true);
    crypto.rx = { decryptionMode: 'BYPASSED', decryptionKeyStatus: 'Mismatch', decryptionAuthTagVerified: false };
    expect(EVIDENCE_FACTS['crypto-intact'](ctx())).toBe(false);
  });

  it('gnss-constellation-healthy and reference-in-holdover read the GPSDO', () => {
    expect(EVIDENCE_FACTS['gnss-constellation-healthy'](ctx(station(gpsdo({ satelliteCount: 3 }))))).toBe(false);
    expect(EVIDENCE_FACTS['reference-in-holdover'](ctx(station(gpsdo({ isInHoldover: true }))))).toBe(true);
    expect(EVIDENCE_FACTS['reference-in-holdover'](ctx(station(gpsdo({ isInHoldover: true, isPowered: false }))))).toBe(false);
  });

  it('timing-drifting is the spoof tell: spoof active while still trusting GNSS', () => {
    gnss.initialized = true;
    gnss.exposed = true;
    expect(EVIDENCE_FACTS['timing-drifting'](ctx())).toBe(true);
    gnss.exposed = false;
    expect(EVIDENCE_FACTS['timing-drifting'](ctx())).toBe(false);
  });

  it('weather-attenuation-dominant yields to interference and faults', () => {
    weather.events = [{ linkMarginDegradation: WEATHER_DOMINANT_DB }];
    expect(EVIDENCE_FACTS['weather-attenuation-dominant'](ctx())).toBe(true);
    weather.events = [{ linkMarginDegradation: WEATHER_DOMINANT_DB - 1 }];
    expect(EVIDENCE_FACTS['weather-attenuation-dominant'](ctx())).toBe(false);
    weather.events = [{ linkMarginDegradation: 10 }];
    faults.has = true;
    expect(EVIDENCE_FACTS['weather-attenuation-dominant'](ctx())).toBe(false);
  });

  it('audit-anomaly-present and config-drifted read the security console', () => {
    security.initialized = true;
    security.anomaly = true;
    expect(EVIDENCE_FACTS['audit-anomaly-present'](ctx())).toBe(true);
    security.log = [{ id: 'cfg-1', category: 'config', isAnomaly: true }];
    expect(EVIDENCE_FACTS['config-drifted'](ctx())).toBe(true);
    security.acked.add('cfg-1');
    expect(EVIDENCE_FACTS['config-drifted'](ctx())).toBe(false);
  });

  it('evidence-chain-intact is true without a security console and false once a carried-forward entry was dropped', () => {
    security.initialized = false;
    expect(EVIDENCE_FACTS['evidence-chain-intact'](ctx())).toBe(true);
    security.initialized = true;
    expect(EVIDENCE_FACTS['evidence-chain-intact'](ctx())).toBe(true);
    security.dropped = [{ id: 'evt-kg-replay-log' }];
    expect(EVIDENCE_FACTS['evidence-chain-intact'](ctx())).toBe(false);
    security.dropped = [];
  });

  it('command-window-open and uplink-jammed read the commanding manager', () => {
    commanding.initialized = true;
    commanding.windowOpen = true;
    expect(EVIDENCE_FACTS['command-window-open'](ctx())).toBe(true);
    expect(EVIDENCE_FACTS['uplink-jammed'](ctx())).toBe(false);
    commanding.jammed = true;
    expect(EVIDENCE_FACTS['uplink-jammed'](ctx())).toBe(true);
  });
});

describe('evaluateFactRule', () => {
  const read = (id: EvidenceFactId): boolean => id === 'interference-active' || id === 'crypto-intact';

  it('evaluates leaves, all and any', () => {
    expect(evaluateFactRule({ fact: 'interference-active', is: true }, read)).toBe(true);
    expect(evaluateFactRule({ fact: 'interference-active', is: false }, read)).toBe(false);
    expect(
      evaluateFactRule(
        {
          all: [
            { fact: 'interference-active', is: true },
            { fact: 'crypto-intact', is: true },
          ],
        },
        read
      )
    ).toBe(true);
    expect(
      evaluateFactRule(
        {
          all: [
            { fact: 'interference-active', is: true },
            { fact: 'timing-drifting', is: true },
          ],
        },
        read
      )
    ).toBe(false);
    expect(
      evaluateFactRule(
        {
          any: [
            { fact: 'timing-drifting', is: true },
            { fact: 'crypto-intact', is: true },
          ],
        },
        read
      )
    ).toBe(true);
  });
});

describe('EvidenceFactRegistry - holds', () => {
  let raw: Record<EvidenceFactId, boolean>;
  const resolvers = Object.fromEntries(EVIDENCE_FACT_IDS.map((id) => [id, () => raw[id]])) as Record<EvidenceFactId, () => boolean>;

  beforeEach(() => {
    raw = Object.fromEntries(EVIDENCE_FACT_IDS.map((id) => [id, false])) as Record<EvidenceFactId, boolean>;
  });

  it('adopts the raw value on the first tick without a hold', () => {
    raw['interference-active'] = true;
    const registry = new EvidenceFactRegistry(0.5, resolvers);
    registry.tick(0.016, ctx());
    expect(registry.read('interference-active')).toBe(true);
  });

  it('reads false before any tick', () => {
    expect(new EvidenceFactRegistry(0.5, resolvers).read('interference-active')).toBe(false);
  });

  it('ignores a transient frame shorter than the hold', () => {
    const registry = new EvidenceFactRegistry(0.5, resolvers);
    registry.tick(0.1, ctx());
    raw['interference-active'] = true;
    registry.tick(0.2, ctx());
    expect(registry.read('interference-active')).toBe(false);
    raw['interference-active'] = false;
    registry.tick(0.1, ctx());
    raw['interference-active'] = true;
    registry.tick(0.2, ctx());
    // the false frame reset the pending hold, so 0.2 s is not enough
    expect(registry.read('interference-active')).toBe(false);
  });

  it('flips once the raw value has held for the hold period', () => {
    const registry = new EvidenceFactRegistry(0.5, resolvers);
    registry.tick(0.1, ctx());
    raw['interference-active'] = true;
    registry.tick(0.3, ctx());
    registry.tick(0.3, ctx());
    expect(registry.read('interference-active')).toBe(true);
    raw['interference-active'] = false;
    registry.tick(0.6, ctx());
    expect(registry.read('interference-active')).toBe(false);
  });

  it('evaluates rules against held values and snapshots them', () => {
    const registry = new EvidenceFactRegistry(0, resolvers);
    raw['crypto-intact'] = true;
    registry.tick(0.1, ctx());
    expect(
      registry.evaluate({
        all: [
          { fact: 'crypto-intact', is: true },
          { fact: 'interference-active', is: false },
        ],
      })
    ).toBe(true);
    expect(registry.snapshot()['crypto-intact']).toBe(true);
    registry.reset();
    expect(registry.read('crypto-intact')).toBe(false);
  });
});
