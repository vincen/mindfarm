import type { NodeObj } from 'mind-elixir'
import type { NodeImage } from '@renderer/image-node'

/**
 * A change applied through `reshapeNode`. `image: null` removes the picture;
 * omitting `image` leaves it alone. `undefined` cannot do that, because the
 * kernel merges with `Object.assign` and never deletes a key.
 */
export type NodePatch = Omit<Partial<NodeObj>, 'image'> & {
  image?: NodeImage | null
}

/** Drops the key. `reshapeNode` assigns over the object and would keep `image: undefined`. */
export function removeNodeImage(node: NodeObj): void {
  delete node.image
}
