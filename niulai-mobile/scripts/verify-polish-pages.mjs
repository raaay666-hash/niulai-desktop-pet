import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('../../niulai-android/node_modules/playwright');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(project, 'dist');
const output = path.resolve(project, '../outputs/polish-20261113/site');
await fs.mkdir(output, { recursive: true });
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(dist, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
  if (!file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const bytes = await fs.readFile(file);
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf' }[path.extname(file)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = process.env.NIULAI_PAGE_ORIGIN || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-gpu'] });
const checks = [], errors = [];
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, colorScheme: 'light', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/download/');
    assert.equal(await page.getByRole('link', { name: '下载 Android 安装版', exact: true }).getAttribute('href'), '/files/Niulai-Android-1.4.0.apk');
    assert.equal(await page.getByRole('link', { name: '下载 Windows 安装版', exact: true }).getAttribute('href'), '/files/Niulai-1.6.0-Setup-x64.exe');
    assert.equal(await page.getByRole('link', { name: '下载免安装版', exact: true }).getAttribute('href'), '/files/Niulai-1.6.0-portable-x64.exe');
    assert.equal(await page.getByRole('link', { name: '下载 Apple 芯片版', exact: true }).getAttribute('href'), '/files/Niulai-1.6.0-mac-arm64.dmg');
    assert.equal(await page.getByRole('link', { name: '下载 Intel 芯片版', exact: true }).getAttribute('href'), '/files/Niulai-1.6.0-mac-x64.dmg');
    assert.match(await page.locator('.version-update').textContent(), /1\.6\.0.*1\.4\.0/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.getByRole('link', { name: /过往版本/ }).count(), 1);
    await page.screenshot({ path: path.join(output, `download-${viewport.width}.png`), fullPage: true });
    await page.locator('#versions').screenshot({ path: path.join(output, `online-versions-${viewport.width}.png`) });
    await page.getByRole('link', { name: /过往版本/ }).click();
    await page.waitForURL('**/download/history/');
    assert.equal(await page.getByRole('heading', { name: '过往版本', exact: true }).count(), 1);
    const links = await page.locator('a[download]').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), label: node.textContent })));
    assert.equal(links.length, 13);
    for (const link of links) assert.match(link.href, /^\/(files|android)\//);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `history-${viewport.width}.png`), fullPage: true });
    await page.goto(origin + '/download/updates/');
    assert.equal(await page.getByRole('heading',{name:'更新记录',exact:true}).count(),1);
    assert.equal(await page.locator('.release-entry').count(),2);
    assert.match(await page.locator('.release-platforms').first().textContent(),/1\.6\.0.*1\.4\.0/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(output,'updates-'+viewport.width+'.png'),fullPage:true});
    await context.close();
    checks.push({ viewport, latestLinks: true, historyLinks: links, noHorizontalOverflow: true });
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'page-verification.json'), JSON.stringify({ passed: true, origin, checks, errors }, null, 2));
  console.log('Download and history pages pass desktop/mobile navigation, link and layout checks');
} finally { await browser.close(); server.close(); }
