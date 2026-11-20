// Captures Vice Cover Studio's screenshots and verifies the app end to end, using
// Chrome for Testing through playwright-core (resolved from the earlier GTA 6 work's
// node_modules). Serves app/ with the repo's own serve.ts, then:
//   1. shoots every scene in shots.json into screenshots/ (JPEG, quality 85),
//   2. runs ?shot=export and checks the export path's PNG dimensions for all 3 sizes,
//   3. smoke-tests the editor: click a sample, switch layout, edit the title, and
//      confirms the canvas actually changes and no request leaves the machine.
// Usage: node capture/capture-cover.mjs [--port 8091]
// Exit code 0 only when every check passes.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/hatch/workspace/gta6-work/capture/x.js');
const { chromium } = require('playwright-core');

const CFT = '/home/hatch/workspace/gta6-work/cft/chrome-linux64/chrome';
const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const get = (k, d) => {
  const i = argv.indexOf(k);
  return i === -1 ? d : argv[i + 1];
};
const port = Number(get('--port', '8091'));
const shots = JSON.parse(readFileSync(join(REPO, 'shots.json'), 'utf8'));

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: REPO, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('serve.ts did not start')), 15000);
  server.stdout.on('data', () => {
    clearTimeout(timer);
    resolve();
  });
  server.on('error', reject);
});
console.log(`serving app/ on http://127.0.0.1:${port}`);

const browser = await chromium.launch({
  executablePath: CFT,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

let failed = false;
const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  failed = true;
};

async function trackPage(page) {
  const problems = { errors: [], failedReqs: [], external: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') problems.errors.push(m.text());
  });
  page.on('pageerror', (e) => problems.errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.failedReqs.push(`${r.url()} :: ${r.failure()?.errorText || ''}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(`http://127.0.0.1:${port}`) && !u.startsWith(`http://localhost:${port}`) && !u.startsWith('data:') && !u.startsWith('blob:')) {
      problems.external.push(u);
    }
  });
  return problems;
}

function report(tag, problems) {
  if (problems.errors.length) console.log(`  [${tag}] console errors: ${JSON.stringify(problems.errors.slice(0, 5))}`);
  if (problems.failedReqs.length) console.log(`  [${tag}] failed requests: ${JSON.stringify(problems.failedReqs.slice(0, 5))}`);
  if (problems.external.length) console.log(`  [${tag}] external requests: ${JSON.stringify(problems.external.slice(0, 5))}`);
  if (problems.errors.length || problems.failedReqs.length || problems.external.length) fail(tag);
}

// 1. Screenshot scenes from shots.json.
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
  const problems = await trackPage(page);
  await page.goto(`http://127.0.0.1:${port}/index.html${shot.query}`, { waitUntil: 'load', timeout: 60000 });
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 60000 });
  } catch {
    fail(`${shot.name}: timeout waiting for __shotReady`);
  }
  await page.waitForTimeout(400);
  const out = join(REPO, 'screenshots', shot.name);
  await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
  const bytes = statSync(out).size;
  console.log(`[${shot.name}] ${shot.w}x${shot.h} -> ${bytes} bytes${bytes > 262144 ? ' OVER 256 KiB' : ''}`);
  if (bytes > 262144) fail(`${shot.name} over 256 KiB`);
  report(shot.name, problems);
  await page.close();
}

// 2. Export path self-test: all three sizes, exact dimensions, non-trivial PNG bytes.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = await trackPage(page);
  await page.goto(`http://127.0.0.1:${port}/index.html?shot=export`, { waitUntil: 'load', timeout: 60000 });
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 60000 });
  } catch {
    fail('export: timeout waiting for __shotReady');
  }
  const info = await page.evaluate(() => window.__exportInfo);
  console.log('[export] __exportInfo =', JSON.stringify(info));
  const want = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1920x1080': [1920, 1080] };
  for (const row of info ?? []) {
    const [w, h] = want[row.size] ?? [0, 0];
    if (row.width !== w || row.height !== h) fail(`export ${row.size}: got ${row.width}x${row.height}`);
    if (!row.bytes || row.bytes < 10000) fail(`export ${row.size}: suspicious byte count ${row.bytes}`);
  }
  if ((info ?? []).length !== 3) fail(`export: expected 3 sizes, got ${(info ?? []).length}`);
  report('export', problems);
  await page.close();
}

// 3. Editor smoke test: load a sample, switch layout, edit the title.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = await trackPage(page);
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => {
    const c = document.getElementById('cover');
    return c.toDataURL('image/png').length;
  });
  await page.click('button[data-sample="2-street"]');
  await page.click('button[data-layout="grid"]');
  await page.click('button[data-grade="neon"]');
  await page.fill('#title', 'Vice Nights');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const c = document.getElementById('cover');
    const s = window.__state;
    return {
      dataUrlLen: c.toDataURL('image/png').length,
      layout: s.layout,
      grade: s.grade,
      title: s.title,
      photo0: (s.photos[0] && (s.photos[0].currentSrc || s.photos[0].src)) || '',
      photos: s.photos.filter(Boolean).length,
      canvasW: c.width,
      canvasH: c.height,
    };
  });
  console.log('[editor] before dataUrlLen =', before, 'after =', JSON.stringify(after));
  if (after.dataUrlLen === before) fail('editor: canvas did not change after edits');
  if (after.layout !== 'grid' || after.grade !== 'neon' || after.title !== 'Vice Nights') fail('editor: state did not update');
  if (!after.photo0.includes('2-street')) fail('editor: sample click did not fill the selected panel');
  report('editor', problems);
  await page.close();
}

await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
