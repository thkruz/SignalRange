/**
 * @file panel-util - Helpers shared by the instrument panels (device lookup, staged inputs)
 */

import type { HamStationManager } from '../../ham-station-manager';
import type { HamDeviceKind } from '../../ham-types';
import type { DeviceRuntime } from '../../station/station-devices';
import { h, tid } from '../ui-kit';

export const inService = (m: HamStationManager, kind: HamDeviceKind): Readonly<DeviceRuntime>[] => m.devices().filter((d) => d.kind === kind && !d.spare && !d.removed);

export const spares = (m: HamStationManager): Readonly<DeviceRuntime>[] => m.devices().filter((d) => d.spare && !d.removed);

/** Number input that update() refreshes only while it is not focused */
export function numInput(testId: string, label: string, value: number, step: number, min?: number, max?: number): HTMLInputElement {
  const i = h('input', { type: 'number', class: 'form-control form-control-sm', step, min, max, value, 'aria-label': label });
  i.id = testId;
  i.setAttribute('data-testid', testId);

  return i;
}

export const setIfIdle = (i: HTMLInputElement | HTMLSelectElement, v: string): void => {
  if (document.activeElement !== i && i.value !== v) i.value = v;
};

export const setText = (e: HTMLElement, t: string): void => {
  if (e.textContent !== t) e.textContent = t;
};

export const kv = (label: string, valueEl: HTMLElement): HTMLElement => h('div', { class: 'ham-kv' }, h('span', { text: label }), valueEl);

export const T = tid;
