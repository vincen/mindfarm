import { create } from 'zustand'
import { UNTITLED } from '@shared/types'

interface DocumentStore {
  filePath: string | null
  dirty: boolean
  scale: number
  selectionCount: number
  notice: string | null
  setFilePath: (filePath: string | null) => void
  setDirty: (dirty: boolean) => void
  setScale: (scale: number) => void
  setSelectionCount: (count: number) => void
  setNotice: (notice: string | null) => void
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  filePath: null,
  dirty: false,
  scale: 1,
  selectionCount: 0,
  notice: null,
  setFilePath: (filePath) => set({ filePath }),
  setDirty: (dirty) => set({ dirty }),
  setScale: (scale) => set({ scale }),
  setSelectionCount: (selectionCount) => set({ selectionCount }),
  setNotice: (notice) => set({ notice }),
}))

export function documentTitle(filePath: string | null): string {
  if (!filePath) return UNTITLED
  const name = filePath.split('/').pop() ?? filePath
  return name.replace(/\.mind$/i, '')
}
