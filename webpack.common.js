/* eslint-disable import/no-extraneous-dependencies */
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const WebpackNotifierPlugin = require('webpack-notifier');

module.exports = {
  entry: {
    popup: './src/popup.ts',
    // background: './src/background.ts',
    'worker-history': './src/worker-history.ts',
    settings: './src/settings.ts',
    'editor.worker': 'monaco-editor/esm/vs/editor/editor.worker.js',
    'css.worker': 'monaco-editor/esm/vs/language/css/css.worker',
  },
  output: {
    globalObject: 'globalThis',
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /background\.ts$/,
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
      {
        test: /\.(scss|css)$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'sass-loader',
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  target: ['web', 'es2021'],
  cache: true,
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    new CopyPlugin({
      patterns: [
        { from: '*.*', context: 'src/assets/' },
        { from: '*.html', context: 'src/view/' },
        { from: '*.png', context: 'src/images/' },
        { from: '*.json', context: 'src/_locales/en/', to: '_locales/en' },
        { from: '*.json', context: 'src/_locales/ja/', to: '_locales/ja' },
      ],
    }),
    new ESLintPlugin({
      extensions: ['.ts', '.js'],
      exclude: 'node_modules',
    }),
    new CleanWebpackPlugin(),
    new WebpackNotifierPlugin({ alwaysNotify: true }),
  ],
};
