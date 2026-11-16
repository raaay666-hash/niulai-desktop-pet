import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { connectQaWebView } from '../tests/cdp-client.mjs';
import { loadChart } from '../web/market-chart-data.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const serial = process.env.NIULAI_QA_SERIAL;
assert.equal(serial, '127.0.0.1:16448', 'Use the dedicated Niulai QA emulator');
const emulator = JSON.parse(execFileSync('D:/Program Files/Netease/MuMu/nx_main/mumu-cli.exe', ['info', '-v', '2'], { encoding: 'utf8', windowsHide: true }));
assert.equal(emulator.name, 'Niulai-Android-QA');
const adb = path.join(root, '.tools/android-sdk/platform-tools/adb.exe');
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 12000000 });
const shell = (...args) => run('shell', ...args);
const output = path.join(root, 'outputs/market-chart-20261116/android/system-island');
fs.mkdirSync(output, { recursive: true });
const checks = [], history = [];
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, limit = 20000) {
  const end = Date.now() + limit;
  while (Date.now() < end) { if (await predicate()) return; await delay(200); }
  throw new Error('Timed out waiting for ' + label);
}
let client;
try {
  shell('am', 'force-stop', 'art.niulai.android');
  shell('pm', 'grant', 'art.niulai.android', 'android.permission.POST_NOTIFICATIONS');
  shell('appops', 'set', 'art.niulai.android', 'SYSTEM_ALERT_WINDOW', 'ignore');
  shell('am', 'instrument', 'art.niulai.qa/.FeatureInstrumentation');
  let socket;
  await until(() => {
    socket = shell('cat', '/proc/net/unix').match(/@(webview_devtools_remote_[0-9]+)/)?.[1];
    return Boolean(socket);
  }, 'instrumented WebView');
  run('forward', 'tcp:9223', 'localabstract:' + socket);
  await until(async () => {
    try { client = await connectQaWebView(); return true; } catch { return false; }
  }, 'QA connection');
  const ui = code => client.evaluate(code);
  await until(() => ui('window.__niulaiReady === true'), 'normal Android entry');
  const initial = await ui('JSON.parse(window.NiulaiNative.islandStatus())');
  assert.equal(initial.sdk, 35);
  pass('release APK reports actual Android version, notification permission and promotion state');
  let sequence = 9000000;
  for (const code of ['s_sh600519', 'rt_hk00700', 'gb_aapl']) {
    const result = await loadChart(value => ui(`new Promise((resolve,reject)=>{
      const id=${JSON.stringify(String(++sequence))};
      const previous=window.__niulaiResult;
      const timer=setTimeout(()=>{window.__niulaiResult=previous;reject(Error('native timeout'));},15000);
      window.__niulaiResult=(key,text,error)=>{
        if(key!==id){previous(key,text,error);return;}
        clearTimeout(timer);window.__niulaiResult=previous;
        if(error)reject(Error(error));else resolve(text);
      };
      window.NiulaiNative.request(id,'history',${JSON.stringify(value)});
    })`), code, 'day');
    assert.ok(result.bars.length > 100);
    history.push({ code, bars: result.bars.length, last: result.bars.at(-1).date, adjusted: result.adjusted });
  }
  pass('installed APK fetches live mainland, Hong Kong and US history through the real Java gateway');
  await ui(`document.getElementById('settings-open').click();document.querySelector('[data-settings=pet]').click();if(document.getElementById('petEnabled').checked)document.getElementById('petEnabled').click();document.querySelector('[data-settings=island]').click();`);
  await ui(`(()=>{const mode=document.getElementById('islandMode');mode.value='system';mode.dispatchEvent(new Event('change',{bubbles:true}));if(document.getElementById('islandHideInApp').checked)document.getElementById('islandHideInApp').click();if(!document.getElementById('islandEnabled').checked)document.getElementById('islandEnabled').click();})()`);
  await until(() => ui('JSON.parse(window.NiulaiNative.islandStatus()).posted'), 'system notification');
  assert.equal(await ui('JSON.parse(window.NiulaiNative.deviceInfo()).overlay'), false);
  assert.doesNotMatch(shell('dumpsys', 'window', 'windows'), /u0 Niulai Quote Island}/);
  pass('system mode starts without overlay permission and uses a system notification surface');
  const posted = await ui('JSON.parse(window.NiulaiNative.islandStatus())');
  assert.equal(posted.promoted, false);
  assert.match(await ui('document.getElementById("island-system-status").textContent'), /尚未提供/);
  pass('Android 15 accurately reports unavailable promotion instead of claiming a successful island');
  await ui('document.getElementById("island-check-status").click()');
  const image = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, 'system-status.png'), Buffer.from(image.data, 'base64'));
  await ui('document.getElementById("islandEnabled").click()');
  await until(() => ui('!JSON.parse(window.NiulaiNative.islandStatus()).posted'), 'notification removal');
  pass('disabling the system island removes its ongoing notification');
  await ui(`(()=>{const mode=document.getElementById('islandMode');mode.value='floating';mode.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  shell('appops', 'set', 'art.niulai.android', 'SYSTEM_ALERT_WINDOW', 'allow');
  await ui('document.getElementById("islandEnabled").click()');
  await until(() => /u0 Niulai Quote Island}/.test(shell('dumpsys', 'window', 'windows')), 'explicit floating mode');
  pass('the explicit floating-window mode remains available');
  await ui('document.getElementById("islandEnabled").click()');
  await until(() => !/u0 Niulai Quote Island}/.test(shell('dumpsys', 'window', 'windows')), 'floating window removal');
  const pid = shell('pidof', 'art.niulai.android').trim();
  assert.doesNotMatch(run('logcat', '-d', '--pid=' + pid, '-s', 'AndroidRuntime:E'), /FATAL EXCEPTION/);
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ passed: true, checks, history, initial, posted, limitation: 'Android 15 emulator verifies notification transport and fallback. Android 16 promotion and HyperOS 3.0.305.0 physical island placement require device verification.' }, null, 2));
} finally {
  client?.close();
  try { shell('am', 'broadcast', '-a', 'art.niulai.qa.DONE', '-p', 'art.niulai.android'); } catch {}
  try { run('forward', '--remove', 'tcp:9223'); } catch {}
  try { run('uninstall', 'art.niulai.qa'); } catch {}
}
