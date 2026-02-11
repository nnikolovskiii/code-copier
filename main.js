const { autoUpdater } = require('electron-updater');
const log = require('electron-log'); // Optional but recommended for debugging updates

const hljs = require('highlight.js');
const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu } = require('electron/main');
const path = require('node:path');
const fs = require('node:fs');
const chokidar = require('chokidar');
const { exec } = require('node:child_process');

// --- GLOBAL REFERENCES ---
let mainWindow = null;
let currentWatcher = null;
let currentRootPath = null;
let customIgnorePatterns = [];

// --- PERSISTENCE SETTINGS ---
const HISTORY_FILE = path.join(app.getPath('userData'), 'recent-projects.json');
const MAX_RECENT_PROJECTS = 10;

// --- CONFIGURATION ---
// Binary/media extensions that should never be copied
const BINARY_EXTENSIONS = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.heic',
    '.mp3', '.mp4', '.mov', '.avi', '.wav', '.flac', '.mkv', '.webm',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz', '.jar', '.war', '.ear',
    '.exe', '.dll', '.so', '.dylib', '.bin', '.dmg', '.iso',
    '.o', '.a', '.obj', '.class', '.pyc', '.pyo', '.pyd',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.psd', '.ai', '.sketch', '.fig',
    '.sqlite', '.sqlite3', '.db', '.mdb',
    '.lock' // lock files are usually not useful
];

// Specific filenames to ignore
const IGNORED_FILENAMES = [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'poetry.lock',
    'Gemfile.lock',
    'Cargo.lock',
    'composer.lock',
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini'
];

// Directories to ignore
const IGNORED_DIRS = [
    '.git', '.svn', '.hg',
    'node_modules', 'bower_components', 'jspm_packages',
    '__pycache__', 'venv', '.venv', 'env', '.env.local',
    '.idea', '.vscode', '.vs',
    'dist', 'build', 'out', 'target', 'bin', 'obj',
    '.next', '.nuxt', '.output',
    '.pytest_cache', '.mypy_cache', '.tox',
    'coverage', '.nyc_output',
    '.gradle', '.m2',
    '.terraform',
    'logs', 'log',
    '.cache',
    '.tmp', 'tmp', 'temp'
];

function setupAutoUpdater() {
    // Optional: Enable logging
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = 'info';
    log.info('App starting...');

    // Check for updates immediately on start
    autoUpdater.checkForUpdatesAndNotify();

    // Check every 30 minutes (optional)
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 30 * 60 * 1000);

    // When an update is available
    autoUpdater.on('update-available', (info) => {
        log.info('Update available:', info);
        // You can show a custom notification here if you want
        // The default notification will show automatically with checkForUpdatesAndNotify()
    });

    // When an update is downloaded
    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded:', info);
        
        // Option 1: Install on next restart (default behavior)
        // The user will get a notification saying "Restart to update"
        
        // Option 2: Force restart immediately (uncomment if you want this)
        // autoUpdater.quitAndInstall();
    });

    // Handle errors silently (don't crash the app)
    autoUpdater.on('error', (err) => {
        log.error('Update error:', err);
    });
}

// --- HELPER: DEBOUNCE ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- HISTORY HELPERS ---
function loadRecentProjects() {
    try {
        if (!fs.existsSync(HISTORY_FILE)) return [];
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch (e) {
        return [];
    }
}

function addToRecentProjects(folderPath) {
    let history = loadRecentProjects();
    history = history.filter(p => p !== folderPath);
    history.unshift(folderPath);
    if (history.length > MAX_RECENT_PROJECTS) history.length = MAX_RECENT_PROJECTS;
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
        console.error('Failed to save history:', e);
    }
    return history;
}

// --- CUSTOM IGNORE LOGIC (.codecopierignore) ---
function globToRegex(glob) {
    let isNegation = false;

    if (glob.startsWith('!')) {
        isNegation = true;
        glob = glob.slice(1);
    }

    if (glob.startsWith('/')) {
        glob = glob.slice(1);
    }

    if (glob.endsWith('/')) {
        glob = glob.slice(0, -1);
    }

    let regexStr = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    regexStr = regexStr.replace(/\*\*/g, '{{GLOBSTAR}}');
    regexStr = regexStr.replace(/\*/g, '[^/]*');
    regexStr = regexStr.replace(/\?/g, '[^/]');
    regexStr = regexStr.replace(/\{\{GLOBSTAR\}\}/g, '.*');

    return { regex: new RegExp(`(^|/)${regexStr}($|/)`), isNegation };
}

function loadCustomIgnores(rootPath) {
    customIgnorePatterns = [];
    const ignorePath = path.join(rootPath, '.codecopierignore');

    if (fs.existsSync(ignorePath)) {
        try {
            const content = fs.readFileSync(ignorePath, 'utf-8');
            const lines = content.split(/\r?\n/);

            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('#')) continue;
                customIgnorePatterns.push(globToRegex(line));
            }
            console.log("Loaded .codecopierignore:", customIgnorePatterns.length, "patterns");
        } catch (e) {
            console.error("Error reading .codecopierignore:", e);
        }
    }
}

// --- IGNORE CHECK FUNCTIONS ---
function shouldIgnoreDir(name) {
    return IGNORED_DIRS.includes(name);
}

function shouldIgnoreFile(name) {
    const nameLower = name.toLowerCase();

    // Check specific filenames
    if (IGNORED_FILENAMES.includes(name)) {
        return true;
    }

    // Check binary extensions
    for (const ext of BINARY_EXTENSIONS) {
        if (nameLower.endsWith(ext)) {
            return true;
        }
    }

    return false;
}

function shouldIgnoreCustom(relativePath) {
    if (customIgnorePatterns.length === 0) return false;

    const normalizedPath = relativePath.replace(/\\/g, '/');
    const name = path.basename(relativePath);

    let ignored = false;

    for (const { regex, isNegation } of customIgnorePatterns) {
        if (regex.test(normalizedPath) || regex.test(name)) {
            ignored = !isNegation;
        }
    }

    return ignored;
}

// --- FILE WATCHER ---
function startWatching(targetPath) {
    if (currentWatcher) {
        currentWatcher.close();
    }

    currentWatcher = chokidar.watch(targetPath, {
        ignored: (filePath) => {
            const name = path.basename(filePath);
            if (name === '.git' || filePath.includes('/.git/') || filePath.includes('\\.git\\')) {
                return true;
            }
            if (IGNORED_DIRS.includes(name)) {
                return true;
            }
            return false;
        },
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 100 }
    });

    const notifyRenderer = debounce(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('file:system-changed');
        }
    }, 1000);

    currentWatcher
        .on('add', notifyRenderer)
        .on('change', notifyRenderer)
        .on('unlink', notifyRenderer)
        .on('addDir', notifyRenderer)
        .on('unlinkDir', notifyRenderer);
}

// --- FILE TREE GENERATION (for display) ---
function generateFileTree(directoryPath, rootPath = null) {
    if (!rootPath) rootPath = directoryPath;

    try {
        const items = fs.readdirSync(directoryPath);
        const tree = [];

        for (const item of items) {
            const fullPath = path.join(directoryPath, item);
            const relativePath = path.relative(rootPath, fullPath);

            try {
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    // Skip ignored directories
                    if (shouldIgnoreDir(item)) continue;
                    if (shouldIgnoreCustom(relativePath)) continue;

                    tree.push({
                        name: item,
                        path: fullPath,
                        type: 'directory',
                        children: generateFileTree(fullPath, rootPath)
                    });
                } else if (stat.isFile()) {
                    // Skip ignored files
                    if (shouldIgnoreFile(item)) continue;
                    if (shouldIgnoreCustom(relativePath)) continue;

                    tree.push({
                        name: item,
                        path: fullPath,
                        type: 'file'
                    });
                }
            } catch (e) {
                // Skip files we can't access
                console.log(`Cannot access ${fullPath}: ${e.message}`);
            }
        }

        return tree;
    } catch (e) {
        console.error(`Error reading directory ${directoryPath}: ${e.message}`);
        return [];
    }
}

// --- FILE READING FOR COPY ---
function readSingleFile(filePath, rootPath) {
    const relativePath = path.relative(rootPath, filePath).replace(/\\/g, '/');

    try {
        const stat = fs.statSync(filePath);

        // Skip large files (> 1MB)
        if (stat.size > 1024 * 1024) {
            console.log(`[SKIP] ${relativePath} - too large (${(stat.size / 1024 / 1024).toFixed(2)}MB)`);
            return null;
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        // --- NEW CODE STARTS HERE ---
        // Check for Null Bytes (\0). If found, it's likely binary or will break the clipboard.
        if (content.includes('\0')) {
            console.log(`[SKIP-BINARY] ${relativePath} - Detected null bytes (binary file)`);
            return null;
        }
        // --- NEW CODE ENDS HERE ---

        console.log(`[READ] ${relativePath} (${content.length} chars)`);

        return {
            path: relativePath,
            content: content
        };
    } catch (e) {
        console.log(`[ERROR] ${relativePath}: ${e.message}`);
        return null;
    }
}

function collectFilesFromDirectory(dirPath, rootPath, files = []) {
    console.log(`[DIR] Scanning: ${path.relative(rootPath, dirPath) || '.'}`);

    try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const relativePath = path.relative(rootPath, fullPath);

            try {
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    // Check if directory should be ignored
                    if (shouldIgnoreDir(item)) {
                        console.log(`[SKIP-DIR] ${relativePath}`);
                        continue;
                    }
                    if (shouldIgnoreCustom(relativePath)) {
                        console.log(`[SKIP-CUSTOM] ${relativePath}`);
                        continue;
                    }

                    // Recurse into directory
                    collectFilesFromDirectory(fullPath, rootPath, files);

                } else if (stat.isFile()) {
                    // Check if file should be ignored
                    if (shouldIgnoreFile(item)) {
                        console.log(`[SKIP-FILE] ${relativePath}`);
                        continue;
                    }
                    if (shouldIgnoreCustom(relativePath)) {
                        console.log(`[SKIP-CUSTOM] ${relativePath}`);
                        continue;
                    }

                    // Read the file
                    const fileData = readSingleFile(fullPath, rootPath);
                    if (fileData) {
                        files.push(fileData);
                    }
                }
            } catch (e) {
                console.log(`[ERROR] Cannot access ${relativePath}: ${e.message}`);
            }
        }
    } catch (e) {
        console.log(`[ERROR] Cannot read directory ${dirPath}: ${e.message}`);
    }

    return files;
}

// --- FILE VIEWER ---
async function handleReadFile(event, filePath) {
    try {
        const stat = fs.statSync(filePath);

        if (stat.size > 2 * 1024 * 1024) {
            return { error: 'File is too large to display (>2MB).' };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const highlighted = hljs.highlightAuto(content);

        return {
            content: content,
            html: highlighted.value,
            language: highlighted.language
        };
    } catch (error) {
        return { error: error.message };
    }
}

// --- TREE STRUCTURE STRING ---
function generateTreeStructureString(node, prefix = '', isLast = true, isRoot = true) {
    let result = '';

    if (isRoot) {
        result += `${node.name}/\n`;
    } else {
        const connector = isLast ? '└── ' : '├── ';
        result += `${prefix}${connector}${node.name}${node.type === 'directory' ? '/' : ''}\n`;
    }

    if (node.type === 'directory' && node.children && node.children.length > 0) {
        let childPrefix = prefix;
        if (!isRoot) {
            childPrefix += isLast ? '    ' : '│   ';
        }

        const sortedChildren = [...node.children].sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
        });

        sortedChildren.forEach((child, index) => {
            const isChildLast = index === sortedChildren.length - 1;
            result += generateTreeStructureString(child, childPrefix, isChildLast, false);
        });
    }

    return result;
}

// --- GIT HELPERS ---
function getGitStagedFiles(rootPath) {
    return new Promise((resolve) => {
        exec('git diff --name-only --cached', { cwd: rootPath }, (error, stdout) => {
            if (error) {
                console.log('Git staged files error:', error.message);
                resolve([]);
                return;
            }

            const files = stdout
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const absolutePaths = [];
            for (const file of files) {
                const fullPath = path.join(rootPath, file);
                if (fs.existsSync(fullPath)) {
                    absolutePaths.push(fullPath);
                }
            }

            resolve(absolutePaths);
        });
    });
}

function getGitDiff(rootPath) {
    return new Promise((resolve) => {
        exec('git diff --cached', {
            cwd: rootPath,
            maxBuffer: 10 * 1024 * 1024
        }, (error, stdout) => {
            if (error) {
                if (error.message.includes('maxBuffer')) {
                    resolve({ error: "Staged content is too large (>10MB)." });
                } else {
                    resolve({ error: "Git error: " + error.message });
                }
                return;
            }
            resolve({ content: stdout });
        });
    });
}

// --- IPC HANDLERS ---

async function handleDirectoryOpen() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });

    if (canceled || filePaths.length === 0) {
        return null;
    }

    const rootPath = filePaths[0];
    currentRootPath = rootPath;

    // Load custom ignores
    loadCustomIgnores(rootPath);
    addToRecentProjects(rootPath);
    startWatching(rootPath);

    return {
        name: path.basename(rootPath),
        path: rootPath,
        type: 'directory',
        children: generateFileTree(rootPath, rootPath)
    };
}

async function handleRefreshTree(event, dirPath) {
    if (!dirPath) return null;

    // Reload custom ignores
    loadCustomIgnores(dirPath);

    try {
        return {
            name: path.basename(dirPath),
            path: dirPath,
            type: 'directory',
            children: generateFileTree(dirPath, dirPath)
        };
    } catch (e) {
        console.error('Refresh error:', e);
        return null;
    }
}

async function handleCopyMultiple(event, { paths, rootPath }) {
    console.log('\n' + '='.repeat(50));
    console.log('COPY OPERATION STARTED');
    console.log('='.repeat(50));
    console.log('Root path:', rootPath);
    console.log('Items selected:', paths.length);
    paths.forEach(p => console.log('  -', path.relative(rootPath, p) || '.'));
    console.log('-'.repeat(50));

    const allFiles = [];

    for (const itemPath of paths) {
        const relativePath = path.relative(rootPath, itemPath);
        console.log(`\nProcessing: ${relativePath || 'ROOT'}`);

        try {
            const stat = fs.statSync(itemPath);

            if (stat.isFile()) {
                // Directly selected file - don't apply ignore rules
                const fileData = readSingleFile(itemPath, rootPath);
                if (fileData) {
                    allFiles.push(fileData);
                }
            } else if (stat.isDirectory()) {
                // Directory - collect all non-ignored files
                collectFilesFromDirectory(itemPath, rootPath, allFiles);
            }
        } catch (e) {
            console.log(`[ERROR] Cannot access ${itemPath}: ${e.message}`);
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('COPY OPERATION COMPLETE');
    console.log('='.repeat(50));
    console.log(`Total files collected: ${allFiles.length}`);

    if (allFiles.length === 0) {
        return "No files found to copy.";
    }

    // Format the content
    let finalContent = '';
    for (const file of allFiles) {
        finalContent += `--- File: ${file.path} ---\n`;
        finalContent += file.content;
        finalContent += '\n\n';
    }

    // Copy to clipboard
    clipboard.writeText(finalContent);

    const charCount = finalContent.length.toLocaleString();
    console.log(`Copied ${allFiles.length} files (${charCount} chars) to clipboard`);

    return `✅ Copied ${allFiles.length} files (${charCount} chars)`;
}

async function handleCopyStructure(event, { rootPath }) {
    try {
        const fileTree = generateFileTree(rootPath, rootPath);
        const rootNode = {
            name: path.basename(rootPath),
            path: rootPath,
            type: 'directory',
            children: fileTree
        };
        const treeString = generateTreeStructureString(rootNode);
        clipboard.writeText(treeString);
        return `✅ Copied directory structure.`;
    } catch (error) {
        return `❌ Error: ${error.message}`;
    }
}

async function handleGetGitStaged(event, rootPath) {
    return await getGitStagedFiles(rootPath);
}

async function handleCopyGitDiff(event, rootPath) {
    const result = await getGitDiff(rootPath);

    if (result.error) {
        return `❌ Error: ${result.error}`;
    }

    if (!result.content || result.content.trim() === '') {
        return "No staged changes found.";
    }

    clipboard.writeText(result.content);
    return "✅ Copied staged changes to clipboard";
}

async function handleGetRecent() {
    return loadRecentProjects();
}

async function handleOpenSpecificPath(event, dirPath) {
    if (!fs.existsSync(dirPath)) {
        return { error: "Directory no longer exists" };
    }

    currentRootPath = dirPath;

    // Load custom ignores
    loadCustomIgnores(dirPath);
    addToRecentProjects(dirPath);
    startWatching(dirPath);

    return {
        name: path.basename(dirPath),
        path: dirPath,
        type: 'directory',
        children: generateFileTree(dirPath, dirPath)
    };
}

// --- MENU ---
// --- MENU ---
function createMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'delete' },
                { type: 'separator' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { label: 'Zoom In', accelerator: 'CommandOrControl+=', role: 'zoomIn' },
                { label: 'Zoom Out', accelerator: 'CommandOrControl+-', role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
                ])
            ]
        },
        // ADD THIS NEW HELP MENU AT THE END:
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Check for Updates',
                    click: () => {
                        autoUpdater.checkForUpdatesAndNotify();
                    }
                },
                { type: 'separator' },
                {
                    label: `Version: ${app.getVersion()}`,
                    enabled: false
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// --- WINDOW CREATION ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 500,
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
}

// --- APP LIFECYCLE ---
app.whenReady().then(() => {
    createMenu();

    // IPC Handlers
    ipcMain.handle('dialog:openDirectory', handleDirectoryOpen);
    ipcMain.handle('file:refreshTree', handleRefreshTree);
    ipcMain.handle('file:readFile', handleReadFile);
    ipcMain.handle('context:copyMultiple', handleCopyMultiple);
    ipcMain.handle('context:copyStructure', handleCopyStructure);
    ipcMain.handle('git:getStaged', handleGetGitStaged);
    ipcMain.handle('git:copyDiff', handleCopyGitDiff);
    ipcMain.handle('history:get', handleGetRecent);
    ipcMain.handle('history:open', handleOpenSpecificPath);

    // Window controls
    ipcMain.on('window:minimize', () => mainWindow.minimize());
    ipcMain.on('window:maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.on('window:close', () => mainWindow.close());

    createWindow();

      // Setup auto-updater after window is created
    setupAutoUpdater();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});