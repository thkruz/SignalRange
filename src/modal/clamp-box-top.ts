/**
 * Top offset that keeps a floating box fully inside the viewport. A box centred
 * at open time grows downward when feedback and a Continue button are added;
 * without this the button ends up past the bottom edge on a 1280x720 screen.
 */
export function clampBoxTop(top: number, boxHeight: number, viewportHeight: number, scrollY = 0, margin = 8): number {
  const max = scrollY + viewportHeight - boxHeight - margin;
  const min = scrollY + margin;
  return Math.max(min, Math.min(top, max));
}
