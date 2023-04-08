/* eslint-disable import/no-extraneous-dependencies */
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const common = require('./webpack.common');

module.exports = {
  ...common,
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
  },
  devtool: 'inline-source-map',
  watchOptions: {
    poll: true,
    ignored: [path.resolve(__dirname, 'src/background.ts')],
  },
  plugins: [
    ...common.plugins,
    new CleanWebpackPlugin(),
    new CopyPlugin({
      patterns: [
        { from: '**/*', context: 'src/assets/' },
        { from: '**/*', context: 'vite-work/' },
      ],
    }),
  ],
};
