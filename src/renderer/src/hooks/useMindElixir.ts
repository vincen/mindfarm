import { useCallback, useEffect, useRef, useState } from 'react'
import MindElixir, {
  type MindElixirData,
  type MindElixirInstance,
  type NodeObj,
  type Topic,
} from 'mind-elixir'
import { zh_CN } from 'mind-elixir/i18n'
import { bytesToNodeImage, imageFileFromClipboard } from '@renderer/image-node'
import { removeNodeImage, type NodePatch } from '@renderer/node-patch'
import { useDocumentStore } from '@renderer/store/document'
import { lightTheme } from '@renderer/themes'

export interface MindElixirHandlers {
  onDirty: () => void
  onScale: (scale: number) => void
  onSelectionChange: (nodes: NodeObj[]) => void
}

export interface UseMindElixir {
  containerRef: React.RefObject<HTMLDivElement | null>
  instance: MindElixirInstance | null
  loadData: (data: MindElixirData) => void
  getData: () => MindElixirData | null
  patchSelected: (patch: NodePatch) => void
}

/**
 * Bridges the imperative, DOM-driven mind-elixir core into React. The instance is
 * created once per mount and torn down in the cleanup, which also covers the double
 * invocation React StrictMode performs in development.
 */
export function useMindElixir(handlers: MindElixirHandlers): UseMindElixir {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<MindElixirInstance | null>(null)
  const [instance, setInstance] = useState<MindElixirInstance | null>(null)

  // Loading a document mutates the map the same way a user edit does; this flag
  // keeps those programmatic changes from marking the document dirty.
  const suppressDirty = useRef(false)
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const mind = new MindElixir({
      el,
      direction: MindElixir.SIDE,
      allowUndo: true,
      toolBar: false,
      alignment: 'nodes',
      newTopicName: '新节点',
      theme: lightTheme,
      contextMenu: { locale: zh_CN, focus: true, link: true },
    })
    mind.init(MindElixir.new('中心主题'))

    // Runs only when the clipboard is not a copied node. Images land on the
    // single selected topic; text pastes are ignored.
    mind.pasteHandler = (event) => {
      if (event.target instanceof HTMLElement && event.target.id === 'input-box') return
      if (mind.currentNodes.length !== 1) return
      const file = imageFileFromClipboard(event.clipboardData)
      if (!file) return
      event.preventDefault()
      const topic = mind.currentNodes[0]
      void file
        .arrayBuffer()
        .then((buffer) =>
          window.api.doc.keepOriginal({ bytes: new Uint8Array(buffer), mime: file.type || 'image/png' }),
        )
        .then((original) => bytesToNodeImage(file).then((image) => ({ image, original })))
        .then(({ image, original }) => {
          if (!mind.currentNodes.includes(topic)) return
          if (original) image.original = original
          mind.reshapeNode(topic, { image })
          handlersRef.current.onSelectionChange(mind.currentNodes.map((node) => node.nodeObj))
        })
        .catch(() => {
          useDocumentStore.getState().setNotice('无法插入这张图片')
        })
    }

    const markDirty = (): void => {
      if (!suppressDirty.current) handlersRef.current.onDirty()
    }
    const handleScale = (scale: number): void => handlersRef.current.onScale(scale)
    // Both selection events carry only the nodes that just changed, so the authoritative
    // list is always read back off the instance.
    const syncSelection = (): void =>
      handlersRef.current.onSelectionChange(mind.currentNodes.map((topic) => topic.nodeObj))

    // Notes are stored on the node but mind-elixir renders nothing for them, so the
    // indicator hangs off a data attribute refreshed on every re-link.
    const markNotes = (): void => {
      for (const el of mind.map.querySelectorAll<Topic>('me-tpc')) {
        if (el.nodeObj?.note) el.dataset.note = ''
        else delete el.dataset.note
      }
    }

    mind.bus.addListener('operation', markDirty)
    mind.bus.addListener('operation', syncSelection)
    mind.bus.addListener('expandNode', markDirty)
    mind.bus.addListener('changeDirection', markDirty)
    mind.bus.addListener('scale', handleScale)
    mind.bus.addListener('selectNodes', syncSelection)
    mind.bus.addListener('selectNewNode', syncSelection)
    mind.bus.addListener('unselectNodes', syncSelection)
    mind.bus.addListener('linkDiv', markNotes)

    instanceRef.current = mind
    setInstance(mind)
    handlersRef.current.onScale(mind.scaleVal)

    return () => {
      mind.destroy()
      instanceRef.current = null
      setInstance(null)
    }
  }, [])

  const loadData = useCallback((data: MindElixirData) => {
    const mind = instanceRef.current
    if (!mind) return

    suppressDirty.current = true
    // `refresh` only restores nodes/arrows/summaries, so map-level settings are applied by hand.
    if (data.direction !== undefined) mind.direction = data.direction
    if (data.compact !== undefined && data.compact !== mind.compact)
      mind.changeCompact(data.compact)
    mind.refresh({ ...data, theme: undefined })
    mind.clearHistory?.()
    mind.toCenter()
    handlersRef.current.onScale(mind.scaleVal)
    handlersRef.current.onSelectionChange([])
    window.setTimeout(() => {
      suppressDirty.current = false
    }, 0)
  }, [])

  const patchSelected = useCallback((patch: NodePatch) => {
    const mind = instanceRef.current
    if (!mind || mind.currentNodes.length === 0) return

    const { image, ...rest } = patch
    for (const topic of mind.currentNodes) {
      // reshapeNode merges `style` into the node and then keeps the very object it was
      // handed, so sharing one patch across a multi-selection would leak the first
      // node's colours onto the rest. Each node gets its own copy.
      if (image === null) removeNodeImage(topic.nodeObj)
      const next: Partial<NodeObj> = rest.style ? { ...rest, style: { ...rest.style } } : { ...rest }
      if (image) next.image = { ...image } as NodeObj['image']
      mind.reshapeNode(topic, next)
    }

    // The node objects are mutated in place; a fresh array is what tells React to re-read them.
    handlersRef.current.onSelectionChange(mind.currentNodes.map((topic) => topic.nodeObj))
  }, [])

  const getData = useCallback((): MindElixirData | null => {
    const mind = instanceRef.current
    if (!mind) return null
    // The app-level appearance owns theming, so it never travels with the document.
    const { theme: _theme, ...rest } = mind.getData()
    return rest
  }, [])

  return { containerRef, instance, loadData, getData, patchSelected }
}
