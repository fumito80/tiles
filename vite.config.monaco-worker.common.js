module.exports = {
  build: {
    mode: 'production',
    outDir: 'src/assets',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        inlineDynamicImports: true,
      },
    },
  },
};
