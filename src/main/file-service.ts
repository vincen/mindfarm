import { dialog, type BrowserWindow } from 'electron'
import { lstat, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { isOriginalName } from '@shared/original'
import {
  DOC_EXTENSION,
  DOC_VERSION,
  UNTITLED,
  type ExportFormat,
  type MindDocument,
  type PickedImage,
} from '@shared/types'
import type { MindElixirData, NodeObj } from 'mind-elixir'

const CONTENTS = 'contents.json'
const RESOURCES = 'resources'

export interface OriginalFile {
  name: string
  bytes: Uint8Array
}

export function titleFromPath(filePath: string | null): string {
  if (!filePath) return UNTITLED
  return basename(filePath).replace(new RegExp(`\\.${DOC_EXTENSION}$`, 'i'), '')
}

function isMindElixirData(value: unknown): value is MindElixirData {
  if (typeof value !== 'object' || value === null) return false
  const node = (value as MindElixirData).nodeData
  return typeof node === 'object' && node !== null && typeof node.topic === 'string'
}

/**
 * Accepts both our own envelope and a bare `mind.getData()` dump, so maps exported
 * from mind-elixir playgrounds can be opened directly.
 */
export function normalizeDocument(raw: unknown, title: string): MindDocument {
  const now = new Date().toISOString()

  if (isMindElixirData(raw)) {
    return { version: DOC_VERSION, meta: { title, createdAt: now, updatedAt: now }, data: raw }
  }

  if (typeof raw === 'object' && raw !== null && isMindElixirData((raw as MindDocument).data)) {
    const doc = raw as MindDocument
    return {
      version: DOC_VERSION,
      meta: {
        title: doc.meta?.title || title,
        createdAt: doc.meta?.createdAt || now,
        updatedAt: doc.meta?.updatedAt || now,
      },
      theme: doc.theme,
      data: doc.data,
    }
  }

  throw new Error('文件内容不是有效的思维导图数据')
}

export function createDocument(data: MindElixirData, title: string): MindDocument {
  const now = new Date().toISOString()
  return { version: DOC_VERSION, meta: { title, createdAt: now, updatedAt: now }, data }
}

async function readJsonDocument(text: string, filePath: string): Promise<MindDocument> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('文件不是合法的 JSON')
  }
  return normalizeDocument(parsed, titleFromPath(filePath))
}

/**
 * A package is a directory with `contents.json`. Older builds wrote a single JSON file
 * at the same extension; those still open.
 */
export async function readDocument(filePath: string): Promise<MindDocument> {
  const stat = await lstat(filePath)
  if (!stat.isDirectory()) return readJsonDocument(await readFile(filePath, 'utf8'), filePath)

  let text: string
  try {
    text = await readFile(join(filePath, CONTENTS), 'utf8')
  } catch {
    throw new Error('文件不是合法的思维导图')
  }
  return readJsonDocument(text, filePath)
}

function collectOriginalNames(data: MindElixirData): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  const walk = (node: NodeObj | undefined): void => {
    if (!node) return
    const name = (node.image as { original?: unknown } | undefined)?.original
    if (typeof name === 'string' && isOriginalName(name) && !seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
    node.children?.forEach(walk)
  }
  walk(data.nodeData)
  return names
}

export function originalNamesIn(data: MindElixirData): string[] {
  return collectOriginalNames(data)
}

/** Reads one original out of an existing package. A legacy JSON file has none. */
export async function readPackagedOriginal(filePath: string, name: string): Promise<Uint8Array | null> {
  if (!isOriginalName(name)) return null
  const stat = await lstat(filePath).catch(() => null)
  if (!stat?.isDirectory()) return null
  try {
    return new Uint8Array(await readFile(join(filePath, RESOURCES, name)))
  } catch {
    return null
  }
}

/**
 * Replaces whatever is at `filePath` (a package, a legacy JSON file, or nothing) with a
 * package. The previous file is moved aside first so a failed rename can put it back.
 */
export async function writeDocument(
  filePath: string,
  document: MindDocument,
  originals: OriginalFile[],
): Promise<void> {
  const payload: MindDocument = {
    ...document,
    meta: { ...document.meta, updatedAt: new Date().toISOString() },
  }
  const dir = dirname(filePath)
  const tmp = join(dir, `.${basename(filePath)}.${process.pid}.tmp`)
  const backup = join(dir, `.${basename(filePath)}.${process.pid}.bak`)

  await rm(tmp, { recursive: true, force: true })
  await mkdir(join(tmp, RESOURCES), { recursive: true })
  try {
    await writeFile(join(tmp, CONTENTS), JSON.stringify(payload, null, 2), 'utf8')
    for (const file of originals) {
      if (!isOriginalName(file.name)) continue
      await writeFile(join(tmp, RESOURCES, file.name), file.bytes)
    }
  } catch (error) {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }

  await rm(backup, { recursive: true, force: true })
  let movedAside = false
  try {
    await rename(filePath, backup)
    movedAside = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  try {
    await rename(tmp, filePath)
  } catch (error) {
    if (movedAside) await rename(backup, filePath).catch(() => undefined)
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  await rm(backup, { recursive: true, force: true }).catch(() => undefined)
}

export async function showOpenDialog(win?: BrowserWindow): Promise<string[]> {
  const options: Electron.OpenDialogOptions = {
    title: '打开思维导图',
    filters: [{ name: '思维导图', extensions: [DOC_EXTENSION, 'json'] }],
    properties: ['openFile', 'multiSelections'],
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

export async function showSaveDialog(
  win: BrowserWindow,
  defaultName: string,
): Promise<string | null> {
  const result = await dialog.showSaveDialog(win, {
    title: '保存思维导图',
    defaultPath: `${defaultName}.${DOC_EXTENSION}`,
    filters: [{ name: '思维导图', extensions: [DOC_EXTENSION] }],
  })
  return result.canceled || !result.filePath ? null : result.filePath
}

const EXPORT_DIALOG = {
  png: { title: '导出为 PNG', name: 'PNG 图片', extension: 'png' },
  pdf: { title: '导出为 PDF', name: 'PDF 文档', extension: 'pdf' },
} as const

export async function showExportDialog(
  win: BrowserWindow,
  defaultName: string,
  format: ExportFormat,
): Promise<string | null> {
  const spec = EXPORT_DIALOG[format]
  const result = await dialog.showSaveDialog(win, {
    title: spec.title,
    defaultPath: `${defaultName}.${spec.extension}`,
    filters: [{ name: spec.name, extensions: [spec.extension] }],
  })
  return result.canceled || !result.filePath ? null : result.filePath
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

export async function showImageDialog(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: '选择图片',
    filters: [{ name: '图片', extensions: Object.keys(IMAGE_MIME) }],
    properties: ['openFile'],
  })
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
}

export async function readImageFile(filePath: string): Promise<PickedImage> {
  const mime = IMAGE_MIME[extname(filePath).slice(1).toLowerCase()]
  if (!mime) throw new Error('不支持的图片格式')
  const bytes = new Uint8Array(await readFile(filePath))
  return { bytes, mime }
}

/** Writes bytes via a sibling temp file so a crash mid-write cannot truncate the original. */
export async function writeBytes(filePath: string, bytes: Uint8Array): Promise<void> {
  const tmp = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.tmp`)
  try {
    await writeFile(tmp, bytes)
    await rename(tmp, filePath)
  } catch (error) {
    await unlink(tmp).catch(() => undefined)
    throw error
  }
}
