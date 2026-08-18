import { useCallback, useEffect, useRef, useState } from 'react'
import MindElixir, { type MindElixirData, type MindElixirInstance, type NodeObj } from 'mind-elixir'
import { zh_CN } from 'mind-elixir/i18n'
import { lightTheme } from '@renderer/themes'

export interface MindElixirHandlers {
  onDirty: () => void
  onScale: (scale: number) => void
  onSelectionChange: (count: number) => void
}

export interface UseMindElixir {
  containerRef: React.RefObject<HTMLDivElement | null>
  instance: MindElixirInstance | null
  loadData: (data: MindElixirData) => void
  getData: () => MindElixirData | null
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

    const markDirty = (): void => {
      if (!suppressDirty.current) handlersRef.current.onDirty()
    }
    const handleScale = (scale: number): void => handlersRef.current.onScale(scale)
    const handleSelect = (nodes: NodeObj[]): void =>
      handlersRef.current.onSelectionChange(nodes.length)
    const handleUnselect = (): void =>
      handlersRef.current.onSelectionChange(mind.currentNodes?.length ?? 0)

    mind.bus.addListener('operation', markDirty)
    mind.bus.addListener('expandNode', markDirty)
    mind.bus.addListener('changeDirection', markDirty)
    mind.bus.addListener('scale', handleScale)
    mind.bus.addListener('selectNodes', handleSelect)
    mind.bus.addListener('unselectNodes', handleUnselect)

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
    if (data.compact !== undefined && data.compact !== mind.compact) mind.changeCompact(data.compact)
    mind.refresh({ ...data, theme: undefined })
    mind.clearHistory?.()
    mind.toCenter()
    handlersRef.current.onScale(mind.scaleVal)
    handlersRef.current.onSelectionChange(0)
    window.setTimeout(() => {
      suppressDirty.current = false
    }, 0)
  }, [])

  const getData = useCallback((): MindElixirData | null => {
    const mind = instanceRef.current
    if (!mind) return null
    // The app-level appearance owns theming, so it never travels with the document.
    const { theme: _theme, ...rest } = mind.getData()
    return rest
  }, [])

  return { containerRef, instance, loadData, getData }
}
