# 2026-11-01 主窗口内存与歌曲封面诊断

## 执行范围与结论

仓库为 `/home/pcbysan/Projects/VutronMusic`，分支 `main`，修改基线为 `e1c21c1`。开始时工作区干净，本地保留此前三个提交。本轮没有推送或发布 Release，没有修改依赖与锁文件，也没有删除听歌历史。证据汇总见 [数值记录](2026-11-01-cover-memory-metrics.json)。原始用户快照及本机探测脚本保留在 `/tmp/vutron-audit-20261101/`，不自动上传。

运行环境为 Ubuntu 22.04、kernel 6.8、Electron 37.10.3、Chromium 138、Node 22.21.1；实际安装的 `vue-i18n` 为 9.14.5。现场是开发模式，浏览器加载了 Vite 入口。以下结论适用于这个实际运行组合，不把开发版的计时问题推定为所有发行包的问题。

已确认两个独立问题：翻译性能记录在浏览器原生堆中长期累积；API 与媒体/图片选择代理的方式不一致。此外，图片代理存在允许名单遗漏，播放器封面缺少失败处理，诊断统计没有覆盖当前播放封面。

## 主窗口内存：已采到累计对象

### 原进程证据

用户快照中的主窗口 PID 为 2947814：RSS 10677.65 MiB（约 10.4 GiB）、PSS 10581.32 MiB、Private 10542.03 MiB。CDP 的 JS Heap used 为约 68.9 MiB，`performance.memory` 的估计为约 86 MiB；这两个值都不能代表进程总占用。

`Runtime.getHeapUsage` 的 embedder heap 为约 2484 MiB，图片资源约 28 MiB。现场读取显示只有约 3500 个 DOM 节点。保留原进程后，通过仅绑定本机的主进程 Inspector 和 WebContents 调试协议取得对象类型汇总。

对象汇总发现：

| 类型 | 数量 | 自身体积 |
|---|---:|---:|
| `PerformanceMeasure` | 16,746,894 | 2,294,929,104 bytes，约 2.14 GiB |
| `system / ExternalStringData` | 3,499 | 约 18.1 MiB |

完整对象图约 1.28 GB。首次采集超过 512 MiB 的内存预算后被丢弃；第二次改为流式统计，仅保留对象类别、数量及字节汇总，没有把原始对象图中的字符串表、Cookie 或鉴权 URL 写入文件。对象图采集本身会暂停页面、触发采集器行为并暂时增加 RSS；因此不能把采集期间的峰值当成应用正常增长数据。

### 来源与处理

现场短时观测的新计时记录名称为：

- `intlify message resolve`
- `intlify message compilation`
- `intlify message evaluation`

调用栈指向当前安装的 `vue-i18n`。其 `@intlify/shared/dist/shared.mjs` 中的开发版 `measure()` 调用 `performance.measure()` 后只清理 start/end marks，没有释放 measure 记录。每次翻译都会继续向浏览器 Performance Timeline 添加记录。现场 Vue 的 `app.config.performance` 为 false，Vue DevTools hook 也不存在；关闭 Vue 自身性能开关不能阻止这组 Intlify 记录。

修复位于 `src/renderer/utils/i18nPerformance.ts`：通过 `PerformanceObserver` 在批次交付后清理这三个明确归属 Intlify 的计时名称，不清理业务自定义计时、Resource Timing 或其他性能记录。安装时也清理已有的三个名称，避免申请包含数百万条旧记录的 buffered observer 列表。主窗口在 `runtime-stability.ts` 启动时安装，桌面歌词在独立入口安装。诊断新增 active/releasedEntries 标量。没有改写浏览器原生方法，没有定时 GC、Heap Limit 调整或周期性重启。

### 可重复验证与边界

`tests/renderer-resources-integration.spec.ts` 在真实 Electron/Vite 中加载实际 `vue-i18n`：2 万次翻译留下 6 万条计时记录；安装清理后再运行 10 万次翻译，三个名称的记录数全部为 0，业务自定义 `application-owned` 记录保留。测试不调用强制 GC，记录实际 JS/embedder heap 与工作集，翻译返回内容保持一致。

原异常进程中，定向清理后十秒内记录数归零，但工作集没有立即下降。这说明不能把记录清理等同于物理页即时归还。本轮并未逐页归属全部 10.4 GiB RSS；对象自身体积也不是整个进程内存。

开发入口恢复后另进行了三分钟、每十五秒一次的只读采样，共 13 点：三个计时名称一直为 0，封面持续加载成功，播放器保持暂停。该短测工作集从约 255.5 增至 291.3 MiB，PSS 从约 153.2 增至 201.9 MiB，不能宣称零增长。重启后的低起始值属于冷启动观察，不能作为整个历史 RSS 降幅的受控对比；全天稳定性仍待验证。原 Browser 进程约 1.1 GiB 的历史占用也未完成独立归因。

## 封面：输入有效，请求策略不一致

### 单变量网络证据

当前歌曲为 `1986743401`，底部播放器封面是 `p4.music.126.net` 的直接图片 URL。原图 complete=true、naturalWidth=0。原进程的 Chromium session 对该地址解析代理结果为 `DIRECT`；DNS 是 `198.18.0.0/15` Fake-IP。

同一张图片不改 URL，只改请求路径：直连及 CDN 候选在八秒内未返回；显式通过已有 `http://127.0.0.1:7890` 代理，HTTP/HTTPS 都得到 200，有效 PNG，约 66–76 ms。上游把该 PNG 标成 `image/jpg`，但真实字节可解码，不能将 MIME 差异直接认定为原故障原因。

网易云 API 已通过 `getDevSystemProxy()` 使用进程的 HTTPS_PROXY，而 Chromium 图片 session 和 Node 音频代理当时没有采用这个开发环境回退。因此可以出现“歌曲详情/API 成功，封面与音频 CDN 请求却超时”。这里只确认请求策略的不一致；没有仅凭 Fake-IP 推定系统 TUN、透明代理或具体路由规则出了哪一种问题，也没有更改系统代理配置。

### 修复与其他已确认缺陷

1. `src/shared/proxySettings.ts` 新增统一的开发运行时代理选择：有效的应用自定义代理优先；开发模式中再使用现有 HTTPS_PROXY/https_proxy，和既有网易云 API 的回退方式一致。发行模式不自动启用这个环境回退。
2. `src/main/index.ts` 在加载页面之前等待 Chromium session 代理设置完成；`proxyFetch.ts` 使用同一选择规则，设置页更新代理时也同步采用该规则。没有硬编码 7890，也没有修改用户持久化代理配置。
3. `atom://get-image` 原来有处理器，却不在 `runtimeSecurity.ts` 的 KNOWN_ATOM_HOSTS 中，会被提前返回 404。这是独立的潜在失败点；原截图的底部图片是直接 URL，不能把这次直接请求超时归因于该 404。现在增加严格限定的图片入口，仍要求网易云域名和公网 DNS 地址策略；私网和无关域名返回 403。
4. `src/main/utils/coverFetch.ts` 将既有 CDN 候选变为有限、可取消的请求，每个候选设置 3.5 秒取消信号、最多 8 MiB 图片文件数据；关闭错误响应与未消费的流。按实际字节识别图片 MIME，拒绝 HTML 等伪图片；只对纯尺寸参数提供不带尺寸的候选，保留签名及其他查询字段。
5. `coverImageFallback.ts` 为底部播放器、经典播放器和桌面歌词封面增加一次同资源代理回退，仍失败时使用本地默认图。卸载移除监听器，不重复重试占位图。封面卡片也不再通过删除鉴权参数来“恢复”图片。
6. `coverNetworkDiagnostics.ts` 改在 document 捕获图片事件，覆盖播放封面与桌面歌词，并补充当前 loaded/broken/pending 统计。原先“0 成功、0 失败”不能证明封面正常；新测试在真实图片错误事件下验证了计数和脱敏。

### 实际恢复结果

恢复后的开发实例中，同一歌曲的 p4 封面 naturalWidth/naturalHeight 为 512×512；session 代理为 `PROXY 127.0.0.1:7890`。新获取的公开歌曲 443854 音源返回 API 200、媒体 206、`Content-Range: bytes 0-1023/4698741`，文件头为 ID3。探测只读取并取消响应，没有改变主播放器的歌曲或暂停状态，也没有产生听歌时长。

Linux 目录包用全新临时 profile、明确配置的 HTTP 代理实际启动；验证页面确实是生产产物而非 Vite 页面。歌曲 443854 播放时间前进超过 0.6 秒，readyState=4，无媒体错误。图片代理返回 2809×2809 JPEG，字节内容与本地默认图不同。私网图片返回 403，复制诊断中没有测试 Token。此测试不使用用户账号，也不把开发环境回退当作发行包默认行为。

用户账本重启前后均为 1622 条，合计秒数与按 ID/秒数排序的 SHA-256 摘要完全一致。本次不修改听歌核算或推荐算法。

## 修改与验证

| 范围 | 文件 |
|---|---|
| 翻译计时生命周期 | `src/renderer/utils/i18nPerformance.ts`、`runtime-stability.ts`、`osdLyric.ts` |
| 代理一致性与图片请求 | `src/shared/proxySettings.ts`、`src/main/{index,IPCs}.ts`、`utils/{proxyFetch,coverFetch,index}.ts`、`security/runtimeSecurity.ts` |
| 当前封面及诊断 | `coverImageFallback.ts`、三个播放封面组件、`CoverBox.vue`、`coverNetworkDiagnostics.ts`、`diagnosticsSnapshotSettings.ts` |
| 回归 | 新增传输/真实 Electron 资源测试；同步滞后的封面与诊断源码断言；Vite 测试改用临时缓存目录 |

| 检查 | 结果 |
|---|---|
| `npm run vue:type-check`、Lint | 通过 |
| `npm run build:pre`、Linux `npm run build:dir` | 通过；已有依赖树版本漂移告警仍存在 |
| 针对封面、安全、音频恢复、计时和状态面板的检查 | 54 项通过 |
| 最终广泛回归，排除已有 Environment check | 360 通过、22 失败；失败名称均在原有基线失败名单中 |
| Linux 生产目录包实际播放、真实封面、私网阻断、脱敏 | 通过，使用隔离 profile |
| 独立主进程 `tsc --project tsconfig.node.json --noEmit` | 仍失败：同条件基线 365 条、当前 362 条，涉及既有依赖类型、共享文件列表和严格空值问题；没有将其报告为通过 |
| Windows/macOS 真机、24 小时稳定性 | 未运行 |

原 Environment check 本轮未重复执行，其历史首窗口超时不混入上述 22 项失败。自动缓存及嵌入封面的 worker 请求路径本轮没有修改，也没有独立完成代理回归；不把可见封面及在线播放的验证扩大成全部下载功能均已验证。
