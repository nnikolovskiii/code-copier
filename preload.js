const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Function to open the directory dialog and get the file tree
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),

    // Function to request copying content for a given path.
    // It sends an object containing both the target and root paths.
    copyPath: (pathData) => ipcRenderer.invoke('context:copyPath', pathData),

    // Function to read the contents of a file
    readFile: (fileData) => ipcRenderer.invoke('file:read', fileData),

    // Function to copy the folder structure as ASCII tree
    copyStructure: (pathData) => ipcRenderer.invoke('context:copyStructure', pathData)
});