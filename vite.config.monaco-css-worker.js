const { build: { rollupOptions, ...rest } } = require('./vite.config.monaco-worker.common');

module.exports = {
  build: {
    ...rest,
    rollupOptions: {
      ...rollupOptions,
      input: {
        'css.worker': 'monaco-editor/esm/vs/language/css/css.worker',
      },
    },
  },
};
