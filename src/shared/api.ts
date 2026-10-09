import type {
  ExportPayload,
  MenuAction,
  OpenedDocument,
  SavePayload,
  SaveResult,
  ThemePreference,
  ThemeState,
} from './types'

export type Unsubscribe = () => void

/**
 * The complete surface the preload script exposes on `window.api`.
 * Declared here (free of Electron imports) so the renderer can consume it.
 */
export interface MindApi {
  platform: string
  doc: {
    getInitial(): Promise<OpenedDocument | null>
    save(payload: SavePayload): Promise<SaveResult>
    saveAs(payload: SavePayload): Promise<SaveResult>
    setDirty(dirty: boolean): void
    exportFile(payload: ExportPayload): Promise<SaveResult>
    create(): void
    openDialog(): void
    onLoad(callback: (doc: OpenedDocument) => void): Unsubscribe
  }
  menu: {
    onAction(callback: (action: MenuAction) => void): Unsubscribe
  }
  theme: {
    get(): Promise<ThemeState>
    set(preference: ThemePreference): Promise<ThemeState>
    onChange(callback: (state: ThemeState) => void): Unsubscribe
  }
  inspector: {
    get(): Promise<boolean>
    set(open: boolean): Promise<boolean>
    onChange(callback: (open: boolean) => void): Unsubscribe
  }
  window: {
    forceClose(): void
  }
  openExternal(url: string): void
}
