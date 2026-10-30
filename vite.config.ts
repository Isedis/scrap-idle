/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages serves the game from /scrap-idle/.
export default defineConfig({
  base: '/scrap-idle/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: { include: ['tests/**/*.test.ts'] },
});
