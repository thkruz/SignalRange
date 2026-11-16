/**
 * Inline glyphs for Mission Control (Phase 32 D21).
 *
 * The app loads no icon font: every `fa-*` class it used to emit rendered as
 * an empty element, so the ticker badges, alarm rows, SYSTEM STABLE and the
 * skip buttons showed no icon at all. Each glyph here is a 16 x 16 inline SVG
 * sized to 1em and painted in `currentColor`, so it inherits the colour class
 * of whatever holds it (`text-red-400`, `text-yellow-400`, ...).
 *
 * The wrapper is an `<i>` on purpose: the existing stylesheets size, colour,
 * pulse or hide icons with `... i` selectors (`.command-bar-left i`,
 * `.time-skip-overlay-label i`, `body.chrome-astro .alarm-count i`), and those
 * keep working unchanged.
 */

/** Alarm severities a glyph exists for; anything else draws the ok check. */
export type SeverityGlyphKey = 'error' | 'warning' | 'info' | 'ok';

/** Leading icon of the command bar wordmark, one per campaign. */
export type HeaderGlyphKey = 'globe' | 'dish' | 'tower' | 'crosshairs';

export type GlyphKey = SeverityGlyphKey | HeaderGlyphKey | 'forward';

// Severity glyphs are one even-odd path: the mark is a hole in the solid
// shape, so it reads on any background without a second colour.
const FILLED_PATHS: Partial<Record<GlyphKey, string>> = {
  error: 'M8 0a8 8 0 1 0 0 16A8 8 0 1 0 8 0zM7 3.5h2v6H7zM7 11h2v2H7z',
  warning: 'M8 .8 15.6 14.6H.4zM7 5.5h2v5H7zM7 11.5h2v2H7z',
  info: 'M8 0a8 8 0 1 0 0 16A8 8 0 1 0 8 0zM8 1.6a6.4 6.4 0 1 0 0 12.8A6.4 6.4 0 1 0 8 1.6zM7 7h2v5H7zM7 4h2v2H7z',
  ok: 'M8 0a8 8 0 1 0 0 16A8 8 0 1 0 8 0zM3.9 8.2l1.4-1.4L7 8.5l3.7-3.7 1.4 1.4L7 11.3z',
  forward: 'M1 3l6.5 5L1 13zM8.5 3 15 8l-6.5 5z',
};

// Header glyphs are line drawings.
const STROKED_MARKUP: Partial<Record<GlyphKey, string>> = {
  globe: '<circle cx="8" cy="8" r="6.6"/><ellipse cx="8" cy="8" rx="2.8" ry="6.6"/><path d="M1.4 8h13.2M2.6 4.5h10.8M2.6 11.5h10.8"/>',
  dish: '<path d="M2 5.5a7 7 0 0 0 8.5 8.5z"/><path d="M6.2 9.8 12 4"/><circle cx="12.6" cy="3.4" r="1.2"/><path d="M5 14.5h6"/>',
  tower: '<circle cx="8" cy="7" r="1.3"/><path d="M8 8.3V15M5.5 15h5M5.2 4.2a4 4 0 0 0 0 5.6M10.8 4.2a4 4 0 0 1 0 5.6M3 2a7 7 0 0 0 0 10M13 2a7 7 0 0 1 0 10"/>',
  crosshairs: '<circle cx="8" cy="8" r="5.5"/><path d="M8 .5v4M8 11.5v4M.5 8h4M11.5 8h4"/>',
};

/**
 * One inline glyph. `extraClass` lands on the wrapper (margins, hooks a test
 * or stylesheet reads); the wrapper always carries `sr-glyph sr-glyph-<key>`
 * and `data-glyph="<key>"`.
 */
export function glyph(key: GlyphKey, extraClass = ''): string {
  const filled = FILLED_PATHS[key];
  const body = filled
    ? `<path fill="currentColor" fill-rule="evenodd" d="${filled}"/>`
    : `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${STROKED_MARKUP[key] ?? ''}</g>`;
  const classes = `sr-glyph sr-glyph-${key} d-inline-block${extraClass ? ` ${extraClass}` : ''}`;

  return (
    `<i class="${classes}" data-glyph="${key}" aria-hidden="true" style="font-style: normal; line-height: 1; vertical-align: -0.125em;">` +
    `<svg viewBox="0 0 16 16" width="1em" height="1em" focusable="false" style="display: block;">${body}</svg></i>`
  );
}

/**
 * Severity glyph: error = "!" in a filled circle, warning = a filled triangle
 * with "!", info = "i" in a ring, anything else (success, ok) = a check in a
 * filled circle.
 */
export function severityGlyph(severity: string, extraClass = ''): string {
  switch (severity) {
    case 'error':
    case 'critical':
      return glyph('error', extraClass);
    case 'warning':
      return glyph('warning', extraClass);
    case 'info':
      return glyph('info', extraClass);
    default:
      return glyph('ok', extraClass);
  }
}
