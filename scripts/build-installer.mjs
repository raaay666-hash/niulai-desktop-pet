import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, cpSync, renameSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = process.argv.includes('--qa');
const uiOnly = process.argv.includes('--ui-only');
const work = path.join(root, 'artifacts', 'installer-build');
let source = path.join(work, 'official-1.4.0-clean');
const variant = qa ? 'qa' : 'release';
const output = path.join(work, variant);
const zip = path.join(root, 'artifacts/niulai-desktop-download-20261108/Niulai-1.4.0-Windows-x64.zip');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, NODE_PATH: [path.join(root, 'node_modules/.pnpm/node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${path.basename(command)} failed: ${result.status}`);
}
mkdirSync(output, { recursive: true });
if (sha(readFileSync(zip)) !== '1020a396916222d4723cf57100119c030b5c68cf1f823b8ac7185d52911b839c') throw Error('Official release ZIP hash mismatch');
if (!existsSync(source)) {
  mkdirSync(source, { recursive: true });
  run('tar.exe', ['-xf', zip, '-C', source]);
}
if (qa) {
  const isolated = path.join(work, 'qa-source-clean');
  if (!existsSync(isolated)) {
    cpSync(source, isolated, { recursive: true });
    renameSync(path.join(isolated, '牛来盯盘.exe'), path.join(isolated, '牛来安装验收.exe'));
  }
  source = isolated;
}

const manifest = [];
function walk(dir) {
  for (const file of readdirSync(dir)) {
    const full = path.join(dir, file);
    if (statSync(full).isDirectory()) walk(full);
    else manifest.push(`${path.relative(source, full).replaceAll('\\', '/')}\t${statSync(full).size}\t${sha(readFileSync(full))}`);
  }
}
walk(source);
writeFileSync(path.join(output, 'files.tsv'), manifest.join('\n'), 'utf8');
const payload = path.join(output, 'payload.exe');
if (!uiOnly) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const config = {
    ...pkg.build,
    appId: qa ? 'com.niulai.desktop-pet.installer-qa' : pkg.build.appId,
    productName: qa ? '牛来安装验收' : pkg.build.productName,
    extraMetadata: { name: qa ? 'niulai-installer-qa' : pkg.name },
    directories: { output, buildResources: path.join(root, 'build') },
    afterPack: undefined,
    win: { ...pkg.build.win, target: [{ target: 'nsis', arch: ['x64'] }], artifactName: 'payload.exe' },
    nsis: { ...pkg.build.nsis, guid: qa ? '07e165b0-2bd2-4147-9ba3-6ba1d9fea9f1' : '2eb57be9-98ed-593c-88cd-e5fd2a57bae7',
      allowElevation: false, packElevateHelper: false, selectPerMachineByDefault: false, runAfterFinish: false,
      createDesktopShortcut: 'always', deleteAppDataOnUninstall: false,
      shortcutName: qa ? '牛来安装验收' : '牛来盯盘',
      uninstallDisplayName: qa ? '牛来安装验收 1.4.0' : '牛来盯盘 1.4.0',
      include: path.join(root, 'build/installer/backend-hooks.nsh'),
      installerLanguages: ['zh_CN'], language: '2052' }
  };
  const configFile = path.join(output, 'builder.json');
  writeFileSync(configFile, JSON.stringify(config, null, 2));
  let cli = path.join(root, 'node_modules/electron-builder/cli.js');
  const preload = [];
  const packageMap = path.join(root, 'node_modules/.package-map.json');
  if (existsSync(packageMap)) {
    const map = JSON.parse(readFileSync(packageMap, 'utf8')).packages;
    cli = path.resolve(root, 'node_modules', map[map['.'].dependencies['electron-builder']].url, 'cli.js');
    preload.push('--require', path.join(root, 'scripts/installer/package-map.cjs'));
  }
  run(process.execPath, [...preload, cli, '--prepackaged', source, '--win', 'nsis', '--x64', '--publish', 'never', '--config', configFile]);
}
if (!existsSync(payload)) throw Error('Build the NSIS payload before --ui-only');
const metadata = [
  '1.4.0', sha(readFileSync(payload)), String(statSync(payload).size),
  qa ? '07e165b0-2bd2-4147-9ba3-6ba1d9fea9f1' : '2eb57be9-98ed-593c-88cd-e5fd2a57bae7',
  qa ? '牛来安装验收' : '牛来盯盘', String(manifest.reduce((sum, row) => sum + Number(row.split('\t')[1]), 0)),
  qa ? '牛来安装验收.exe' : '牛来盯盘.exe'
].join('\n');
writeFileSync(path.join(output, 'setup.txt'), metadata, 'utf8');
const framework = path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319');
const destination = qa ? path.join(output, 'Niulai-Setup-QA.exe') : path.join(root, 'release/Niulai-1.4.0-Setup-x64.exe');
mkdirSync(path.dirname(destination), { recursive: true });
const refs = ['System.dll', 'System.Core.dll', 'System.Xaml.dll', 'System.Windows.Forms.dll', 'System.Drawing.dll',
  'WPF/WindowsBase.dll', 'WPF/PresentationCore.dll', 'WPF/PresentationFramework.dll'].map(file => '/r:' + path.join(framework, file));
run(path.join(framework, 'csc.exe'), ['/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/utf8output',
  '/out:' + destination, '/win32icon:' + path.join(root, 'build/icon.ico'), '/win32manifest:' + path.join(root, 'build/installer/app.manifest'),
  ...refs, '/resource:' + payload + ',payload', '/resource:' + path.join(output, 'setup.txt') + ',metadata',
  '/resource:' + path.join(output, 'files.tsv') + ',files', '/resource:' + path.join(root, 'build/installer/niulai-actions.png') + ',actions',
  '/resource:' + path.join(root, 'build/icon.png') + ',icon',
  '/resource:' + path.join(root, 'build/installer/Installer.xaml') + ',view', path.join(root, 'scripts/installer/Installer.cs')]);
const result = { file: destination, bytes: statSync(destination).size, sha256: sha(readFileSync(destination)),
  payloadSha256: metadata.split('\n')[1], sourceZipSha256: sha(readFileSync(zip)), files: manifest.length, qa };
writeFileSync(path.join(output, 'build-result.json'), JSON.stringify(result, null, 2));
if (!qa) writeFileSync(path.join(root, 'release/Niulai-1.4.0-Setup-x64.sha256.txt'), result.sha256 + '  Niulai-1.4.0-Setup-x64.exe\n');
console.log(JSON.stringify(result, null, 2));
