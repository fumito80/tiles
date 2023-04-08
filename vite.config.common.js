module.exports = {
  root: 'src',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: '[name].mjs',
        assetFileNames: '[name].[ext]',
      },
    },
  },
};
