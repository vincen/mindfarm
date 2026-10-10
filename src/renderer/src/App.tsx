import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeObj, Topic } from 'mind-elixir'
import type { OpenedDocument, SaveResult } from '@shared/types'
import { ImageViewer } from '@renderer/components/ImageViewer'
import { Inspector } from '@renderer/components/Inspector/Inspector'
import { MindMapCanvas } from '@renderer/components/MindMapCanvas'
import { Notice } from '@renderer/components/Notice'
import { StatusBar } from '@renderer/components/StatusBar'
import { TitleBar } from '@renderer/components/TitleBar'
import { captureMapPng } from '@renderer/export-map'
import { asImageBytes, blobFromBytes, bytesToNodeImage, type NodeImage } from '@renderer/image-node'
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
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const viewerBlob = useRef<string | null>(null)
  const viewerGeneration = useRef(0)

  const { containerRef, instance, loadData, getData, patchSelected } = useMindElixir({
    onDirty: () => useDocumentStore.getState().setDirty(true),
    onScale: (value) => useDocumentStore.getState().setScale(value),
    onSelectionChange: (nodes) => useDocumentStore.getState().setSelectedNodes(nodes),
  })

  useAppTheme(instance)
  const toggleInspector = useInspector()
  const { tool, setTool, handActive, panning } = useHandTool(containerRef, instance)

  const closeViewer = useCallback(() => {
    viewerGeneration.current += 1
    if (viewerBlob.current) URL.revokeObjectURL(viewerBlob.current)
    viewerBlob.current = null
    setViewerUrl(null)
  }, [])

  const openOriginal = useCallback(
    (topic: Topic) => {
      const image = topic.nodeObj.image as NodeImage | undefined
      if (!image?.url) return
      const generation = ++viewerGeneration.current
      if (viewerBlob.current) URL.revokeObjectURL(viewerBlob.current)
      viewerBlob.current = null
      setViewerUrl(null)

      const show = (url: string, blob: boolean): void => {
        if (generation !== viewerGeneration.current) {
          if (blob) URL.revokeObjectURL(url)
          return
        }
        if (blob) viewerBlob.current = url
        setViewerUrl(url)
      }

      if (!image.original) {
        show(image.url, false)
        return
      }
      void window.api.doc.readOriginal(image.original).then((file) => {
        if (!file) {
          show(image.url, false)
          return
        }
        show(URL.createObjectURL(blobFromBytes(asImageBytes(file.bytes), file.mime)), true)
      })
    },
    [],
  )

  useNodeDrag(containerRef, instance, openOriginal)

  // The smoke test captures and inserts images through these. Export from the menu
  // uses the same capture function; the image path is the one the inspector uses.
  useEffect(() => {
    if (!instance) return
    window.__mindfarmCapture = () => captureMapPng(instance)
    window.__mindfarmApplyImage = async (bytes) => {
      const image = await bytesToNodeImage(blobFromBytes(asImageBytes(bytes), 'image/png'))
      patchSelected({ image })
    }
    window.__mindfarmAttachOriginal = async (bytes, mime) => {
      const name = await window.api.doc.keepOriginal({ bytes: asImageBytes(bytes), mime })
      const topic = instance.currentNodes[0]
      const current = topic?.nodeObj.image as NodeImage | undefined
      if (!topic || !current || !name) return
      instance.reshapeNode(topic, { image: { ...current, original: name } as NodeObj['image'] })
    }
    return () => {
      delete window.__mindfarmCapture
      delete window.__mindfarmApplyImage
      delete window.__mindfarmAttachOriginal
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
      {viewerUrl ? <ImageViewer src={viewerUrl} onClose={closeViewer} /> : null}
    </div>
  )
}
