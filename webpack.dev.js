const path = require('path');
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
};
