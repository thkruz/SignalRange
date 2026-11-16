/**
 * What a checklist row says (nats-r3-s20-F1).
 *
 * A visible condition reads its authored description. A row must never be
 * blank, so a condition authored without one falls back to a label derived
 * from its type (and its tab, for tab-active). The hidden tab-active row's
 * late hint (B5) gets a real label too, so the row names what it needs.
 * Phase 29 D5: a tab gate on a quiz step (isTabGate) is shown from the
 * step's start; when authored hidden or without a description it reads
 * tabGateLabel ("Open the Dashboard tab").
 */

import type { Condition } from './objective-types';

const TAB_LABELS: Readonly<Record<string, string>> = {
  dashboard: 'Dashboard',
  'mission-overview': 'Overview',
  'rx-analysis': 'RX Analysis',
  'tx-chain': 'TX Chain',
  'gps-timing': 'GPS Timing',
  'acu-control': 'ACU Control',
  'pass-schedule': 'Pass Schedule',
  'link-budget': 'Link Analysis',
  commanding: 'TT&C',
  telemetry: 'Telemetry',
  'security-console': 'Security',
  geolocation: 'Geolocation',
};

/** A tab id as the tab strip prints it ('rx-analysis-2' -> 'RX Analysis') */
export function tabLabel(tabId: string): string {
  const key = Object.keys(TAB_LABELS).find((id) => tabId === id || tabId.startsWith(`${id}-`));
  return key ? TAB_LABELS[key] : tabId;
}

/** 'buc-temperature-normal' -> 'Buc temperature normal' */
function humanizeType(type: string): string {
  const words = type.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The checklist label for a condition: its description, or a type-derived label when it has none */
export function conditionLabel(condition: Pick<Condition, 'type' | 'description' | 'params'>): string {
  const description = condition.description?.trim();
  if (description) {
    return description;
  }
  const tab = condition.params?.tab;
  if (condition.type === 'tab-active' && tab) {
    return tabGateLabel(tab);
  }

  return humanizeType(condition.type);
}

/** The instruction a tab row reads when it has no authored label: 'Open the Dashboard tab' */
export function tabGateLabel(tabId: string): string {
  return `Open the ${tabLabel(tabId)} tab`;
}

/** The B5 row that names a hidden tab-active condition once it is the only blocker */
export function tabHintLabel(tabId: string): string {
  return `(open the ${tabLabel(tabId)} tab to continue)`;
}
