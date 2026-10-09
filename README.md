# MindFarm

一款面向 macOS 的文档型思维导图应用。基于 Electron + React 19 + TypeScript 构建，导图内核使用 [Mind Elixir](https://docs.mind-elixir.com/)。

每个窗口对应一个 `.mind` 文档，行为遵循 macOS 的文档型应用惯例：原生菜单栏、最近打开、代表文件（represented filename）、关闭时的"是否保存"询问、跟随系统的深色模式。

## 节点样式面板

`⌘I`（或"视图 → 节点样式面板"、标题栏的"样式"按钮）打开右侧检查器，选中节点后可以调整：

| 分区       | 可编辑内容                                     |
| ---------- | ---------------------------------------------- |
| 文本       | 字号、粗体、删除线、文字颜色、背景颜色         |
| 分支       | 一级分支的连线颜色                             |
| 标签       | 节点下方的文字标签                             |
| 图标       | 节点末尾的 emoji 标记                          |
| 链接与备注 | 超链接（点击图标用系统浏览器打开）、纯文本备注 |
| 图片       | 从文件或剪贴板插入，缩小后嵌进节点             |

文本类字段对整个多选生效；标签、图标、图片、链接与备注只在选中单个节点时可编辑。面板的开关状态保存在偏好里，
由主进程持有，因此菜单勾选、各个窗口和下次启动始终一致。

## 导出

“文件 → 导出为 PNG…”和“导出为 PDF…”把整张导图写成图片或单页 PDF，不改变当前打开的 `.mind` 文件。
截图走 DOM 克隆而不是内核自带的 `exportPng()`：后者把文字放进 SVG 的 `foreignObject`，Chromium
把这种 SVG 当图片绘制时会丢掉文字。PDF 是把同一张 PNG 嵌进一页，页尺寸跟图片走；超过 PDF 的页面上限时按比例缩小。

## 手形与框选

在画布空白处按住左键拖动即可平移，这是默认操作。点一下空白处会先提交正在编辑的文字，再取消当前节点的选中。
状态栏可以切到“框选”（`V`）恢复拉框多选，再按 `H` 回到手形。框选模式下按住空格也暂时变成手形。
点一下空白处同样会取消选中；拖出选框则保留框到的节点。

按住节点（光标为抓手）可以拖动它。拖过中心主题的另一侧，会换到左边或右边；在同一侧拖到节点之间的空隙，或拖到某个节点的上沿、下沿，会调整上下顺序。拖到节点中部则变成它的子节点。
中心主题不能拖。松手后导图会自动重排，这一步可以撤销。点在节点上的选中和编辑不受手形、框选切换影响。

## 技术栈

| 领域   | 选择                                      |
| ------ | ----------------------------------------- |
| 运行时 | Electron 43（contextIsolation + sandbox） |
| 构建   | electron-vite 5 / Vite 7                  |
| 界面   | React 19、TypeScript 5.9、Tailwind CSS 4  |
| 导图   | mind-elixir 5.15                          |
| 导出   | snapdom（PNG）、pdf-lib（PDF）            |
| 状态   | Zustand                                   |
| 打包   | electron-builder 26（DMG，仅 arm64）      |

## 开始开发

```bash
npm install
npm run dev
```

其他命令：

```bash
npm run typecheck    # 主进程与渲染进程分别做类型检查
npm run lint
npm run build        # 类型检查 + 产出 out/
npm run start        # 以生产方式预览已构建的产物
npm run icons        # 由 build/*-source.png 重新生成 icns
npm run smoke        # 端到端冒烟测试：样式面板、手形平移、空白失焦、拖拽重排、节点图片、PNG 截图
```

`npm run smoke` 会带着 DevTools 协议端口启动构建产物，然后像用户一样点选节点、改颜色、写备注、撤销，
断言导图、脏标记与撤销栈都同步。应用持有单实例锁，运行前请先关掉已打开的 MindFarm 窗口。

> 在 Cursor、VS Code 等 Electron 编辑器的内置终端里运行时，环境可能带有 `ELECTRON_RUN_AS_NODE=1`，
> 这会让 Electron 退化成普通 Node 进程从而无法启动。遇到这种情况用
> `env -u ELECTRON_RUN_AS_NODE npm run dev` 即可。

## 打包

```bash
npm run dist:mac:unsigned   # 本地验证用，产物为 ad-hoc 签名，只能在本机运行
npm run dist:mac            # 正式分发，需要 Developer ID 证书
```

正式分发需要在环境中提供以下变量，`scripts/after-sign.cjs` 会自动调用公证：

```
APPLE_ID=you@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
```

证书不要提交进仓库。CI 里将 `.p12` 转成 base64 存入 Secret，运行前解码并导入钥匙串即可。

## 工程结构

```
src/
  main/                 主进程：窗口、菜单、文件读写、偏好设置
    index.ts            应用生命周期、open-file、单实例、CSP
    window-manager.ts   一窗口一文档的状态机与关闭确认
    documents.ts        新建 / 打开 / 复用空白窗口
    file-service.ts     .mind 的读写（原子写入）与系统对话框
    menu.ts             macOS 原生菜单栏
    ipc.ts              ipcMain 处理器
    preferences.ts      主题、面板开关与窗口尺寸的持久化
  preload/index.ts      contextBridge 白名单，暴露 window.api
  renderer/src/
    App.tsx             外壳编排
    components/         标题栏、画布容器、状态栏、提示
      Inspector/        节点样式面板与各分区
    hooks/              useMindElixir / useMenuActions / useAppTheme / useInspector
    store/document.ts   文档元信息与 UI 状态
    themes/             浅色与深色主题
  shared/               两端共享的类型、IPC 通道常量、API 契约
```

## 文件格式

`.mind` 是 UTF-8 的 JSON，外层是一个信封，`data` 直接内嵌 `mind.getData()` 的结果，与内核零转换：

```json
{
  "version": 1,
  "meta": { "title": "产品规划", "createdAt": "…", "updatedAt": "…" },
  "data": { "nodeData": { "id": "root", "topic": "产品规划", "children": [] } }
}
```

样式面板写入的 `style`、`branchColor`、`tags`、`icons`、`hyperLink`、`note`、`image` 都是 `NodeObj` 上的原生字段，
一并存在 `data` 里，不引入自定义扩展。`image.url` 是缩小后的 data URL，长边不超过 480 像素，所以文档单独一份就能带走图片。

打开时也接受裸的 `mind-elixir` 导出数据（即顶层直接是 `{ nodeData: … }`），会自动补全信封。
保存走"先写临时文件再 `rename`"的原子流程，写入中断不会损坏原文件。
主题不随文档保存，始终由应用级的外观设置决定。

## 几个实现要点

**React 与命令式内核的边界。** Mind Elixir 是操作 DOM 的命令式库，不是 React 组件。React 只负责外壳，
画布交给 `useMindElixir` 持有的实例。effect 的 cleanup 会调用 `mind.destroy()`，因此 StrictMode 下的
双次挂载不会留下两张导图。

**快捷键的归属。** 注册成 Electron 加速键的按键会被原生菜单拦截、不再传到页面，所以菜单里分成两类：

- `⌘Z` / `⌘S` / `⌘=` 这类由菜单注册，点击后通过 IPC 交给渲染进程处理。撤销会先判断当前是否正在编辑
  节点文本：是则走文本撤销，否则调用 `mind.undo()`。
- `Tab`、`Enter`、`Delete`、`⌘C/V/X` 用 `registerAccelerator: false`，只显示提示不注册，
  把按键留给 mind-elixir 自己的快捷键与浏览器默认行为。

**样式面板的写入路径。** 面板只调用 `mind.reshapeNode(tpc, patch)`，它会把补丁合并进节点并触发 `operation`
事件；撤销插件对 `getData()` 做全量前后快照，脏标记也挂在同一个事件上，所以撤销、重做与"已编辑"标记都不需要
额外接线。三个由此而来的约束：

- 清除某个样式要传空字符串。内核渲染节点时只做 `el.style[key] = value`，从不重置已有的行内样式，
  删掉 key 会让旧颜色留在 DOM 上。
- 每次调用都压一条历史。取色器走原生 `change` 而不是 React 的 `onChange`（后者对应 `input` 事件，
  拖动时会持续触发），文本框则防抖 500ms 并在失焦时提交。
- 多选时每个节点用独立的补丁副本。`reshapeNode` 会保留传入的那个 `style` 对象，共用一份会把第一个节点的
  颜色泄漏给其余节点。

**深色模式。** Mind Elixir 明确不监听 `prefers-color-scheme`。主进程通过 `nativeTheme` 作为唯一事实来源，
把变化推给所有窗口，渲染进程再调用 `mind.changeTheme()` 并切换 Tailwind 的 `dark` class。

**安全基线。** `contextIsolation` + `sandbox` 开启、`nodeIntegration` 关闭；渲染进程不接触 `fs`，
只能调用 preload 暴露的白名单方法；除 Vite 开发服务器外一律注入 CSP；外链交给 `shell.openExternal`。

## 尚未包含

导出 SVG、Markdown 与 OPML / XMind 互转、节点搜索、多标签页、自动更新、AI 生成导图。
文件格式带 `version` 字段，IPC 层按可扩展设计，后续接入不需要重构。

## 许可

本项目以 [Apache License 2.0](LICENSE) 授权，Copyright 2026 MindFarm。
