# 牛来盯盘

电脑版当前版本 `1.6.0`，Android 为 `1.4.0`。Electron 二维桌宠与盯盘主面板，支持 A 股、港股和美股。正式下载与每次更新内容见 [官网](https://niulai.raaay.art/download/) 和 [更新记录](https://niulai.raaay.art/download/updates/)。

## 功能

- 双栏主面板与侧栏导航，集中查看行情、自选与持仓。
- 15 组高清逐帧角色动画，覆盖 27 种行情与互动状态；统一颜色、无损分页、插帧与高分屏绘制。
- 软件内更新提示、手动检查和可控制的系统通知；先安装本版后获得后续正式版本提醒。
- 木鱼支持点击、空格、本轮、今日与累计计数，所有窗口共享。
- 桌宠、悬浮窗和四场景卡片可独立开启。
- 深浅主题、静音与省电模式、持仓隐私、托盘驻留、窗口位置记忆。
- 情绪记忆、安静办公、收盘总结与自定义提醒。
- 明显下跌时的哭泣动作可播放原版“妈妈”音效，默认关闭，带报价确认、渐入和冷却。
- 升级迁移旧版自选、持仓和声音设置，发行版移除 3D 牛与 Three.js。

详细操作见 [电脑版使用说明](docs/电脑版使用说明.md)，布局与平台适配见 [电脑版设计](docs/电脑版1.5.0设计.md)。

## 开发

```powershell
pnpm install
npm start
```

```powershell
npm run test:regression
npm run test:single-instance
npm run test:desktop
```

桌面界面验收脚本使用 `niulai-android` 开发依赖中的 Playwright，可先运行 `npm ci --prefix niulai-android`。测试使用独立临时资料目录。

## 打包

```powershell
npm run dist:win
```

Windows 输出安装版 `release/Niulai-1.6.0-Setup-x64.exe` 与免安装版 `release/牛来盯盘-1.6.0-portable-x64.exe`。

macOS 构建需在 macOS 运行。

```sh
npm run dist:mac:universal
npm run dist:mac:arm64
npm run dist:mac:x64
```

## 当前代码结构

- `main.js` 管理窗口、托盘、行情请求、系统恢复和统一数据写入。
- `main-modules/desktop-state.cjs` 规范化设置、迁移旧数据、管理木鱼计数。
- `main-modules/crying-reaction.cjs` 管理哭泣确认、恢复、启动保护和音频冷却。
- `renderer.js`、`index.html`、`desktop.css` 实现主面板。
- `overlay.js`、`overlay.html`、`overlay.css` 实现桌宠、悬浮窗和卡片。
- `renderer-modules/desktop-ui.js` 复用格式、图标、画布与二维动画入口。
- `niulai-android/web` 提供共用的二维帧播放器、行情动作、市场时段和音频逻辑。
- `scripts/build-renderer.js` 构建两份浏览器脚本，并检查被移除的依赖。

公开行情可能延迟或中断，常规时段按周历估算。成本、股数、计数和设置仅保存在本机。
