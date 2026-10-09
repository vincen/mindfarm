import { BrowserWindow, app, ipcMain, nativeTheme, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ExportPayload,
  PickedImage,
  SavePayload,
  SaveResult,
  ThemePreference,
  ThemeState,
} from '@shared/types'
import { DOC_VERSION } from '@shared/types'
import { pngToPdf } from './export-pdf'
import {
  readImageFile,
  showExportDialog,
  showImageDialog,
  showSaveDialog,
  titleFromPath,
  writeBytes,
  writeDocument,
} from './file-service'
import { newDocument, promptOpen } from './documents'
import { getPreferences, setPreferences } from './preferences'
import { getState, syncWindowChrome } from './window-manager'

export function currentThemeState(): ThemeState {
  return { preference: getPreferences().theme, dark: nativeTheme.shouldUseDarkColors }
}

function asBytes(value: Uint8Array): Uint8Array {
  return Buffer.isBuffer(value) ? value : new Uint8Array(value)
}

function windowOf(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

async function save(
  win: BrowserWindow,
  payload: SavePayload,
  forceDialog: boolean,
): Promise<SaveResult> {
  const state = getState(win)
  let target = forceDialog ? null : state.filePath

  if (!target) {
    target = await showSaveDialog(win, payload.title || titleFromPath(state.filePath))
    if (!target) return { status: 'canceled' }
  }

  const now = new Date().toISOString()
  try {
    await writeDocument(target, {
      version: DOC_VERSION,
      meta: {
        title: titleFromPath(target),
        createdAt: state.createdAt ?? now,
        updatedAt: now,
      },
      data: payload.data,
    })
  } catch (error) {
    return { status: 'error', message: (error as Error).message }
  }

  state.filePath = target
  state.dirty = false
  state.createdAt ??= now
  syncWindowChrome(win)
  app.addRecentDocument(target)
  return { status: 'saved', filePath: target }
}

export function registerIpcHandlers(onPreferenceChange: () => void): void {
  ipcMain.handle(IPC.doc.getInitial, (event) => {
    const win = windowOf(event)
    return win ? getState(win).pending : null
  })

  ipcMain.handle(IPC.doc.save, async (event, payload: SavePayload): Promise<SaveResult> => {
    const win = windowOf(event)
    if (!win) return { status: 'error', message: '窗口已关闭' }
    return save(win, payload, false)
  })

  ipcMain.handle(IPC.doc.saveAs, async (event, payload: SavePayload): Promise<SaveResult> => {
    const win = windowOf(event)
    if (!win) return { status: 'error', message: '窗口已关闭' }
    return save(win, payload, true)
  })

  ipcMain.handle(IPC.doc.exportFile, async (event, payload: ExportPayload): Promise<SaveResult> => {
    const win = windowOf(event)
    if (!win) return { status: 'error', message: '窗口已关闭' }

    const target = await showExportDialog(win, payload.suggestedName, payload.format)
    if (!target) return { status: 'canceled' }

    try {
      const bytes =
        payload.format === 'pdf' ? await pngToPdf(asBytes(payload.bytes)) : asBytes(payload.bytes)
      await writeBytes(target, bytes)
    } catch (error) {
      return { status: 'error', message: (error as Error).message }
    }
    // Export is a copy. It must not retarget the open document or clear its edited state.
    return { status: 'saved', filePath: target }
  })

  ipcMain.handle(IPC.doc.pickImage, async (event): Promise<PickedImage | null> => {
    const win = windowOf(event)
    if (!win) return null
    const filePath = await showImageDialog(win)
    if (!filePath) return null
    return readImageFile(filePath)
  })

  ipcMain.on(IPC.doc.setDirty, (event, dirty: boolean) => {
    const win = windowOf(event)
    if (!win) return
    const state = getState(win)
    if (state.dirty === dirty) return
    state.dirty = dirty
    syncWindowChrome(win)
  })

  ipcMain.on(IPC.doc.new, () => {
    newDocument()
  })

  ipcMain.on(IPC.doc.openDialog, (event) => {
    void promptOpen(windowOf(event) ?? undefined)
  })

  ipcMain.on(IPC.window.forceClose, (event) => {
    const win = windowOf(event)
    if (!win) return
    getState(win).forceClose = true
    win.close()
  })

  ipcMain.handle(IPC.theme.get, () => currentThemeState())

  ipcMain.handle(IPC.theme.set, (_event, preference: ThemePreference): ThemeState => {
    setPreferences({ theme: preference }, true)
    nativeTheme.themeSource = preference
    onPreferenceChange()
    return currentThemeState()
  })

  ipcMain.handle(IPC.inspector.get, () => getPreferences().inspectorOpen)

  ipcMain.handle(IPC.inspector.set, (_event, open: boolean): boolean => {
    setPreferences({ inspectorOpen: open }, true)
    onPreferenceChange()
    return open
  })

  ipcMain.on(IPC.app.openExternal, (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}
