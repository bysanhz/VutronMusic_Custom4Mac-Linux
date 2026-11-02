# 2026-11-02 稳定性与可复现构建优化

## 范围与环境

仓库 `/home/pcbysan/Projects/VutronMusic`，工作分支 `main`，起始提交 `8a7f141`，开始时工作区干净。保留当前业务功能、心动模式、听歌统计、新场景图、圆角人物图标、彩白黑托盘、Inter 字体及默认头像。本轮没有推送、发布或自动上传诊断数据。

宿主 Node.js 22.22.3、Yarn 1.22.22；实际 Electron 37.10.3 / Chromium 138 / 内置 Node.js 22.21.1，Ubuntu 22.04 / Kernel 6.8。干净依赖目录为独立临时目录；安装跳过生命周期脚本，测试复用本机同版本 Electron 二进制，并独立重建、验证 SQLite 的 Electron ABI。

`yarn.lock` 原本已经被 Git 跟踪；`.gitignore` 的同名规则没有使它失效。此前“锁文件未纳入版本管理”的推断不成立。本轮移除冗余忽略规则，真正处理的是安装漂移和不兼容的版本组合。

## 已确认的问题与修复

### 依赖一致性

安装目录原 API 为 4.30.2，清单和锁文件要求 4.40.1。实际 Pinia 为 2.3.1，而持久化插件 4.4.1 的 peer 要求 Pinia >=3。本轮保留 Pinia 2 系列，固定 `pinia=2.3.1`、兼容的 `pinia-plugin-persistedstate=4.2.0`，更新并验证锁文件，统一 API 到已声明的 4.40.1。未把版本漂移直接认定为所有歌曲失败的根因。

Node 下限调整为 22.12.0，与已锁定的 `@electron/rebuild@4.0.3` 要求一致；README 使用冻结安装。插件 4.2.0 包自身包含 Nuxt 集成的传递依赖，但应用不导入该集成，也未迁移框架；实际播放器的持久化路径已通过回归。

### 新数据库启动失败：已实测

位置：`src/main/db.ts`、`src/public/migrations/2.4.0.sql`、`2.5.0.sql`。

`migrate()` 用一个 SQLite transaction 包住全部迁移，但两个 SQL 文件又包含 `BEGIN TRANSACTION` / `COMMIT`。旧 SQL 的负向对照稳定产生 `SQLITE_ERROR: cannot start a transaction within a transaction`，外层回滚后 `Track` 仍是旧结构。此前回退到内存库时只执行 init.sql，也缺少当前查询要求的 `type` 字段。真实隔离冷启动记录了 `local_music: no such column: type`。

修复：事务由 `migrate()` 统一管理，移除两个文件的重复事务边界；内存库回退同样执行迁移。4 项原生 SQLite 测试验证新建持久化库、旧歌曲与备份保留及再次打开、不可用磁盘时的兼容内存库、失败迁移原子回滚。该问题能解释相关本地缓存查询失败；未证明它是历史在线 demuxer 错误或多 GiB RSS 的原因。

### Linux 可选扩展初始化失败：已实测

位置：`src/main/IPCs.ts:initMprisIpcMain()`。

隔离 D-Bus 使用 `unix:abstract` 地址，现有客户端不能建立连接；原实现等待模块导入和连接成功后才注册 `askExtensionStatus`，失败时 Renderer 收到 `No handler registered`。现在先注册查询，初始化中或扩展不可用时返回 false，并捕获可选扩展错误；MPRIS 自身事件注册继续执行。没有实现该第三方库对 abstract 地址的新支持，也没有声称所有桌面扩展环境已兼容。

### 推荐卡片生命周期：已对照验证

位置：`src/renderer/components/DailyTracksCard.vue`。

原 `document.visibilitychange` 监听没有卸载；歌词状态与页面可见性分别覆写同一个 paused 值；异步推荐晚返回可能覆写已离开的页面状态。

修复：监听随组件挂载和卸载；暂停状态由页面可见性、KeepAlive 激活状态和歌词界面状态共同计算；请求 revision 拒绝旧结果，网络失败保留最后成功的数据。新请求仍使用原 API 超时机制，没有增加重试次数。

同一 Electron 夹具、同一素材、100 次挂载/卸载：旧代码监听器由 1 增至 101，卸载后的最大残留为 100；新代码峰值为 1，卸载归零。旧版还会在歌词界面显示时被可见性事件误恢复动画，新版保持暂停。该结果证明此处的资源缺口，不能用于推算全部历史 RSS 降幅。

卡片保留轻微缩放，避免原先移动图片高度的 50%；本地场景使用各自的裁切焦点，真实封面仍居中，并尊重减少动态效果设置。素材文件未重新生成或替换。

### 设置观察器与回归约束

位置：`v327FeatureShared.ts`、`SystemSettings.vue`。

共享设置观察器从整个 document 改为当前设置根节点，由组件负责启动、断开和清除待执行任务。实际 Electron 测试验证外部 100 次 DOM 插入不触发设置工作、语言切换只挂载一份、离开后停止、重入后恢复。发布构建另验证 5 次进入设置、切换软件更新与杂项、离开再进入；诊断入口仅在软件更新页可见。

未一次性改写所有动态设置模块，其他独立观察器的逐步组件化仍属于后续工作。

原两份扩展回归为 81 通过 / 17 失败。逐项核对后，失败来自旧挂载位置、旧类名、国际化前的文字、旧布局断言、错误的函数截取范围以及 matchAll 使用非全局正则。保留语义约束并更新检查，未为通过测试恢复旧 UI。全套另发现并校正了 ref 访问、图表标签、报表状态与控件顺序等过时断言；真实冷启动测试发现了上面两个产品缺陷，已独立修复。

## 验证结果

- 干净目录安装及再次冻结离线安装：通过；`yarn check --integrity --ignore-scripts` 通过。
- TypeScript、源代码 Lint、`build:pre`（含 native:check、图标生成和生产构建）：通过。
- 最终生产代码完整回归：405 通过、1 项按需长测默认跳过、0 失败。该长测另行完成 2/2 断言；外层 D-Bus/Xvfb 命令返回 143，清理退出路径未完整确认，不将整条命令标记为成功。见内存证据。
- 推荐卡片和素材 7 项 Electron 测试：通过，包括真实封面优先、失败后默认图、100 次挂载、晚到请求、设置观察器及场景裁切。
- 连续 100 次切歌、30 次失败、卸载及再空闲 15 秒：通过功能与资源所有权检查，保留独立内存样本。
- Linux unpacked 目录包：成功。复用已验证 Electron 二进制，打包时关闭重复 native rebuild；不是安装器安装测试。
- ASAR 中默认封面、3 张推荐场景和 3 张托盘图逐字节匹配源文件；Inter 字体存在；API 包为 4.40.1。
- Git diff 空白检查、针对新增和主要改动文件的格式检查：通过。
- 全仓 `format:check`：运行但失败，本次检查报告 104 个文件。未用全仓格式重写覆盖已有风格。基准复核显示这些是既有内容/格式问题；其中一项检查差异的文件与 HEAD 字节一致，本轮未修改。
- electron-builder 仍报告两个 Git 来源依赖 discord-rpc/register-scheme 的 npm 收集告警及重复依赖引用；命令退出 0，不能据此宣称依赖生态的全部告警已消除。
- 新 CI 保持手动触发，增加依赖一致性、单色主题及真实 Electron 回归；本机等价步骤已执行，GitHub Actions 本身未触发。

## 内存证据与界限

详细数值与压缩原始样本见同目录的 `2026-11-02-optimization-results.json` 及 `artifacts/2026-11-02/`。

30 分钟空闲采样完成 121 点（最后 elapsed=1800.035 秒）：

| 指标                  | 冷启动 | 120 秒 | 1800 秒 |
| --------------------- | -----: | -----: | ------: |
| 主窗口 RSS / MiB      | 151.54 | 179.80 |  189.01 |
| 主窗口 PSS / MiB      |  97.22 | 115.45 |  125.37 |
| 主窗口 Private / MiB  |  69.84 |  85.39 |   96.05 |
| JS Heap used / MiB    |   9.70 |   8.73 |    8.27 |
| backing storage / MiB |   4.79 |   4.03 |    3.94 |
| DOM 节点              |   1578 |   1764 |    1764 |
| 全局 JS 监听器计数    |    331 |    410 |     410 |

从暖机 120 秒起到结束，RSS +9.21 MiB、Private +10.66 MiB；这不是零增长或长期无泄漏证明。三个 Intlify measure 名称均为零。完整诊断 IPC 每 15 秒采样也会引入调试器/采集开销，尚未用低干预对照分离其影响。冷启动前后不是历史异常进程的受控修复对照。

连续切歌/失败的独立夹具数据：

| 阶段             | Renderer RSS / MiB | Renderer PSS / MiB | Heap used / MiB | 全局监听器计数 |
| ---------------- | -----------------: | -----------------: | --------------: | -------------: |
| 基线             |             126.32 |              55.41 |            5.47 |             28 |
| 100 次切歌       |             145.08 |              69.76 |            8.02 |            428 |
| 再 30 次失败     |             154.58 |              79.05 |            9.05 |            552 |
| 卸载后空闲 15 秒 |             154.32 |              78.77 |            9.12 |            566 |

此处目标媒体元素自身的监听器为零，但全局计数未回落；没有据此宣称整个 Renderer 监听器完全释放。是否有可达的全局/AbortSignal 对象残留仍需引用链证据。

没有增加 V8 Heap Limit，没有周期性 GC 或 Renderer 重启。冷启动使用独立 profile；测试数据和真实账号数据分离。

连续切歌/失败夹具使用真实 player Store、HTMLAudioElement、Web Audio 与合成 WAV，模拟 URL、网络及格式故障。它不是登录账号后的真实网易云 CDN 长播。资源检查确认一个 AudioContext、一个媒体元素，卸载后目标媒体监听器为零、src 清除、上下文关闭。但 PSS、全局 DOM 监听器计数没有立即回到冷启动值；全局计数包含尚未回收的对象，不能等同于可达泄漏，也不能忽略为“已完全释放”。没有取得最终全局引用链证明，保留为下一轮内存定位事项。

30 分钟记录使用最小化生产 bundle、空白 profile、独立端口和 Xvfb，并非安装包在真实桌面的运行。为了不占用正在运行的实例，测试副本只重映射回环端口及可信 origin。观察开始后仅追加场景裁切 CSS 和测试；因此长测覆盖运行时修复，但不宣称最终 CSS 构建已经完成同长度验证。最终构建已独立通过完整回归及打包检查。采样期间有本机其他测试并行运行，PSS 会受共享页分摊影响，不能将它视为严格的历史版本对照。

Renderer 记录 RSS/PSS/Private/Anonymous、JS Heap、embedder 和 backing storage；backing storage 不是完整 V8 External 指标。Browser 的 External/ArrayBuffer 可直接获得。Linux 映射分类只是映射类别，不等于完整 Chromium 原生分配调用栈，未取得的 Blink/Media 分类不补造。

## 未完成验证与后续步骤

1. 登录真实网易云账号后的 30 分钟播放、权限/地区差异、真实 CDN 断网恢复；本轮不操作真实账号的听歌统计。
2. 最终 CSS 构建的同长度观察，以及连续数小时、多轮切歌/失败后的 Private/Anonymous 和全局事件目标引用链分析。当前不能宣称历史数 GiB 问题全部解决。
3. macOS/Windows 原生安装器、托盘、桌面歌词及真实驱动验证；Linux 测试不能替代这些平台。
4. 全仓格式基线的独立整理；其他设置观察器按模块逐步迁移。保持现有素材和交互设计，避免一次性重构。

可重复命令（先完成冻结安装和生产构建）：

```bash
yarn install --frozen-lockfile
yarn check --integrity
yarn lint
yarn vue:type-check
yarn build:pre
dbus-run-session -- xvfb-run -a yarn playwright test --workers=2
VUTRON_STABILITY_SECONDS=1800 dbus-run-session -- xvfb-run -a yarn playwright test tests/app.spec.ts --workers=1
```

安装跳过脚本时，完整性检查也需带 `--ignore-scripts`，并另行安装 Electron 二进制、执行 native:check。默认自动测试不运行半小时观察；上面的显式环境变量开启它。

参考：[Electron 的 ESM 与 ready 时序](https://www.electronjs.org/docs/latest/tutorial/esm)。隔离启动夹具保留生产 bundle 的 CommonJS 格式，使用 .mjs 入口的顶层 await 设置 profile 后再加载它；没有将夹具最初的模块格式错误认定为产品缺陷。
