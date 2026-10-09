interface MindMapCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  hand: boolean
  panning: boolean
}

export function MindMapCanvas({
  containerRef,
  hand,
  panning,
}: MindMapCanvasProps): React.ReactElement {
  // mind-elixir measures its host element, so the container needs a resolved size:
  // `min-h-0` stops the flex item from growing past the viewport.
  const cursor = `${hand ? 'hand-tool' : ''} ${panning ? 'panning' : ''}`
  return (
    <div ref={containerRef} className={`mind-canvas relative min-h-0 min-w-0 flex-1 ${cursor}`} />
  )
}
