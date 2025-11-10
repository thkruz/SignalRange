import { syncManager } from './storage';

// HMR support for development
const webpackHotModule = (import.meta as any).webpackHot;
if (webpackHotModule) {
  webpackHotModule.dispose(async () => {
    await syncManager.saveToStorage();
    await syncManager.dispose();
  });
  webpackHotModule.accept();
}
