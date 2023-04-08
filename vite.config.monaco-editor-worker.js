const { build: { rollupOptions, ...rest } } = require('./vite.config.monaco-worker.common');

module.exports = {
  build: {
    ...rest,
    rollupOptions: {
      ...rollupOptions,
      input: {
        'editor.worker': 'monaco-editor/esm/vs/editor/editor.worker.js',
      },
    },
  },
};
