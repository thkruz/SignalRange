declare global {
  // Build-time constants injected by webpack DefinePlugin
  const __APP_VERSION__: string;
  const __GIT_COMMIT_SHA__: string;

  interface Window {
    signalRange: App;
  }
  interface GlobalThis {
    signalRange: App;
  }
}

export { };
