import { Analytics } from './analytics';
import { App } from './app';
// Ahead of everything else: the @font-face declarations must exist before any
// rule asks for the family.
import './fonts.css';
import '@tabler/core/dist/css/tabler.min.css';
import './tabler-overrides.css';
import './index.css';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  // Before App.create() so the ROUTE_CHANGED subscription catches the initial
  // route emitted during Router.init(). Opt-in: gtag.js loads only after the
  // visitor allows it on the consent banner (see src/analytics.ts).
  Analytics.init();
  App.create();
});
