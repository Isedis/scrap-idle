/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

// Unique per build: the commit on CI, the time locally.
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 7) ?? `local-${Date.now()}`;

/** Writes version.json next to the game so an open copy can tell a newer build is out. */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

// GitHub Pages serves the game from /scrap-idle/.
export default defineConfig({
  base: '/scrap-idle/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [versionFile()],
  test: { include: ['tests/**/*.test.ts'] },
});
