import { useEffect, useRef, useState } from 'react'
import type { MindElixirInstance } from 'mind-elixir'

export type CanvasTool = 'hand' | 'select'

/** A press shorter than this is a click, and clears the selection instead of panning. */
const DRAG_THRESHOLD = 3

/**
 * Mind Elixir starts a marquee once the pointer has moved this far. A shorter
 * press on blank canvas is a click, and must not wipe a selection the marquee
 * just made.
 */
const MARQUEE_THRESHOLD = 10

function isEditingText(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
}

/** Blur commits an open topic editor and any half-typed inspector field. */
function commitFocus(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}

function isBlankCanvas(target: EventTarget | null): target is Element {
  // `.map-canvas` ignores pointers, so a blank click lands on `.map-container` itself.
  // A node, expander or link is a different element and keeps mind-elixir's handling.
  return target instanceof Element && target.classList.contains('map-container')
}

/**
 * Left-dragging the blank canvas pans it. Mind Elixir treats that same gesture as a
 * marquee, and the branch that does so ignores the space bar, so the gesture is taken
 * over here in the capture phase. Node clicks, drags and editing are left alone.
 *
 * A click (no drag) first blurs, so an in-progress edit is written onto the node that
 * is still selected, and only then clears the selection.
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
      if (event.button !== 0 || event.pointerType !== 'mouse') return
      if (!isBlankCanvas(event.target)) return

      const hand = toolRef.current === 'hand' || spaceRef.current
      const startX = event.clientX
      const startY = event.clientY
      let x = startX
      let y = startY
      let moved = false

      if (hand) {
        // preventDefault keeps the caret where it is, so the click has to blur by hand.
        event.stopPropagation()
        event.preventDefault()
        setPanning(true)
      } else {
        // The marquee clears the selection on this same pointerdown, after capture.
        // Blur first so a pending edit still lands on the node that is selected.
        commitFocus()
      }

      const onMove = (move: PointerEvent): void => {
        if (hand) {
          const dx = move.clientX - x
          const dy = move.clientY - y
          if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
          moved = true
          x = move.clientX
          y = move.clientY
          instance.move(dx, dy)
          return
        }
        if (Math.hypot(move.clientX - startX, move.clientY - startY) >= MARQUEE_THRESHOLD) {
          moved = true
        }
      }
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        if (hand) setPanning(false)
        // A real marquee has already replaced the selection; only a click dismisses it.
        if (moved) return
        if (hand) commitFocus()
        instance.clearSelection()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    el.addEventListener('pointerdown', onPointerDown, true)
    return () => el.removeEventListener('pointerdown', onPointerDown, true)
  }, [containerRef, instance])

  return { tool, setTool, handActive: tool === 'hand' || spaceHeld, panning }
}
