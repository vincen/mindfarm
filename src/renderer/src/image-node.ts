
/** Longest side stored on the node. Larger photos are scaled down before embedding. */
export const IMAGE_MAX_EDGE = 480

/** Thumbnail plus the optional filename of the untouched original in the document package. */
export interface NodeImage {
  url: string
  width: number
  height: number
  fit?: 'fill' | 'contain' | 'cover'
  original?: string
}

export function imageFileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const item of data.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}

export function asImageBytes(value: Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value
  const buffer = value as unknown as { data?: number[] }
  if (Array.isArray(buffer.data)) return new Uint8Array(buffer.data)
  return new Uint8Array(value)
}

/** Copies into a fresh ArrayBuffer so the view is a valid Blob part. */
export function blobFromBytes(bytes: Uint8Array, mime: string): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy], { type: mime })
}

/**
 * Draws the first frame onto a canvas and embeds it as a data URL. Opaque
 * pictures become JPEG; anything with transparency stays PNG.
 */
export async function bytesToNodeImage(source: Blob): Promise<NodeImage> {
  const bitmap = await createImageBitmap(source)
  try {
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法处理这张图片')

    ctx.drawImage(bitmap, 0, 0, width, height)
    const pixels = ctx.getImageData(0, 0, width, height).data
    let opaque = true
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 255) {
        opaque = false
        break
      }
    }

    const url = opaque ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png')
    return { url, width, height, fit: 'contain' }
  } finally {
    bitmap.close()
  }
}
