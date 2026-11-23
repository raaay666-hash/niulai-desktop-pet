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
const output = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/market-chart-20261116/android/system-island');
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
  assert.equal(posted.fallback, true);
  assert.equal(posted.floating, false);
  assert.match(await ui('document.getElementById("island-system-status").textContent'), /尚未提供/);
  assert.equal(await ui('document.getElementById("island-overlay-settings").hidden'), false);
  pass('Android 15 accurately reports unavailable promotion instead of claiming a successful island');
  await ui('document.getElementById("island-check-status").click()');
  const image = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, 'system-status.png'), Buffer.from(image.data, 'base64'));
  shell('input', 'keyevent', 'KEYCODE_HOME');
  shell('appops', 'set', 'art.niulai.android', 'SYSTEM_ALERT_WINDOW', 'allow');
  shell('am', 'start', '-n', 'art.niulai.android/.MainActivity');
  await until(() => ui(`(() => { const status = JSON.parse(window.NiulaiNative.islandStatus()); return status.floatingVisible && !status.posted; })()`), 'fallback replaces the ordinary notification once overlay permission is available');
  const fallback = await ui('JSON.parse(window.NiulaiNative.islandStatus())');
  assert.equal(fallback.promoted, false);
  assert.equal(fallback.posted, false);
  assert.equal(await ui('JSON.parse(window.NiulaiNative.restoreAppState()).islandMode'), 'system');
  assert.match(shell('dumpsys', 'window', 'windows'), /u0 Niulai Quote Island}/);
  await until(() => ui('document.getElementById("island-system-status").textContent.includes("顶部悬浮窗")'), 'fallback status');
  fs.writeFileSync(path.join(output, 'fallback-top.png'), execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, timeout: 25000, maxBuffer: 12000000 }));
  pass('system preference remains saved while the permission-backed top overlay takes over');
  await ui(`document.querySelector('[data-settings=pet]').click();document.getElementById('petEnabled').click();document.querySelector('[data-settings=island]').click()`);
  await until(() => /u0 Niulai 2D Pet}/.test(shell('dumpsys', 'window', 'windows')), 'independent desktop pet');
  assert.equal(await ui('JSON.parse(window.NiulaiNative.islandStatus()).floatingVisible'), true);
  pass('the fallback coexists with the independently enabled desktop pet');
  await ui('document.getElementById("islandHideInApp").click()');
  await until(() => ui('!JSON.parse(window.NiulaiNative.islandStatus()).floatingVisible'), 'fallback hides in app');
  shell('input', 'keyevent', 'KEYCODE_HOME');
  await until(() => shell('dumpsys', 'window', 'windows').split(/\n\s*Window #\d+/)
    .some(window => /u0 Niulai Quote Island}/.test(window) && /mViewVisibility=0x0/.test(window)), 'fallback shown on the launcher');
  fs.writeFileSync(path.join(output, 'fallback-launcher.png'), execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true, timeout: 25000, maxBuffer: 12000000 }));
  shell('am', 'start', '-n', 'art.niulai.android/.MainActivity');
  await until(() => ui('!JSON.parse(window.NiulaiNative.islandStatus()).floatingVisible'), 'fallback hides on returning to the app');
  await ui('document.getElementById("preview-island").click()');
  await until(() => ui('JSON.parse(window.NiulaiNative.islandStatus()).floatingVisible'), 'fallback preview in app');
  pass('fallback displays on the launcher, respects in-app hiding and can be previewed');
  await ui('document.getElementById("islandEnabled").click()');
  await until(() => ui('!JSON.parse(window.NiulaiNative.islandStatus()).posted && !JSON.parse(window.NiulaiNative.islandStatus()).floating'), 'notification and fallback removal');
  pass('disabling the island removes notification and floating surfaces');
  await ui(`(()=>{const mode=document.getElementById('islandMode');mode.value='floating';mode.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  shell('appops', 'set', 'art.niulai.android', 'SYSTEM_ALERT_WINDOW', 'allow');
  await ui('document.getElementById("islandEnabled").click()');
  await until(() => /u0 Niulai Quote Island}/.test(shell('dumpsys', 'window', 'windows')), 'explicit floating mode');
  pass('the explicit floating-window mode remains available');
  await ui('document.getElementById("islandEnabled").click()');
  await until(() => !/u0 Niulai Quote Island}/.test(shell('dumpsys', 'window', 'windows')), 'floating window removal');
  assert.match(shell('dumpsys', 'window', 'windows'), /u0 Niulai 2D Pet}/);
  await ui(`document.querySelector('[data-settings=pet]').click();document.getElementById('petEnabled').click()`);
  const pid = shell('pidof', 'art.niulai.android').trim();
  assert.doesNotMatch(run('logcat', '-d', '--pid=' + pid, '-s', 'AndroidRuntime:E'), /FATAL EXCEPTION/);
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ passed: true, checks, history, initial, posted, fallback, limitation: 'Android 15 emulator verifies notification transport and fallback. Android 16 promotion and HyperOS physical island placement require device verification.' }, null, 2));
} finally {
  client?.close();
  try { shell('am', 'broadcast', '-a', 'art.niulai.qa.DONE', '-p', 'art.niulai.android'); } catch {}
  try { run('forward', '--remove', 'tcp:9223'); } catch {}
  try { run('uninstall', 'art.niulai.qa'); } catch {}
}
