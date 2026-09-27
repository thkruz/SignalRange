/**
 * Modem reference cases (phase 19.1): DVB-S2 demodulation thresholds and the
 * uncoded bit-error curve.
 *
 * Thresholds: ETSI EN 302 307 V1.2.1 (2009-08) Table 13, ideal Es/N0 for
 * quasi-error-free operation (PER 1e-7, 64 800-bit FECFRAME, AWGN), plus the
 * 1.0 dB implementation loss the phase 19 plan adopts (Q4).
 *
 * BER: Pb = Q(sqrt(2 Eb/N0)) = 0.5 erfc(sqrt(Eb/N0)) for coherent BPSK (and
 * per bit for Gray-coded QPSK). The Eb/N0 values below are the standard
 * textbook points (e.g. Sklar, Digital Communications, 2nd ed., Fig. 4.25).
 */

import { FECSimulator } from '../../src/equipment/receiver/fec-simulator';
import { Receiver } from '../../src/equipment/receiver/receiver';
import { expectWithinAbs, expectWithinRel, referenceCase } from './reference-helpers';

/** EN 302 307 Table 13, ideal Es/N0 (dB) at QEF */
const DVB_S2_QEF_ES_N0: Record<string, number> = {
  'QPSK 1/2': 1.0,
  'QPSK 3/4': 4.03,
  'QPSK 8/9': 6.2,
};
const IMPLEMENTATION_LOSS_DB = 1.0;

describe('DVB-S2 QEF thresholds (EN 302 307 Table 13)', () => {
  referenceCase('QPSK 3/4 degrades below Es/N0 4.03 dB + 1.0 dB implementation loss (within 1 dB)', 'DEV-MODEM-02', () => {
    expectWithinAbs(Receiver.requiredCnDb('QPSK'), DVB_S2_QEF_ES_N0['QPSK 3/4'] + IMPLEMENTATION_LOSS_DB, 1);
  });

  referenceCase('the threshold depends on code rate: QPSK 1/2 to 8/9 spans 5.2 dB', 'DEV-MODEM-02', () => {
    // The engine takes only the modulation; the code rate cannot move it
    const span = DVB_S2_QEF_ES_N0['QPSK 8/9'] - DVB_S2_QEF_ES_N0['QPSK 1/2'];
    expectWithinAbs(Receiver.requiredCnDb('QPSK') - Receiver.requiredCnDb('QPSK'), span, 0.5);
  });
});

describe('uncoded bit-error rate', () => {
  const fec = new FECSimulator() as unknown as { calculateRawBer_: (cnDb: number, modulation: string) => number };

  // Eb/N0 (dB) for a given Pb on the coherent BPSK curve
  const POINTS = [
    { pb: 1e-3, ebN0Db: 6.79 },
    { pb: 1e-5, ebN0Db: 9.59 },
    { pb: 1e-6, ebN0Db: 10.53 },
    { pb: 1e-7, ebN0Db: 11.3 },
  ];

  for (const { pb, ebN0Db } of POINTS) {
    referenceCase(`BPSK: Pb ${pb} at Eb/N0 ${ebN0Db} dB (within 10 %)`, undefined, () => {
      expectWithinRel(fec.calculateRawBer_(ebN0Db, 'BPSK'), pb, 0.1);
    });

    // QPSK with the noise bandwidth equal to the symbol rate: C/N = Es/N0 = Eb/N0 + 3.01 dB
    referenceCase(`QPSK: Pb ${pb} at C/N ${(ebN0Db + 3.01).toFixed(2)} dB, B = Rs (within 10 %)`, undefined, () => {
      expectWithinRel(fec.calculateRawBer_(ebN0Db + 3.01, 'QPSK'), pb, 0.1);
    });
  }
});
