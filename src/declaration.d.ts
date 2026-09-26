declare global {
  // Build-time constants injected by rspack DefinePlugin
  const __APP_VERSION__: string;
  const __GIT_COMMIT_SHA__: string;
  /** True when the private submodule's app entry (src/private/app/index.ts) is present at build time. */
  const __IS_PRIVATE__: boolean;
  /** True only for development builds of the private edition; gates the scenario authoring tools. */
  const __AUTHORING__: boolean;

  interface Window {
    signalRange: App;
  }
  interface GlobalThis {
    signalRange: App;
  }
}

export {};
