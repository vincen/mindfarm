import type { NodeObj } from 'mind-elixir'
import type { NodePatch } from '@renderer/node-patch'

export interface SectionProps {
  nodes: NodeObj[]
  patch: (patch: NodePatch) => void
}

/** Sections whose fields make no sense to apply to several nodes at once. */
export interface NodeSectionProps {
  node: NodeObj
  patch: (patch: NodePatch) => void
}

/** Kept in step with the map palettes in `@renderer/themes` so nodes stay on-brand. */
export const SWATCHES = [
  '#1c1c1e',
  '#ffffff',
  '#0a84ff',
  '#30b0c7',
  '#34c759',
  '#ff9f0a',
  '#ff453a',
  '#bf5af2',
  '#5e5ce6',
  '#a2845e',
] as const

/**
 * The value to display for a field across the whole selection. Nodes that disagree
 * collapse to an empty string, which every control renders as "unset".
 */
export function sharedValue(nodes: NodeObj[], read: (node: NodeObj) => string | undefined): string {
  const first = read(nodes[0]) ?? ''
  return nodes.every((node) => (read(node) ?? '') === first) ? first : ''
}
