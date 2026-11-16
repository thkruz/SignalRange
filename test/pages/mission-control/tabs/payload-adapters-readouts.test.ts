/**
 * Phase 29 D4 payload readouts:
 * - RX Payload Data Integrity has no healthy figures without frame sync
 *   (nats-r4-s08-F2): BER, CRC, data rate, auth tag and decryption read "--".
 * - TX Payload Data derives its data rate and frames/s from the active
 *   modem's carrier exactly as RX does (nats-r4-s10-F2).
 */
import { CryptoModule } from '@app/equipment/crypto';
import type { Receiver } from '@app/equipment/receiver/receiver';
import type { Transmitter } from '@app/equipment/transmitter/transmitter';
import { EventBus } from '@app/events/event-bus';
import { FaultInjector } from '@app/faults';
import { RxPayloadAdapter } from '@app/pages/mission-control/tabs/rx-payload-adapter';
import { TxPayloadAdapter } from '@app/pages/mission-control/tabs/tx-payload-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const RX_IDS = [
  'rx-payload-alarm-badge',
  'rx-payload-frame-sync',
  'rx-payload-ber',
  'rx-payload-crc-status',
  'rx-payload-rs-status',
  'rx-payload-viterbi-status',
  'rx-payload-data-rate',
  'rx-payload-channel-status',
  'rx-payload-dec-auth-tag',
  'rx-payload-dec-success',
];

const TX_IDS = ['tx-payload-alarm-badge', 'tx-payload-data-rate', 'tx-payload-frames-sec'];

/** A 24 MHz QPSK 3/4 carrier: 20 Msps at roll-off 0.2, 30 Mbps of information */
const SYMBOL_RATE_HZ = 24e6 / 1.2;

function container(ids: string[]): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = ids.map((id) => `<span id="${id}"></span>`).join('');
  document.body.appendChild(el);
  return el;
}

function receiverWith(info: Record<string, unknown>): Receiver {
  return {
    activeModem: { modemNumber: 1, modulation: 'QPSK', fec: '3/4', isPowered: true },
    getSignalsInBandwidth: () => info,
  } as unknown as Receiver;
}

const text = (root: HTMLElement, id: string) => root.querySelector(`#${id}`)?.textContent;

describe('payload readouts (phase 29 D4)', () => {
  beforeEach(() => {
    EventBus.destroy();
    CryptoModule.resetInstance();
    FaultInjector.resetInstance();
  });

  afterEach(() => {
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  it('RX: no carrier -> Unlocked, No Lock, and "--" for BER, CRC, data rate, auth tag and decryption (nats-r4-s08-F2)', () => {
    const root = container(RX_IDS);
    const adapter = new RxPayloadAdapter(root, receiverWith({ hasCarrier: false, hasLock: false, cnRatio_dB: Number.NEGATIVE_INFINITY }));

    expect(text(root, 'rx-payload-frame-sync')).toBe('Unlocked');
    expect(text(root, 'rx-payload-channel-status')).toBe('No Lock');
    expect(text(root, 'rx-payload-ber')).toBe('--');
    expect(text(root, 'rx-payload-crc-status')).toBe('--');
    expect(text(root, 'rx-payload-rs-status')).toBe('No Sync');
    expect(text(root, 'rx-payload-viterbi-status')).toBe('No Sync');
    expect(text(root, 'rx-payload-data-rate')).toBe('--');
    expect(text(root, 'rx-payload-dec-auth-tag')).toBe('--');
    expect(text(root, 'rx-payload-dec-success')).toBe('--');
    adapter.dispose();
  });

  it('RX: no carrier -> the LED is idle grey "No carrier", not red decoder reasons (nats-eu-r1 s01-F7)', () => {
    const root = container(RX_IDS);
    const adapter = new RxPayloadAdapter(root, receiverWith({ hasCarrier: false, hasLock: false, cnRatio_dB: Number.NEGATIVE_INFINITY }));
    const led = root.querySelector<HTMLElement>('.card-alarm-led');

    expect(led?.className).not.toContain('error');
    expect(led?.title).toBe('No carrier');
    adapter.dispose();
  });

  it('RX: a carrier without modem lock keeps the red decoder reasons', () => {
    const root = container(RX_IDS);
    const adapter = new RxPayloadAdapter(root, receiverWith({ hasCarrier: true, hasLock: false, cnRatio_dB: 14, effectiveEsN0_dB: 14.8, symbolRate_Hz: SYMBOL_RATE_HZ }));
    const led = root.querySelector<HTMLElement>('.card-alarm-led');

    expect(led?.className).toContain('error');
    expect(led?.title).toContain('Frame sync lost');
    adapter.dispose();
  });

  it('RX: a carrier without modem lock is still no sync (a dropout)', () => {
    const root = container(RX_IDS);
    const adapter = new RxPayloadAdapter(root, receiverWith({ hasCarrier: true, hasLock: false, cnRatio_dB: 14, effectiveEsN0_dB: 14.8, symbolRate_Hz: SYMBOL_RATE_HZ }));

    expect(text(root, 'rx-payload-frame-sync')).toBe('Unlocked');
    expect(text(root, 'rx-payload-dec-success')).toBe('--');
    adapter.dispose();
  });

  it('RX: a locked carrier decodes, 30.000 Mbps on 24 MHz QPSK 3/4', () => {
    const root = container(RX_IDS);
    const adapter = new RxPayloadAdapter(root, receiverWith({ hasCarrier: true, hasLock: true, cnRatio_dB: 14, effectiveEsN0_dB: 14.8, symbolRate_Hz: SYMBOL_RATE_HZ }));

    expect(text(root, 'rx-payload-frame-sync')).toBe('Locked');
    expect(text(root, 'rx-payload-data-rate')).toBe('30.000 Mbps');
    expect(text(root, 'rx-payload-dec-success')).toBe('Success');
    adapter.dispose();
  });

  const transmitterWith = (modem: Record<string, unknown>) =>
    ({
      activeModem: {
        isPowered: true,
        isTransmitting: true,
        isFaulted: false,
        ifSignal: { bandwidth: 24e6, modulation: 'QPSK', fec: '3/4' },
        ...modem,
      },
    }) as unknown as Transmitter;

  it('TX: data rate and frames/s from the carrier, matching RX (nats-r4-s10-F2)', () => {
    const root = container(TX_IDS);
    const adapter = new TxPayloadAdapter(root, 'gs', transmitterWith({}));

    expect(text(root, 'tx-payload-data-rate')).toBe('30.000 Mbps');
    // 20 Msps x 2 bits / 64 800-bit FECFRAME
    expect(text(root, 'tx-payload-frames-sec')).toBe('617');
    adapter.dispose();
  });

  it('TX: no carrier on the air reads "--"', () => {
    const root = container(TX_IDS);
    const adapter = new TxPayloadAdapter(root, 'gs', transmitterWith({ isTransmitting: false }));

    expect(text(root, 'tx-payload-data-rate')).toBe('--');
    expect(text(root, 'tx-payload-frames-sec')).toBe('--');
    adapter.dispose();
  });
});
