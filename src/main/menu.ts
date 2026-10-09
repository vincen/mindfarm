import {
  BrowserWindow,
  Menu,
  app,
  nativeTheme,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'
import type { MenuAction, ThemePreference } from '@shared/types'
import { newDocument, promptOpen } from './documents'
import { getPreferences, setPreferences } from './preferences'
import { sendMenuAction } from './window-manager'

type ClickHandler = NonNullable<MenuItemConstructorOptions['click']>

function targetWindow(win: unknown): BrowserWindow | null {
  if (win instanceof BrowserWindow && !win.isDestroyed()) return win
  return BrowserWindow.getFocusedWindow()
}

const dispatch =
  (action: MenuAction): ClickHandler =>
  (_item, win) => {
    const target = targetWindow(win)
    if (target) sendMenuAction(target, action)
  }

/**
 * Items whose keys mind-elixir already handles inside the canvas. Registering the
 * accelerator would make the native menu swallow the key before the page sees it,
 * which would break typing (Enter/Tab/Delete) and node copy/paste.
 */
function passthrough(
  label: string,
  accelerator: string,
  action: MenuAction,
): MenuItemConstructorOptions {
  return { label, accelerator, registerAccelerator: false, click: dispatch(action) }
}

function appearanceSubmenu(onPreferenceChange: () => void): MenuItemConstructorOptions[] {
  const current = getPreferences().theme
  const item = (label: string, preference: ThemePreference): MenuItemConstructorOptions => ({
    label,
    type: 'radio',
    checked: current === preference,
    click: () => {
      setPreferences({ theme: preference }, true)
      nativeTheme.themeSource = preference
      onPreferenceChange()
    },
  })
  return [item('跟随系统', 'system'), item('浅色', 'light'), item('深色', 'dark')]
}

export function buildAppMenu(onPreferenceChange: () => void): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `关于 ${app.name}` },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${app.name}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${app.name}` },
      ],
    },
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => newDocument() },
        {
          label: '打开…',
          accelerator: 'CmdOrCtrl+O',
          click: (_item, win) => void promptOpen(targetWindow(win) ?? undefined),
        },
        {
          label: '打开最近使用',
          role: 'recentDocuments',
          submenu: [{ role: 'clearRecentDocuments', label: '清除菜单' }],
        },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: dispatch('save') },
        { label: '另存为…', accelerator: 'Shift+CmdOrCtrl+S', click: dispatch('save-as') },
        { type: 'separator' },
        { label: '导出为 PNG…', click: dispatch('export-png') },
        { label: '导出为 PDF…', click: dispatch('export-pdf') },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        // Deliberately not `role: 'undo'`: the renderer decides between text undo
        // (while a node is being edited) and mind-elixir's operation history.
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: dispatch('undo') },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', click: dispatch('redo') },
        { type: 'separator' },
        { role: 'cut', label: '剪切', accelerator: 'CmdOrCtrl+X', registerAccelerator: false },
        { role: 'copy', label: '复制', accelerator: 'CmdOrCtrl+C', registerAccelerator: false },
        { role: 'paste', label: '粘贴', accelerator: 'CmdOrCtrl+V', registerAccelerator: false },
        {
          role: 'selectAll',
          label: '全选',
          accelerator: 'CmdOrCtrl+A',
          registerAccelerator: false,
        },
        { type: 'separator' },
        passthrough('插入子节点', 'Tab', 'add-child'),
        passthrough('插入同级节点', 'Enter', 'add-sibling'),
        passthrough('插入父节点', 'CmdOrCtrl+Enter', 'add-parent'),
        passthrough('删除节点', 'Delete', 'remove-node'),
        passthrough('编辑节点文本', 'F2', 'edit-node'),
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: dispatch('zoom-in') },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: dispatch('zoom-out') },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', click: dispatch('zoom-reset') },
        { label: '适应窗口', accelerator: 'Shift+CmdOrCtrl+0', click: dispatch('zoom-fit') },
        {
          label: '回到中心',
          accelerator: 'F1',
          registerAccelerator: false,
          click: dispatch('center'),
        },
        { type: 'separator' },
        { label: '展开全部节点', click: dispatch('expand-all') },
        { label: '折叠全部节点', click: dispatch('collapse-all') },
        { type: 'separator' },
        {
          label: '布局',
          submenu: [
            passthrough('向左展开', 'CmdOrCtrl+Left', 'layout-left'),
            passthrough('向右展开', 'CmdOrCtrl+Right', 'layout-right'),
            passthrough('两侧展开', 'CmdOrCtrl+Up', 'layout-side'),
            { label: '向下展开', click: dispatch('layout-down') },
          ],
        },
        {
          label: '节点样式面板',
          type: 'checkbox',
          accelerator: 'CmdOrCtrl+I',
          checked: getPreferences().inspectorOpen,
          click: () => {
            setPreferences({ inspectorOpen: !getPreferences().inspectorOpen }, true)
            onPreferenceChange()
          },
        },
        { label: '外观', submenu: appearanceSubmenu(onPreferenceChange) },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入全屏幕' },
        ...(app.isPackaged
          ? []
          : ([
              { type: 'separator' },
              { role: 'reload', label: '重新载入' },
              { role: 'toggleDevTools', label: '开发者工具' },
            ] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
        { type: 'separator' },
        { role: 'window' },
      ],
    },
    {
      role: 'help',
      label: '帮助',
      submenu: [
        {
          label: 'Mind Elixir 文档',
          click: () => void shell.openExternal('https://docs.mind-elixir.com/'),
        },
        {
          label: '键盘快捷键',
          click: () =>
            void shell.openExternal('https://docs.mind-elixir.com/docs/guides/shortcuts'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
