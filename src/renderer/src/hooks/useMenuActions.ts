import { useEffect, useRef } from 'react'
import type { MindElixirInstance } from 'mind-elixir'
import type { ExportFormat, MenuAction, SaveResult } from '@shared/types'
import { captureMapPng } from '@renderer/export-map'
import { documentTitle, useDocumentStore } from '@renderer/store/document'

export type SaveMode = 'save' | 'save-as'

interface MenuActionDeps {
  instance: MindElixirInstance | null
  save: (mode: SaveMode) => Promise<SaveResult>
  markDirty: () => void
}

const ZOOM_STEP = 0.15

/** While a node's text is being edited the caret owns Cmd+Z, not the operation history. */
function isEditingText(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
}

async function exportMap(mind: MindElixirInstance, format: ExportFormat): Promise<void> {
  const store = useDocumentStore.getState()
  try {
    const bytes = await captureMapPng(mind)
    const result = await window.api.doc.exportFile({
      format,
      bytes,
      suggestedName: documentTitle(store.filePath),
    })
    if (result.status === 'error') store.setNotice(`导出失败：${result.message}`)
  } catch (error) {
    store.setNotice(`导出失败：${(error as Error).message}`)
  }
}

function collapseFirstLevel(mind: MindElixirInstance): void {
  for (const child of mind.nodeData.children ?? []) {
    const el = mind.findEle(child.id)
    if (el) mind.expandNodeAll(el, false)
  }
}

export function useMenuActions({ instance, save, markDirty }: MenuActionDeps): void {
  const depsRef = useRef({ instance, save, markDirty })
  useEffect(() => {
    depsRef.current = { instance, save, markDirty }
  })

  useEffect(() => {
    return window.api.menu.onAction(async (action: MenuAction) => {
      const { instance: mind, save: runSave, markDirty: setDirty } = depsRef.current

      if (action === 'save' || action === 'save-as') {
        await runSave(action === 'save' ? 'save' : 'save-as')
        return
      }
      if (action === 'save-and-close') {
        const result = await runSave('save')
        if (result.status === 'saved') window.api.window.forceClose()
        return
      }
      if (action === 'export-png' || action === 'export-pdf') {
        if (mind) await exportMap(mind, action === 'export-png' ? 'png' : 'pdf')
        return
      }

      if (!mind) return

      switch (action) {
        case 'undo':
          if (isEditingText()) document.execCommand('undo')
          else mind.undo()
          break
        case 'redo':
          if (isEditingText()) document.execCommand('redo')
          else mind.redo()
          break
        case 'add-child':
          await mind.addChild()
          break
        case 'add-sibling':
          await mind.insertSibling('after')
          break
        case 'add-parent':
          await mind.insertParent()
          break
        case 'remove-node':
          if (mind.currentNodes.length > 0) await mind.removeNodes(mind.currentNodes)
          break
        case 'edit-node':
          await mind.beginEdit()
          break
        case 'focus-node': {
          const node = mind.currentNode
          if (node) mind.focusNode(node)
          break
        }
        case 'cancel-focus':
          mind.cancelFocus()
          break
        case 'zoom-in':
          mind.scale(Math.min(mind.scaleVal + ZOOM_STEP, mind.scaleMax))
          break
        case 'zoom-out':
          mind.scale(Math.max(mind.scaleVal - ZOOM_STEP, mind.scaleMin))
          break
        case 'zoom-reset':
          mind.scale(1)
          break
        case 'zoom-fit':
          mind.scaleFit()
          break
        case 'center':
          mind.toCenter()
          break
        case 'expand-all':
          mind.expandNodeAll(mind.findEle(mind.nodeData.id), true)
          setDirty()
          break
        case 'collapse-all':
          collapseFirstLevel(mind)
          setDirty()
          break
        case 'layout-left':
          mind.initLeft()
          setDirty()
          break
        case 'layout-right':
          mind.initRight()
          setDirty()
          break
        case 'layout-side':
          mind.initSide()
          setDirty()
          break
        case 'layout-down':
          mind.initDown()
          setDirty()
          break
      }
    })
  }, [])
}
