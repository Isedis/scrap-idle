/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };
import release from './release.json' with { type: 'json' };
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const git = promisify(execFile);

// Unique per build: the commit on CI, the time locally.
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 7) ?? `local-${Date.now()}`;

// Credit is explicit on each release commit, including shallow CI checkouts.
const message = (await git('git', ['log', '-1', '--format=%B'])).stdout;
const credit = /^Release-Author: Codex$/m.test(message) && release.author === 'Codex'
  ? release : { author: null, summary: '' };

/** Writes version.json next to the game so an open copy can tell a newer build is out. */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID, ...credit }) });
      const files = [...new Set([...Object.keys(bundle), 'index.html', 'icon.svg', 'manifest.webmanifest'])];
      const source = readFileSync('scripts/service-worker.js', 'utf8')
        .replace('__SW_BUILD__', JSON.stringify(BUILD_ID))
        .replace('__SW_FILES__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// GitHub Pages serves the game from /scrap-idle/.
export default defineConfig({
  base: '/scrap-idle/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __RELEASE_AUTHOR__: JSON.stringify(credit.author),
    __RELEASE_SUMMARY__: JSON.stringify(credit.summary),
  },
  plugins: [versionFile()],
  test: { include: ['tests/**/*.test.ts'] },
});
