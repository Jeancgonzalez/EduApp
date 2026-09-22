const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{js,mjs,cjs}'],
    globals: true,
    hookTimeout: 20000,
    testTimeout: 20000,
  },
});
