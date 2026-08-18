# MindFarm

一款面向 macOS 的文档型思维导图应用。基于 Electron + React 19 + TypeScript 构建，导图内核使用 [Mind Elixir](https://docs.mind-elixir.com/)。

每个窗口对应一个 `.mind` 文档，行为遵循 macOS 的文档型应用惯例：原生菜单栏、最近打开、代表文件（represented filename）、关闭时的"是否保存"询问、跟随系统的深色模式。

## 技术栈

| 领域   | 选择                                       |
| ------ | ------------------------------------------ |
| 运行时 | Electron 43（contextIsolation + sandbox）  |
| 构建   | electron-vite 5 / Vite 7                   |
| 界面   | React 19、TypeScript 5.9、Tailwind CSS 4   |
| 导图   | mind-elixir 5.15                           |
| 状态   | Zustand                                    |
| 打包   | electron-builder 26（DMG，arm64 + x64）    |

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
```

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
    preferences.ts      主题与窗口尺寸的持久化
  preload/index.ts      contextBridge 白名单，暴露 window.api
  renderer/src/
    App.tsx             外壳编排
    components/         标题栏、画布容器、状态栏、提示
    hooks/              useMindElixir / useMenuActions / useAppTheme
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

**深色模式。** Mind Elixir 明确不监听 `prefers-color-scheme`。主进程通过 `nativeTheme` 作为唯一事实来源，
把变化推给所有窗口，渲染进程再调用 `mind.changeTheme()` 并切换 Tailwind 的 `dark` class。

**安全基线。** `contextIsolation` + `sandbox` 开启、`nodeIntegration` 关闭；渲染进程不接触 `fs`，
只能调用 preload 暴露的白名单方法；除 Vite 开发服务器外一律注入 CSP；外链交给 `shell.openExternal`。

## 尚未包含

导出 PNG / SVG / PDF、Markdown 与 OPML / XMind 互转、多标签页、自动更新、AI 生成导图。
文件格式带 `version` 字段，IPC 层按可扩展设计，后续接入不需要重构。
