const path = require('path');
/* eslint-disable import/no-extraneous-dependencies */
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const WebpackNotifierPlugin = require('webpack-notifier');

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  watchOptions: {
    poll: true,
    ignored: [path.resolve(__dirname, 'src/background.ts')],
  },
  entry: {
    'three-svg': './src/images/three-svg.ts',
  },
  output: {
    globalObject: 'globalThis',
    filename: '[name].js',
    path: path.resolve(__dirname, 'src/images'),
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /sw\.ts$/,
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  target: ['web', 'es2022'],
  cache: true,
  plugins: [
    new ESLintPlugin({
      extensions: ['.ts', '.js'],
      exclude: 'node_modules',
    }),
    new WebpackNotifierPlugin({ alwaysNotify: true }),
  ],
};
