# 牛来盯盘

当前仓库的 Windows/macOS 构建版本为 `1.8.0`。牛来提供二维桌宠和 A 股、港股、美股盯盘。正式发布版本见 [官网](https://niulai.raaay.art/download/) 和 [更新记录](https://niulai.raaay.art/download/updates/)。

## 功能

- 双栏主面板与侧栏导航，集中查看行情、自选与持仓。
- 桌面盯盘包含常规分时、日/周/月 K 线、前复权与不复权、盘口指标和 A 股公开五档。K 线下方随股票更新个股新闻，支持国际媒体筛选、外语标题翻译和关注通知。
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

Windows 安装包与免安装包输出到 `release/`。

macOS DMG 构建需在 macOS 运行。本地也可用 `scripts/build-macos-preview.py` 将已经验证的桌面 ASAR 与同版本官方 Electron 运行时组合成临时签名的 `.app.zip`，适合分架构体验。

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

## 电脑版财经新闻

在所选股票的 K 线下查看个股新闻，点击标题在浏览器打开原文。国际媒体页通过 Google News RSS 检索限定媒体的英文、日文、法文和德文版内容，覆盖随语言、标的和新闻发布情况变化。显示新闻标题、媒体和发布时间。自动翻译默认开启，由 Google 翻译服务处理新闻标题，可在「通知与翻译」关闭。服务不可用时继续显示原文。

点「关注新闻」加入关注列表，最多关注 12 只。开启「已关注股票的系统通知」后可打开系统权限设置并发送测试通知。程序在运行期间约每五分钟分批检查，首次获取建立基线，之后每只股票在一次检查中只发一条汇总通知。点击通知会回到该股票的新闻区。

## 电脑版自有走势与盘口

在 **设置 → 行情来源** 配置已有权限的 HTTP JSON 行情接口。报价接口可额外提供 `open`、`high`、`low`、`volume`、`volumeUnit` 和 `amount`。成交额以标的原币计，成交量单位为 `股` 或 `手`。通过字段映射将盘口对象指向 `orderBook` 或实际路径。每侧显示源提供的前 20 个有效价格档位。

```json
{
  "unit": "股",
  "timestamp": "2026-11-20T15:00:00Z",
  "bids": [{ "price": 100.00, "size": 500 }],
  "asks": [{ "price": 100.02, "size": 300 }]
}
```

走势接口可选，与报价接口共用协议、主机、端口和鉴权。示例路径为 `/series?symbol={symbol}&period={period}&adjustment={adjustment}`，设置中填写完整地址。返回顶层 JSON 对象，`symbol` 对应请求标的，`period` 为 `minute`、`day`、`week` 或 `month`，`adjustment` 为 `raw` 或 `qfq`，并返回 `volumeUnit`。走势地址留空时，图表使用公开源。配置地址后的失败回退遵循行情来源设置。

- K 线返回 `bars` 数组。每条包含 `date`（YYYY-MM-DD）、`open`、`high`、`low`、`close` 和 `volume`。前复权值可以为负。日线、周线和月线在服务端按各自周期生成。
- 分时使用 `adjustment: "raw"`，返回 `date`（交易日，YYYY-MM-DD）、`previousClose`、`session` 和 `points`。时段用 `session.open` 和 `session.close`，有午休时同时传 `breakStart` 和 `breakEnd`。每条分钟点包含 `time`、`price`、`volume`，时间使用该市场当地的 HH:mm，成交量使用该点对应区间的增量。

该接口用于轮询有权限的数据快照。交易所实时深度、逐笔数据和完整历史的覆盖范围由实际数据许可和服务商决定。
