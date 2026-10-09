import { useCallback, useEffect } from 'react'
import type { OpenedDocument, SaveResult } from '@shared/types'
import { Inspector } from '@renderer/components/Inspector/Inspector'
import { MindMapCanvas } from '@renderer/components/MindMapCanvas'
import { Notice } from '@renderer/components/Notice'
import { StatusBar } from '@renderer/components/StatusBar'
import { TitleBar } from '@renderer/components/TitleBar'
import { captureMapPng } from '@renderer/export-map'
import { asImageBytes, blobFromBytes, bytesToNodeImage } from '@renderer/image-node'
import { useAppTheme } from '@renderer/hooks/useAppTheme'
import { useHandTool } from '@renderer/hooks/useHandTool'
import { useNodeDrag } from '@renderer/hooks/useNodeDrag'
import { useInspector } from '@renderer/hooks/useInspector'
import { useMenuActions, type SaveMode } from '@renderer/hooks/useMenuActions'
import { useMindElixir } from '@renderer/hooks/useMindElixir'
import { documentTitle, useDocumentStore } from '@renderer/store/document'

export default function App(): React.ReactElement {
  const filePath = useDocumentStore((s) => s.filePath)
  const dirty = useDocumentStore((s) => s.dirty)
  const scale = useDocumentStore((s) => s.scale)
  const selectedNodes = useDocumentStore((s) => s.selectedNodes)
  const inspectorOpen = useDocumentStore((s) => s.inspectorOpen)
  const notice = useDocumentStore((s) => s.notice)
  const setNotice = useDocumentStore((s) => s.setNotice)

  const { containerRef, instance, loadData, getData, patchSelected } = useMindElixir({
    onDirty: () => useDocumentStore.getState().setDirty(true),
    onScale: (value) => useDocumentStore.getState().setScale(value),
    onSelectionChange: (nodes) => useDocumentStore.getState().setSelectedNodes(nodes),
  })

  useAppTheme(instance)
  const toggleInspector = useInspector()
  const { tool, setTool, handActive, panning } = useHandTool(containerRef, instance)
  useNodeDrag(containerRef, instance)

  // The smoke test captures and inserts images through these. Export from the menu
  // uses the same capture function; the image path is the one the inspector uses.
  useEffect(() => {
    if (!instance) return
    window.__mindfarmCapture = () => captureMapPng(instance)
    window.__mindfarmApplyImage = async (bytes) => {
      const image = await bytesToNodeImage(blobFromBytes(asImageBytes(bytes), 'image/png'))
      patchSelected({ image })
    }
    return () => {
      delete window.__mindfarmCapture
      delete window.__mindfarmApplyImage
    }
  }, [instance, patchSelected])

  // The main process owns the window title, the edited dot and the close prompt.
  useEffect(() => {
    window.api.doc.setDirty(dirty)
  }, [dirty])

  const applyDocument = useCallback(
    (opened: OpenedDocument) => {
      loadData(opened.document.data)
      const store = useDocumentStore.getState()
      store.setFilePath(opened.filePath)
      store.setDirty(false)
    },
    [loadData],
  )

  useEffect(() => {
    if (!instance) return
    let active = true
    void window.api.doc.getInitial().then((opened) => {
      if (active && opened) applyDocument(opened)
    })
    const unsubscribe = window.api.doc.onLoad(applyDocument)
    return () => {
      active = false
      unsubscribe()
    }
  }, [instance, applyDocument])

  const save = useCallback(
    async (mode: SaveMode): Promise<SaveResult> => {
      const data = getData()
      if (!data) return { status: 'error', message: '导图尚未就绪' }

      const store = useDocumentStore.getState()
      const payload = { title: documentTitle(store.filePath), data }
      const result =
        mode === 'save' ? await window.api.doc.save(payload) : await window.api.doc.saveAs(payload)

      if (result.status === 'saved') {
        store.setFilePath(result.filePath)
        store.setDirty(false)
      } else if (result.status === 'error') {
        store.setNotice(`保存失败：${result.message}`)
      }
      return result
    },
    [getData],
  )

  useMenuActions({
    instance,
    save,
    markDirty: () => useDocumentStore.getState().setDirty(true),
  })

  const dismissNotice = useCallback(() => setNotice(null), [setNotice])

  return (
    <div className="relative flex h-full flex-col bg-shell text-shell-text">
      <TitleBar
        title={documentTitle(filePath)}
        dirty={dirty}
        filePath={filePath}
        onNew={() => window.api.doc.create()}
        onOpen={() => window.api.doc.openDialog()}
        onSave={() => void save('save')}
        inspectorOpen={inspectorOpen}
        onToggleInspector={toggleInspector}
      />
      <div className="flex min-h-0 flex-1">
        <MindMapCanvas containerRef={containerRef} hand={handActive} panning={panning} />
        {inspectorOpen && <Inspector nodes={selectedNodes} patch={patchSelected} />}
      </div>
      <StatusBar
        filePath={filePath}
        selectionCount={selectedNodes.length}
        scale={scale}
        tool={tool}
        onTool={setTool}
        onZoomOut={() => instance?.scale(Math.max(instance.scaleVal - 0.15, instance.scaleMin))}
        onZoomReset={() => instance?.scale(1)}
        onZoomIn={() => instance?.scale(Math.min(instance.scaleVal + 0.15, instance.scaleMax))}
        onFit={() => instance?.scaleFit()}
        onCenter={() => instance?.toCenter()}
      />
      <Notice message={notice} onDismiss={dismissNotice} />
    </div>
  )
}
