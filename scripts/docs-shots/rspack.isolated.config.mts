// Isolated dev-server config for the docs screenshot run: no persistent cache,
// no lazy compilation, no HMR (a source edit elsewhere must not reset a capture).
import base from '../../rspack.config.mts';

const config = {
  ...base,
  cache: false,
  lazyCompilation: false,
  experiments: { ...(base as any).experiments, incremental: false, lazyCompilation: false },
  devServer: { ...(base as any).devServer, port: Number(process.env.SR_DEV_PORT) || 3011, hot: false, liveReload: false },
};

export default config;
