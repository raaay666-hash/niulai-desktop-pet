import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { _electron } = require('../niulai-android/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const output = path.join(root, 'outputs/macos-release');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'niulai-macos-release-'));
const appDirectory = (await fs.readdir(release)).find(name => name === 'mac' || name === 'mac-arm64');
assert.ok(appDirectory, 'Packaged macOS application directory exists');
const executablePath = path.join(release, appDirectory, '牛来盯盘.app/Contents/MacOS/牛来盯盘');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
await fs.mkdir(output, { recursive: true });
const errors = [];
const application = await _electron.launch({ executablePath, args: ['--qa-user-data-dir=' + profile], cwd: root, env });
try {
  application.on('window', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await application.firstWindow();
  await page.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
  const bootstrap = await page.evaluate(() => window.desktopPet.bootstrap());
  assert.equal(bootstrap.version, '1.5.0');
  assert.ok(bootstrap.state.stocks.length > 0);
  await page.waitForFunction(() => {
    const pixels = document.getElementById('bull').getContext('2d').getImageData(0, 0, 384, 384).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 100);
  });
  await page.locator('[data-tab=settings]').click();
  await page.locator('[data-settings-panel=general]').click();
  await page.locator('#settings-content [data-setting=theme]').selectOption('light');
  await page.locator('[data-tab=muyu]').click();
  await page.screenshot({ path: path.join(output, 'application.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({
    version: bootstrap.version, platform: process.platform, arch: process.arch,
    checks: ['native packaged application starts', 'renderer initializes', 'default watchlist loads',
      'frame assets draw', 'settings and wood-fish page open', 'no renderer exceptions'], errors
  }, null, 2));
  console.log('macOS packaged application verification passed');
} finally {
  await application.close();
}
