/** One timer the command bar is showing (objective or scenario). */
export interface WatchTimer {
  label: string;
  value: string;
  hold: boolean;
}

/** One skip the command bar offers, reworded for the watch. */
export interface WatchSkip {
  /** The command bar button this mirrors; the watch clicks it, so the skip logic stays in one place. */
  sourceId: 'time-skip-control' | 'objective-skip-control';
  label: string;
  title: string;
  disabled: boolean;
}

export interface WatchReadout {
  time: string;
  timers: WatchTimer[];
  skips: WatchSkip[];
}

const TIME_RE = /\d{2}:\d{2}(?::\d{2})?/u;

/** "Skip to 10:00" reads "Wait until 10:00"; "Skip 7 min" reads "Wait 7 min". */
export function waitLabel(skipLabel: string): string {
  const label = skipLabel.replace(/\s+/gu, ' ').trim();
  if (/^skip to /iu.test(label)) return `Wait until ${label.slice('skip to '.length)}`;
  if (/^skip /iu.test(label)) return `Wait ${label.slice('skip '.length)}`;
  if (/^skip$/iu.test(label)) return 'Wait';

  return label;
}

const shown = (el: HTMLElement | null): el is HTMLElement => !!el && el.style.display !== 'none' && !el.hidden;

/**
 * Read what the (hidden) global command bar shows: its clock, its timers and its skip buttons. The watch mirrors
 * this instead of keeping timers of its own, so there is one source of truth for every countdown.
 */
export function readWatch(root: ParentNode): WatchReadout {
  const clock = root.querySelector<HTMLElement>('#utc-clock')?.textContent ?? '';
  const time = TIME_RE.exec(clock)?.[0] ?? '--:--';
  const timers: WatchTimer[] = [];
  for (const id of ['objective', 'scenario'] as const) {
    const display = root.querySelector<HTMLElement>(`#${id}-timer-display`);
    if (!shown(display)) continue;
    const labelEl = display.querySelector<HTMLElement>('.timer-label');
    const holdEl = display.querySelector<HTMLElement>('.timer-hold-tag');
    const label = [...(labelEl?.childNodes ?? [])]
      .filter((node) => node !== holdEl)
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();
    timers.push({ label, value: display.querySelector('.timer-value')?.textContent?.trim() ?? '--:--', hold: !!holdEl && !holdEl.hidden });
  }
  const skips: WatchSkip[] = [];
  for (const sourceId of ['objective-skip-control', 'time-skip-control'] as const) {
    const button = root.querySelector<HTMLButtonElement>(`#${sourceId}`);
    if (!shown(button)) continue;
    const label = button.querySelector(`#${sourceId}-label`)?.textContent ?? button.textContent ?? '';
    skips.push({ sourceId, label: waitLabel(label), title: button.title, disabled: button.disabled });
  }

  return { time, timers, skips };
}
