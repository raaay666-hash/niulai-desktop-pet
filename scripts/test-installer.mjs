import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'artifacts/installer-build/qa/Niulai-Setup-QA.exe');
const target = path.join(root, 'artifacts/installer-qa/安装路径 中文 空格');
const guid = '07e165b0-2bd2-4147-9ba3-6ba1d9fea9f1';
const desktop = path.join(process.env.USERPROFILE, 'Desktop/牛来安装验收.lnk');
const menu = path.join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/牛来安装验收.lnk');
const productionKeys = ['HKCU\\Software\\2eb57be9-98ed-593c-88cd-e5fd2a57bae7', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\2eb57be9-98ed-593c-88cd-e5fd2a57bae7'];
const hash = file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
const reg = key => spawnSync('reg.exe', ['query', key, '/s'], { encoding: 'utf8', windowsHide: true }).stdout;
const before = productionKeys.map(reg);
const productionShortcuts = [path.join(process.env.USERPROFILE, 'Desktop/牛来盯盘.lnk'), path.join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/牛来盯盘.lnk')];
const shortcutBefore = productionShortcuts.map(hash);
const results = [];
function run(args) {
  const run = spawnSync(exe, args, { windowsHide: true, timeout: 120000 });
  if (run.error) throw run.error;
  return run.status;
}
function pass(name) { results.push({ name, passed: true }); console.log('PASS ' + name); }
assert(target.startsWith(path.join(root, 'artifacts/installer-qa') + path.sep));
assert.equal(fs.existsSync(target) && fs.readdirSync(target).length > 0, false, 'Use a fresh isolated test installation');
assert.equal(run(['--verify-install', '--install-dir=C:\\']), 21);
assert.equal(reg('HKCU\\Software\\' + guid), '');
pass('rejects disk root before installation');
assert.equal(run(['--verify-install', '--install-dir=' + root]), 21);
assert.equal(reg('HKCU\\Software\\' + guid), '');
pass('rejects a nonempty unrelated folder');
assert.equal(run(['--verify-install', '--install-dir=' + target, '--no-desktop-shortcut']), 0);
const manifest = fs.readFileSync(path.join(root, 'artifacts/installer-build/qa/files.tsv'), 'utf8').trim().split('\n');
for (const line of manifest) {
  const [relative, size, sha] = line.trimEnd().split('\t');
  const file = path.join(target, relative);
  assert.equal(fs.statSync(file).size, Number(size)); assert.equal(hash(file), sha);
}
assert.equal(fs.existsSync(desktop), false); assert.equal(fs.existsSync(menu), true);
assert.match(reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + guid), /1\.4\.0/);
pass('installs to a Chinese path with spaces; all 19 files match the official release');
pass('desktop opt-out, start menu and Windows uninstall registration');
const profile = path.join(root, '.qa-profiles/installer-qa');
fs.mkdirSync(profile, { recursive: true });
const sentinel = path.join(profile, 'preserve-settings.txt');
fs.writeFileSync(sentinel, 'installer must preserve user data\n');
assert.equal(run(['--verify-install', '--install-dir=' + target]), 0);
assert.equal(fs.existsSync(desktop), true);
assert.equal(fs.readFileSync(sentinel, 'utf8'), 'installer must preserve user data\n');
pass('reinstalls in place and creates the requested desktop shortcut');
const installedExe = path.join(target, '牛来安装验收.exe');
const smoke = spawn(installedExe, ['--qa-user-data-dir=' + profile, '--qa-auto-quit=7000'], { cwd: root, windowsHide: true, stdio: 'ignore' });
const exited = new Promise((resolve, reject) => { smoke.once('error', reject); smoke.once('exit', code => resolve(code)); });
await new Promise(resolve => setTimeout(resolve, 1500));
assert.equal(smoke.exitCode, null, 'The installed application must still be running');
assert.equal(run(['--verify-install', '--install-dir=' + target]), 21);
const blockedBackend = spawnSync(path.join(root, 'artifacts/installer-build/qa/payload.exe'), ['/S', '/currentuser'], {
  windowsHide: true, timeout: 15000, env: { ...process.env, NIULAI_INSTALL_DIR: target }
});
assert.ifError(blockedBackend.error); assert.equal(blockedBackend.status, 23);
pass('both installer and backend refuse to terminate a running application');
assert.equal(await exited, 0);
assert.equal(fs.existsSync(path.join(profile, 'Local Storage')), true);
assert.equal(fs.existsSync(path.join(profile, 'Preferences')), true);
const preferences = hash(path.join(profile, 'Preferences'));
pass('installed application starts and exits with its own real settings profile');
const uninstall = spawnSync(path.join(target, 'Uninstall 牛来安装验收.exe'), ['/S', '/currentuser'], { windowsHide: true, timeout: 60000 });
assert.ifError(uninstall.error); assert.equal(uninstall.status, 0);
for (let n = 0; n < 150 && (fs.existsSync(installedExe) || fs.existsSync(desktop) || fs.existsSync(menu)); n++) await new Promise(resolve => setTimeout(resolve, 100));
assert.equal(fs.existsSync(installedExe), false); assert.equal(fs.existsSync(desktop), false); assert.equal(fs.existsSync(menu), false);
assert.equal(reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + guid), '');
assert.equal(fs.readFileSync(sentinel, 'utf8'), 'installer must preserve user data\n');
assert.equal(hash(path.join(profile, 'Preferences')), preferences);
pass('silent uninstall removes program, shortcuts and registration while preserving profile data');
assert.deepEqual(productionKeys.map(reg), before); assert.deepEqual(productionShortcuts.map(hash), shortcutBefore);
pass('existing production installation records and shortcuts remain unchanged');
const report = { checkedAt: new Date().toISOString(), isolatedAppId: 'com.niulai.desktop-pet.installer-qa', target, installerSha256: hash(exe), tests: results, scope: 'QA identity differs from production only in installer app ID, executable filename, cache and shortcut names; app files retain official hashes.' };
fs.writeFileSync(path.join(root, 'outputs/牛来安装程序-安装卸载核验-20261109.json'), JSON.stringify(report, null, 2));
