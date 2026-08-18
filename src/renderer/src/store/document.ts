import { create } from 'zustand'
import type { NodeObj } from 'mind-elixir'
import { UNTITLED } from '@shared/types'

interface DocumentStore {
  filePath: string | null
  dirty: boolean
  scale: number
  /** Live references into the map, replaced with a fresh array whenever they change. */
  selectedNodes: NodeObj[]
  inspectorOpen: boolean
  notice: string | null
  setFilePath: (filePath: string | null) => void
  setDirty: (dirty: boolean) => void
  setScale: (scale: number) => void
  setSelectedNodes: (nodes: NodeObj[]) => void
  setInspectorOpen: (open: boolean) => void
  setNotice: (notice: string | null) => void
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  filePath: null,
  dirty: false,
  scale: 1,
  selectedNodes: [],
  // Replaced by the persisted value as soon as the main process answers.
  inspectorOpen: false,
  notice: null,
  setFilePath: (filePath) => set({ filePath }),
  setDirty: (dirty) => set({ dirty }),
  setScale: (scale) => set({ scale }),
  setSelectedNodes: (selectedNodes) => set({ selectedNodes }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setNotice: (notice) => set({ notice }),
}))

export function documentTitle(filePath: string | null): string {
  if (!filePath) return UNTITLED
  const name = filePath.split('/').pop() ?? filePath
  return name.replace(/\.mind$/i, '')
}
