# VutronMusic 开发调试指南

本文适用于 macOS、Linux 和 Windows 的源码开发环境。调试时不要使用正式版本标签，也不要在含有真实密码、Cookie 或令牌的日志中直接公开完整配置。

## 1. 完整同步与干净启动

本地修改不需要保留时：

```bash
cd /Users/bysan/Projects/VutronMusic
git fetch origin --prune
git reset --hard origin/main
rm -rf node_modules/.vite dist
yarn dev 2>&1 | tee ~/Desktop/vutron-dev.log
```

需要保留本地修改时：

```bash
git status --short
git stash push -u -m "before-debug"
git pull --ff-only origin main
rm -rf node_modules/.vite dist
yarn dev 2>&1 | tee ~/Desktop/vutron-dev.log
```

开发环境在 macOS/Linux 默认使用软件渲染，以避开部分 Chromium SharedImage 合成问题。

## 2. 图形模式对照

稳定的软件渲染模式：

```bash
VUTRON_DISABLE_HARDWARE_ACCELERATION=1 yarn dev
```

验证硬件加速是否正常：

```bash
VUTRON_ENABLE_HARDWARE_ACCELERATION=1 yarn dev
```

只在硬件模式出现白屏、闪烁、`Invalid mailbox` 或 `SharedImageManager` 时，问题位于 Chromium/GPU 合成链路；在两种模式都出现时，优先检查 Vue、preload、CSP 和 IPC 日志。

## 3. Vue DevTools

Vue DevTools 扩展默认不自动加载，避免扩展版本与 Electron 37 内置 Chromium 不兼容时产生 `renderer.bundle.js script failed to run`。

确实需要组件树和 Pinia 检查时显式启用：

```bash
VUTRON_ENABLE_VUE_DEVTOOLS=1 yarn dev
```

扩展模式出现错误而普通 `yarn dev` 正常时，应将问题归类为开发扩展兼容性，不要修改播放器业务代码规避。

## 4. 主进程与渲染进程日志

主进程重点搜索：

```text
[Window] 页面加载失败
[Window] 渲染进程退出
[Window] 渲染进程无响应
[Graphics] GPU 子进程退出
[Security] 已阻止
[DB]
[Worker cacheTrack]
[Worker writeCover]
```

渲染进程在开发者工具 Console 中重点查看：

```text
Uncaught
Unhandled
TypeError
ReferenceError
EvalError
Refused to
Unknown ipc channel
```

来自以下来源的消息通常是开发工具自身噪声：

```text
devtools://devtools/...
Request Autofill.enable failed
Request Autofill.setAddresses failed
```

可在 Console 过滤框中输入：

```text
-url:devtools:// -Autofill
```

## 5. 主窗口与桌面歌词分别调试

主窗口和桌面歌词是两个独立 renderer，且使用不同 preload。测试桌面歌词时：

1. 在设置中显示桌面歌词；
2. 右键桌面歌词或通过 Electron 的窗口调试入口打开该窗口 DevTools；
3. 检查 `osdlyric.html` 是否成功加载；
4. 检查 `window.mainApi`、`window.env` 是否存在；
5. 依次验证拖动、四边缩放、紧凑模式、锁定、鼠标穿透、封面控制区和字体缩放；
6. 关闭并重新打开桌面歌词，确认 MessagePort 能重新连接。

preload 问题通常表现为：

```text
Electron renderer.bundle.js script failed to run
Unknown ipc channel name
Message port is not available
```

修改 `src/preload/*.ts` 后必须完整退出 Electron，再重新执行 `yarn dev`，Vite 热更新不足以重新加载 preload。

## 6. 功能回归顺序

### 启动与窗口

- 主窗口首次启动和二次启动；
- 主窗口缩放、最小化、最大化和关闭选项；
- 软件渲染与硬件加速各运行一次；
- 窗口关闭后无残留 Electron Helper 进程。

### 在线歌曲与封面

- 首页、歌单、歌手和播放页封面正常；
- Console 不再出现 `music.126.net` 图片 CSP 拦截；
- 播放、暂停、上一首、下一首和进度拖动正常；
- 今日已签到时只输出普通信息，不再记为 ERROR。

### 本地音乐

- 重新选择一个音乐目录；
- 首次扫描、增量扫描和删除文件后重扫；
- 不出现重复歌曲 ID；
- 本地封面、歌词和“在文件夹中显示”正常；
- 未授权路径被拒绝后扫描状态能够结束。

### 桌面歌词

- 普通与紧凑模式；
- 锁定和鼠标穿透；
- 左侧封面与控制按钮独立开关；
- 主窗口与桌面歌词播放状态同步；
- 预设保存、应用和删除；
- 重启后窗口位置、尺寸和设置恢复。

### 睡眠定时器

为了避免等待 15 分钟，可先测试“当前歌曲结束后”，并把播放进度拖到末尾前 5 秒：

- 正常播完后暂停且不进入下一首；
- 手动切歌后取消本曲结束定时；
- 分钟定时器倒计时持续更新；
- 替换定时器和取消定时器正常；
- 到时使用淡出暂停，不误触发播放。

### 设置备份

- 导出 JSON；
- 搜索文件中是否含有 `password`、Cookie、代理和本地目录；
- 修改一项界面设置后导入恢复；
- 导入损坏 JSON 时当前设置不被部分覆盖；
- 导入完成后应用重新加载。

### 流媒体服务

- Navidrome、Emby、Jellyfin 公网地址；
- 用户明确配置的局域网地址；
- 登录页不回显明文密码；
- 密码留空可继续使用系统安全存储中的密码；
- 登出后旧密码不能继续复用。

## 7. 静态检查

```bash
yarn run format:check
yarn lint
yarn run vue:type-check
yarn playwright test tests/security-hardening.spec.ts
yarn vite --config vite.config.ts build
```

格式失败时：

```bash
yarn run format:fix
git diff --check
```

## 8. 定位回归提交

确认某个旧提交正常、当前提交异常后，可使用 Git 二分：

```bash
git bisect start
git bisect bad
git bisect good <已知正常提交>
```

每次 Git 切换提交后执行：

```bash
rm -rf node_modules/.vite dist
yarn dev
```

根据结果执行 `git bisect good` 或 `git bisect bad`。结束后：

```bash
git bisect reset
```

## 9. 提交问题时需要提供的信息

```bash
git rev-parse --short HEAD
node --version
yarn --version
uname -a
```

同时提供：

- 使用的软件/硬件渲染模式；
- 问题发生的窗口；
- 可重复步骤；
- 首个异常前后约 50 行日志；
- Console 中首个业务来源异常，而不是后续连锁异常；
- 是否启用了 Vue DevTools。
