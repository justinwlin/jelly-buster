import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/** The commit this build came from (shown on the home screen), "-dirty" if built with uncommitted changes. */
function buildSha() {
  const git = (cmd: string) => execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    return git('rev-parse --short HEAD') + (git('status --porcelain') ? '-dirty' : '');
  } catch {
    return (process.env.GITHUB_SHA ?? 'unknown').slice(0, 7);
  }
}

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true, watch: { ignored: ['**/e2e-out/**'] } },
  preview: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  build: { target: 'es2022' },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(buildSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Jelly Buster',
        short_name: 'Jelly Buster',
        description: 'Send jellies around the belt to munch every cube of the picture.',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        background_color: '#76c3ff',
        theme_color: '#76c3ff',
        categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'], globIgnores: ['**/icon-512.png', '**/icon-maskable-512.png'] },
    }),
  ],
});
