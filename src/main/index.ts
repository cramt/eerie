import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { spawn, ChildProcess } from 'child_process'

let mainWindow: BrowserWindow | null = null
let daemonProcess: ChildProcess | null = null
let daemonRequestId = 0
const daemonCallbacks = new Map<number, (result: unknown, error?: string) => void>()

// ── Daemon management ──────────────────────────────────────────────────────

function startDaemon() {
  const daemonBin = app.isPackaged
    ? join(process.resourcesPath, 'eerie-daemon')
    : join(__dirname, '../../target/debug/eerie-daemon')

  try {
    daemonProcess = spawn(daemonBin, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })

    daemonProcess.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as { id: number; result?: unknown; error?: string }
          const cb = daemonCallbacks.get(msg.id)
          if (cb) {
            daemonCallbacks.delete(msg.id)
            cb(msg.result, msg.error)
          }
        } catch {
          // ignore non-JSON output (e.g. log lines)
        }
      }
    })

    daemonProcess.on('exit', (code) => {
      console.log(`eerie-daemon exited with code ${code}`)
      daemonProcess = null
    })
  } catch (err) {
    console.warn('Could not start eerie-daemon:', err)
  }
}

function callDaemon(method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!daemonProcess?.stdin) {
      reject(new Error('daemon not running'))
      return
    }
    const id = ++daemonRequestId
    daemonCallbacks.set(id, (result, error) => {
      if (error) reject(new Error(error))
      else resolve(result)
    })
    const msg = JSON.stringify({ id, method, params }) + '\n'
    daemonProcess.stdin.write(msg)
  })
}

// ── Window ─────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f111a',
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC handlers ───────────────────────────────────────────────────────────

ipcMain.handle('daemon:call', async (_e, method: string, params: unknown) => {
  return callDaemon(method, params)
})

ipcMain.handle('file:read', async (_e, path: string) => {
  return readFileSync(path, 'utf-8')
})

ipcMain.handle('file:write', async (_e, path: string, content: string) => {
  writeFileSync(path, content, 'utf-8')
  return true
})

ipcMain.handle('dialog:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [
      { name: 'Eerie Circuits', extensions: ['eerie', 'yaml', 'yml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:save', async (_e, defaultPath?: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultPath ?? 'untitled.eerie',
    filters: [{ name: 'Eerie Circuits', extensions: ['eerie'] }],
  })
  return result.canceled ? null : result.filePath
})

// ── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  startDaemon()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  daemonProcess?.kill()
  if (process.platform !== 'darwin') app.quit()
})
