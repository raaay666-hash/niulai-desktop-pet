const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/polish-20261113');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const publication = read('outputs/polish-20261113/site/publication-verification.json');
assert.equal(publication.passed, true);
assert.equal(publication.fullDownloads.length, 5);
const pages = read('outputs/polish-20261113/site/page-verification.json');
assert.equal(pages.passed, true);
assert.equal(pages.origin, 'https://niulai.raaay.art');
const websiteMuyu = read('outputs/polish-20261113/site/muyu/verification.json');
assert.equal(websiteMuyu.origin, 'https://niulai.raaay.art');
assert.ok(websiteMuyu.checks.every(check => check.passed));
const platforms = {};
for (const platform of ['windows', 'arm64', 'x64']) {
  const checks = {};
  for (const [name, file] of Object.entries({ application: 'packaged-verification.json', experience: 'experience-verification.json', updates: 'update-ui.json' })) {
    const result = read('outputs/polish-20261113/' + platform + '/' + file);
    assert.equal(result.passed, true);
    checks[name] = result.checks.length;
  }
  const sourcePath = platform === 'windows' ? 'sources' : platform + '/sources';
  const sources = read('outputs/polish-20261113/' + sourcePath + '/verification.json');
  assert.equal(sources.passed, true);
  checks.marketSources = sources.checks.length;
  assert.equal(read('outputs/polish-20261113/' + platform + '/single-instance-validation.json').valid, true);
  platforms[platform] = { version: '1.6.0', checks, singleInstance: true };
}
for (const arch of ['arm64', 'x64']) {
  const parity = read('outputs/polish-20261113/' + arch + '/payload-verification.json');
  assert.equal(parity.allFileBytesEqual, true);
  assert.equal(parity.identicalFileCount, 115);
}
const androidBrowser = read('outputs/polish-20261113/android/browser/browser-verification.json');
const androidDevice = read('outputs/polish-20261113/android/127.0.0.1-16448/verification.json');
for (const result of [androidBrowser, androidDevice]) assert.ok(result.checks.every(check => check.passed));
const release = read('outputs/polish-20261113/github-release.json');
assert.equal(release.draft, false);
const metadata = read('niulai-mobile/download-files.json');
const packages = publication.fullDownloads.map(download => {
  assert.equal(download.sha256, metadata[download.name].sha256);
  return { name: download.name, bytes: download.bytes, sha256: download.sha256, url: 'https://niulai.raaay.art/files/' + download.name };
});
assert.equal(androidDevice.installedApkSha256, packages.find(file => file.name.endsWith('.apk')).sha256);
const limitations = [
  'Windows packages are unsigned; macOS packages are unsigned and not Apple-notarized.',
  'Mac checks ran on native arm64/x64 CI runners; Android checks used a dedicated Android 15 virtual device, not physical Xiaomi/Huawei devices.',
  'Physical multi-monitor, speakers, notification presentation and battery-life acceptance remain unverified.',
  'Older installations must first install this release to gain future update reminders.',
  'Android checks on app opening/returning with a six-hour throttle; this is not background push. No automatic download or installation.',
  'Animation uses estimated intermediate frames; visual naturalness remains subjective. A 60fps timeline is not a guarantee of 60fps on every device.'
];
const report = {
  completedAt: new Date().toISOString(), status: 'published-and-verified',
  website: 'https://niulai.raaay.art/download/', changelog: 'https://niulai.raaay.art/download/updates/',
  release: { url: 'https://github.com/raaay666-hash/niulai-desktop-pet/releases/tag/v1.6.0', sourceCommit: release.source, run: 'https://github.com/raaay666-hash/niulai-desktop-pet/actions/runs/43542911902' },
  platforms, desktopPayloadFilesIdentical: 115,
  android: { version: '1.4.0', versionCode: 7, browserChecks: androidBrowser.checks.length, virtualDeviceChecks: androidDevice.checks.length, installedApkMatchesRelease: true },
  animation: { groups: 15, states: 27, frames: 1176, timelineFps: 60, desktopFrameSize: 512, androidFrameSize: 384, losslessWebp: true, comparison: 'outputs/desktop-hq-20261113/hq-comparison.mp4' },
  updates: { manifest: 'https://niulai.raaay.art/updates.json', officialStableOnly: true, oncePerVersion: true, manualCheck: true, permissionSettings: true, newInstallerRequiredForFutureNotifications: true },
  publication: { staticFiles: publication.assets.length, downloadRangeChecks: publication.ranges.length, fullDownloads: publication.fullDownloads.length, fullDownloadsVerifiedAt: publication.fullDownloadsVerifiedAt || publication.checkedAt, updates: publication.updates, feedbackGet: publication.feedback.status, package: read('outputs/polish-20261113/site/package.json') },
  websiteMuyu: { frameSize: 512, losslessWebp: true, samePagesAsDesktop: true, checks: websiteMuyu.checks.length, origin: websiteMuyu.origin },
  packages, limitations
};
fs.writeFileSync(path.join(output, 'delivery.json'), JSON.stringify(report, null, 2) + '\n');
const text = `# 牛来盯盘三端更新 · 2026-11-14

Windows / macOS 1.6.0 与 Android 1.4.0 已正式发布。下载：https://niulai.raaay.art/download/ 。更新记录：https://niulai.raaay.art/download/updates/ 。

- 统一角色毛色和鼻口颜色，15 组动作共 1,176 帧，60fps 时间基准；桌面 512px、Android 384px 无损分页，改善轮廓、毛发与连贯性。移除导致色闪的叠加过渡，连续点击只排队一次。
- 优化深浅主题、按钮点击、设置排版和窄屏布局；刷新保留列表焦点与滚动位置，中文输入完成后搜索，防止重复添加。
- 新增软件内更新提示、手动检查、系统提醒开关和系统权限入口。只有正式发布的新版本才提醒，同一版本成功系统提醒后不重复。网页和版本接口由同一份更新记录生成。
- Android 原生悬浮层同步修复美股报价时间、盘前盘后价格和盈亏基准。
- 官网敲木鱼同步最新 512px 无损校色素材，高分屏画布适配，两页预先解码后完整播放。移除按下时的变淡效果，静止停止重绘，保留音效、震动、自动敲击、累计与离线使用。

Windows、Mac Apple Silicon、Mac Intel 各通过 22 项成品功能、10 项体验、9 项行情来源、3 项更新界面和单实例检查；115 个应用文件逐字节一致。Android 15 项浏览器检查与 10 项独立模拟器检查通过，模拟器安装包与发布 APK 一致。

官网正式域名 ${publication.assets.length} 个公开资源、${publication.ranges.length} 项下载 HEAD/Range 和 5 个完整安装包 SHA-256 均已核对；更新接口带 no-store，当前版本无误报，低版本识别新版本。反馈 GET 405，未读取或写入私人反馈。电脑与手机页面无横向溢出，13 个历史下载入口保留。

官网木鱼 ${websiteMuyu.checks.length} 项检查通过，包含高清原帧比对、跨页绘制、静止停止重绘、50 次连续点击、存储恢复、离线播放及高清下载失败回退。木鱼追加发布没有更换安装包或下载 Worker，完整安装包校验沿用本轮先前成功的正式域名下载记录。

先安装本版，后续版本才有更新提醒。电脑版启动与持续运行每 6 小时检查；Android 打开或返回应用时检查，6 小时内合并；不是应用关闭时的即时推送。未授予系统权限仍保留软件内提示，不自动下载安装。

Windows 未签名，Mac 未签名及 Apple 公证。Mac 使用对应架构 CI 运行器验收，Android 使用独立虚拟设备；实体 Mac、小米/华为、物理多屏、系统通知展示和耗电仍待设备验收。插帧不能替代原画制作，主观自然度需结合实际观看判断。

安装包：release/polish-20261113。完整元数据：outputs/polish-20261113/delivery.json。公开源码标签：v1.6.0，构建提交：${release.source}。动画对比：outputs/desktop-hq-20261113/hq-comparison.mp4。
`;
fs.writeFileSync(path.join(root, 'docs/三端优化与正式发布-20261114.md'), text);
const progress = '\n\n## 2026-11-14 三端高清动画、交互与更新提醒正式发布\n\n' + text.split('\n').slice(2).join('\n');
const progressFile = path.join(root, 'PROGRESS.md');
if (!fs.readFileSync(progressFile, 'utf8').includes('## 2026-11-14 三端高清动画、交互与更新提醒正式发布')) fs.appendFileSync(progressFile, progress);
const deploymentFile = path.join(root, 'niulai-mobile/PUBLIC_DEPLOYMENT.md');
const heading = '### 2026-11-14 三端动画与更新提醒正式发布';
if (!fs.readFileSync(deploymentFile, 'utf8').includes(heading)) fs.appendFileSync(deploymentFile, '\n\n' + heading + '\n\n' +
  '- Windows/macOS 1.6.0、Android 1.4.0 正式上线；三端发布先经 Preview 35/35 和 Production Success，随后官网木鱼高清追加发布为 Production 37/37、Success。旧部署保留，摄影站未改动。\n' +
  '- 最终通过完整目录 artifacts/niulai-public-muyu-hq-20261114 上传，37 个文件逐字节核对，单文件均小于 25 MiB；另保留两个 Deflate 备份 ZIP：' + report.publication.package.archives.map(file => path.basename(file.file) + ' SHA-256 ' + file.sha256).join('；') + '。\n' +
  '- 官网资源 34/34、HEAD/Range 51/51、五个完整新包校验通过；追加木鱼不改变安装包及 Worker，复用已完成的整包校验。官网木鱼 14 项正式站检查通过；反馈 GET 405。更新清单与记录共用 release-history.json，接口 no-store，旧版下载继续可用。\n' +
  '- 发布记录与平台验收范围见 docs/三端优化与正式发布-20261114.md；完整机器报告 outputs/polish-20261113/delivery.json，公开页面截图位于 outputs/polish-20261113/site。\n');
console.log(JSON.stringify({ status: report.status, packages: packages.length, delivery: path.join(output, 'delivery.json') }));
