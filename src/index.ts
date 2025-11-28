import { App } from './app';
import '@tabler/core/dist/css/tabler.min.css';
import './tabler-overrides.css';
import './index.css';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  App.create();
});