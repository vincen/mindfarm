import { useEffect, useRef } from 'react'
import type { MindElixirInstance, Topic } from 'mind-elixir'
import {
  applyPlacement,
  asTopic,
  clearDropCue,
  dragRoots,
  placementAt,
  showDropCue,
  type NodePlacement,
} from '@renderer/node-drag'

const DRAG_THRESHOLD = 5

/**
 * Takes over presses on a node so a drop in the gap between branches, or on the
 * other side of the root, actually moves the node. Mind Elixir's own detector
 * only looks 12px past the pointer and misses those positions.
 */
function topicOf(target: EventTarget | null): Topic | null {
  if (!(target instanceof Element)) return null
  if (target.closest('a')) return null
  const topic = target.closest('me-tpc')
  if (!(topic instanceof HTMLElement) || !(topic as Topic).nodeObj) return null
  return topic as Topic
}

function pressedImage(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('img')
}

export function useNodeDrag(
  containerRef: React.RefObject<HTMLDivElement | null>,
  instance: MindElixirInstance | null,
  onImageClick: (topic: Topic) => void,
): void {
  const onImageClickRef = useRef(onImageClick)
  useEffect(() => {
    onImageClickRef.current = onImageClick
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el || !instance) return

    let endDrag: (() => void) | null = null

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || event.pointerType !== 'mouse') return
      const imageClick = pressedImage(event.target)
      // The root cannot be dragged, but a click on its picture still opens the original.
      const topic = imageClick ? topicOf(event.target) : asTopic(event.target)
      if (!topic) return
      const plainImageClick = imageClick && !event.metaKey && !event.ctrlKey

      event.stopPropagation()
      try {
        topic.setPointerCapture(event.pointerId)
      } catch {
        // A press that never became a real pointer cannot be captured.
      }

      let deselectOnClick: Topic | null = null
      if (event.metaKey || event.ctrlKey) {
        if (instance.currentNodes.includes(topic)) deselectOnClick = topic
        else instance.selection.select(topic)
      } else if (!instance.currentNodes.includes(topic)) {
        instance.selectNode(topic)
      }

      const originX = event.clientX
      const originY = event.clientY
      let moved = false
      let dragging = false
      let placement: NodePlacement | null = null
      let dragged: Topic[] = []
      const ghost = document.createElement('div')
      ghost.className = 'mindfarm-drag-ghost'

      const restore = (): void => {
        ghost.remove()
        clearDropCue(el)
        for (const item of dragged) {
          const wrap = item.parentElement?.parentElement
          if (wrap) wrap.style.opacity = ''
        }
      }

      const onMove = (move: PointerEvent): void => {
        if (!moved && Math.hypot(move.clientX - originX, move.clientY - originY) < DRAG_THRESHOLD) {
          return
        }
        moved = true
        if (!dragging) {
          dragged = dragRoots(
            instance.currentNodes.includes(topic) ? instance.currentNodes : [topic],
          )
          if (dragged.length === 0) return
          dragging = true
          deselectOnClick = null
          ghost.textContent = dragged.length > 1 ? String(dragged.length) : dragged[0].nodeObj.topic
          document.body.appendChild(ghost)
          for (const item of dragged) {
            const wrap = item.parentElement?.parentElement
            if (wrap) wrap.style.opacity = '0.5'
          }
        }
        ghost.style.transform = `translate(${move.clientX + 12}px, ${move.clientY + 12}px)`
        placement = placementAt(instance, dragged, move.clientX, move.clientY)
        if (placement) showDropCue(el, placement)
        else clearDropCue(el)
      }

      const finish = (up: PointerEvent): void => {
        window.removeEventListener('pointermove', onMove, true)
        window.removeEventListener('pointerup', finish, true)
        window.removeEventListener('pointercancel', finish, true)
        endDrag = null
        restore()
        if (!dragging) {
          if (plainImageClick && !moved) {
            up.stopPropagation()
            onImageClickRef.current(topic)
          }
          if (deselectOnClick) instance.unselectNodes([deselectOnClick])
          return
        }
        up.stopPropagation()
        if (placement && dragged.length > 0) applyPlacement(instance, dragged, placement)
      }

      endDrag = () => {
        window.removeEventListener('pointermove', onMove, true)
        window.removeEventListener('pointerup', finish, true)
        window.removeEventListener('pointercancel', finish, true)
        restore()
      }
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', finish, true)
      window.addEventListener('pointercancel', finish, true)
    }

    el.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, true)
      endDrag?.()
    }
  }, [containerRef, instance])
}
