import { App } from './app';
import './index.css';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Root element not found');
  }

  const app = new App(rootElement);
  app.init();
});