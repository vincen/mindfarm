import type { MindElixirData } from 'mind-elixir'

/** Bumped whenever the on-disk envelope changes shape, so old files can be migrated. */
export const DOC_VERSION = 1
export const DOC_EXTENSION = 'mind'
export const UNTITLED = '未命名导图'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface ThemeState {
  preference: ThemePreference
  dark: boolean
}

export interface MindDocumentMeta {
  title: string
  createdAt: string
  updatedAt: string
}

export interface MindDocument {
  version: number
  meta: MindDocumentMeta
  /** Reserved for per-document appearance; the app-level preference wins today. */
  theme?: ThemePreference
  data: MindElixirData
}

export interface OpenedDocument {
  filePath: string | null
  document: MindDocument
}

export interface SavePayload {
  title: string
  data: MindElixirData
}

export type SaveResult =
  | { status: 'saved'; filePath: string }
  | { status: 'canceled' }
  | { status: 'error'; message: string }

export type ExportFormat = 'png' | 'pdf'

export interface PickedImage {
  bytes: Uint8Array
  mime: string
}

export interface ExportPayload {
  format: ExportFormat
  /** PNG bytes either way. PDF is wrapped around this image in the main process. */
  bytes: Uint8Array
  suggestedName: string
}

export type MenuAction =
  | 'save'
  | 'save-as'
  | 'save-and-close'
  | 'export-png'
  | 'export-pdf'
  | 'undo'
  | 'redo'
  | 'add-child'
  | 'add-sibling'
  | 'add-parent'
  | 'remove-node'
  | 'edit-node'
  | 'focus-node'
  | 'cancel-focus'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'zoom-fit'
  | 'center'
  | 'expand-all'
  | 'collapse-all'
  | 'layout-left'
  | 'layout-right'
  | 'layout-side'
  | 'layout-down'
