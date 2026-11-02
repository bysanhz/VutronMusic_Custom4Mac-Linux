# VutronMusic 新资源接入

## 状态

用户已采纳全部新资源，并要求直接删除09及其他废弃旧图。当前源码已使用新图片、图标和主界面Inter字体；默认头像保持原样。原02合并至01，09不再保留文件或展示卡片。没有发布Release，没有重写Git历史。

- [当前总览](index.html) / [图片版](numbered-review.png)
- [03–07图标](symbols-review.html) / [图片版](symbols-review.png)
- [人物托盘三版及原尺寸](tray-review.html) / [图片版](tray-review.png)
- [四张场景](scene-gallery.html) / [图片版](scene-gallery.png)

本机地址：<http://127.0.0.1:8765/index.html?adopted=1>。

## 当前代码入口

| 用途 | 当前文件 |
| --- | --- |
| 03应用图标及05登录图标 | `src/renderer/assets/branding/app-icon.png` |
| 04首页导航 | `src/renderer/assets/icons/brand-logo.svg` |
| 同源单色导航与06标题栏 | `src/renderer/assets/icons/logo.svg` |
| 主进程默认图 | `src/public/images/default.jpg` |
| Renderer本地默认图 | `src/renderer/assets/images/default.jpg` |
| 10–12推荐备用图 | `src/public/images/branding/recommend-{beach,snow,sakura}.jpg` |
| Linux/Windows三版托盘 | `src/public/images/tray/vutronmusic-{color,white,black}.png` |
| macOS歌词Canvas图标 | `src/renderer/assets/tray/menu_{white,black}.png` |
| 主界面字体 | `src/renderer/assets/fonts/InterVariable.woff2` |

默认封面与推荐图导出为512px JPEG，原画保留在本目录当前选定资源中。真实曲目封面优先；没有真实来源才显示推荐备用图，加载失败继续通过现有封面恢复链路处理。歌词自选字体与系统标题栏原生字体未改。

`npm run app:icons` 从03的透明定稿生成Linux尺寸、通用1024px PNG和运行时彩色托盘；electron-builder的Linux/macOS/Windows配置都指向这套新资源。开发命令也先生成图标。源文件已经有透明圆角，不再执行旧的白色背景洪泛清除，以免破坏头发与衣服高光。

## 旧资源清理

删除范围包括09的Vue图标与旧文字标识、未使用的旧ICO/ICNS/iconset、旧应用图标Base64分片、废弃品牌PNG、旧审核候选与历史对比页面。删除记录见上一级 `asset-adoption-cleanup.json`。原旧默认图文件已被新森林图覆盖；未修改用户音乐、缓存、账户、默认头像或功能按钮/第三方服务标志，也未删除历史安装包。

## 制作来源

- 03圆角处理：[完整提示词](icon-generation-prompt-v12.json)，内置image_gen。
- 四场景：[完整生成与姿势提示词](scene-generation-prompts-v3.json)，内置image_gen。
- 07单色人物：[完整提示词与模板来源](tray-portrait-prompt-v4.json)，内置image_gen；黑白由同一个SVG模板输出。
- 04/06：[可编辑矢量与导出脚本](scripts/build-mark-v3.cjs)。
- 07：[可重复模板导出脚本](scripts/build-tray-portrait-v4.cjs)。
- Inter：[SIL许可证](assets/Inter-OFL.txt)，同时随应用字体分发。

旧输入图已经按要求删除，提示词中的输入路径仅记录历史制作来源，不再作为当前文件链接。

## 验证

类型、Lint、生产构建和Linux目录打包均已通过；16项资源相关与Electron集成测试通过。扩大回归的17项失败与修改前HEAD完全一致，新增失败为0。完整结果见上一级 `asset-adoption-validation.md`。跨平台资源可以静态核对，macOS和Windows的真实系统托盘效果仍需对应平台运行验证。
