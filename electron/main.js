const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let currentFilePath = null;
let pendingFilePath = null;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

function getFilePathFromArgv(argv) {
  return argv.find((arg) => arg && !arg.startsWith('-') && fs.existsSync(arg));
}

function sendFileToRenderer(filePath) {
  if (!mainWindow || !filePath) return;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    currentFilePath = filePath;
    mainWindow.webContents.send('file-opened', { filePath, content });
    mainWindow.setTitle(`${path.basename(filePath)} - MD Editor`);
  } catch (error) {
    dialog.showErrorBox('Open File Failed', `Could not open file:\n${filePath}\n\n${error.message}`);
  }
}

function openFilePath(filePath) {
  if (!filePath) return;

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.webContents.isLoading()) {
      pendingFilePath = filePath;
      mainWindow.webContents.once('did-finish-load', () => {
        if (pendingFilePath) {
          const nextFilePath = pendingFilePath;
          pendingFilePath = null;
          sendFileToRenderer(nextFilePath);
        }
      });
      return;
    }

    sendFileToRenderer(filePath);
    return;
  }

  pendingFilePath = filePath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const isDev = process.argv.includes('--dev');
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingFilePath) {
      const filePath = pendingFilePath;
      pendingFilePath = null;
      sendFileToRenderer(filePath);
    }
  });

  createMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
  const template = [
    {
      label: 'MD Editor',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-file');
          },
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Markdown Files', extensions: ['md', 'markdown', 'txt'] },
                { name: 'All Files', extensions: ['*'] },
              ],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              openFilePath(result.filePaths[0]);
            }
          },
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu-save-file');
          },
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('menu-save-as-file');
          },
        },
        { type: 'separator' },
        {
          label: 'Export as HTML',
          click: () => {
            mainWindow.webContents.send('menu-export-html');
          },
        },
        {
          label: 'Export as PDF',
          accelerator: 'CmdOrCtrl+P',
          click: async () => {
            const pdfPath = await dialog.showSaveDialog(mainWindow, {
              defaultPath: 'document.pdf',
              filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
            });
            if (!pdfPath.canceled) {
              mainWindow.webContents.printToPDF({}).then((data) => {
                fs.writeFileSync(pdfPath.filePath, data);
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Export Successful',
                  message: `PDF saved to ${pdfPath.filePath}`,
                });
              });
            }
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle('save-file', async (event, { content, filePath }) => {
  try {
    if (filePath) {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, filePath };
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: 'untitled.md',
        filters: [
          { name: 'Markdown Files', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, content, 'utf-8');
        currentFilePath = result.filePath;
        mainWindow.setTitle(`${path.basename(result.filePath)} - MD Editor`);
        return { success: true, filePath: result.filePath };
      }
      return { success: false };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-current-file-path', () => {
  return currentFilePath;
});

ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFilePath(filePath);
});

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePathFromArg = getFilePathFromArgv(argv.slice(app.isPackaged ? 1 : 2));

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }

    if (filePathFromArg) {
      openFilePath(filePathFromArg);
    }
  });

  app.whenReady().then(() => {
    const filePathFromArg = getFilePathFromArgv(process.argv.slice(app.isPackaged ? 1 : 2));

    if (filePathFromArg) {
      pendingFilePath = filePathFromArg;
    }

    createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
