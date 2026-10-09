import type { MindElixirInstance, NodeObj, Topic } from 'mind-elixir'

/** Top and bottom bands of a node insert a sibling. The middle makes it a child. */
const EDGE = 0.32

export type NodePlacement =
  | { kind: 'relative'; type: 'before' | 'after' | 'in'; target: Topic }
  | { kind: 'side'; direction: 0 | 1 }

export function asTopic(target: EventTarget | null): Topic | null {
  if (!(target instanceof Element)) return null
  if (target.closest('a')) return null
  const topic = target.closest('me-tpc')
  if (!(topic instanceof HTMLElement)) return null
  const node = (topic as Topic).nodeObj
  if (!node?.parent) return null
  return topic as Topic
}

/** Drop the nodes that are inside another dragged node; moving the parent moves them. */
export function dragRoots(topics: Topic[]): Topic[] {
  const dragged = new Set(topics.map((topic) => topic.nodeObj))
  return topics.filter((topic) => {
    let parent = topic.nodeObj.parent
    while (parent) {
      if (dragged.has(parent)) return false
      parent = parent.parent
    }
    return Boolean(topic.nodeObj.parent)
  })
}

function containsNode(ancestor: NodeObj, node: NodeObj): boolean {
  let current: NodeObj | undefined = node
  while (current) {
    if (current === ancestor) return true
    current = current.parent
  }
  return false
}

function canDrop(dragged: NodeObj[], target: NodeObj): boolean {
  return dragged.every((node) => node !== target && !containsNode(node, target))
}

function topicAt(x: number, y: number): Topic | null {
  const hit = document.elementFromPoint(x, y)
  if (!(hit instanceof Element)) return null
  const topic = hit.closest('me-tpc')
  return topic instanceof HTMLElement ? (topic as Topic) : null
}

function rootTopic(mind: MindElixirInstance): Topic | null {
  const topic = mind.map.querySelector('me-root > me-tpc')
  return topic instanceof HTMLElement ? (topic as Topic) : null
}

function groupKey(node: NodeObj): string {
  const parent = node.parent
  if (!parent) return ''
  // Root children live in two columns. Every other parent is a single vertical list.
  if (!parent.parent) return `root:${node.direction ?? 1}`
  return parent.id
}

/**
 * Mind Elixir only accepts a drop within 12px of a node's edge. Main branches are
 * spaced much wider than that, so a pointer in the gap — or on the empty side of
 * the root — used to snap the node back.
 */
export function placementAt(
  mind: MindElixirInstance,
  dragged: Topic[],
  x: number,
  y: number,
): NodePlacement | null {
  const draggedNodes = dragged.map((topic) => topic.nodeObj)
  const under = topicAt(x, y)

  // A hit on the node being dragged is the gap it is leaving; keep looking at its siblings.
  // A hit on one of its descendants is not a legal target.
  if (under?.nodeObj.parent && !draggedNodes.includes(under.nodeObj)) {
    if (!canDrop(draggedNodes, under.nodeObj)) return null
    const rect = under.getBoundingClientRect()
    const ratio = rect.height > 0 ? (y - rect.top) / rect.height : 0.5
    const type = ratio < EDGE ? 'before' : ratio > 1 - EDGE ? 'after' : 'in'
    return { kind: 'relative', type, target: under }
  }

  const exclude = new Set(draggedNodes)
  const groups = new Map<string, Topic[]>()
  for (const topic of mind.map.querySelectorAll('me-tpc')) {
    if (!(topic instanceof HTMLElement)) continue
    const node = (topic as Topic).nodeObj
    if (!node?.parent || exclude.has(node) || !canDrop(draggedNodes, node)) continue
    const key = groupKey(node)
    const list = groups.get(key)
    if (list) list.push(topic as Topic)
    else groups.set(key, [topic as Topic])
  }

  // Match by horizontal band only. The gap between two main branches is the
  // margin above and below each topic, so it sits outside every topic box, and
  // dragging the neighbour away leaves that gap outside the remaining box too.
  let nearest: { topics: Topic[]; distance: number } | null = null
  for (const topics of groups.values()) {
    const rects = topics.map((topic) => topic.getBoundingClientRect())
    const left = Math.min(...rects.map((rect) => rect.left)) - 48
    const right = Math.max(...rects.map((rect) => rect.right)) + 48
    if (x < left || x > right) continue
    const center = (left + 48 + right - 48) / 2
    const distance = Math.abs(x - center)
    if (!nearest || distance < nearest.distance) nearest = { topics, distance }
  }

  if (nearest) return placementInColumn(nearest.topics, y)

  const root = rootTopic(mind)
  if (!root) return null
  const rect = root.getBoundingClientRect()
  return { kind: 'side', direction: x < rect.left + rect.width / 2 ? 0 : 1 }
}

function placementInColumn(topics: Topic[], y: number): NodePlacement {
  const ordered = topics
    .map((topic) => ({ topic, rect: topic.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top)
  for (const item of ordered) {
    if (y < item.rect.top + item.rect.height / 2) return { kind: 'relative', type: 'before', target: item.topic }
  }
  return { kind: 'relative', type: 'after', target: ordered[ordered.length - 1].topic }
}

function sameSide(node: NodeObj, target: NodeObj): boolean {
  if (node.parent !== target.parent) return false
  if (node.parent?.parent) return true
  return node.direction === target.direction
}

function isSameSlot(placement: NodePlacement, dragged: Topic[]): boolean {
  if (placement.kind === 'side' || dragged.length !== 1) return false
  const node = dragged[0].nodeObj
  const target = placement.target.nodeObj
  if (placement.type === 'in') {
    return node.parent === target && target.children?.[target.children.length - 1] === node
  }
  if (!sameSide(node, target)) return false
  const siblings = (node.parent?.children ?? []).filter((item) =>
    node.parent?.parent ? true : item.direction === node.direction,
  )
  const from = siblings.indexOf(node)
  const to = siblings.indexOf(target)
  if (from < 0 || to < 0) return false
  return placement.type === 'before' ? from === to - 1 : from === to + 1
}

function sideChanges(nodes: NodeObj[], direction: 0 | 1): boolean {
  const root = nodes[0]?.parent
  if (!root || root.parent) return true
  if (nodes.some((node) => node.parent !== root || node.direction !== direction)) return true
  const children = root.children ?? []
  const moving = new Set(nodes)
  const next = [...children.filter((node) => !moving.has(node)), ...nodes]
  return next.some((node, index) => node !== children[index])
}

export function applyPlacement(
  mind: MindElixirInstance,
  dragged: Topic[],
  placement: NodePlacement,
): void {
  if (isSameSlot(placement, dragged)) return

  if (placement.kind === 'relative') {
    if (placement.type === 'before') mind.moveNodeBefore(dragged, placement.target)
    else if (placement.type === 'after') mind.moveNodeAfter(dragged, placement.target)
    else mind.moveNodeIn(dragged, placement.target)
    return
  }

  const nodes = dragged.map((topic) => topic.nodeObj)
  if (!sideChanges(nodes, placement.direction)) return
  for (const node of nodes) {
    const siblings = node.parent?.children
    if (!siblings) continue
    const index = siblings.indexOf(node)
    if (index >= 0) siblings.splice(index, 1)
    node.direction = placement.direction
  }
  const root = mind.nodeData
  root.children = [...(root.children ?? []), ...nodes]
  mind.refresh()
  mind.bus.fire('operation', { name: 'moveNodeBefore', objs: nodes, toObj: root })
}

export function clearDropCue(scope: ParentNode): void {
  for (const mark of scope.querySelectorAll('.insert-preview')) mark.remove()
  scope.querySelector('me-root')?.removeAttribute('data-drop-side')
}

export function showDropCue(scope: ParentNode, placement: NodePlacement): void {
  clearDropCue(scope)
  if (placement.kind === 'side') {
    scope.querySelector('me-root')?.setAttribute('data-drop-side', placement.direction === 0 ? 'left' : 'right')
    return
  }
  const mark = document.createElement('div')
  mark.className = `insert-preview ${placement.type} show`
  placement.target.appendChild(mark)
}
