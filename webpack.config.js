const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'bundle.[contenthash].js',
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
      // favicon: './public/favicon.ico'
    }),
    new CaseSensitivePathsPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public/assets/logo.png', to: 'logo.png' },
        { from: 'public/images/scenarios', to: 'images/scenarios' }
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