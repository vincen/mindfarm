import { BrowserWindow, app, dialog, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import type { MenuAction, MindDocument, OpenedDocument } from '@shared/types'
import { titleFromPath } from './file-service'
import { forgetOriginals } from './original-store'
import { getPreferences, setPreferences } from './preferences'

export interface WindowDocState {
  filePath: string | null
  dirty: boolean
  /** Preserved across saves so re-saving does not reset the document's birth date. */
  createdAt: string | null
  /** Set once the user has resolved the "unsaved changes" prompt. */
  forceClose: boolean
  closePromptOpen: boolean
  /** Handed to the renderer when it asks for its initial document. */
  pending: OpenedDocument | null
}

const states = new Map<number, WindowDocState>()
let quitting = false

export function markQuitting(value: boolean): void {
  quitting = value
}

export function isQuitting(): boolean {
  return quitting
}

export function getState(win: BrowserWindow): WindowDocState {
  let state = states.get(win.id)
  if (!state) {
    state = {
      filePath: null,
      dirty: false,
      createdAt: null,
      forceClose: false,
      closePromptOpen: false,
      pending: null,
    }
    states.set(win.id, state)
  }
  return state
}

export function findWindowByPath(filePath: string): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find((win) => states.get(win.id)?.filePath === filePath)
}

/** A blank, never-saved, unmodified window is a valid target to open a file into. */
export function findReusableWindow(): BrowserWindow | undefined {
  const focused = BrowserWindow.getFocusedWindow()
  const candidates = focused
    ? [focused, ...BrowserWindow.getAllWindows()]
    : BrowserWindow.getAllWindows()
  return candidates.find((win) => {
    const state = states.get(win.id)
    return state && !state.filePath && !state.dirty
  })
}

export function syncWindowChrome(win: BrowserWindow): void {
  const state = getState(win)
  win.setTitle(titleFromPath(state.filePath))
  win.setRepresentedFilename(state.filePath ?? '')
  win.setDocumentEdited(state.dirty)
}

export function sendMenuAction(win: BrowserWindow, action: MenuAction): void {
  win.webContents.send(IPC.menu.action, action)
}

export function loadDocumentIntoWindow(
  win: BrowserWindow,
  filePath: string | null,
  document: MindDocument,
): void {
  forgetOriginals(win.id)
  const state = getState(win)
  state.filePath = filePath
  state.dirty = false
  state.createdAt = document.meta.createdAt
  state.pending = { filePath, document }
  syncWindowChrome(win)
  win.webContents.send(IPC.doc.load, state.pending)
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}

function nextBounds(): { width: number; height: number; x?: number; y?: number } {
  const { windowBounds } = getPreferences()
  const offset = BrowserWindow.getAllWindows().length * 24
  const base = { width: windowBounds.width, height: windowBounds.height }
  if (windowBounds.x === undefined || windowBounds.y === undefined) return base
  return { ...base, x: windowBounds.x + offset, y: windowBounds.y + offset }
}

async function confirmClose(win: BrowserWindow): Promise<'save' | 'discard' | 'cancel'> {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['保存', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2,
    message: `是否保存对“${titleFromPath(getState(win).filePath)}”的更改？`,
    detail: '如果不保存，你所做的更改将会丢失。',
  })
  return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel'
}

export function createWindow(initial?: OpenedDocument): BrowserWindow {
  const win = new BrowserWindow({
    ...nextBounds(),
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: titleFromPath(initial?.filePath ?? null),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1f' : '#f4f4f6',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  states.set(win.id, {
    filePath: initial?.filePath ?? null,
    dirty: false,
    createdAt: initial?.document.meta.createdAt ?? null,
    forceClose: false,
    closePromptOpen: false,
    pending: initial ?? null,
  })

  win.once('ready-to-show', () => {
    win.show()
    syncWindowChrome(win)
  })

  const persistBounds = debounce(() => {
    if (win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return
    const { width, height, x, y } = win.getNormalBounds()
    setPreferences({ windowBounds: { width, height, x, y } })
  }, 300)
  win.on('resize', persistBounds)
  win.on('move', persistBounds)

  if (!app.isPackaged) {
    win.webContents.on('console-message', (details) => {
      console.log(`[renderer] ${details.message} (${details.sourceId}:${details.lineNumber})`)
    })
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  win.on('close', (event) => {
    const state = getState(win)
    if (state.forceClose || !state.dirty) return
    event.preventDefault()
    if (state.closePromptOpen) return
    state.closePromptOpen = true
    void confirmClose(win).then((choice) => {
      state.closePromptOpen = false
      if (choice === 'cancel') {
        markQuitting(false)
        return
      }
      if (choice === 'discard') {
        state.forceClose = true
        win.close()
        return
      }
      // The renderer owns the map data, so it performs the save and then calls back.
      sendMenuAction(win, 'save-and-close')
    })
  })

  win.on('closed', () => {
    forgetOriginals(win.id)
    states.delete(win.id)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}
