// Render public/icons/icon.svg to the PNG sizes the manifest needs.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { browserPath } from './browser';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: browserPath() });
const page = await browser.newPage();
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.1], ['apple-touch-icon.png', 180, 0]] as const) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<body style="margin:0;background:#3f8cff;display:grid;place-items:center;height:100vh">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: false });
}
await browser.close();
console.log('icons written');
