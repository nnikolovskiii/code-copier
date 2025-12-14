const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    refreshTree: (path) => ipcRenderer.invoke('file:refreshTree', path),
    copyStructure: (data) => ipcRenderer.invoke('context:copyStructure', data),
    copyMultiple: (data) => ipcRenderer.invoke('context:copyMultiple', data),
    getGitStaged: (rootPath) => ipcRenderer.invoke('git:getStaged', rootPath), // <--- New API
    onFileSystemChange: (callback) => ipcRenderer.on('file:system-changed', (_event, value) => callback(value)),
    
    // Window Controls
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
});