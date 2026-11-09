import type { AntennaPage, AntennaPageFactory } from '@app/pages/mission-control/antenna-page-registry';

export const ARRAY_CONTROL_TAB_LABEL = 'Array Control';

/** Placeholder Array Control page; PA-WP4 replaces it with the real page. */
export const createArrayControlPlaceholderPage: AntennaPageFactory = (_groundStation, containerId): AntennaPage => {
  let dom: HTMLElement | null = null;

  return {
    tabLabel: ARRAY_CONTROL_TAB_LABEL,
    get dom() {
      return dom;
    },
    activate() {
      if (dom && document.contains(dom)) {
        dom.style.display = '';

        return;
      }
      dom = document.createElement('div') as unknown as HTMLElement;
      dom.className = 'p-3 text-muted';
      dom.textContent = 'Array Control (coming in WP4)';
      document.getElementById(containerId)?.appendChild(dom);
    },
    deactivate() {
      if (dom) {
        dom.style.display = 'none';
      }
    },
    dispose() {
      dom?.remove();
      dom = null;
    },
  };
};
