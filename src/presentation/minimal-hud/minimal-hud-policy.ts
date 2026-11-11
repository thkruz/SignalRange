/** Class on the document root while the field HUD replaces the station computer's chrome. */
export const MINIMAL_HUD_CLASS = 'mc-minimal-hud';

/** Whether the field HUD is on screen now (the document root carries its class). */
export function minimalHudShown(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains(MINIMAL_HUD_CLASS);
}

/** What decides whether the station computer's chrome (sidebar, command bar, tab bar) is shown. */
export interface MinimalHudInput {
  /** The selected ground station's class, or null on the Mission Overview or a satellite. */
  stationClass: string | null | undefined;
  /** The trainer unlocked the professional engineering tabs at a field station. */
  engineeringUnlocked: boolean;
  /** Sandbox scenarios keep the full chrome (loadout, engineering tabs). */
  sandbox: boolean;
  /** A backyard station worked from the drawn bench (Campaign 3 ham station running). */
  hamBench?: boolean;
}

/**
 * The left menu and top menu stand for the station computer in Campaigns 1 and 2. A field station
 * (Campaign 6) and a backyard bench (Campaign 3) are worked with physical equipment instead, so their
 * chrome gives way to a minimal HUD. The trainer unlock and the sandbox keep the full chrome; a backyard
 * station without the bench (no ham station) keeps it too, since the SDR console is its only workspace.
 */
export function minimalHudActive(input: MinimalHudInput): boolean {
  if (input.sandbox) return false;
  if (input.stationClass === 'field') return !input.engineeringUnlocked;

  return input.stationClass === 'backyard' && input.hamBench === true;
}
