# 2026-11-02 内存增长与全局事件引用链调查

## 范围和结论边界

起始提交 `2d85700a2ea83a3749bb1d5af5d64634d8951583`，工作分支 `main`，开始时工作区干净。本轮保留业务功能、新场景图、人物应用图标、彩白黑托盘、字体及默认头像，不改账号数据，不推送、不发布。

已实际复现并修复三个独立缺陷：播放器卸载后全局回调/异步观察器残留，preload 跨 contextBridge 的取消订阅失效，以及诊断采样自身反复建立 inspector 会话导致 native/embedder 内存增长。它们有各自的引用链或受控实验依据。**尚未证明历史上 4–10 GiB Renderer RSS 的全部根因，也没有证明其与 CDN 播放失败存在因果关系。**

环境为 Ubuntu 22.04、Kernel 6.8、Electron 37.10.3、Chromium 138.0.7204.251、Electron Node 22.21.1。真实 Electron 使用 Xvfb 和独立 D-Bus；生产页面、真实 preload、Web Audio 与媒体元素参与测试。测试使用隔离的新 profile、合成 WAV 和受控 API，不访问用户登录会话或累加真实听歌记录。软件渲染环境不代表实际桌面 GPU 使用情况。

## 已验证根因和具体引用链

### 播放器全局 message 与异步初始化生命周期

位置：`src/renderer/store/player.ts` 的 `handleIpcRenderer()`、`onMounted()`、`onBeforeUnmount()`。

旧代码在异步挂载流程之后注册匿名 Window message 监听器、12 个 IPC 回调和 4 个 watch。message 没有对应删除；异步边界之后创建的观察器不能依赖组件自动收集。此外，8 个 MediaSession action handler 与 metadata 没有卸载清理。组件在初始化 await 期间销毁后，旧异步流程仍可创建 AudioContext、启动定时器和安装全局回调。

旧版卸载快照中，目标闭包 heap object id 为 `31317`，可沿以下强引用到达：

```text
C++ Persistent roots
  → native Window
  → InternalNode / EventListener
  → V8EventListener
  → message callback (31317)
  → system / Context
  → lyrics / currentTrack / audioNodes / playing / pic
```

`strong-retainer-paths.json` 保存原始节点 id、边类型与闭包捕获变量。该快照中 currentTrack=112215、lyrics=112233、audioNodes=112507；id 仅属于这一次快照。没有把弱边当作强引用。播放器诊断入口和测试夹具也会保留当前 store/媒体元素，所以本实验**证明全局监听器这一条不该存在的引用链**，不声称所有播放器对象在该夹具中均应被回收。

对照：卸载后旧 message 仍响应 get-seek，旧异步 watch 仍响应 currentIndex 变化；新版均不再发送。旧版 IPC 12 / MediaSession 8 残留，新版均为 0。阻塞备份恢复、先卸载再解除阻塞：旧版晚创建一个 AudioContext 并注册 IPC/MediaSession，新版均为 0。

修复采用具名 Window 回调与精确移除、保留并停止 4 个观察器和 12 个 IPC 的取消函数、清除所属 MediaSession handler/metadata/MessagePort，以及在异步初始化边界检查 disposed。原听歌账本提交、退出落盘、媒体资源释放和业务回调内容保留。

### contextBridge 回调身份使旧 off() 无法取消订阅

位置：`src/preload/index.ts`、`src/preload/osdWin.ts` 的 `wrappedListeners`、`on()`、`off()`；调用方见 `src/renderer/utils/ipcSubscription.ts`、播放器、`OSDLyric.vue`、`OsdHeader.vue`、`CompactCoverControls.vue`。

旧的链路是：

```text
preload ipcRenderer EventEmitter
  → registered wrapped callback
  → Renderer callback proxy
  → Renderer closure / component state
```

注册时以传入函数代理为 WeakMap key；同一个 Renderer 函数再次跨 bridge 传给 off 时，preload 收到不同代理，无法查回原 wrapper。WeakMap 本身不解决问题，因为 EventEmitter 仍强持有 wrapper。这是实际 preload 中测出的行为，模拟 IPC 的函数身份稳定，无法暴露它。

受控实验中仅换回基准 preload，其余夹具不变：

| 场景                                      | 基准 preload | 新 preload |
| ----------------------------------------- | -----------: | ---------: |
| 卸载后播放器所属 IPC                      |           12 |          0 |
| 同通道设置页 resume 订阅                  |       保留 1 |     保留 1 |
| 主窗口 100 次订阅/取消，含 1 个无关订阅   |          101 |          1 |
| 桌面歌词 100 次订阅/取消，含 1 个无关订阅 |          101 |          1 |

新版随后取消该无关订阅，总数也归零。新版 on() 返回捕获精确 wrapper 的幂等取消函数，在 preload 自己的上下文中移除注册。所有当前显式取消订阅的 Renderer 调用点改用该返回值；没有使用 removeAllListeners，也没有取消其他模块监听器。旧 off API 兼容保留，旧 preload/浏览器夹具回退不提供新版精确取消保证；需要重启应用加载新版 preload，单独 Renderer HMR 不足以更新它。

补充 WeakRef 可达性审计：主窗口和桌面歌词各 100 个 Renderer callback，在取堆快照后存活为 0。这里的快照会扰动 GC，只用于引用可达性验证，不用于声称产品 RSS 降低。Windows/macOS 使用相同 bridge 实现，源码修复覆盖它们，但本机没有实测这两个平台。

### 诊断采样反复 attach/detach inspector

位置：`src/main/runtimeDiagnostics.ts` 旧 `readRendererHeapUsage()`；新版提取为 `src/main/utils/rendererHeapSampler.ts`。

旧版每次完整诊断都 attach、读取 Runtime.getHeapUsage、finally detach。用实际旧函数和实际新函数，在同一 Electron 版本的空白窗口、全新进程中按 A–B–B–A 顺序各采 500 次，期间没有手动 GC 或堆快照：

| 顺序 | 实现 | attach / detach 次数 | Renderer Private 增量 / MiB | embedder 增量 / MiB |
| ---- | ---- | -------------------: | --------------------------: | ------------------: |
| A1   | 基准 |            500 / 500 |                        7.04 |               3.686 |
| B1   | 新版 |                1 / 0 |                        0.07 |                   0 |
| B2   | 新版 |                1 / 0 |                        0.06 |                   0 |
| A2   | 基准 |            500 / 500 |                        7.05 |               3.686 |

这确认了会话 churn 对本受控场景的增长贡献。CDP native allocation sampling 在当前发行二进制返回 0 samples / 0 modules，**未取得带符号的 Chromium C++ 分配栈**，不把该结果扩大为某个具体 Blink 类的泄漏结论，也不将 500 次密集采样的数值外推到历史数 GiB。

新版按 WebContents 复用一个本地会话，以 WeakMap 管理；目标销毁时清理，只 detach 自己拥有的会话；DevTools 打开时诚实返回不可用，不抢占它。并发采样复用同一个 pending command，1500 ms 超时不叠加未完成的原生命令。轻量内存面板的原采样接口与完整快照导出格式不变。Electron 的 debugger 在打开 DevTools 或关闭 WebContents 时会自动脱离，参见[官方文档](https://www.electronjs.org/docs/latest/api/debugger)。

## 排除的误判：累计事件数不等于全局事件泄漏

100 次切歌时 Chromium 总 jsEventListeners 从 28 到 428，两版相同；这包括尚未 GC 的已完成 Axios XHR 的四个属性回调，不能据此认定每首歌泄漏 4 个全局监听器。

单独启用 opt-in retainer 审计，30 次切歌后累计创建 31 个 XHR，堆快照后 WeakRef 存活 0；总 jsEventListeners 从 141 降到 21。新版卸载快照后为 6，Window 余下的 message 是 Axios 调度单例，storage 为桌面歌词 store 单例，beforeunload 为睡眠定时器单例；它们是窗口级所有者，不随歌曲新增。旧播放器 message 在旧版卸载后仍有独立强引用路径，新版这一回调消失。

本轮没有增加 Heap Limit、在产品中强制 GC、定时重启 Renderer 或扩大重试次数。

## 同条件对照：实际内存而非清理推断

### 100 次切歌与 30 次连续失败

相同夹具、相同依赖和素材、新 profile、合成音频、相同切歌/错误路径，旧版和新版并行独立运行。期间只有普通 CDP 数值采样，无强制 GC 或堆快照。

| 阶段             | 基准 RSS / MiB | 新版 RSS / MiB | 基准 Private / MiB | 新版 Private / MiB |
| ---------------- | -------------: | -------------: | -----------------: | -----------------: |
| 启动基线         |         125.01 |         125.79 |              25.39 |              24.46 |
| 切歌 100 次      |         144.43 |         145.03 |              37.63 |              36.98 |
| 失败 30 次       |         153.68 |         154.51 |              46.54 |              46.18 |
| 卸载再空闲 15 秒 |         153.48 |         154.44 |              46.51 |              47.55 |

两版都维持一个 AudioContext 和一个 HTMLAudioElement，卸载后 context 不可用、src 清空、媒体元素监听器归零。**本次短测没有显示新版 RSS 改善**；修复的证据是所属回调/引用链清除，不能用该测试推断原生分配器的高水位会立刻归还。夹具仍持有播放器诊断入口、媒体数组和 CDP 对象句柄，媒体对象释放的判定取自已明确检查的生命周期状态。

原始样本同时包含 RSS、PSS、Private、Anonymous、JS used/allocated、embedder/backing storage、DOM 计数与进程角色，见 `stress-*.json.gz`。Renderer 没有取得完整的 V8 External 总量；CDP backingStorage 只是后备存储指标，不能当作全部 External，Browser 的 externalBytes 也不属于 Renderer。

### 30 分钟生产页面空闲对照

最终配对两条命令均退出 0，各获得 121 个采样点，末点分别为 1800.046 / 1800.038 秒。使用相同构建命令、锁定依赖、素材和场景，生产页面独立 profile，每 15 秒读取完整诊断；不登录、不播放，不启用手动 GC 或堆快照。两个本机 HTTP 服务分别分配独立端口，未改产品端口。Xvfb 软件渲染与新 profile 无法复现登录后长时间浏览/听歌的全部负载。

两侧仍同时存活时的采样如下，单位 MiB；表中时间均取最近实测点，不将启动阶段当作稳态：

| 时间    | 基准 RSS | 新版 RSS | 基准 Anonymous | 新版 Anonymous | 基准 JS used | 新版 JS used |
| ------- | -------: | -------: | -------------: | -------------: | -----------: | -----------: |
| 启动    |   148.52 |   146.62 |          42.46 |          41.43 |         9.01 |         8.32 |
| 120 秒  |   183.59 |   184.11 |          48.96 |          48.92 |         8.46 |         8.46 |
| 602 秒  |   192.59 |   191.64 |          59.70 |          59.19 |         8.95 |         8.74 |
| 1203 秒 |   193.88 |   192.42 |          60.77 |          59.75 |         8.37 |         8.13 |
| 1790 秒 |   192.02 |   190.19 |          60.47 |          59.08 |         8.03 |         8.27 |

1790 秒处两侧 PSS 为 99.57 / 97.31，Private 为 64.99 / 62.53，embedder 为 6.584 / 4.847，backing storage 为 3.941 / 3.941。表中为一次配对实验，未取得重复实验统计置信度；后 20 分钟 RSS 没有继续单调增长，整体差异约 2 MiB，不能当作数 GiB 异常已解决。

先退出的一侧会改变另一侧共享文件页的 PSS/Private 归属。本次旧版末点 Private 从 64.99 到 96.81，RSS 仅从 192.02 到 192.06，Anonymous 从 60.47 到 60.52；该变化符合共享页归属变化，不能宣称新版降低 34 MiB 私有分配。比较采用两侧仍存活的 1790 秒点，完整末点保留在原始数据中。

原始记录为 `idle-baseline-final.jsonl.gz` / `idle-fixed-final.jsonl.gz`，包含 Renderer/Browser/GPU 等进程角色与可获取的分类。测试期间同机还执行过短回归和原生采样实验，PSS/Private 会受其他共享同一二进制的进程影响；该实验不是严格独占整机的性能基准。

## 测试、复现与交付

新增 `tests/renderer-heap-sampler.spec.ts`（4 项）、`tests/renderer-heap-native.spec.ts`（实际函数 A–B–B–A）、`tests/player-ipc-lifecycle.spec.ts`（实际两种 preload 与播放器），并扩充实际播放器夹具的卸载/晚初始化/按需 heap audit。`tests/feature-regression.spec.ts` 仅更新订阅方法名的静态约束。`tools/heap-retainer-audit.mjs` 读取本地快照，只输出有界节点类别、变量名和强引用路径，不导出页面字符串或音频鉴权 URL。原始大堆快照未提交，诊断不自动上传。

已执行：

- 全套 Playwright：415 通过、2 项按需测试默认跳过、0 失败、0 flaky。30 分钟生产页面测试另行在基准和新版各运行一次，两条命令退出 0；retainer 审计亦单独执行。
- 最终复跑中有一次环境失败：397 通过、15 跳过、5 失败；5 项均在 Vite 创建文件监听器时触发 `EMFILE`，未进入对应功能断言。保留失败统计，随后以 `CHOKIDAR_USEPOLLING=1` 重跑同一套测试，未修改系统限制或产品逻辑。
- TypeScript `npm run vue:type-check`、源代码 `npm run lint`、`npm run build:pre`（含 native:check、图标生成、生产构建）：通过。
- 真实 preload 的三项测试另启用 WeakRef 审计：3 通过。
- 基准旧播放器的两项生命周期负向对照按预期失败；基准旧 preload 的三项按预期失败。它们是缺陷复现，不计入新版通过数，数据独立保存。
- 旧版/新版各 100 次切歌 + 30 次失败 + 卸载后 15 秒空闲：两条命令退出 0。
- Linux unpacked 目录包：成功；未发布安装器。打包仍有既有 Git 来源依赖 discord-rpc/register-scheme 等收集告警，不能将退出 0 描述为全部生态告警消失。
- ASAR 中默认图、三张推荐场景、彩白黑托盘共 7 图与源文件逐字节一致，Inter 字体一致；包外应用/托盘资源与既有生成物一致，素材与主题源码没有差异。
- 新文件和主要扩展测试的 Prettier 检查、`git diff --check`：通过；未把整个既有播放器/Vue 文件批量格式化。

复现命令（在仓库根目录、有可用依赖和 Electron 原生模块的 Linux 上）：

```bash
npm run build:pre
npm run vue:type-check
npm run lint
CHOKIDAR_USEPOLLING=1 dbus-run-session -- xvfb-run -a npx playwright test --workers=2
VUTRON_RETAINER_AUDIT=1 dbus-run-session -- xvfb-run -a npx playwright test tests/player-ipc-lifecycle.spec.ts --workers=1
VUTRON_RETAINER_AUDIT=1 dbus-run-session -- xvfb-run -a npx playwright test tests/player-playback-integration.spec.ts --grep 'opt-in retainer audit' --workers=1
VUTRON_STABILITY_SECONDS=1800 dbus-run-session -- xvfb-run -a npx playwright test tests/app.spec.ts --grep 'opt-in production idle' --workers=1
node tools/heap-retainer-audit.mjs /path/to/isolated.heapsnapshot 31317
```

旧版对照使用 git archive 提取上述基准到独立目录并链接相同 node_modules；测试侧通过 `VUTRON_PLAYER_SOURCE_ROOT` 或 `VUTRON_PRELOAD_SOURCE_ROOT` 指向该目录，不覆盖工作区。实际旧采样器冻结在 `tests/fixtures/renderer-heap/baseline.ts`，避免依赖 CI 的 Git 历史深度。

尚未验证：用户真实登录状态下连续正常播放 30 分钟、长时间封面/歌词/探索页负载、历史数 GiB RSS 现场的完整 native 分配链、Windows/macOS 实机行为及 GPU 硬件渲染。下一次异常应优先保留同进程 `/proc` RSS/PSS/Anonymous/Private 与映射分类、完整快照和进程运行时，再单独取可达性快照；后者会扰动 GC，必须与前者分开解释。不要在现有证据上宣称全量内存异常已解决。

数据索引：[`artifacts/2026-11-02-memory-retainers/results.json`](artifacts/2026-11-02-memory-retainers/results.json)。压缩原始记录不含真实账号/Cookie/鉴权 URL，保留测试进程 PID 和采样阶段以便核对。
