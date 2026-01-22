const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    refreshTree: (path) => ipcRenderer.invoke('file:refreshTree', path),
    readFile: (path) => ipcRenderer.invoke('file:readFile', path),

    // --- NEW HISTORY API ---
    getRecentProjects: () => ipcRenderer.invoke('history:get'),
    openRecentProject: (path) => ipcRenderer.invoke('history:open', path),

    copyStructure: (data) => ipcRenderer.invoke('context:copyStructure', data),
    copyMultiple: (data) => ipcRenderer.invoke('context:copyMultiple', data),
    getGitStaged: (rootPath) => ipcRenderer.invoke('git:getStaged', rootPath),
    copyGitDiff: (rootPath) => ipcRenderer.invoke('git:copyDiff', rootPath),
    onFileSystemChange: (callback) => ipcRenderer.on('file:system-changed', (_event, value) => callback(value)),

    // Window Controls
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
});