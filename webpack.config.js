const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');

module.exports = {
  devtool: 'inline-source-map',
  entry: {
    popup: './src/popup.ts',
    background: './src/background.ts',
    settings: './src/settings.ts',
    'editor.worker': 'monaco-editor/esm/vs/editor/editor.worker.js',
    'css.worker': 'monaco-editor/esm/vs/language/css/css.worker',
  },
  output: {
    globalObject: 'self',
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
            },
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
  target: ['web', 'es2020'],
  cache: true,
  watchOptions: {
    poll: true,
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    new CopyPlugin({
      patterns: [
        { from: '*.html', context: 'src/' },
        { from: '*.json', context: 'src/' },
        { from: '*.css', context: 'src/' },
        { from: '*.js', context: 'src/' },
      ],
    }),
    new ESLintPlugin({
      extensions: ['.ts', '.js'],
      exclude: 'node_modules',
    }),
  ],
};
