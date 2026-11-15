/**
 * @file where-locator - The "where is it" data and page, built from the `where` locators on condition rows
 * @description One source feeds two places. The checklist row suffix reads `whereSuffix` (objectives-manager.ts), and
 * the campaign's "where is it" page reads `collectWhereEntries` and `renderWherePage`, so the page cannot drift from
 * the checklist. A scenario with no `where` data produces no entries, and every surface renders nothing for it.
 *
 * Host surfaces (they only call `mountWherePage`):
 * - C3 bench: Riley's index card on the Logbook front cover (ham/ui/panels/front-panel.ts)
 * - C4 and C5 console: the laminated "Console map" in the sidebar Mission section
 * - C6 tent: the "Site map" sheet on the Clipboard
 * Test ids: where-page, where-entry.
 */

import type { Condition, Objective, ObjectiveState } from './objective-types';

/** Where the row's objective stands, which orders and marks the page */
export type WhereStatus = 'active' | 'later' | 'done';

export interface WhereEntry {
  objectiveId: string;
  objectiveTitle: string;
  /** The row's checklist text */
  label: string;
  /** The row's locator, in the words of the checklist suffix */
  where: string;
  status: WhereStatus;
  /** The place costs something to reach (C6 outside items). Read from the locator text. */
  usesTrip: boolean;
}

export type WherePageKind = 'index-card' | 'console-map' | 'site-map';

export interface WherePageOptions {
  kind: WherePageKind;
  title: string;
  /** One line under the title, such as how the page reads */
  intro?: string;
  /** Scenario words mapped to console labels (C4 and C5), listed after the entries */
  glossary?: readonly (readonly [string, string])[];
}

/** The trimmed locator of a row, or null when it has none */
export function whereOf(condition: Pick<Condition, 'where'>): string | null {
  const text = condition.where?.trim();

  return text ? text : null;
}

/** The text shown after a checklist row: the locator in brackets, or null */
export function whereSuffix(condition: Pick<Condition, 'where'>): string | null {
  const text = whereOf(condition);

  return text ? `(${text})` : null;
}

/** Escapes locator text for the checklist's HTML string */
export function escapeWhereText(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

/** True when a locator names a cost to get there (the C6 trip rule) */
export function locatorUsesTrip(where: string): boolean {
  return /\buses a trip\b/iu.test(where);
}

const STATUS_ORDER: Record<WhereStatus, number> = { active: 0, later: 1, done: 2 };

/**
 * Every shown row that carries a locator, for the current scenario. Hidden rows are left out because the checklist
 * leaves them out. The active objectives come first, then later ones, then done ones; within a status the scenario
 * order stands.
 */
export function collectWhereEntries(states: readonly ObjectiveState[]): WhereEntry[] {
  const entries: WhereEntry[] = [];

  for (const state of states) {
    const objective: Objective = state.objective;
    const status: WhereStatus = state.isCompleted ? 'done' : state.isActive ? 'active' : 'later';

    objective.conditions.forEach((condition, index) => {
      const where = whereOf(condition);

      if (!where || condition.hidden) return;
      const rowDone = state.conditionStates[index]?.isMaintenanceComplete === true;

      entries.push({
        objectiveId: objective.id,
        objectiveTitle: objective.title,
        label: condition.description,
        where,
        status: rowDone && status === 'active' ? 'done' : status,
        usesTrip: locatorUsesTrip(where),
      });
    });
  }

  return entries
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => STATUS_ORDER[a.entry.status] - STATUS_ORDER[b.entry.status] || a.order - b.order)
    .map(({ entry }) => entry);
}

const STATUS_MARK: Record<WhereStatus, string> = { active: 'Now', later: 'Later', done: 'Done' };

/** The page, or null when there is nothing to list (a campaign with no `where` data renders nothing) */
export function renderWherePage(entries: readonly WhereEntry[], options: WherePageOptions): HTMLElement | null {
  if (entries.length === 0) return null;

  const root = document.createElement('section');

  root.className = `where-page where-page--${options.kind}`;
  root.dataset.testid = 'where-page';
  root.setAttribute('aria-label', options.title);

  const title = document.createElement('h3');

  title.className = 'where-page__title';
  title.textContent = options.title;
  root.append(title);

  if (options.intro) {
    const intro = document.createElement('p');

    intro.className = 'where-page__intro';
    intro.textContent = options.intro;
    root.append(intro);
  }

  const list = document.createElement('ul');

  list.className = 'where-page__list';
  for (const entry of entries) {
    const item = document.createElement('li');

    item.className = `where-page__entry is-${entry.status}`;
    item.dataset.testid = 'where-entry';
    item.dataset.status = entry.status;
    if (entry.usesTrip) item.dataset.trip = 'true';

    const mark = document.createElement('span');

    mark.className = 'where-page__mark';
    mark.textContent = STATUS_MARK[entry.status];

    const label = document.createElement('span');

    label.className = 'where-page__label';
    label.textContent = entry.label;

    const where = document.createElement('span');

    where.className = 'where-page__where';
    where.textContent = entry.where;

    item.append(mark, label, where);
    list.append(item);
  }
  root.append(list);

  if (options.glossary && options.glossary.length > 0) {
    const glossary = document.createElement('dl');

    glossary.className = 'where-page__glossary';
    for (const [word, label] of options.glossary) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');

      dt.textContent = word;
      dd.textContent = label;
      glossary.append(dt, dd);
    }
    root.append(glossary);
  }

  return root;
}

/**
 * Builds the page for the running scenario and appends it to `host`. Returns the page, or null when the scenario has
 * no `where` data (the host is left untouched).
 */
export function mountWherePage(host: HTMLElement, states: readonly ObjectiveState[], options: WherePageOptions): HTMLElement | null {
  const page = renderWherePage(collectWhereEntries(states), options);

  if (page) host.append(page);

  return page;
}
