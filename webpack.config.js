const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
require('dotenv').config();

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
      'process.env.PUBLIC_SUPABASE_URL': JSON.stringify(process.env.PUBLIC_SUPABASE_URL),
      'process.env.PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.PUBLIC_SUPABASE_ANON_KEY),
      'process.env.PUBLIC_USER_API_URL': JSON.stringify(process.env.PUBLIC_USER_API_URL || 'https://user.keeptrack.space')
    }),
    new CaseSensitivePathsPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public/assets/logo.png', to: 'logo.png' },
        { from: 'public/images/scenarios', to: 'images/scenarios' },
        { from: 'public/images/screenshots', to: 'images/screenshots' },
        { from: 'public/images/facebook-white.png', to: 'images/facebook-white.png' },
        { from: 'public/images/github-white.png', to: 'images/github-white.png' },
        { from: 'public/images/google-white.png', to: 'images/google-white.png' },
        { from: 'public/images/linkedin-white.png', to: 'images/linkedin-white.png' },
        { from: 'public/images/person-gray.png', to: 'images/person-gray.png' },
        { from: 'public/mission-briefs', to: 'mission-briefs' }
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
    historyApiFallback: true,
    liveReload: false
  }
};