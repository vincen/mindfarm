/// <reference types="vite/client" />

import type { MindApi } from '@shared/api'

declare global {
  interface Window {
    api: MindApi
    /** Present while a map is mounted. Used by `scripts/smoke-inspector.mjs`. */
    __mindfarmCapture?: () => Promise<Uint8Array>
    __mindfarmApplyImage?: (bytes: Uint8Array) => Promise<void>
    /** Keeps these bytes as the selected node's original, leaving the thumbnail in place. */
    __mindfarmAttachOriginal?: (bytes: Uint8Array, mime: string) => Promise<void>
  }
}

export {}
