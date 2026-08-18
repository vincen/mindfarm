import { app, dialog, type BrowserWindow } from 'electron'
import { readDocument, showOpenDialog } from './file-service'
import {
  createWindow,
  findReusableWindow,
  findWindowByPath,
  loadDocumentIntoWindow,
} from './window-manager'

export function newDocument(): BrowserWindow {
  return createWindow()
}

export async function openPaths(paths: string[]): Promise<void> {
  let reusable = findReusableWindow()

  for (const filePath of paths) {
    const existing = findWindowByPath(filePath)
    if (existing) {
      existing.focus()
      continue
    }

    let document
    try {
      document = await readDocument(filePath)
    } catch (error) {
      dialog.showErrorBox('无法打开文件', `${filePath}\n\n${(error as Error).message}`)
      continue
    }

    app.addRecentDocument(filePath)

    if (reusable && !reusable.isDestroyed()) {
      loadDocumentIntoWindow(reusable, filePath, document)
      reusable.focus()
      reusable = undefined
    } else {
      createWindow({ filePath, document })
    }
  }
}

export async function promptOpen(win?: BrowserWindow): Promise<void> {
  const paths = await showOpenDialog(win)
  if (paths.length > 0) await openPaths(paths)
}
