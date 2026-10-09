import { useEffect, useRef, useState } from 'react'
import type { MindElixirInstance } from 'mind-elixir'

export type CanvasTool = 'hand' | 'select'

/** A press shorter than this is a click, and clears the selection instead of panning. */
const DRAG_THRESHOLD = 3

function isEditingText(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
}

/**
 * Left-dragging the blank canvas pans it. Mind Elixir treats that same gesture as a
 * marquee, and the branch that does so ignores the space bar, so the gesture is taken
 * over here in the capture phase. Node clicks, drags and editing are left alone.
 */
export function useHandTool(
  containerRef: React.RefObject<HTMLDivElement | null>,
  instance: MindElixirInstance | null,
): {
  tool: CanvasTool
  setTool: (tool: CanvasTool) => void
  handActive: boolean
  panning: boolean
} {
  const [tool, setTool] = useState<CanvasTool>('hand')
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const toolRef = useRef(tool)
  const spaceRef = useRef(spaceHeld)
  useEffect(() => {
    toolRef.current = tool
    spaceRef.current = spaceHeld
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditingText()) return
      if (event.code === 'KeyH') setTool('hand')
      else if (event.code === 'KeyV') setTool('select')
      else if (event.code === 'Space') {
        event.preventDefault()
        setSpaceHeld(true)
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const releaseSpace = (): void => setSpaceHeld(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseSpace)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseSpace)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !instance) return

    const onPointerDown = (event: PointerEvent): void => {
      if (toolRef.current !== 'hand' && !spaceRef.current) return
      if (event.button !== 0 || event.pointerType !== 'mouse') return
      const target = event.target
      // `.map-canvas` ignores pointers, so a blank click lands on `.map-container` itself.
      // A node, expander or link is a different element and keeps mind-elixir's handling.
      if (!(target instanceof Element) || !target.classList.contains('map-container')) return

      event.stopPropagation()
      event.preventDefault()

      let x = event.clientX
      let y = event.clientY
      let moved = false
      setPanning(true)

      const onMove = (move: PointerEvent): void => {
        const dx = move.clientX - x
        const dy = move.clientY - y
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        moved = true
        x = move.clientX
        y = move.clientY
        instance.move(dx, dy)
      }
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setPanning(false)
        if (!moved) instance.clearSelection()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    el.addEventListener('pointerdown', onPointerDown, true)
    return () => el.removeEventListener('pointerdown', onPointerDown, true)
  }, [containerRef, instance])

  return { tool, setTool, handActive: tool === 'hand' || spaceHeld, panning }
}
