// Render every picture in a pack (or all packs) to a contact sheet PNG.
// Usage: npx tsx scripts/art-preview.ts [pack] → e2e-out/art-<pack>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { browserPath } from './browser';
import { COLORS } from '../src/sim/art';
import { PACKS } from '../src/sim/pictures';

const want = process.argv[2];
mkdirSync('e2e-out', { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath() });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
for (const pack of PACKS) {
  if (want && pack.id !== want) continue;
  const html = `<body style="margin:0;background:#2b2733;font:14px sans-serif;color:#fff"><div id="g" style="display:flex;flex-wrap:wrap;gap:14px;padding:14px;width:1172px"></div><script>
    const arts = ${JSON.stringify(pack.pictures)}; const C = ${JSON.stringify(COLORS)};
    for (const a of arts) {
      const cs = 9, w = Math.max(...a.rows.map(r => r.length)), h = a.rows.length;
      const d = document.createElement('div'); d.style.textAlign='center';
      const c = document.createElement('canvas'); c.width = w*cs; c.height = h*cs; const x = c.getContext('2d');
      a.rows.forEach((r, y) => [...r].forEach((ch, i) => { if (ch === '.') return; x.fillStyle = C[ch] || '#f0f'; x.fillRect(i*cs, y*cs, cs-1, cs-1); }));
      const counts = {}; a.rows.join('').replace(/\\./g,'').split('').forEach(ch => counts[ch]=(counts[ch]||0)+1);
      d.append(c, document.createElement('br'), a.name + ' ' + w + 'x' + h + ' ' + Object.entries(counts).map(([k,v])=>k+v).join(' '));
      document.getElementById('g').append(d);
    }</script></body>`;
  await page.setContent(html);
  await page.screenshot({ path: `e2e-out/art-${pack.id}.png`, fullPage: true });
  console.log(`e2e-out/art-${pack.id}.png`);
}
await browser.close();
