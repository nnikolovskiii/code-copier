const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Function to open the directory dialog and get the file tree
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),

    // Function to request copying content for a given path.
    // It sends an object containing both the target and root paths.
    copyPath: (pathData) => ipcRenderer.invoke('context:copyPath', pathData)
});