const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
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
  target: ['web', 'es2021'],
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
        { from: '*.html', context: 'src/view/' },
        { from: '*.json', context: 'src/json/' },
        { from: '*.css', context: 'src/css/' },
        // { from: '*.js', context: 'src/' },
        { from: '*.png', context: 'src/images/' },
      ],
    }),
    new ESLintPlugin({
      extensions: ['.ts', '.js'],
      exclude: 'node_modules',
    }),
    new CleanWebpackPlugin(),
  ],
};
