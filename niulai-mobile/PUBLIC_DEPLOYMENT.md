# 公开网页版

正式入口：https://niulai.raaay.art/

2026-10-20 已部署至独立 Cloudflare Pages 项目 `niulai-muyu`，不依赖 ChatGPT 登录、电脑或本地开发服务器。只新增 `niulai.raaay.art` 子域名，摄影网站的源文件、主域名与原部署未改动。

备用 Pages 地址：https://niulai-muyu.pages.dev/ 。大陆访问优先使用正式自定义域名；不要把备用域名、旧 ChatGPT Sites 域名或托管产品名称当作大陆可用性证明。旧 Sites 链接已经按用户要求改为公开访问，但不是新的正式入口。

## 本次验收

- 从未带登录 Cookie 的 HTTP 客户端访问正式域名，首页、CSS、脚本、主题、Manifest、Service Worker、头像、音频和图标共 11 项均为 200，文件 SHA-256 与当前 `dist/` 一致。
- 响应头 `X-Niulai-Hosting: cloudflare-pages` 标明实际来源。
- 真实浏览器打开正式域名，头像加载、点击增加数量、设置及三种外观选项均可用。
- **用户已确认**：通过大陆手机网络、不经过代理，可以打开并播放“牛来”。这是用户反馈的真机网络结果。
- 本机 HTTP 验证的出口为美国，不能单独用作大陆网络证据。
- ITDOG 大陆多线路检测被人工验证码挡住，未得到本网址的多节点测量结果；该站默认展示的其他结果不算本项目证据。

计数与偏好属于浏览器当前域名的本地数据；旧 ChatGPT Sites 地址、Pages 备用地址与新自定义域名之间不会自动同步。

## 2026-10-21 点击反馈与震动更新

- 已发布到上述正式域名，Cloudflare 显示 12/12 文件上传完成及部署 Success。
- 点击牛头时出现红色上涨箭头及“牛气➕1”，短暂上浮后消失；昼夜背景保留原指定颜色。
- 设置新增“点击震动”，默认开启并保存在本机；手动点击请求 18ms 短震，自动敲击不触发震动，关闭开关后立即停止。
- 震动依赖设备、系统与浏览器支持；iPhone Safari 网页版通常不支持，未来原生 iOS 版须独立接入触感接口。当前未进行手机实体马达验收。
- 38 项 Chromium 运行检查通过，包含开关保存、无震动 API 降级、连点、减少动态效果、离线与音频范围请求；震动 API 使用替身核对调用，不能视作真机震动测试。
- 发布后匿名 HTTP 检查 11/11 文件内容与 dist 一致，来源头正确；正式域名真实浏览器已验证点击计数、上涨反馈及震动开关可关闭/恢复。
- 离线缓存版本为 `niulai-mobile-v5`；新版入口脚本与样式附版本参数，导航改为网络优先并保留离线回退。首次更新可打开 `https://niulai.raaay.art/?v=20261021-feedback`。
- 上传包：`../artifacts/niulai-public-cloudflare-20261021-feedback.zip`，SHA-256 `94A97F88D1D0217463DA0147B5189B36A7276858F03C1F1AFF6AF463858D3E2C`。
- 浏览器截图及检查报告保存在 `../artifacts/niulai-mobile-review/`。此次发布没有新增大陆手机网络或实体设备测试，先前用户确认的大陆访问/声音反馈仍为历史结果。

## 后续更新

### 2026-11-08 桌面端介绍与下载入口

- 已发布到正式域名 https://niulai.raaay.art/ ，Cloudflare 显示 13/13 文件上传成功及部署 Success。摄影站点未改动。
- 首页右下角仅显示独立托腮趴窗角色与「下载牛来盯盘桌面端」。以用户提供的毛绒角色图为依据，使用内置 imagegen 改为歪头托腮姿势，透明背景，未复用最终弃用的 Q 版矢量图，未修改桌面软件素材。
- 点击入口打开介绍、明确标注为非实时的行情效果示意与 Windows 1.4.0 便携版下载。跟随原昼夜主题，支持窄屏滚动、点击外部和 Esc 关闭；介绍打开时暂停自动敲击、声音与震动。计数、原木鱼头像、音频和存储字段保留。
- 公开下载：https://github.com/raaay666-hash/niulai-desktop-pet/releases/tag/v1.4.0 。发行文件 `Niulai-1.4.0-Windows-x64.zip` 为原交付包，不是重新编译版。GitHub 显示 SHA-256 与本地原包一致：`1020a396916222d4723cf57100119c030b5c68cf1f823b8ac7185d52911b839c`。本轮浏览器整包下载检查超时，未据此声称已完成整包下载或大陆线路验证。
- `node --check app.js`、`node --check sw.js` 与 `node prepare.mjs` 通过；正式域名匿名 HTTP 检查 12/12 文件返回 200、来源头正确且 SHA-256 与发布目录一致。真实浏览器已观察正式站入口、角色图片加载、介绍弹窗和下载地址；本地检查覆盖昼夜主题、390×844 窄屏、木鱼计数、按钮关闭与键盘关闭。未进行本轮实体手机测试。
- 离线缓存升级为 `niulai-mobile-v6`，HTML 中脚本与样式版本为 `20261108-desktop`。旧部署保留，修改前源文件另存于 `../artifacts/niulai-desktop-entry-before-20261108/`。
- 上传包：`../artifacts/niulai-public-cloudflare-20261108-desktop.zip`；发布核验和截图位于 `../outputs/`，生成提示词见 `../outputs/牛来盯盘网站入口-素材说明-20261108.md`。

### 2026-11-08 极简顶栏调整

- 根据用户对首页简约感的反馈，将下载入口移到顶栏右侧，以电脑下载线条图标呈现，与左侧设置图标保持同色、同一 44×44 点击区域；原右下角角色和下载条从首页移除。托腮牛保留在点击后的介绍窗口中。
- 已发布至正式域名，Cloudflare 显示 13/13 文件上传成功及 Success。匿名 HTTP 核验 12/12 文件为 200、来源正确且与本地发布目录一致；正式站真实浏览器已检查顶栏入口、介绍打开/关闭与原下载地址。首页图片检查仅包含原木鱼牛头。
- 缓存升级为 `niulai-mobile-v7`，脚本和样式查询版本为 `20261108-toolbar`。上传包为 `../artifacts/niulai-public-cloudflare-20261108-toolbar.zip`，SHA-256：`DE2F4C48967670AD3EDD474CE623E1E059BD12E1FB8FC5C20AA7AC8482CCE7BD`。
- 修改前源文件保留在 `../artifacts/niulai-before-toolbar-20261108/`，前次部署与上传包均保留。核验及截图分别为 `../outputs/牛来盯盘网站入口-极简顶栏发布核验-20261108.json` 和 `../outputs/牛来盯盘网站入口-极简顶栏-20261108.jpg`。

### 2026-11-08 独立下载页与 Mac 版本

- 已发布 https://niulai.raaay.art/download/ 。首页顶栏图标改为站内链接，下载页包含产品介绍与 Windows、Mac Apple 芯片、Mac Intel 三个版本；按用户要求，产品页面不展示测试状态、技术细节、安装说明、校验值或风险说明。用户明确确认 Mac 已测试过。
- 浏览器下载链接均为本域 `/files/`，由 Pages Advanced Mode Worker 服务端转发固定发行文件，不打开或跳转至 GitHub 页面。`_routes.json` 仅对 `/files/*` 启用 Worker；其他页面继续通过静态资源提供。后续发布必须保留 `_worker.js` 和 `_routes.json`，不能只上传 HTML。
- 先发布独立预览站，再发布相同压缩包至 Production。Cloudflare 显示 18/18 文件上传成功及 Success；正式域名资源核验 15/15，三种文件的 HEAD、首尾字节检查 9/9。同一压缩包的预览站完整下载核验 3/3，大小和 SHA-256 与原件一致。
- 新下载服务测试 9/9；正式浏览器已核对首页导航、页面排版、三个同域下载链接及页面无外部链接。当前截图尺寸未出现横向溢出。未经本轮实体手机测试。
- 木鱼缓存升级为 `niulai-mobile-v8`；下载二进制不进入离线缓存。样式和脚本版本为 `20261108-downloads`。
- 上传包：`../artifacts/niulai-public-cloudflare-20261108-download-page.zip`，SHA-256 `FCA07374F3ADC715469E6190D36DDDBFB13DD589EB14FA6C364BF1192CF6B794`。旧部署和本轮修改前源码 `../artifacts/niulai-before-download-page-20261108/` 均保留。
- 详细实现和证据见 `../outputs/牛来盯盘下载页-设计与交付-20261108.md`、`../outputs/牛来盯盘下载页-正式发布核验-20261108.json`、`../outputs/牛来盯盘下载页-完整文件核验-20261108.json`。

### 2026-11-08 艺术字、介绍设计与信封反馈

- 已发布 https://niulai.raaay.art/download/ ，Cloudflare 显示 20/20 文件上传完成及部署 Success。牛气满满改用自托管 Ma Shan Zheng 艺术字及轻量装饰；中部改为「开盘 · 看一眼／收盘 · 歇一会」导航；持仓介绍改为「赚了加餐，亏了吃土。」并配牛来饭票图形。字体授权随发布包保留。
- 下载页导航新增小信封，打开「给牛来写封信」窗口，支持问题、建议及选填联系方式；实际写入成功后才显示「信收到了。」。不在产品页面增加后台、测试或安装说明。
- 反馈写入独立 Cloudflare D1 数据库 `niulai-feedback` 的 `feedback` 表。Production 与 Preview 均已绑定 `FEEDBACK_DB`；无公开反馈读取入口。`weekly_reports` 表用于周报发送记录及去重。私有维护配置留在忽略目录 `.ops/`，不参与网站打包。
- Pages Worker 路由现为 `/files/*` 与 `/api/feedback`。下载仍使用原有三个同域地址；反馈接口仅接受同源 JSON POST，并有长度校验、参数绑定、请求幂等、防机器人字段及提交频率限制。正式 GET、HEAD 均为 405。
- 下载及反馈接口自动测试 19/19 通过。正式站静态资源 17/17 与源文件一致；Windows、Mac Apple 芯片、Mac Intel 下载 HEAD 和首尾范围请求 9/9 通过。本轮未重复下载完整安装包，之前整包核验记录保留。
- 真实浏览器完成预览站及正式站提交，并在私有数据库读回：预览建议 `2eb09d84-3a9a-4ecf-b3a6-fb7efc54393b`；正式问题 `5331380f-d3d0-4a89-9291-89aa981c4ec6`。两条均带 `[维护测试]` 前缀，周报排除。预览测试已读回 reviewed；正式测试的 reviewed 更新已执行，未将其更新后状态视作已读回。
- 已建立原生 App 周报任务「牛来网站维护与反馈周报」，状态 ACTIVE，每周一北京时间 10:00 运行，固定邮件发送至用户指定邮箱。任务核对当前站点、下载与私有反馈，汇总新增及未解决意见；维护流程及收件人仅存放在私有操作记录。当前尚未发送首封周报。本地定时任务需电脑和 App 运行，后台或邮件认证失效时须如实报告。
- 缓存版本为 `niulai-mobile-v9`；下载页样式及脚本版本 `20261108-letter`。发布包 `../artifacts/niulai-public-cloudflare-20261108-letter-feedback.zip`，SHA-256 `E7D6F93FFE7CE839D843B6BE5B729A4F1A3149156F97B4F6AF30226869216B7E`。修改前备份 `../artifacts/niulai-before-art-feedback-20261108/`，旧部署保留。
- 正式核验报告 `../outputs/牛来网站-艺术字与反馈-正式核验-20261108.json`；页面与信封截图、完整交付记录位于 `../outputs/`。友好预览别名曾返回 404；实际预览部署 `https://eecf8060.niulai-muyu.pages.dev` 已通过核验，不以失败别名报告作为验收结果。

1. 在 `niulai-mobile` 修改源文件，运行 `node prepare.mjs`。
2. 上传 `dist/` 内的内容（`index.html` 位于 ZIP 根目录），包含 `_headers` 和 `assets/`；不要上传 `.git`、`.openai`、测试档案或凭证。
3. 在 Cloudflare → Workers & Pages → `niulai-muyu` → Create deployment，选择 Production。
4. 如修改离线缓存文件，更新 `sw.js` 的缓存版本；发布后核对正式域名的脚本、图片与声音，并进行真实浏览器操作。
5. 保留上次可用部署作为回退版本；不要覆盖摄影站点 `raaay-portfolio`。

本次上传包：`../artifacts/niulai-public-cloudflare-20261020.zip`，SHA-256 `3ECB07E6E05BFCEF0E75C873F0BB53674140DAC8FC34C51D61814E5D2D83FAF2`。Cloudflare 显示 12/12 文件上传成功并部署成功。

当前原生 iOS、TestFlight 与 App Store 状态不因网页版发布而改变，仍需独立构建与验收。

### 2026-11-09 Windows 动态安装程序（本地已准备，尚未部署）

- Windows 下载卡片已在本地改为 Niulai-1.4.0-Setup-x64.exe，102.9 MB，点击即可取得单文件离线安装程序；三段牛来动作沿用桌面软件深色与红橙风格。
- download-files.json 新增 EXE 的精确大小和 SHA-256，保留原 ZIP 与两个 Mac 文件白名单。缓存升级为 niulai-mobile-v10。下载、范围请求和私有反馈逻辑保留；自动测试 20/20。
- 已准备 artifacts/niulai-public-cloudflare-20261109-installer.zip。该部署包不包含安装二进制、私有 .ops、凭证或测试代码。
- 本轮电脑操作被停止，EXE 尚未上传 GitHub，网站也未部署。正式域名仍是旧 ZIP。后续须先向原 v1.4.0 Release 新增 EXE，再部署网站 ZIP，并核验正式 EXE 的完整文件大小和 SHA-256；旧发行文件与部署继续保留。
- 安装程序说明与最终交付记录分别位于父目录 docs/安装程序设计与构建.md 和 outputs/牛来安装程序-最终交付核验-20261109.json。

### 2026-11-09 Windows 动态安装程序正式发布

- 已发布至 https://niulai.raaay.art/download/#versions ，Cloudflare Production 上传 20/20、部署 Success。Windows 下载卡片改为新版 EXE，102.9 MB，文案「下载 Windows 安装版」；两个 Mac 卡片保留。
- EXE 与独立校验文件已新增到原 GitHub v1.4.0 Release。网站通过本域 /files/Niulai-1.4.0-Setup-x64.exe 直接提供附件，浏览器不跳转至外部发行页。旧 ZIP 和旧部署保留。
- 正式站匿名 HTTP 资源校验 17/17，四种文件 HEAD 与首尾范围请求 12/12。新 EXE 从正式同域地址完整下载，107,937,792 字节，SHA-256 与本地成品 8d2e1a5401bc6a14a45d2f7a702b8d14b4e19e7312c0b7ef3f0baa35a23605c8 一致。
- 正式浏览器确认 Windows 按钮的新文案、EXE 地址和 download 属性。反馈接口只读检查仍为 405、Allow: POST；未提交反馈或读取私有数据库。此次发布没有新增实体手机、大陆运营商或其他电脑安装验收。
- 部署 ZIP 未改动，SHA-256 9ddb88be8a4846d1158cd14a4dfe0f6ba59d7c89b163d78201c4134e90a57306。正式截图和核验报告为父目录 outputs/牛来安装程序-正式网站下载入口-20261109.jpg、outputs/牛来安装程序-正式网站发布核验-20261109.json。

### 2026-11-12 Android 1.3.2、逐帧木鱼与平台介绍

- 正式入口 https://niulai.raaay.art/ 与 https://niulai.raaay.art/download/ 已部署，Cloudflare Production 显示 24/24 文件上传及 Success。
- 首页使用牛来完整逐帧敲木鱼，单击完成一轮，密集点击合并动画节拍且逐次计数。原设置、累计存储、自动敲击、布局及主题继续使用。音效为官网原音频截取的 0.81 秒短音频，已剪去尾部牛叫。
- 下载页按总览、手机版与电脑版介绍，删除 Android 安装卡片的重复功能文字，反馈表单采用直接的提示与状态文案。
- 本次冻结目录为父目录 artifacts/niulai-public-platforms-20261112-final，发布 ZIP 为 artifacts/niulai-public-android-web-platforms-20261112-final.zip，SHA-256 7b9190c277571f067fbbee30e3d4d61346205b8baea2ec1981b7f1d308363f98。SW 缓存为 niulai-mobile-v17-platforms。
- 发布时间 Windows 1.5.0 尚无公开 GitHub 文件。本次仅在冻结发布副本中使用当时线上可下载的 Windows 1.4.0 卡片，并使用 Mac 1.4.0。并行电脑版待发布源码保留。后续运行 prepare.mjs 后需要核对全部发行地址与发布版本，再打包。
- 匿名 HTTP 核验 21 个公开文件的大小与 SHA-256 一致，含完整 Android APK。APK 为 11,140,157 字节，SHA-256 d29b154620c352ba14dfd10de269a4a47015185f0acfc1736d21d7396126bc20。Windows 安装版与两种 Mac 文件 HEAD 和首段 Range 检查通过，反馈 GET 405、Allow POST。
- 界面测试 11 项及接口测试 22 项通过。公开浏览器核对计数、设置、平台分区、Android 卡片与 390 像素窄屏单列。正式截图和网络记录位于父目录 outputs/android/compat-1.3.2/website。小米和华为实体机、外屏、长期保活及耗电仍待复测。


### 2026-11-12 Windows 1.5.0 与过往版本入口

- Windows 1.5.0 安装版与免安装版已发布 GitHub v1.5.0 Release，网站使用同域 /files/ 链接下载。Mac 下载标注 1.4.0，Android 主下载标注 1.3.2。
- 新增 /download/history/，包含 Windows 1.4.0 安装版和 ZIP、Android 1.0.0 / 1.1.0 / 1.2.0 / 1.3.0，以及 Mac 1.4.0 两种芯片文件。APK 与原有校验文件逐项核对后加入发布目录。
- 下载代理按文件选择发行标签，新 Windows 来源为 v1.5.0，原文件继续使用 v1.4.0。新增逐文件来源和无效标签回归检查，下载及反馈单元检查 22/22。
- Cloudflare Production 上传 33/33、部署 Success。匿名 HTTP 核对 30 个静态资源均与本地构建一致，六个代理文件的 HEAD 与首尾 Range 共 18 项通过。Windows 安装版和免安装版均从正式同域地址完整读取并计算 SHA-256，与最终本地文件及 GitHub 摘要一致。
- 正式浏览器已核对新版下载卡片、免安装入口和过往版本页面。手机与电脑布局、链接和导航检查通过。反馈仅执行 GET，返回 405、Allow POST，没有提交测试反馈或读取私有数据库。
- 发布包为 artifacts/niulai-public-desktop-1.5.0-history-20261112-max.zip，使用标准 ZIP Deflate 压缩以满足浏览器上传 25 MiB 限制。Worker、路由及 D1 绑定沿用现有项目。缓存版本升级为 niulai-mobile-v16。
- 证据位于 outputs/desktop-1.5.0/site/，最终程序元数据位于 outputs/desktop-1.5.0/delivery.json。安装包未签名。本轮没有新增实体手机、Mac 构建、大陆运营商线路或多显示器实体环境检查。

### 2026-11-12 电脑版 1.5.0 与 Mac 正式更新

- 正式下载入口 https://niulai.raaay.art/download/ 现提供 Windows 1.5.0 安装版与免安装版，以及 Mac 1.5.0 Apple 芯片与 Intel 芯片 DMG。Android 下载为 1.3.2。
- GitHub 主分支已同步电脑版 1.5.0 源码。两个 Mac 包从提交 597040a07c7cf271cdcf750e09a24df2846a4f39 构建，分别在 macOS Apple Silicon 与 Intel 运行器通过回归、原生启动、帧图绘制和设置导航检查。对应源码附件为 Niulai-1.5.0-source.zip。
- GitHub v1.5.0 Release 已提供两个 Mac DMG 及 SHA-256。Apple 芯片包为 98,689,599 字节，SHA-256 536fcd5f6426b65672a950af2c4561bcac815b0712da13fb3394a6188aea8843。Intel 包为 102,348,211 字节，SHA-256 5feeb031bbda2971d6a3513d72ce3fc9be912ce46e8319144346a2d24adb5115。
- Cloudflare Production 上传 33/33，部署显示 Success。匿名 HTTP 核对 30 个静态资源、8 个代理文件的 HEAD 与首尾范围共 24 项，以及四个新版 Windows/Mac 安装包的完整大小和 SHA-256。全部通过，两个 DMG 的 UDIF 尾部标记有效。反馈 GET 返回 405、Allow POST。
- 公开浏览器核对四个桌面端下载地址、版本文字与无横向溢出。缓存版本为 niulai-mobile-v18-stable150，旧版本下载入口保留。验证报告和截图位于 outputs/desktop-1.5.0/site。
- Windows 和 Mac 安装包均未签名，Mac 尚未 Apple 公证。Mac 检查基于云端对应架构运行器，其他用户设备兼容性尚待反馈。
