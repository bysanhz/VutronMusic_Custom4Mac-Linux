# 新资源采用与旧资源清理验证

## 完成范围

工作分支为 `main`，修改前HEAD为 `1d980212c4d2963dc543516b154649f3de5e8177`。

- 01默认图、03圆角人物图、04导航标识、05登录标识、06自绘标题栏、07人物彩白黑托盘、10–12本地推荐备用图均已接入源码。
- Inter字体已用于主界面，SIL许可证随应用分发；歌词自选字体和系统标题栏字体未变。
- 08默认头像未变；真实歌曲封面仍优先，CDN和代理失败后才回退默认图。
- 09的Vue图标、旧文字标识、废弃打包图标/iconset、旧Base64图标源、旧审核图片和历史页面共152个文件已从工作区直接删除，清单见 [asset-adoption-cleanup.json](asset-adoption-cleanup.json)。旧默认图已被森林新图覆盖，没有另留备份。
- 不修改用户音乐、缓存和账户，不删除历史安装包，不重写Git历史；没有发布Release。

## 已运行且通过

| 检查 | 结果 |
| --- | --- |
| `npm run vue:type-check` / 构建内类型检查 | 通过 |
| `npm run lint` | 通过 |
| `eslint tools/generate-app-icons.js` | 通过 |
| `npm run build:pre` | 通过，包含Native ABI检查、图标生成和Vite生产构建 |
| 图片恢复、JPEG/PNG缩放与传输测试 | 8项通过 |
| 新资源与既有封面恢复Electron集成测试 | 8项通过 |
| Linux electron-builder目录包 | 通过；使用独立临时输出，不覆盖已有安装包 |
| Linux ASAR资源核对 | 新封面、推荐图、三版托盘、登录圆角图、Inter及许可证均存在 |
| 当前资源展示页 | 7页关联的28个链接均返回HTTP 200，无缺失旧图引用 |
| `git diff --check` | 通过 |

新增 `tests/branding-resources.spec.ts` 在隔离Electron profile中加载实际的Linux标题栏、推荐卡片、SVG注册器和主界面字体，检查本地备用图、真实封面优先、错误回退、新图标及构建输入；不读取音乐账号或修改真实应用配置。

## 已运行但未全部通过

完整执行本次选定的五份既有回归文件，共106项：89项通过、17项失败。17项全部位于 `feature-regression.spec.ts` 与 `monochrome-theme-design.spec.ts`。

随后将修改前HEAD的源码、测试和相关配置解包至独立临时目录，复用当前依赖运行这两份测试。修改前后结果均为81项通过、17项失败；失败测试名称完全一致，新增失败为0。详见 [branding-regression-comparison.json](branding-regression-comparison.json)。本次未修改这些原有心动模式、歌词交互和主题实现来迎合字符串断言。

此外，打包器报告了当前安装依赖树已有的版本警告，包括网易云API、Pinia等与声明版本不一致；目录打包仍成功。未在本次资源修改中升级依赖，不能把打包通过表述成整套业务功能或线上播放已经通过。

## 跨平台限制

Linux目录包已实际生成并检查资源；macOS、Windows的真实安装包和系统托盘尚未实机验证。两平台的打包配置继续使用同一新1024px图标源；macOS歌词Canvas的图标输入已更新为新44px单色人物，保留原有合成与系统模板流程。

已安装旧版本不会因源码变化自动更新；需使用新构建或重启开发实例。此次没有擅自替换运行中的安装包或中断播放。

## 当前入口与证据

- [当前采用资源总览](prism-review-20261102/index.html)
- [当前资源制作与代码入口](prism-review-20261102/README.md)
- [隔离组件加载截图](prism-review-20261102/adopted-renderer.png)
- [包内资源检查](packaged-branding-validation.json)
