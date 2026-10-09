/// <reference types="vite/client" />

import type { MindApi } from '@shared/api'

declare global {
  interface Window {
    api: MindApi
    /** Present while a map is mounted. Used by `scripts/smoke-inspector.mjs`. */
    __mindfarmCapture?: () => Promise<Uint8Array>
  }
}

export {}
