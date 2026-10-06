/**
 * Modem reference cases (phase 19.1, rewritten for 19.5): DVB-S2 demodulation
 * thresholds, the uncoded and coded error curves, the IQ scatter and the ADC.
 *
 * Thresholds: ETSI EN 302 307-1 V1.2.1 (2009-08) Table 13, ideal Es/N0 for
 * quasi-error-free operation (PER 1e-7, 64 800-bit FECFRAME, AWGN), plus the
 * 1.0 dB implementation loss the phase 19 plan adopts (Q4).
 *
 * BER: Pb = Q(sqrt(2 Eb/N0)) = 0.5 erfc(sqrt(Eb/N0)) for coherent BPSK (and
 * per bit for Gray-coded QPSK). The Eb/N0 values below are the standard
 * textbook points (e.g. Sklar, Digital Communications, 2nd ed., Fig. 4.25);
 * Gray 16QAM needs about 13.4 dB Eb/N0 for 1e-5 (Proakis, Digital
 * Communications, 5th ed., Fig. 4.3-8).
 *
 * ADC: an ideal N-bit quantizer's SNR for a full-scale sine is 6.02 N + 1.76 dB
 * over the Nyquist band (Kester, "Taking the Mystery out of the Infamous
 * Formula", ADI MT-001). Clipping: a hard-clipped Gaussian's output is
 * a x + d with a the Bussgang gain and d uncorrelated distortion; the test
 * integrates that numerically.
 */

import { calculateADCDegradation, clippingSdrLinear, quantizationSnrLinear } from '../../src/equipment/receiver/adc-degradation';
import { FECSimulator } from '../../src/equipment/receiver/fec-simulator';
import { CODED_PER_CURVE, codedPer, DVB_S2_TABLE_13, IMPLEMENTATION_LOSS_DB, modcodFor, symbolRateHz, uncodedBer } from '../../src/equipment/receiver/modcod';
import { Receiver } from '../../src/equipment/receiver/receiver';
import { IQConstellationAdapter } from '../../src/pages/mission-control/tabs/iq-constellation-adapter';
import { expectWithinAbs, expectWithinRel, referenceCase } from './reference-helpers';

/** EN 302 307-1 Table 13, ideal Es/N0 (dB) at QEF: the published values, typed in independently of the engine */
const TABLE_13: Record<string, number> = {
  'QPSK 1/2': 1.0,
  'QPSK 2/3': 3.1,
  'QPSK 3/4': 4.03,
  'QPSK 5/6': 5.18,
  'QPSK 8/9': 6.2,
  '8PSK 2/3': 6.62,
  '8PSK 3/4': 7.91,
  '8PSK 5/6': 9.35,
  '16APSK 2/3': 8.97,
  '16APSK 3/4': 10.21,
  '16APSK 5/6': 11.61,
};

/** Engine label -> DVB-S2 family */
const FAMILY: Record<string, string> = { QPSK: 'QPSK', '8QAM': '8PSK', '16QAM': '16APSK' };

describe('DVB-S2 QEF thresholds (EN 302 307 Table 13)', () => {
  referenceCase('the engine table reproduces Table 13 for every MODCOD the labels reach', undefined, () => {
    for (const [name, esN0] of Object.entries(TABLE_13)) {
      const [family, rate] = name.split(' ');
      expect(DVB_S2_TABLE_13[family as keyof typeof DVB_S2_TABLE_13][rate], name).toBe(esN0);
    }
  });

  for (const modulation of ['QPSK', '8QAM', '16QAM']) {
    for (const fec of ['2/3', '3/4', '5/6']) {
      const name = `${FAMILY[modulation]} ${fec}`;
      referenceCase(`${modulation} ${fec} locks at Table 13 ${name} (${TABLE_13[name]} dB) + 1.0 dB implementation loss`, undefined, () => {
        const modcod = modcodFor(modulation, fec);
        expect(modcod?.source).toBe('table');
        expectWithinAbs(modcod?.thresholdEsN0Db ?? Number.NaN, TABLE_13[name] + IMPLEMENTATION_LOSS_DB, 0.005);
      });
    }
  }

  referenceCase('QPSK 3/4 needs Es/N0 4.03 dB + 1.0 dB; as C/N in its 36 MHz channel (Rs = 30 Msps) 4.24 dB', undefined, () => {
    expectWithinAbs(modcodFor('QPSK', '3/4')?.thresholdEsN0Db ?? Number.NaN, 5.03, 0.005);
    expectWithinAbs(symbolRateHz(36e6), 30e6, 1);
    expectWithinAbs(Receiver.requiredCnDb('QPSK', '3/4'), 5.03 - 10 * Math.log10(36 / 30), 0.005);
  });

  referenceCase('the threshold depends on code rate: QPSK 1/2 to 5/6 spans 4.18 dB', undefined, () => {
    const span = (modcodFor('QPSK', '5/6')?.thresholdEsN0Db ?? 0) - (modcodFor('QPSK', '1/2')?.thresholdEsN0Db ?? 0);
    expectWithinAbs(span, TABLE_13['QPSK 5/6'] - TABLE_13['QPSK 1/2'], 0.005);
  });

  referenceCase('QPSK 7/8 (not in DVB-S2) is interpolated between 5/6 and 8/9 by code rate', undefined, () => {
    const modcod = modcodFor('QPSK', '7/8');
    expect(modcod?.source).toBe('interpolated');
    const ideal = modcod?.idealEsN0Db ?? Number.NaN;
    expect(ideal).toBeGreaterThan(TABLE_13['QPSK 5/6']);
    expect(ideal).toBeLessThan(TABLE_13['QPSK 8/9']);
  });

  referenceCase('BPSK needs 3.01 dB less Es/N0 than QPSK at the same code rate (same Eb/N0)', undefined, () => {
    const bpsk = modcodFor('BPSK', '1/2')?.thresholdEsN0Db ?? Number.NaN;
    const qpsk = modcodFor('QPSK', '1/2')?.thresholdEsN0Db ?? Number.NaN;
    expectWithinAbs(qpsk - bpsk, 10 * Math.log10(2), 0.005);
  });

  referenceCase('unmodulated carriers (CW, null) have no MODCOD and never lock', undefined, () => {
    expect(modcodFor('CW', 'null')).toBeNull();
    expect(modcodFor('null', 'null')).toBeNull();
  });
});

describe('uncoded bit-error rate', () => {
  // Eb/N0 (dB) for a given Pb on the coherent BPSK curve
  const POINTS = [
    { pb: 1e-3, ebN0Db: 6.79 },
    { pb: 1e-5, ebN0Db: 9.59 },
    { pb: 1e-6, ebN0Db: 10.53 },
    { pb: 1e-7, ebN0Db: 11.3 },
  ];

  for (const { pb, ebN0Db } of POINTS) {
    referenceCase(`BPSK: Pb ${pb} at Eb/N0 ${ebN0Db} dB (within 10 %)`, undefined, () => {
      expectWithinRel(uncodedBer(ebN0Db, 'BPSK'), pb, 0.1);
    });

    // QPSK: Es/N0 = Eb/N0 + 3.01 dB, same per-bit curve
    referenceCase(`QPSK: Pb ${pb} at Es/N0 ${(ebN0Db + 3.01).toFixed(2)} dB (within 10 %)`, undefined, () => {
      expectWithinRel(uncodedBer(ebN0Db + 3.01, 'QPSK'), pb, 0.1);
    });
  }

  referenceCase('16QAM (Gray): Pb 1e-5 at Eb/N0 13.4 dB (Es/N0 19.42 dB, within 20 %)', undefined, () => {
    expectWithinRel(uncodedBer(13.4 + 10 * Math.log10(4), '16QAM'), 1e-5, 0.2);
  });
});

describe('coded packet-error curve (DVB-S2 waterfall)', () => {
  const qpsk34 = modcodFor('QPSK', '3/4');
  if (!qpsk34) throw new Error('QPSK 3/4 MODCOD missing');

  referenceCase('PER is 1e-7 (QEF) at the practical threshold', undefined, () => {
    expectWithinRel(codedPer(qpsk34.thresholdEsN0Db, qpsk34), 1e-7, 0.01);
  });

  referenceCase('the waterfall is steep: PER 1e-1 within 0.6 dB below QEF, every frame lost 1.2 dB below', undefined, () => {
    expectWithinRel(codedPer(qpsk34.thresholdEsN0Db - 0.6, qpsk34), 0.1, 0.01);
    expect(codedPer(qpsk34.thresholdEsN0Db - 1.2, qpsk34)).toBe(1);
  });

  referenceCase('PER falls monotonically with Es/N0 across the curve', undefined, () => {
    let last = 2;
    for (let m = CODED_PER_CURVE[0].marginDb - 0.5; m <= 4; m += 0.05) {
      const per = codedPer(qpsk34.thresholdEsN0Db + m, qpsk34);
      expect(per).toBeLessThanOrEqual(last);
      last = per;
    }
  });

  referenceCase('the FEC decoder reports frame sync, PER and decoded BER from the curve', undefined, () => {
    const fec = new FECSimulator();
    const atThreshold = fec.calculate({
      cnRatio_dB: 0,
      effectiveEsN0_dB: qpsk34.thresholdEsN0Db,
      symbolRate_Hz: 30e6,
      hasCarrier: true,
      hasLock: true,
      modulation: 'QPSK',
      fec: '3/4',
    });
    expect(atThreshold.frameSyncLocked).toBe(true);
    expectWithinRel(atThreshold.per, 1e-7, 0.01);
    // A failed frame carries the channel's raw errors: BER = PER x pre-FEC BER
    expectWithinRel(atThreshold.ber, 1e-7 * uncodedBer(qpsk34.thresholdEsN0Db, 'QPSK'), 0.01);
    // 30 Msps QPSK 3/4 carries 45 Mbit/s of information
    expect(atThreshold.dataRate).toBe('45.000 Mbps');
  });
});

describe('IQ constellation scatter', () => {
  referenceCase('per-axis sigma = 1 / sqrt(2 Es/N0) for unit symbol energy (10 dB: 0.224, 0 dB: 0.707)', undefined, () => {
    expectWithinAbs(IQConstellationAdapter.noiseSpreadForEsN0(10), 1 / Math.sqrt(20), 1e-9);
    expectWithinAbs(IQConstellationAdapter.noiseSpreadForEsN0(0), 1 / Math.SQRT2, 1e-9);
  });
});

describe('ADC quantization and clipping', () => {
  referenceCase('quantization SNR of a full-scale sine over the Nyquist band = 6.02 N + 1.76 dB (8 bits: 49.92 dB)', undefined, () => {
    const config = { targetLevel_dBFS: -8, clipThreshold_dBFS: -2, quantizationThreshold_dBFS: -20, fullScale_dBm: -22, enob: 8, sampleRate_Hz: 200e6 } as const;
    expectWithinAbs(10 * Math.log10(quantizationSnrLinear(0, 100e6, config as never)), 6.02 * 8 + 1.76, 1e-9);
    // A carrier occupying a tenth of the Nyquist band sees a tenth of the noise
    expectWithinAbs(10 * Math.log10(quantizationSnrLinear(0, 10e6, config as never)), 6.02 * 8 + 1.76 + 10, 1e-9);
  });

  referenceCase('clipping distortion of a Gaussian composite matches a numerical Bussgang integral', undefined, () => {
    for (const level of [-6, -3, 0, 3]) {
      // A = full-scale amplitude; sigma^2 = 10^(L/10) A^2 / 2
      const a = 1;
      const sigma = Math.sqrt((10 ** (level / 10) * a * a) / 2);
      let exy = 0;
      let ey2 = 0;
      const dx = sigma / 400;
      for (let x = -10 * sigma; x <= 10 * sigma; x += dx) {
        const pdf = Math.exp((-x * x) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
        const y = Math.max(-a, Math.min(a, x));
        exy += x * y * pdf * dx;
        ey2 += y * y * pdf * dx;
      }
      const gain = exy / (sigma * sigma);
      const sdr = (gain * gain * sigma * sigma) / (ey2 - gain * gain * sigma * sigma);
      expectWithinRel(clippingSdrLinear(level), sdr, 0.01);
    }
  });

  referenceCase('at the AGC target (-8 dBFS) the ADC costs a 15 dB carrier under 0.1 dB; 30 dB under-driven it costs dB', undefined, () => {
    const atTarget = calculateADCDegradation(-30 as never, { power_dBm: -30, esN0_dB: 15, symbolRate_Hz: 30e6 });
    expect(atTarget.totalPenalty_dB).toBeLessThan(0.1);
    expect(atTarget.status).toBe('optimal');
    const underDriven = calculateADCDegradation(-60 as never, { power_dBm: -60, esN0_dB: 15, symbolRate_Hz: 30e6 });
    expect(underDriven.quantizationPenalty_dB).toBeGreaterThan(1);
    const overDriven = calculateADCDegradation(-19 as never, { power_dBm: -19, esN0_dB: 15, symbolRate_Hz: 30e6 });
    expect(overDriven.clipPenalty_dB).toBeGreaterThan(1);
  });
});
