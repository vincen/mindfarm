import { snapdom } from '@zumer/snapdom'
import type { MindElixirInstance } from 'mind-elixir'

/**
 * Rasterises the whole map, not the viewport. mind-elixir's own `exportPng` draws an
 * SVG that uses foreignObject, and Chromium drops that content when the SVG is loaded
 * as an image, so the labels come out blank. Snapdom clones the live DOM instead.
 *
 * The capture is taken at scale 1: lines and summaries get clipped when the map is zoomed.
 */
export async function captureMapPng(mind: MindElixirInstance): Promise<Uint8Array> {
  const previous = mind.scaleVal
  if (previous !== 1) mind.scale(1)

  try {
    const backgroundColor =
      getComputedStyle(mind.el).getPropertyValue('--bgcolor').trim() || '#ffffff'
    const result = await snapdom(mind.nodes, { backgroundColor })
    const blob = await result.toBlob({ format: 'png' })
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    if (mind.scaleVal !== previous) mind.scale(previous)
  }
}
