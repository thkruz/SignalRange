/**
 * @file event-formatters.ts - Format event data into human-readable log messages
 * @description Pure functions that convert EventBus event data to operator-style log messages.
 * Each formatter returns string | null (null if nothing meaningful to log).
 */

import type { AntennaState } from '@app/equipment/antenna';
import type { TrackingMode } from '@app/equipment/antenna/antenna-core';
import { antennaLockLabel } from '@app/equipment/antenna/tracking-mode-label';
import type { ReceiverModemState } from '@app/equipment/receiver/receiver';
import type { AGCState } from '@app/equipment/rf-front-end/agc-module';
import type { BUCState } from '@app/equipment/rf-front-end/buc-module';
import type { CouplerState } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import type { IfFilterBankState } from '@app/equipment/rf-front-end/filter-module';
import type { GPSDOState } from '@app/equipment/rf-front-end/gpsdo-module/gpsdo-state';
import type { HPAState } from '@app/equipment/rf-front-end/hpa-module';
import type { LNBState } from '@app/equipment/rf-front-end/lnb-module';
import type { NotchFilterState } from '@app/equipment/rf-front-end/notch-filter-module';
import type { OMTState, PolarizationType } from '@app/equipment/rf-front-end/omt-module/omt-module';
import type { RFFrontEndState } from '@app/equipment/rf-front-end/rf-front-end-core';
import type { TransmitterModem } from '@app/equipment/transmitter/transmitter';
import type { AntennaSlewCompleteData, RxConfigChangedData, TxConfigChangedData, TxTransmitChangedData } from '@app/events/events';

// ════════════════════════════════════════════════════════════════════════════
// Antenna Formatters
// ════════════════════════════════════════════════════════════════════════════

const TRACKING_MODE_LABELS: Record<TrackingMode, string> = {
  stow: 'STOW',
  maintenance: 'MAINTENANCE',
  manual: 'MANUAL',
  'program-track': 'PROGRAM-TRACK',
};

/**
 * Format antenna state change into log message
 */
export function formatAntennaEvent(data: Partial<AntennaState>): string | null {
  const parts: string[] = [];

  if (data.trackingMode !== undefined) {
    const label = TRACKING_MODE_LABELS[data.trackingMode] ?? data.trackingMode.toUpperCase();
    // STOW/MAINT only stage the park elevation; the dish moves on APPLY. Log
    // the staged mode as staged, without the lock flags the mode switch
    // momentarily cleared: the dish is still where it was (nats-r3-s11-F2).
    // The APPLY logs the mode again with the state at that moment.
    // Since phase 29 the ACU stages STOW/MAINT as `stagedTrackingMode` while
    // the applied mode keeps running.
    const pendingEl = data.stagedTargetElevation;
    const parkMode = data.stagedTrackingMode ?? data.trackingMode;
    const isParkMode = parkMode === 'stow' || parkMode === 'maintenance';
    if (isParkMode && data.hasStagedChanges && pendingEl !== undefined && pendingEl !== null) {
      return `Tracking mode: ${TRACKING_MODE_LABELS[parkMode] ?? parkMode.toUpperCase()} staged (El ${pendingEl.toFixed(1)} pending APPLY)`;
    }
    // Step-track is an overlay on program-track, so engaging it changes the
    // line and logs (nats-r4-s10-F1)
    const stepTrack = data.trackingMode === 'program-track' && data.isStepTrackEnabled ? ' + STEP-TRACK' : '';
    parts.push(`Tracking mode: ${label}${stepTrack}`);
  }

  if (data.isPowered !== undefined) {
    parts.push(data.isPowered ? 'Power ON' : 'Power OFF');
  }

  // One lock, as the ACU and Dashboard print it: the satellite and beacon
  // flags trade places while acquisition settles, and printing both wrote two
  // contradictory start-of-shift lines (nats-r4-s10-F1)
  if (data.isLocked !== undefined || data.isBeaconLocked !== undefined) {
    const lock = antennaLockLabel({
      isLocked: data.isLocked ?? false,
      isBeaconLocked: data.isBeaconLocked ?? false,
      isAcuAutomationFaulted: data.isAcuAutomationFaulted,
      trackingMode: data.trackingMode,
      isSlewing: data.isSlewing,
    });
    parts.push(lock === 'UNKNOWN' ? 'Antenna lock UNKNOWN' : `Antenna ${lock}`);
  }

  // Only log position if we have both values and not other changes
  if (data.azimuth !== undefined && data.elevation !== undefined && parts.length === 0) {
    parts.push(`Position: Az ${data.azimuth.toFixed(1)} El ${data.elevation.toFixed(1)}`);
  }

  if (data.polarization !== undefined && parts.length === 0) {
    parts.push(`Polarization skew: ${data.polarization.toFixed(1)}°`);
  }

  // A beacon frequency belongs to a target (or the operator's MANUAL entry):
  // PROGRAM with no target yet carries the last satellite's, so it is left out
  // until Move to Target sets the new one (phase 29 D4, nats-r4-s12-F1)
  const hasBeaconTarget = data.targetSatelliteId !== null || data.trackingMode === 'manual';
  if (data.beaconFrequencyHz !== undefined && hasBeaconTarget) {
    const freqMHz = data.beaconFrequencyHz / 1e6;
    parts.push(`Beacon freq: ${freqMHz.toFixed(2)} MHz`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

/** Azimuth as the ACU prints it, 0-360 */
function formatAz_(azimuth: number, digits = 1): string {
  return (((azimuth % 360) + 360) % 360).toFixed(digits);
}

/**
 * The arrival line of a commanded antenna move (nats-r6-s11-F1):
 * "PROGRAM: on target TIDEMARK-1 (Az 188.4, El 29.3)", "STOW: parked (El 90.0)",
 * "MAINTENANCE: parked (El 5.0)", "MANUAL: at Az 153.11, El 35.10". The
 * MANUAL line carries two decimals so a 0.01 deg nudge reads as moved
 * (Phase 33 D8, nats-r8-s23-F2); the others keep one.
 */
export function formatAntennaArrival(data: AntennaSlewCompleteData): string {
  const az = formatAz_(data.azimuth);
  const el = data.elevation.toFixed(1);
  switch (data.mode) {
    case 'program-track':
      return data.targetSatelliteName ? `PROGRAM: on target ${data.targetSatelliteName} (Az ${az}, El ${el})` : `PROGRAM: at Az ${az}, El ${el}`;
    case 'stow':
      return `STOW: parked (El ${el})`;
    case 'maintenance':
      return `MAINTENANCE: parked (El ${el})`;
    default:
      return `MANUAL: at Az ${formatAz_(data.azimuth, 2)}, El ${data.elevation.toFixed(2)}`;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Transmitter Formatters
// ════════════════════════════════════════════════════════════════════════════

/**
 * Format transmitter config change
 */
export function formatTxConfigEvent(data: TxConfigChangedData): string | null {
  const config: TransmitterModem = data.config;
  const modemNum = config.modem_number;
  const freqMHz = (config.ifSignal.frequency / 1e6).toFixed(2);
  const mod = config.ifSignal.modulation !== 'null' ? config.ifSignal.modulation : '';
  const fec = config.ifSignal.fec !== 'null' ? config.ifSignal.fec : '';

  const modFec = [mod, fec].filter(Boolean).join(' ');
  const carrier = `${freqMHz} MHz${modFec ? `, ${modFec}` : ''}`;

  // The event names the modem that changed and what changed (nats-r3-s11-F1);
  // an event with no action is a state refresh and logs nothing. An automatic
  // action says why, like the sibling handover lines (nats-r4-s11-F3)
  const line = formatTxAction_(data.action, modemNum, carrier);
  return line && data.reason ? `${line} (${data.reason})` : line;
}

function formatTxAction_(action: TxConfigChangedData['action'], modemNum: number, carrier: string): string | null {
  switch (action) {
    case 'config':
      return `M${modemNum}: Config ${carrier}`;
    case 'transmit-on':
      return `M${modemNum}: Transmission STARTED, ${carrier}`;
    case 'transmit-off':
      return `M${modemNum}: Transmission STOPPED`;
    case 'power-on':
      return `M${modemNum}: Power ON, booting`;
    case 'boot-complete':
      return `M${modemNum}: Boot complete`;
    case 'power-off':
      return `M${modemNum}: Power OFF`;
    case 'loopback-on':
      return `M${modemNum}: Loopback ON`;
    case 'loopback-off':
      return `M${modemNum}: Loopback OFF`;
    case 'fault-reset':
      return `M${modemNum}: Fault reset`;
    default:
      return null;
  }
}

/**
 * Format transmission start/stop
 */
export function formatTxTransmitEvent(data: TxTransmitChangedData): string | null {
  const status = data.transmitting ? 'STARTED' : 'STOPPED';
  return `M${data.modem + 1}: Transmission ${status}`;
}

// ════════════════════════════════════════════════════════════════════════════
// Receiver Formatters
// ════════════════════════════════════════════════════════════════════════════

/**
 * Format receiver config change
 */
export function formatRxConfigEvent(data: RxConfigChangedData): string | null {
  const config: ReceiverModemState = data.config;
  const modemNum = config.modemNumber;
  const freqMHz = config.frequency.toFixed(2);
  const bwMHz = config.bandwidth.toFixed(1);
  // The modulation and FEC, as the TX config line carries them (nats-r5-s06-F3)
  const mod = config.modulation && config.modulation !== 'null' ? config.modulation : '';
  const fec = config.fec && config.fec !== 'null' ? config.fec : '';
  const modFec = [mod, fec].filter(Boolean).join(' ');

  return `M${modemNum}: Tuned to ${freqMHz} MHz, BW ${bwMHz} MHz${modFec ? `, ${modFec}` : ''}`;
}

// ════════════════════════════════════════════════════════════════════════════
// RF Front-End Formatters
// ════════════════════════════════════════════════════════════════════════════

/**
 * Format RF front-end power change
 */
export function formatRfFePowerEvent(data: Partial<RFFrontEndState>): string | null {
  // RF_FE_POWER_CHANGED typically contains the full state, but we look for specific power changes
  if (data.lnb?.isPowered !== undefined) {
    return data.lnb.isPowered ? 'LNB Power ON' : 'LNB Power OFF';
  }
  return null;
}

/**
 * Format HPA state change
 */
export function formatHpaEvent(data: Partial<HPAState>): string | null {
  if (data.isHpaEnabled !== undefined) {
    return data.isHpaEnabled ? 'HPA enabled' : 'HPA disabled';
  }
  if (data.backOff !== undefined) {
    return `HPA back-off: ${data.backOff} dB`;
  }
  return null;
}

/**
 * Format BUC state change
 */
export function formatBucEvent(data: Partial<BUCState>): string | null {
  if (data.isPowered !== undefined) {
    return data.isPowered ? 'BUC Power ON' : 'BUC Power OFF';
  }
  if (data.loFrequency !== undefined) {
    const freqGHz = data.loFrequency / 1000;
    return `BUC LO: ${freqGHz.toFixed(3)} GHz`;
  }
  if (data.isMuted !== undefined) {
    return data.isMuted ? 'BUC output MUTED' : 'BUC output UNMUTED';
  }
  return null;
}

/**
 * Format LNB state change
 */
export function formatLnbEvent(data: Partial<LNBState>): string | null {
  if (data.isPowered !== undefined) {
    return data.isPowered ? 'LNB Power ON' : 'LNB Power OFF';
  }
  if (data.loFrequency !== undefined) {
    const freqGHz = data.loFrequency / 1000;
    return `LNB LO: ${freqGHz.toFixed(3)} GHz`;
  }
  if (data.isExtRefLocked !== undefined) {
    return data.isExtRefLocked ? 'LNB ref LOCKED' : 'LNB ref UNLOCKED';
  }
  return null;
}

/**
 * Format AGC state change
 */
export function formatAgcEvent(data: Partial<AGCState>): string | null {
  if (data.isBypassed !== undefined) {
    return data.isBypassed ? 'AGC bypassed' : 'AGC enabled';
  }
  if (data.targetLevel !== undefined) {
    return `AGC target: ${data.targetLevel} dBm`;
  }
  return null;
}

/**
 * Format OMT state change
 */
export function formatOmtEvent(data: Partial<OMTState>): string | null {
  const formatPol = (pol: PolarizationType): string => pol ?? 'OFF';

  if (data.txPolarization !== undefined || data.rxPolarization !== undefined) {
    const parts: string[] = [];
    if (data.txPolarization !== undefined) {
      parts.push(`TX: ${formatPol(data.txPolarization)}`);
    }
    if (data.rxPolarization !== undefined) {
      parts.push(`RX: ${formatPol(data.rxPolarization)}`);
    }
    return `OMT polarization ${parts.join(', ')}`;
  }
  return null;
}

/**
 * Format IF filter state change
 */
export function formatFilterEvent(data: Partial<IfFilterBankState>): string | null {
  if (data.bandwidth !== undefined) {
    if (data.bandwidth >= 1) {
      return `IF filter: ${data.bandwidth} MHz`;
    } else if (data.bandwidth >= 0.001) {
      return `IF filter: ${(data.bandwidth * 1000).toFixed(0)} kHz`;
    } else {
      return `IF filter: ${(data.bandwidth * 1e6).toFixed(0)} Hz`;
    }
  }
  return null;
}

/**
 * Format notch filter state change
 */
export function formatNotchFilterEvent(data: Partial<NotchFilterState>): string | null {
  if (data.notches) {
    const enabled = data.notches.filter((n) => n.enabled);
    if (enabled.length === 0) {
      return 'Notch filters: all disabled';
    }
    const freqs = enabled.map((n) => `${n.centerFrequency} MHz`).join(', ');
    return `Notch filter${enabled.length > 1 ? 's' : ''} enabled at ${freqs}`;
  }
  return null;
}

/**
 * Format GPSDO state change
 */
export function formatGpsdoEvent(data: Partial<GPSDOState>): string | null {
  if (data.isPowered !== undefined) {
    return data.isPowered ? 'GPSDO Power ON' : 'GPSDO Power OFF';
  }
  if (data.isLocked !== undefined) {
    return data.isLocked ? 'GPSDO LOCKED' : 'GPSDO UNLOCKED';
  }
  if (data.isInHoldover !== undefined) {
    return data.isInHoldover ? 'GPSDO in HOLDOVER' : 'GPSDO exited holdover';
  }
  return null;
}

/**
 * Format coupler state change
 */
export function formatCouplerEvent(data: Partial<CouplerState>): string | null {
  const parts: string[] = [];

  if (data.tapPointA !== undefined && data.isEnabledA) {
    parts.push(`Tap A: ${data.tapPointA}`);
  }
  if (data.tapPointB !== undefined && data.isEnabledB) {
    parts.push(`Tap B: ${data.tapPointB}`);
  }
  if (data.isEnabledA !== undefined) {
    parts.push(data.isEnabledA ? 'Tap A enabled' : 'Tap A disabled');
  }
  if (data.isEnabledB !== undefined) {
    parts.push(data.isEnabledB ? 'Tap B enabled' : 'Tap B disabled');
  }

  return parts.length > 0 ? `Coupler: ${parts.join(', ')}` : null;
}
