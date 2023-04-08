const { build: { rollupOptions, ...rest } } = require('./vite.config.monaco-worker.common');

module.exports = {
  build: {
    ...rest,
    rollupOptions: {
      ...rollupOptions,
      input: {
        'worker-history': './src/worker-history.ts',
      },
    },
  },
};
