const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron/main');
const path = require('node:path');
const fs = require('node:fs');

// --- COMPREHENSIVE IGNORE CONFIGURATION ---
const IGNORED_EXTENSIONS = [
    // Common binary/non-text formats
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot',
    '.mp3', '.mp4', '.mov', '.avi',
    // Compiled code & artifacts
    '.pyc', '.o', '.so', '.dll', '.exe',
    // Lock files
    '.lock', 'package-lock.json', 'yarn.lock'
];

const IGNORED_DIRS = [
    // Most common and important ones
    'node_modules', '.git', '.idea', '.vscode',
    // Common build/dist outputs
    'dist', 'build', 'out', '.next', '.nuxt', 'public',
    // Python specific
    '__pycache__', 'venv', '.venv', 'env', '.env',
    // Caches and logs
    '.cache', 'logs'
];

/**
 * Recursively scans a directory and builds a tree, filtering ignored items.
 */
function generateFileTree(directoryPath) {
    const items = fs.readdirSync(directoryPath);
    const tree = [];
    for (const item of items) {
        if (IGNORED_DIRS.includes(item)) continue;
        const fullPath = path.join(directoryPath, item);
        try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                tree.push({ name: item, path: fullPath, type: 'directory', children: generateFileTree(fullPath) });
            } else if (stat.isFile()) {
                if (IGNORED_EXTENSIONS.some(ext => item.endsWith(ext))) continue;
                tree.push({ name: item, path: fullPath, type: 'file' });
            }
        } catch (e) {
            console.error(`Could not stat path: ${fullPath}`, e);
        }
    }
    return tree;
}

/**
 * Reads the content of a path, respecting ignore lists and generating relative paths.
 */
function getPathContentAsString(targetPath, rootPath) {
    const stat = fs.statSync(targetPath);
    const baseName = path.basename(targetPath);

    if (stat.isFile()) {
        if (IGNORED_EXTENSIONS.some(ext => baseName.endsWith(ext))) return '';
        try {
            const content = fs.readFileSync(targetPath, 'utf-8');
            const relativePath = path.relative(rootPath, targetPath).replace(/\\/g, '/');
            return `--- File: ${relativePath} ---\n${content}\n\n`;
        } catch (e) {
            return `--- Could not read file: ${path.relative(rootPath, targetPath)} ---\n\n`;
        }
    }
    if (stat.isDirectory()) {
        if (IGNORED_DIRS.includes(baseName)) return '';
        let combinedContent = [];
        const allItems = fs.readdirSync(targetPath);
        for (const item of allItems) {
            const fullPath = path.join(targetPath, item);
            combinedContent.push(getPathContentAsString(fullPath, rootPath));
        }
        return combinedContent.join('');
    }
    return '';
}

async function handleDirectoryOpen() {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return null;
    const rootPath = filePaths[0];
    return { name: path.basename(rootPath), path: rootPath, type: 'directory', children: generateFileTree(rootPath) };
}

async function handleCopyPath(event, { targetPath, rootPath }) {
    try {
        const content = getPathContentAsString(targetPath, rootPath);
        if (!content) return "No text content found to copy.";
        clipboard.writeText(content);
        return `✅ Success! Copied ${content.length.toLocaleString()} characters to clipboard.`;
    } catch (error) {
        console.error("Error processing path:", error);
        return `❌ Error: ${error.message}`;
    }
}

function createWindow() {
    const win = new BrowserWindow({ width: 1000, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
    win.loadFile('index.html');
}

app.whenReady().then(() => {
    ipcMain.handle('dialog:openDirectory', handleDirectoryOpen);
    ipcMain.handle('context:copyPath', handleCopyPath);
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });