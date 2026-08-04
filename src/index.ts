import { App } from './app';
// Ahead of everything else: the @font-face declarations must exist before any
// rule asks for the family.
import './fonts.css';
import '@tabler/core/dist/css/tabler.min.css';
import './tabler-overrides.css';
import './index.css';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  App.create();
});