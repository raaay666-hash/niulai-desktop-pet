import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { _electron } = require('../niulai-android/node_modules/playwright');
const root = path.resolve(import.meta.dirname, '..');
const output = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/polish-20261113/updates');
await fs.mkdir(output, {recursive:true});
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'niulai-updates-'));
const app = await _electron.launch({executablePath:process.env.NIULAI_QA_EXECUTABLE || require('electron'), args:[...(process.env.NIULAI_QA_EXECUTABLE?[]:[root]),'--qa-user-data-dir='+profile],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'))});
const checks=[];
try {
  const page=await app.firstWindow();await page.waitForFunction(()=>window.__NIULAI_RENDERER_READY__);
  await app.evaluate(({shell})=>{
    globalThis.__updateOffline=false;globalThis.__updateRequests=0;globalThis.__openedUpdateUrls=[];
    const original=globalThis.fetch;
    globalThis.fetch=async(url,...args)=>{
      if(String(url)!=='https://niulai.raaay.art/updates.json')return original(url,...args);
      globalThis.__updateRequests++;await new Promise(r=>setTimeout(r,250));
      if(globalThis.__updateOffline)throw Error('fixture offline');
      return new Response(JSON.stringify({schema:1,releases:{desktop:{status:'published',version:'99.0.0',publishedAt:'2026-01-01T00:00:00Z',url:'https://niulai.raaay.art/download/#versions',notes:['测试更新说明']}}}));
    };
    shell.openExternal=async url=>{globalThis.__openedUpdateUrls.push(url);};
  });
  await page.locator('[data-tab=settings]').click();await page.locator('[data-settings-panel=general]').click();
  await page.locator('#check-update').click();await page.waitForFunction(()=>document.getElementById('check-update').disabled);
  await page.locator('#update-banner').waitFor({state:'visible'});
  assert.match(await page.locator('#update-title').textContent(),/99.0.0/);
  assert.match(await page.locator('#update-note').textContent(),/测试更新说明/);
  checks.push('A newer published release shows its version, notes and persistent in-app banner');
  await page.locator('#update-download').click();
  assert.deepEqual(await app.evaluate(()=>globalThis.__openedUpdateUrls),['https://niulai.raaay.art/download/#versions']);
  checks.push('Download opens only the official site');
  await page.locator('[data-setting=updateNotifications]').uncheck();
  assert.equal((await page.evaluate(()=>window.desktopPet.bootstrap())).state.settings.updateNotifications,false);
  await app.evaluate(()=>{globalThis.__updateOffline=true;});await page.locator('#check-update').click();
  await page.waitForFunction(()=>!document.getElementById('check-update').disabled);
  assert.match(await page.locator('#update-status').textContent(),/重试/);
  assert.equal(await page.locator('#update-banner').isVisible(),true);
  checks.push('Notification preference persists and network failure keeps the known update');
  await fs.writeFile(path.join(output,'update-ui.json'),JSON.stringify({passed:true,checks,fixture:'Controlled future release, external navigation captured; no OS notification sent'},null,2));
  console.log(checks.join('\n'));
} finally {await app.close();}
