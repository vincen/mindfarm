import type {
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
  window: {
    forceClose(): void
  }
  openExternal(url: string): void
}
