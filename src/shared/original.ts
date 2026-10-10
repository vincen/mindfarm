const EXTENSION_FOR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

const MIME_FOR_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** Resource names are generated ids. Anything with a path separator is rejected. */
const ORIGINAL_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/i

export function isOriginalName(name: string): boolean {
  return ORIGINAL_NAME.test(name)
}

export function extensionForMime(mime: string): string | null {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  return EXTENSION_FOR_MIME[normalized] ?? null
}

export function mimeForOriginal(name: string): string | null {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  return MIME_FOR_EXTENSION[extension] ?? null
}
