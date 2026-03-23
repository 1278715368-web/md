const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (content, filePath) => ipcRenderer.invoke('save-file', { content, filePath }),
  getCurrentFilePath: () => ipcRenderer.invoke('get-current-file-path'),
  
  onMenuNewFile: (callback) => ipcRenderer.on('menu-new-file', callback),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
  onMenuSaveFile: (callback) => ipcRenderer.on('menu-save-file', callback),
  onMenuSaveAsFile: (callback) => ipcRenderer.on('menu-save-as-file', callback),
  onMenuExportHtml: (callback) => ipcRenderer.on('menu-export-html', callback),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
