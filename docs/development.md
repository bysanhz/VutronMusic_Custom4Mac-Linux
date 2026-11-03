# 开发与构建

本指南对应 `main` 分支。先阅读根目录 [README](../README.md) 了解功能与安装；此处说明本地开发、验证和打包。

## 环境

- Node.js ≥ 22.12.0，Yarn 1.22.22。
- Python 3 与本平台 C/C++ 构建工具，用于 Electron 原生依赖。
- Linux 图形测试需要 Xvfb、D-Bus 及 Electron 所需的 GTK/NSS 等系统库。
- macOS 本机构建先准备 Xcode Command Line Tools：`xcode-select --install`。

```bash
yarn install --frozen-lockfile
yarn dev
```

冻结安装以仓库的 `yarn.lock` 为准。`postinstall` 处理原生模块与必要资源；开发和生产构建前会生成当前品牌图标，并检查 `better-sqlite3` 与当前 Electron ABI 是否匹配。

源码同步使用 `git pull --ff-only origin main`。先检查本地修改，不用强制重置解决分支差异。

## 检查与测试

```bash
yarn lint
yarn vue:type-check
yarn build:pre
```

`build:pre` 依次进行原生模块检查、图标生成、类型检查和生产构建。它不创建 Release，也不发布安装包。

在有图形会话的环境运行回归：

```bash
yarn playwright test --workers=2
```

Linux 无桌面环境时，可在完成 `build:pre` 后执行：

```bash
CHOKIDAR_USEPOLLING=1 dbus-run-session -- xvfb-run -a yarn playwright test --workers=2
```

轮询参数用于避免宿主已有大量文件监听器时触发 `EMFILE`，不改系统资源限制。需要按需长测时：

```bash
VUTRON_STABILITY_SECONDS=1800 dbus-run-session -- xvfb-run -a yarn playwright test tests/app.spec.ts --grep 'opt-in production idle' --workers=1
VUTRON_RETAINER_AUDIT=1 dbus-run-session -- xvfb-run -a yarn playwright test tests/player-ipc-lifecycle.spec.ts --workers=1
```

空闲内存测试不主动 GC；堆快照可达性审计会扰动 GC，两者不能混作内存降低的证据。详细方法见[内存调查](diagnostics/2026-11-02-memory-retainers.md)。

格式检查：

```bash
yarn format:check
```

仓库仍有既有格式差异；不要为了局部修改批量格式化整个项目。优先针对改动文件执行 Prettier，并运行 `git diff --check`。

## 本地打包

以下命令均带 `-p never`，仅生成本地产物，不上传或创建 GitHub Release。默认输出在 `release/<package.json 中的版本>/`。

### Linux amd64 DEB

```bash
yarn build --linux deb --x64 -p never
```

### Windows x64 安装版

在 Windows 开发环境执行：

```bash
yarn build --win nsis --x64 -p never
```

### macOS DMG

Apple Silicon：

```bash
yarn build:mac --arm64 -p never
```

Intel Mac：

```bash
yarn build:mac --x64 -p never
```

本机生成的包不等于经过其他平台实机验证；macOS 默认不签名、不公证。需要只检查解包目录时，可先运行 `yarn build:pre`，再调用 electron-builder 的 `--dir`，避免生成安装器。

## 工作流与版本

- [Code Quality](../.github/workflows/ci.yml)：手动触发检查，不因普通 `main` 推送自动执行。
- [Test Build](../.github/workflows/test-build.yml)：手动触发测试打包；脚本会覆盖测试版本号，不能据此认定其等于源码的发布版本。
- [Release](../.github/workflows/build.yml)：版本标签、`main` 上的 Beta 发布清单变更或手动触发进入发布流程。

普通文档或源码提交不应顺便修改 `.github/beta-release.json`、推版本标签或触发发布工作流。当前发布矩阵是 Windows x64 EXE、Linux amd64 DEB、macOS arm64 DMG；构建器的其他格式与架构选项不等于公开发布承诺。

## 界面素材与文档截图

运行时图片、图标与字体的来源和用途见[品牌资源接入记录](design/prism-review-20261102/README.md)。更新 README 截图使用独立 profile，不复用个人账号、缓存或歌单；截图说明见[截图来源](../.github/screenshots/README.md)。

## 本地歌词的已知边界

更新文档截图时，在隔离 profile 中扫描未匹配网易云的本地 FLAC 和同名 LRC，复现了默认 `online → path → embedded` 顺序的错误：`src/main/utils/index.ts:getLyric()` 将结果初始化为 `null`，首个 online 分支因 `matched=false` 跳过赋值，随后访问 `lyrics.length` 抛错。

当前可在设置的歌曲信息“顺序优先”中把路径放在在线之前，使同名外挂 LRC 先被读取。本轮截图使用 `path → embedded → online`；它只验证该配置下的本地演示，不代表默认顺序问题已修复。本次文档更新未修改此业务代码，后续应为未匹配 / 无歌词 / 不同优先级补充针对性测试再修复。
