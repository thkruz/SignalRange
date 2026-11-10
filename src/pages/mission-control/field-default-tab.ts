/**
 * Landing tab for a field station. A scenario with a physical plant opens on
 * Site (the tent is where the work starts); otherwise the registered default
 * station tab, then the first tab.
 */
export function fieldDefaultTabId(hasSiteTab: boolean, registeredDefaultId: string | null, firstTabId: string): string {
  if (hasSiteTab) {
    return 'site';
  }

  return registeredDefaultId ?? firstTabId;
}
