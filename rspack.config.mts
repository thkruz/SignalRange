import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rspack from '@rspack/core';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string };

// Private submodule (src/private, thkruz/signal-range-private). Absent in OSS
// clones. When its app entry exists the bundle may dynamic-import private
// modules through the @private alias; when it is absent the guarded imports
// are dead code and rspack never resolves the path (no stubs needed).
const PRIVATE_APP_DIR = path.resolve(__dirname, 'src/private/app');
const IS_PRIVATE = fs.existsSync(path.join(PRIVATE_APP_DIR, 'index.ts'));
// Authoring tools need the dev-server file endpoints, so they only exist in
// development builds of the private edition. Never true in a deployed build.
const IS_AUTHORING = IS_PRIVATE && process.env.NODE_ENV === 'development';

// Get git commit SHA at build time
const getGitCommitSha = (): string => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

// First loaded always wins, so load .env first
if (process.env.NODE_ENV === 'development') {
  dotenv.config({ path: '.env' });
}

// For production builds, also load .env.production
dotenv.config({ path: '.env.production' });

const isProduction = process.env.NODE_ENV === 'production';

const config: rspack.Configuration = {
  entry: {
    main: './src/index.ts',
    'popup-callback': './src/user-account/popup-callback.ts',
  },
  output: {
    filename: '[name].[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    publicPath: '/',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@app': path.resolve(__dirname, 'src'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@private': PRIVATE_APP_DIR,
      // External plugin clones (see scripts/plugin). The generated manifest
      // only ever imports plugins present on disk, so this never dangles.
      '@plugins-external': path.resolve(__dirname, 'src/plugins-external'),
    },
  },
  // Production emits maps but keeps the sourceMappingURL out of the bundle,
  // matching keeptrack; dev keeps the reference for debuggability.
  devtool: isProduction ? 'hidden-source-map' : 'source-map',
  module: {
    rules: [
      {
        // Rust/SWC transpile, no type-check: `pnpm run typecheck` (tsgo) owns
        // types. Replaces ts-loader, which re-ran tsc on every build.
        test: /\.ts$/u,
        loader: 'builtin:swc-loader',
        exclude: [/node_modules/u],
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
            },
            target: 'es2022',
          },
        },
      },
      {
        test: /\.css$/u,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              // Root-relative urls are server paths, not module requests. The
              // self-hosted fonts in src/fonts.css point at /fonts/*.woff2,
              // which CopyRspackPlugin puts in the output as-is; without this
              // filter css-loader tries to resolve them against src/ and the
              // build fails with "Can't resolve '/fonts/...'".
              url: { filter: (url: string) => !url.startsWith('/') },
            },
          },
        ],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg|otf|ttf|woff|woff2)$/u,
        type: 'asset/resource',
      },
      {
        test: /\.(mp3|wav)$/u,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: './public/index.html',
      chunks: ['main'],
      filename: 'index.html',
    }),
    new rspack.HtmlRspackPlugin({
      template: './public/auth/callback.html',
      chunks: ['popup-callback'],
      filename: 'auth/callback.html',
    }),
    new rspack.DefinePlugin({
      'process.env.PUBLIC_SUPABASE_URL': JSON.stringify(process.env.PUBLIC_SUPABASE_URL),
      'process.env.PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.PUBLIC_SUPABASE_ANON_KEY),
      'process.env.PUBLIC_USER_API_URL': JSON.stringify(process.env.PUBLIC_USER_API_URL || 'https://user.keeptrack.space'),
      'process.env.PUBLIC_ASSETS_BASE_URL': JSON.stringify(process.env.PUBLIC_ASSETS_BASE_URL || ''),
      'process.env.PUBLIC_DEV_USER_IDS': JSON.stringify(process.env.PUBLIC_DEV_USER_IDS || ''),
      'process.env.PUBLIC_LOG_LEVEL': JSON.stringify(process.env.PUBLIC_LOG_LEVEL || 'LOG'),
      __APP_VERSION__: JSON.stringify(pkg.version),
      __GIT_COMMIT_SHA__: JSON.stringify(getGitCommitSha()),
      __IS_PRIVATE__: JSON.stringify(IS_PRIVATE),
      __AUTHORING__: JSON.stringify(IS_AUTHORING),
    }),
    // No case-sensitive-paths equivalent in rspack; the Linux CI build is what
    // catches casing mistakes now.
    new rspack.CopyRspackPlugin({
      patterns: [
        // noErrorOnMissing on the next two patterns preserves webpack's
        // behaviour: copy-webpack-plugin tolerated them, CopyRspackPlugin
        // errors. Both currently match nothing -- public/assets/logo.png does
        // not exist, and public/assets/characters holds only .png files, which
        // this pattern's own ignore list excludes. Neither has ever emitted
        // anything into dist/. Kept (rather than deleted) so the intent
        // survives if non-png character art is added.
        { from: 'public/assets/logo.png', to: 'logo.png', noErrorOnMissing: true },
        {
          from: 'public/assets/characters/',
          to: 'assets/characters/',
          noErrorOnMissing: true,
          globOptions: {
            ignore: ['**/*.png', '**/wip/**'],
          },
        },
        {
          from: 'public/images/',
          to: 'images/',
          globOptions: {
            ignore: ['**/wip/**'],
          },
        },
        // Self-hosted web fonts. Copied verbatim (not run through the
        // asset/resource rule) so the URLs in src/fonts.css stay stable.
        {
          from: 'public/fonts/',
          to: 'fonts/',
        },
      ],
    }),
  ],
  optimization: isProduction
    ? {
      minimizer: [
        new rspack.SwcJsMinimizerRspackPlugin({
          minimizerOptions: {
            compress: { keep_classnames: true },
            mangle: { keep_classnames: true },
          },
        }),
        new rspack.LightningCssMinimizerRspackPlugin({}),
      ],
    }
    : undefined,
  // Persistent filesystem cache makes local rebuilds near-instant. Skipped in
  // CI, where a cold runner would write a cache it never reads.
  cache: process.env.CI
    ? false
    : {
      type: 'persistent',
      // Namespace by mode so dev and prod never read each other's
      // (differently minified) cached modules.
      version: isProduction ? 'production' : 'development',
      buildDependencies: [path.resolve(__dirname, 'rspack.config.mts'), path.resolve(__dirname, 'package.json')],
      storage: {
        type: 'filesystem',
        directory: 'node_modules/.cache/rspack',
      },
    },
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    compress: false,
    port: 3000,
    hot: true,
    historyApiFallback: {
      rewrites: [
        // Don't redirect auth callback - serve the actual HTML file
        { from: /^\/auth\/callback/u, to: '/auth/callback.html' },
        // All other routes go to index.html
        { from: /./u, to: '/index.html' },
      ],
    },
    liveReload: false,
    // Private dev endpoints (scenario authoring file access). The module is
    // part of the private submodule; without it the dev server is unchanged.
    //
    // Under webpack-dev-server this registered straight onto `devServer.app`,
    // which was an Express app. @rspack/dev-server does not expose one (its
    // `app` has no .get/.post), so we build an Express app here and mount it as
    // a middleware instead -- an Express app is itself a (req, res, next)
    // handler. This keeps dev-middleware.cjs's Express contract intact without
    // changing the private submodule. It is unshifted so the /__author routes
    // resolve before historyApiFallback rewrites them to index.html.
    setupMiddlewares: (middlewares) => {
      const privateMiddleware = path.join(PRIVATE_APP_DIR, 'dev-middleware.cjs');

      if (IS_AUTHORING && fs.existsSync(privateMiddleware)) {
        const express = require('express');
        const authoringApp = express();

        require(privateMiddleware).register(authoringApp, { repoRoot: __dirname });
        middlewares.unshift({ name: 'private-authoring', middleware: authoringApp });
      }

      return middlewares;
    },
  },
};

export default config;
