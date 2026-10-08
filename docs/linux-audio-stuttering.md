# Linux 播放卡顿排查（2026-09-29）

适用现象：通过 `yarn dev` 播放网易云在线歌曲，未启用音效，声音偶尔断续但界面仍可操作。

## 实机证据与结论边界

- 修改前版本：`8edd52c`，实际安装的 Electron 为 `37.10.3`。
- 开发实例连续运行约 26 小时，播放 renderer（PID `3854938`，含 `Realtime AudioW` 线程）RSS 约 **15.9 GiB**；主进程约 915 MiB，Vite 约 1.2 GiB。这是需要追踪的长期内存异常。
- 主机共 62 GiB 内存，当时约 17 GiB available，短时 CPU 采样仍有约 85% idle。因此不能仅凭训练进程在运行、free 较小或播放器 RSS 较大，就认定机器整体资源耗尽。
- 当前使用 PulseAudio 15.99.1，而非 PipeWire 音频服务。采样时播放器处于暂停状态，没有采到声音断续发生当刻。
- 主进程日志存在网易云请求超时，但这些错误没有与断续时刻关联，不能据此认定音频 CDN 缓冲不足。
- 应用代理设置 `type=0`，当前未启用应用代理。

本次没有稳定复现原始间歇断续，也没有完成 26 小时的内存对照实验。以下修改改善了播放调度和资源管理，并补足定位信息；**尚不能宣布原始卡顿或长期内存增长已彻底消失**。

## 已实施的修改

1. Linux 音频上下文使用 `latencyHint: 'playback'`。实机隔离 Electron 测试中，默认 interactive 的 `baseLatency` 约 11.61 ms，playback 约 23.22 ms；给音频调度更多余量，代价是小幅增加输出延迟。此 hint 由浏览器决定实际值。
2. 媒体预加载从 `metadata` 改成 `auto`。它是加载提示，浏览器仍决定具体缓冲量。
3. 原调播放不再加载或创建 SoundTouch AudioWorklet。启用变调时才创建；关闭变调时通知 processor 停止并关闭 MessagePort，销毁播放器时取消尚未完成的加载。
4. 变调 processor 复用输出数组，使用真实设备采样率，输出不足时补零。原实现每个音频块创建数组，且内部按固定 44100 Hz 初始化；它们是音效路径的问题，不应被当作未启用音效时的已证实根因。
5. 销毁媒体元素时移除 `src` 并调用 `load()`，释放网络/媒体资源。
6. 一键诊断新增连续缓冲余量、音频上下文、实际延迟、waiting/stalled 次数、最近 20 个媒体事件、watchdog 延迟、JS 堆和各 Electron 进程内存。事件记录长度有上限。
7. 硬件加速诊断改为读取实际软件渲染标记，修正 Linux 开发模式被误报为关闭硬件加速的问题。

## 长期内存增长的后续修复

已在真实 Electron renderer 中复现一处歌词动画泄漏。`LyricLine.createAnimations()` 原来直接覆盖动画引用；暂停或 `fill: forwards` 的旧动画仍由文档时间线持有，随后 `clearAnimation()` 只能取消最新一组。重复创建同一行歌词 150 次并暂停、设置进度后：

| 场景          | 修改前     | 修改后   |
| ------------- | ---------- | -------- |
| 首次创建      | 2 个动画   | 2 个动画 |
| 再创建 150 次 | 302 个动画 | 2 个动画 |
| 调用清理      | 300 个动画 | 0 个动画 |

现在重建前取消原有动画，异步测量和帧等待通过版本号拒绝过期结果；卸载时取消并结束等待中的帧任务，避免清理后重新创建动画。主歌词页和桌面歌词的延迟批次也会在换歌或卸载时取消，桌面歌词移除其消息监听器。翻译重建使用独立任务范围，保留尚未完成的原文批次。

另外修复本地歌曲媒体封面的 Blob URL 所有权：512 封面由界面持有，较大封面由媒体会话持有；替换、重置、销毁以及异步请求过期或失败时释放相应 URL。Windows 只请求实际使用的 2048 封面，不再额外创建弃用的 1024 封面。这一封面修复主要涉及本地歌曲，不能用它解释本次网易云在线歌曲的内存增长。

上述动画泄漏已经复现并修复，但没有证据能把原实例全部 15.9 GiB RSS 归因于这一处问题，也尚未做完 26 小时的修改后对照。请完整退出旧 Electron 实例后重新运行 `yarn dev`；热更新无法可靠回收旧代码已经遗失引用的资源。

## 下一次断续时取证

完整退出播放器后重新启动：

```bash
cd /home/pcbysan/Projects/VutronMusic
yarn dev
```

正常收听即可。下次出现断续时，在设置中点击“一键诊断快照”。最好同时保留正常播放时的快照，便于比较同一歌曲和同一实例的变化。不要公开原始日志中的 Cookie、令牌或带鉴权参数的音频 URL。

重点看以下字段：

| 字段 | 如何解释 |
| --- | --- |
| `playback.media.bufferedAhead` | 当前播放位置所在连续缓冲段剩余秒数；远处已有缓冲不计入 |
| `waitingCount`、`recentEvents` | 断续附近出现 waiting 且缓冲接近零，支持网络或媒体解码链路问题；单独 stalled 事件不代表正在断续 |
| `contextState` | 媒体仍播放而上下文不是 running，应检查音频上下文或输出设备状态 |
| `baseLatencyMs`、`outputLatencyMs` | 浏览器报告的音频延迟；输出停止或设备未报告时可能为零 |
| `maxWatchdogDelayMs` | 播放期间 watchdog 调度的最大额外延迟，仅为粗粒度指标；不能代表所有音频线程的调度情况 |
| `pitchProcessorActive` | 未启用变调时应为 false |
| `main.processes` | 区分主窗口、桌面歌词、DevTools、GPU、网络和音频服务的内存；单位 MiB |
| `renderer.jsHeap` | JS 堆估计值，与进程 RSS 不同；Chromium 报告可能较粗，不能单独判定泄漏 |

若媒体进度和缓冲都正常，声音仍断续，则下一步应检查 PulseAudio 输出设备、硬件驱动和音频线程调度。若主窗口 RSS 在连续播放中再次持续增长，再对照 JS 堆与 Chromium heap/memory tracing 定位具体资源；不要把“重启后变小”作为泄漏已修复的证据。

## 其他代码发现

`src/main/utils/proxyFetch.ts` 向 Node 原生 `fetch` 传入 `HttpsProxyAgent` 的 `agent` 参数。Node 原生 fetch 使用 Undici 的 `dispatcher` 接口，不能据此保证应用代理生效。本机复核中，该参数未调用 agent。这是潜在的代理配置问题；当前应用代理关闭，本次未修改该链路，以免混入另一类网络行为变化。自动缓存 worker 还会单独下载歌曲，慢网络下可能与实时播放竞争带宽，应在缓冲不足的证据出现后做关闭自动缓存的对照。

## 验证结果

- 修改前、修改后 `yarn vue:type-check` 通过；修改文件 ESLint、Prettier 和 `git diff --check` 通过。
- 隔离目录中的 Vite 生产构建通过，不覆盖正在调试的项目产物。
- 音频健康、播放状态竞态、安全校验、离线处理、听歌时长与上报生命周期共 **47 项回归测试通过**。
- 隔离 Electron 使用独立用户目录和端口，验证普通模式无变调节点、启用后节点出现、关闭后释放、音频延迟和进程诊断可读取；不使用真实账户数据。
- 静音合成正弦波经真实变调 Worklet 处理，5 次短时采样的 RMS 约 0.706–0.707，未出现处理器异常；该实验不等同于真实网易云长时间收听验证。
- 一条旧播放测试仍匹配硬编码中文提示，已更新为项目现有的多语言键，同时保留中文含义校验。
- 内存资源回归测试 **3 项通过**。普通和 mini 歌词各重建 300 次，动画分别保持 2/4 个；并发重建、切换翻译、清理、等待帧时取消和卸载后重建均通过，无 renderer 异常。
- 最新隔离生产构建和完整 Electron 运行检查通过。本地封面更新 100 次，共创建并回收 200 个 Blob URL，同时保留的数量最多 2 个，重置后为 0；音频与诊断检查继续通过。
- 扩展回归共 **60 项通过、2 项失败**。两项失败位于未修改的 `tests/liked-lyric-regression.spec.ts`，是喜欢歌曲快照和 ID 比较的源码字符串断言；在独立目录取 `HEAD` 原始代码重跑，同样失败，本次未修改喜欢歌曲逻辑或放宽这些断言。

原始采样、构建日志及隔离实验结果暂存于 `/tmp/vutron-audio-investigation-20260929`；内存复现和后续验证在 `/tmp/vutron-memory-investigation-20260929`。这些目录不是长期保存位置。持久回归测试为 `tests/player-memory-resources.spec.ts`，可使用 `yarn playwright test tests/player-memory-resources.spec.ts --workers=1` 运行；无显示环境时使用项目已有的 `xvfb-run` 方式。

参考：[AudioContext latencyHint](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext)、[AudioWorklet 生命周期](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)、[Electron 进程指标](https://www.electronjs.org/docs/latest/api/app#appgetappmetrics)、[Node 原生 fetch dispatcher](https://nodejs.org/docs/latest/api/globals.html#custom-dispatcher)。
