interface MindMapCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function MindMapCanvas({ containerRef }: MindMapCanvasProps): React.ReactElement {
  // mind-elixir measures its host element, so the container needs a resolved size:
  // `min-h-0` stops the flex item from growing past the viewport.
  return <div ref={containerRef} className="mind-canvas relative min-h-0 min-w-0 flex-1" />
}
