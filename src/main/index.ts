import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'

const isDev = !app.isPackaged
import { initDatabase } from './db/schema'
import { registerProjectHandlers } from './services/project'
import { registerClientHandlers } from './services/client'
import { registerGiseongHandlers } from './services/giseong'
import { registerDesignHandlers } from './services/design'
import { IPC_CHANNELS } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'NEP-WORKS',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 다이얼로그 핸들러
function registerDialogHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (_event, options) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: options?.filters || [
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SAVE_FILE, async (_event, options) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: options?.defaultPath,
      filters: options?.filters || [
        { name: 'Excel Files', extensions: ['xlsx'] },
        { name: 'PDF Files', extensions: ['pdf'] }
      ]
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
}

app.whenReady().then(() => {
  // DB 초기화
  const db = initDatabase()

  // IPC 핸들러 등록
  registerDialogHandlers()
  registerProjectHandlers(db)
  registerClientHandlers(db)
  registerGiseongHandlers(db)
  registerDesignHandlers(db)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
