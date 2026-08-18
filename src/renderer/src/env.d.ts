/// <reference types="vite/client" />

import type { MindApi } from '@shared/api'

declare global {
  interface Window {
    api: MindApi
  }
}

export {}
