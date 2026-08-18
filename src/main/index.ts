import { BrowserWindow, app, nativeTheme, session } from 'electron'
import { extname } from 'node:path'
import { IPC } from '@shared/ipc'
import { DOC_EXTENSION } from '@shared/types'
import { newDocument, openPaths } from './documents'
import { currentThemeState, registerIpcHandlers } from './ipc'
import { buildAppMenu } from './menu'
import { flushPreferences, getPreferences } from './preferences'
import { broadcast, markQuitting } from './window-manager'

app.setName('MindFarm')

const pendingPaths: string[] = []

function documentPathsFromArgv(argv: string[]): string[] {
  return argv
    .slice(1)
    .filter((arg) => !arg.startsWith('-') && extname(arg).toLowerCase() === `.${DOC_EXTENSION}`)
}

function queueOrOpen(paths: string[]): void {
  if (paths.length === 0) return
  if (app.isReady()) {
    void openPaths(paths)
  } else {
    pendingPaths.push(...paths)
  }
}

// Registered before `ready` because Finder double-clicks arrive during launch.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  queueOrOpen([filePath])
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const paths = documentPathsFromArgv(argv)
    if (paths.length > 0) {
      void openPaths(paths)
      return
    }
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  queueOrOpen(documentPathsFromArgv(process.argv))

  void app.whenReady().then(() => {
    nativeTheme.themeSource = getPreferences().theme

    // Skipped only while the Vite dev server is driving the renderer, since HMR needs
    // inline scripts and a websocket. Everything else (preview and packaged) gets the
    // production policy, so the file:// load path is always exercised with CSP on.
    if (app.isPackaged || !process.env['ELECTRON_RENDERER_URL']) {
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self' file:; script-src 'self' file:; " +
                "style-src 'self' file: 'unsafe-inline'; img-src 'self' file: data: blob: https:; " +
                "font-src 'self' file: data:; connect-src 'self' file:; object-src 'none'",
            ],
          },
        })
      })
    }

    const refreshMenu = (): void => {
      buildAppMenu(refreshMenu)
      broadcast(IPC.theme.changed, currentThemeState())
    }

    registerIpcHandlers(refreshMenu)
    buildAppMenu(refreshMenu)

    nativeTheme.on('updated', () => {
      broadcast(IPC.theme.changed, currentThemeState())
    })

    if (pendingPaths.length > 0) {
      void openPaths(pendingPaths.splice(0))
    } else {
      newDocument()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) newDocument()
    })
  })
}

app.on('before-quit', () => {
  markQuitting(true)
  flushPreferences()
})

// On macOS the app stays alive with no windows; `activate` re-creates one.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
