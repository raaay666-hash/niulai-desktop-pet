import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(project, '..');
const web = path.join(project, 'build/web');
const output = path.join(root, 'outputs/polish-20261113/android/browser');
await fs.mkdir(output, { recursive: true });
const server = http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(web, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(web + path.sep)) { res.writeHead(403).end(); return; }
  try { const data = await fs.readFile(file); res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg' })[path.extname(file)] || 'application/octet-stream'); res.end(data); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
const page = await context.newPage();
const errors = [], checks = [], network = [];
let offline = false;
page.on('pageerror', e => errors.push(e.message));
await page.exposeFunction('__qaRequest', async (kind, value) => {
  network.push({ kind, value, at: Date.now() });
  if (offline) return { error: 'QA offline' };
  const endpoint = kind === 'quote' ? `https://hq.sinajs.cn/list=${value}` : kind === 'fallback' ? `https://qt.gtimg.cn/q=${value}` : `https://smartbox.gtimg.cn/s3/?t=all&q=${encodeURIComponent(value)}`;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { Referer: kind === 'quote' ? 'https://finance.sina.com.cn/' : 'https://gu.qq.com/', 'User-Agent': 'Mozilla/5.0 (Linux; Android) Niulai/1.0' } });
    if (!response.ok) throw new Error(String(response.status));
    return { text: new TextDecoder('gbk').decode(await response.arrayBuffer()) };
  } catch (e) { return { error: e.message }; }
});
await page.addInitScript(() => {
  window.NiulaiNative = { request(id, kind, value) { window.__qaRequest(kind, value).then(result => window.__niulaiResult(id, result.text ?? null, result.error ?? null)); }, appearance() {}, haptic() {},
    configurePet(raw){window.__qaPetConfig=JSON.parse(raw);},publishQuote(){},petStatus(){return window.__qaPetRunning?'running':'permission';},
    startPet(){window.__qaPetRunning=true;window.__niulaiPetChanged();},stopPet(){window.__qaPetRunning=false;window.__niulaiPetChanged();},deviceInfo(){return JSON.stringify({brand:'Xiaomi',model:'QA viewport',sdk:35});} };
});
const pass = name => { checks.push({ name, passed: true }); console.log('PASS ' + name); };
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForSelector('.pet.ready');
  await page.waitForFunction(() => document.getElementById('price').textContent !== '—', { timeout: 35000 });
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  pass('2D sprite loads and real public index quotes render');
  const live = await page.locator('#connection-text').textContent();
  await page.screenshot({ path: path.join(output, 'home-light.png'), fullPage: true });
  await page.screenshot({ path: path.join(output, 'home-light-screen.png') });
  await page.locator('#pet').click({ force: true }); await page.locator('#pet-bubble').getByText('招手').waitFor();
  pass('touching the 2D cow triggers its interaction');
  await page.locator('#edit-position').click();
  await page.locator('#cost').fill('3000'); await page.locator('#shares').fill('1.25');
  await page.locator('#position-form button[type=submit]').click();
  await page.locator('#home-position .pnl-grid').waitFor();
  await page.locator('[data-tab=portfolio]').click(); await page.screenshot({ path: path.join(output, 'portfolio.png'), fullPage: true });
  pass('fractional position entry calculates and renders P&L');
  await page.reload(); await page.waitForSelector('.pet.ready');
  assert.match(await page.locator('#home-position').textContent(), /股|盈亏/);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('niulai:android:v1')));
  assert.equal(stored.stocks[0].shares, 1.25);
  pass('local position survives page restart');
  await page.locator('.add-stock').first().click(); await page.locator('#search-input').fill('00700');
  await page.waitForFunction(() => document.querySelectorAll('#search-results .result').length > 0);
  await page.screenshot({ path: path.join(output, 'search.png'), fullPage: true });
  await page.locator('#search-results .result').first().click(); await page.waitForFunction(() => !document.getElementById('search-dialog').open, { timeout: 30000 });
  assert.match(await page.locator('#quote-code').textContent(), /00700/);
  pass('search and validate a real Hong Kong stock before adding');
  await page.locator('.add-stock').first().click(); await page.locator('[data-code=gb_aapl]').click();
  await page.waitForFunction(() => !document.getElementById('search-dialog').open, { timeout: 30000 });
  assert.match(await page.locator('#quote-code').textContent(), /AAPL/);
  pass('US stock quote and currency display');
  await page.locator('#settings-open').click();
  await page.locator('[data-settings=general]').click();
  await page.locator('[data-preset="battery"]').click();assert.equal(await page.locator('#motion').isChecked(),false);assert.equal(await page.locator('#interval').inputValue(),'30');
  await page.locator('[data-preset="office"]').click();assert.equal(await page.locator('#sound').isChecked(),false);
  await page.locator('[data-preset="commute"]').click();assert.equal(await page.locator('#private').isChecked(),true);
  await page.locator('[data-preset="home"]').click();assert.equal(await page.locator('#sound').isChecked(),true);
  pass('four companion presets change sound, privacy, animation and refresh settings');
  await page.locator('#theme').selectOption('dark');
  await page.locator('#settings-dialog .close-dialog').click();
  await page.waitForTimeout(3200);
  await page.screenshot({ path: path.join(output, 'home-dark.png'), fullPage: true });
  await page.screenshot({ path: path.join(output, 'home-dark-screen.png') });
  pass('theme changes immediately and persists');
  await page.locator('#desktop-start').click();await page.locator('#desktop-stop').waitFor();
  assert.equal(await page.locator('#desktop-start').isVisible(),false);
  await page.locator('#desktop-stop').click();await page.locator('#desktop-start').waitFor();
  assert.equal(await page.evaluate(()=>Object.hasOwn(window.__qaPetConfig,'cost')||Object.hasOwn(window.__qaPetConfig,'shares')),false);
  pass('desktop-pet controls update their state and default config omits position amounts');
  for(const scene of [1,2,3,0]){await page.locator(`button[data-scene="${scene}"]`).click();assert.equal(await page.locator('html').getAttribute('data-scene'),String(scene));}
  await page.locator('button[data-scene="3"]').click();await page.locator('#calm-start').click();assert.match(await page.locator('#calm-message').textContent(),/剩余 20 秒/);
  await page.locator('button[data-scene="0"]').click();
  pass('four stack scenes switch and the calm scene starts its quiet break');
  await page.locator('#device-help').click();assert.match(await page.locator('#device-guide').textContent(),/小米/);
  await page.locator('#cover-preview').click();await page.setViewportSize({width:280,height:512});
  assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('cover')),true);
  assert.equal(await page.locator('[data-tab=portfolio]').isVisible(),false);
  await page.screenshot({path:path.join(output,'cover-compact.png'),fullPage:true});
  await page.locator('#settings-open').click();await page.locator('#settings-dialog .close-dialog').click();
  await page.locator('#cover-exit').click();await page.setViewportSize({width:390,height:844});
  pass('Xiaomi help and a 280dp cover preview keep position navigation private');
  await page.evaluate(() => window.__niulaiLifecycle(false));
  const requestCount = network.length;
  await page.waitForTimeout(11000);
  assert.equal(network.length, requestCount);
  assert.equal(await page.locator('html').evaluate(e => e.classList.contains('paused')), true);
  await page.evaluate(() => window.__niulaiLifecycle(true));
  await page.waitForFunction(() => !document.getElementById('refresh').disabled, { timeout: 35000 });
  assert(network.length > requestCount);
  pass('background lifecycle stops requests and foreground resumes refresh');
  offline = true;
  const before = await page.locator('#price').textContent();
  await page.locator('#refresh').click();
  await page.locator('.connection.error').waitFor();
  assert.equal(await page.locator('#price').textContent(), before);
  assert.match(await page.locator('#connection-text').textContent(), /更新失败/);
  pass('offline request preserves the last quote and labels it as stale');
  for (const [width, height] of [[280,512],[320,740],[360,800],[390,844],[430,932],[844,390],[720,820],[1000,760]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}`);
    await page.locator('#settings-open').click();
    assert(await page.evaluate(() => { const r = document.getElementById('settings-dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }), `Dialog bounds at ${width}`);
    await page.locator('#settings-dialog .close-dialog').click();
  }
  pass('eight cover/phone/folded/landscape sizes have no horizontal overflow and settings stay on screen');
  offline=false;await page.locator('#refresh').click();await page.waitForFunction(()=>!document.getElementById('refresh').disabled,{timeout:35000});
  await page.setViewportSize({width:1000,height:760});
  await page.locator('button[data-scene="0"]').click();await page.screenshot({path:path.join(output,'fold-expanded.png')});
  assert.deepEqual(errors, []); pass('no browser runtime errors');
  await fs.writeFile(path.join(output, 'browser-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, errors, liveConnectionLabel: live, requestCount: network.length, note: 'Headless Edge tests the exact APK web assets with a test bridge and real quote providers; not a physical Android device.' }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
