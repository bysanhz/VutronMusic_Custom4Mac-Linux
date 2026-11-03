# 2026-11-03 切歌长时间等待：官方音源协议与备用源搜索

## 现场与调用链

基准源码为 `ddc6e5e9bd5b0b0175f3df09e3f112107c514267`，工作分支 main。运行环境为 Linux、Electron 37.10.3，实际 API 包为 4.40.1，UNM 为 0.28.0。开始时工作区干净，沿用现有功能、素材、账号和播放记录；Beta 发布保持暂停。

实际调用链为 `replaceCurrentTrack → getLocalMusic → atom://local-asset?type=track → getAudioSource → 官方歌曲 URL / UNM → HTMLAudioElement`。主进程取得音源后才返回 track，因此等待备用源时，界面仍可能显示上一曲。

系统 DNS 在此前恢复后保持可解析。音源诊断的四次 pyncmd 回退总耗时分别为 16,358、13,435、14,552、26,855 毫秒；这些是历史现场观察，不是同条件性能基准。对应媒体请求已有首包记录为 26～253 毫秒。较早另有一次 Bodian 命中仅用 649 毫秒，不能将所有歌曲都概括为固定等待。

## 已验证根因

### 官方歌曲 URL 默认 XEAPI，但嵌入模式没有初始化公钥

`@neteasecloudmusicapienhanced/api/module/song_url_v1.js` 默认使用 XEAPI。其 `util/request.js` 从临时目录加载 `xeapi_public_key`，缺失时在发出 HTTP 请求之前抛出 `xeapi public key is missing`。依赖的 CLI 通过 `app.js → generateConfig()` 初始化该文件；应用使用自有 Fastify 服务复用 API 函数，没有执行这条 CLI 初始化链。

同一运行进程、同一歌曲、同一账号与 Hi-Res 设置的只读单变量比较：

| 协议       | HTTP / API          | 可用音源          |   耗时 |
| ---------- | ------------------- | ----------------- | -----: |
| 默认 XEAPI | 500 / 500，公钥缺失 | 否                |   6 ms |
| 显式 EAPI  | 200 / 200           | 是，hires，非试听 | 190 ms |

这里只比较官方歌曲 URL 接口，并非完整切歌到出声时间。未打印 Cookie、密钥内容或完整播放 URL。

### 无法核验的视频搜索先耗时、后必定拒绝

当前用户启用了按来源顺序查找，默认顺序中 ytdlp 位于 pyncmd 之前。UNM 0.28 的 youtube、youtubedl、ytdlp 路径没有调用候选身份选择器，并丢弃了可用于核验的歌曲信息。现有适配器会在 `await provider.check()` 之后拒绝这些结果；这保持了防错播要求，但仍先执行外部视频搜索，现场 ytdlp 阶段可等待十余秒至二十余秒。

官方音源的本地协议异常使大量歌曲进入这条较慢的回退路径。没有证据表明本次主要耗时来自音频 CDN 首包或 Renderer 长任务。

## 最小修复

- `src/main/appServer/neteaseRequestParams.ts`：为未指定协议的 `song/url/v1` 设置 API 库已支持、实测可用的 EAPI。保留明确指定的协议、原音质参数、账号 Cookie 和权限结果；其他 API 不受影响。不修改依赖文件、不引入额外密钥初始化服务。
- `src/main/utils/unblockMatcher.ts`：对当前依赖中已知不能形成身份核验凭据的三类视频来源，在执行网络搜索或外部命令之前拒绝，记录有界的 `candidate-skipped` 事件。保留其配置项；不改变可核验来源的顺序和身份校验，也不增加重试预算。

这不是降低音质来换取速度。EAPI 仍将请求中的原 level 发送给官方接口；能否获得对应音质由官方账号权限与返回结果决定。

## 自动化验证

- 新增真实 API 库测试：在独立临时目录中不提供 XEAPI 公钥，先复现默认协议失败，再验证适配后走 `/eapi/song/enhance/player/url/v1`，解密测试请求确认 `level=hires` 和歌曲 ID 保留。网络完全使用受控响应，不访问真实账号。
- 扩展真实 UNM 模块测试：顺序经过三个不可核验视频来源后仍能取得 pyncmd；断言未调用外部搜索进程、未请求 YouTube 或错误媒体 URL。
- 原错播防护测试继续检查同名不同艺人、版本与时长冲突、旧缓存，以及并行来源的身份凭据隔离。
- 完整 Playwright：427 通过，2 项按需长测跳过，0 失败。随后将并行身份隔离用例调整为两个仍会执行的来源，相关 11 项用例另行复跑通过，避免视频源提前跳过使该用例失去隔离覆盖。
- `npm run lint`、`npm run build:pre` 通过；后者包含原生模块 ABI、图标生成、TypeScript 检查与生产构建。
- 改动文件 Prettier 与 `git diff --check` 通过。

本地 amd64 DEB 已构建成功，SHA-256 为 `6d6f7b1fa657ba34f2480440d7f258384bb0d7b50da4c50b98603f350f78f771`。ASAR 中主进程文件与本次生产构建逐字节一致。打包仍有既有 Git 来源依赖 `discord-rpc` / `register-scheme` 的依赖树告警；打包退出 0，不声称这些生态告警已解决。

脱敏核对结果见 [verified.json](artifacts/2026-11-03-track-latency/verified.json)。

## 本机安装与实际切歌验证

用户同意安装并重启后，通过正常暂停和应用自身退出路径结束旧进程。先在本机私有目录备份账号配置、Cookie 数据库、Local Storage、Session Storage 与缓存数据库；数据库备份的完整性检查为 ok。没有将这些私有备份提交到仓库。

使用本地 DEB 原位重装，系统状态为 `install ok installed 4.0.0~beta.1 amd64`。已安装 ASAR 与本次构建的 SHA-256 一致。新实例未出现 XEAPI 公钥缺失、SQLite 持久化初始化失败或原生模块 ABI 错误。

重启后的核对确认：同一账号、原曲目、36 首队列内容、下一首队列、播放来源、设置和音量保留；原播放位置差值为 0 秒。随后恢复播放，调用正常下一曲操作连续测试三次，没有直接改写播放队列或听歌账本。

| 样本 | 官方音源解析 | 下一曲调用完成 | 播放进度前进 | 官方返回音质 |
| ---- | -----------: | -------------: | -----------: | ------------ |
| 1    |       350 ms |        2165 ms |      2265 ms | lossless     |
| 2    |       296 ms |        2556 ms |      2656 ms | lossless     |
| 3    |       703 ms |        2116 ms |      2267 ms | hires        |

三首均未命中音频缓存，来源为官方 netease；都达到 readyState=4、AudioContext running，进度实际前进；音源重试与停滞恢复计数均为 0。媒体首包分别为 392、100、190 ms。原 0.5 秒渐变设置保持不变。

三个请求均保留 Hi-Res 设置，另行读取官方响应核对实际返回两首 lossless、一首 hires，均为非试听 URL。服务端实际提供的音质不等于客户端请求值，不能把三首全部描述为 Hi-Res 音频。

测试后队列内容仍与测试前一致，当前实例继续正常播放。脱敏安装与采样数据见 [installed-verification.json](artifacts/2026-11-03-track-latency/installed-verification.json)。

## 结论边界

前面的 6 ms / 190 ms 是同曲、同账号与同音质请求的协议对照；实际切歌三首是新安装版运行数据。历史慢样本和新切歌样本不是严格同曲配对，不能据此计算同条件端到端性能提升比例，也不能承诺所有歌曲均在同样时间内开始播放。

本轮确认官方协议异常及无效视频搜索等待路径得到修正。未进行主观听辨或音频指纹验证，不声称覆盖全部歌曲、来源、会员音质、Windows/macOS 实机或长时间运行，也没有将此前偶发报表连接超时描述为已经解决。

本次没有修改心动排序、播放计时、ListenSync、队列管理、默认素材或字体，没有修改版本号或触发 Release。
