import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { MindApi, Unsubscribe } from '@shared/api'
import type {
  MenuAction,
  OpenedDocument,
  SavePayload,
  SaveResult,
  ThemePreference,
  ThemeState,
} from '@shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: MindApi = {
  platform: process.platform,
  doc: {
    getInitial: (): Promise<OpenedDocument | null> => ipcRenderer.invoke(IPC.doc.getInitial),
    save: (payload: SavePayload): Promise<SaveResult> => ipcRenderer.invoke(IPC.doc.save, payload),
    saveAs: (payload: SavePayload): Promise<SaveResult> =>
      ipcRenderer.invoke(IPC.doc.saveAs, payload),
    setDirty: (dirty: boolean): void => ipcRenderer.send(IPC.doc.setDirty, dirty),
    create: (): void => ipcRenderer.send(IPC.doc.new),
    openDialog: (): void => ipcRenderer.send(IPC.doc.openDialog),
    onLoad: (callback: (doc: OpenedDocument) => void): Unsubscribe =>
      subscribe(IPC.doc.load, callback),
  },
  menu: {
    onAction: (callback: (action: MenuAction) => void): Unsubscribe =>
      subscribe(IPC.menu.action, callback),
  },
  theme: {
    get: (): Promise<ThemeState> => ipcRenderer.invoke(IPC.theme.get),
    set: (preference: ThemePreference): Promise<ThemeState> =>
      ipcRenderer.invoke(IPC.theme.set, preference),
    onChange: (callback: (state: ThemeState) => void): Unsubscribe =>
      subscribe(IPC.theme.changed, callback),
  },
  window: {
    forceClose: (): void => ipcRenderer.send(IPC.window.forceClose),
  },
  openExternal: (url: string): void => ipcRenderer.send(IPC.app.openExternal, url),
}

contextBridge.exposeInMainWorld('api', api)
