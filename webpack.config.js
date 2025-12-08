const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
// First loaded always wins, so load .env first
if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: '.env' });
}

// For production builds, also load .env.production
require('dotenv').config({ path: '.env.production' });

module.exports = {
  entry: {
    main: './src/index.ts',
    'popup-callback': './src/user-account/popup-callback.ts'
  },
  output: {
    filename: '[name].[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    publicPath: '/'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@app': path.resolve(__dirname, 'src'),
      '@engine': path.resolve(__dirname, 'src/engine'),
    }
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg|otf|ttf|woff|woff2)$/,
        type: 'asset/resource'
      },
      {
        test: /\.(mp3|wav)$/,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      chunks: ['main'],
      filename: 'index.html'
      // favicon: './public/favicon.ico'
    }),
    new HtmlWebpackPlugin({
      template: './public/auth/callback.html',
      chunks: ['popup-callback'],
      filename: 'auth/callback.html'
    }),
    new webpack.DefinePlugin({
      'process.env.PUBLIC_ENVIRONMENT': JSON.stringify(process.env.PUBLIC_ENVIRONMENT || 'production'),
      'process.env.PUBLIC_SUPABASE_URL': JSON.stringify(process.env.PUBLIC_SUPABASE_URL),
      'process.env.PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.PUBLIC_SUPABASE_ANON_KEY),
      'process.env.PUBLIC_USER_API_URL': JSON.stringify(process.env.PUBLIC_USER_API_URL || 'https://user.keeptrack.space'),
      'process.env.PUBLIC_ASSETS_BASE_URL': JSON.stringify(process.env.PUBLIC_ASSETS_BASE_URL || ''),
      'process.env.PUBLIC_AI_MODE': JSON.stringify(process.env.PUBLIC_AI_MODE || 'cloud'),
      'process.env.PUBLIC_AI_ENDPOINT': JSON.stringify(process.env.PUBLIC_AI_ENDPOINT || '')
    }),
    new CaseSensitivePathsPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public/assets/logo.png', to: 'logo.png' },
        { from: 'public/assets/characters/', to: 'assets/characters/' },
        { from: 'public/images/', to: 'images/' },
      ]
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'public')
    },
    compress: false,
    port: 3000,
    hot: true,
    historyApiFallback: {
      rewrites: [
        // Don't redirect auth callback - serve the actual HTML file
        { from: /^\/auth\/callback/, to: '/auth/callback.html' },
        // All other routes go to index.html
        { from: /./, to: '/index.html' }
      ]
    },
    liveReload: false
  }
};