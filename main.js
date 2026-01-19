const hljs = require('highlight.js');
const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu } = require('electron/main');
const path = require('node:path');
const fs = require('node:fs');
const chokidar = require('chokidar');
const { exec } = require('node:child_process');

// --- GLOBAL REFERENCES ---
let mainWindow = null;
let currentWatcher = null;

// [KEEP YOUR EXISTING IGNORED_EXTENSIONS AND IGNORED_DIRS ARRAYS HERE]
// To save space in this answer, I am assuming you keep the long arrays
// from your original file. They are crucial.
const IGNORED_EXTENSIONS = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.heic',
    '.mp3', '.mp4', '.mov', '.avi', '.wav', '.flac', '.mkv', '.webm',
    '.obj', '.fbx', '.blend', '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz', '.jar', '.war', '.ear',
    '.apk', '.aab', '.ipa', '.exe', '.dll', '.so', '.dylib', '.bin',
    '.o', '.a', '.obj', '.class', '.pyc', '.pyo', '.pyd', '.gem',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.rtf',
    '.psd', '.ai', '.eps', '.indd', '.sketch', '.fig',
    '.db', '.sqlite', '.sqlite3', '.mdb', '.accde', '.frm', '.ibd',
    '.map', '.css.map', '.js.map',
    '.pem', '.crt', '.key', '.p12', '.pfx', '.keystore', '.jks',
    '.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Gemfile.lock', 'composer.lock', 'Cargo.lock',
    '.DS_Store', 'Thumbs.db', 'desktop.ini'
];

const IGNORED_DIRS = [
    '.git', '.svn', '.hg', '.DS_Store', 'Trash', 'tmp', 'temp',
    '.idea', '.vscode', '.vs', '.settings', '.project', '.classpath', 'nbproject',
    'node_modules', 'bower_components', 'jspm_packages', '.npm', '.yarn',
    '__pycache__', 'venv', '.venv', 'env', '.env', 'pip-wheel-metadata', '.pytest_cache', '.mypy_cache',
    'dist', 'build', 'out', 'target', 'bin', 'obj', 'pkg', '_build', 'deps',
    '.next', '.nuxt', '.output', '.docusaurus', 'public', 'static',
    '.gradle', 'gradle', '.m2', 'Pods', 'DerivedData', '.xcworkspace',
    'vendor', '.bundle', '.terraform', '.serverless', '.aws-sam', '.vercel', '.netlify',
    'coverage', '.nyc_output', 'test-results', 'logs', 'log', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*',
    '.langgraph_api', '.ipynb_checkpoints'
];

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

// --- FILE WATCHER ---
function startWatching(targetPath) {
    if (currentWatcher) currentWatcher.close();

    const ignoreGlobs = [
        /(^|[\/\\])\../, // Ignore dotfiles
        ...IGNORED_DIRS.map(dir => `**/${dir}/**`)
    ];

    currentWatcher = chokidar.watch(targetPath, {
        ignored: ignoreGlobs,
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

// --- FILE OPERATIONS ---
function generateFileTree(directoryPath, includeAllExtensions = false) {
    try {
        const items = fs.readdirSync(directoryPath);
        const tree = [];
        for (const item of items) {
            if (IGNORED_DIRS.includes(item)) continue;
            const fullPath = path.join(directoryPath, item);
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    tree.push({
                        name: item,
                        path: fullPath,
                        type: 'directory',
                        children: generateFileTree(fullPath, includeAllExtensions)
                    });
                } else if (stat.isFile()) {
                    if (!includeAllExtensions && IGNORED_EXTENSIONS.some(ext => item.toLowerCase().endsWith(ext))) continue;
                    tree.push({ name: item, path: fullPath, type: 'file' });
                }
            } catch (e) { /* ignore access errors */ }
        }
        return tree;
    } catch (e) {
        return [];
    }
}

function getPathContentAsString(targetPath, rootPath) {
    // [KEEP EXISTING LOGIC FOR COPYING]
    const stat = fs.statSync(targetPath);
    const baseName = path.basename(targetPath);

    if (stat.isFile()) {
        if (IGNORED_EXTENSIONS.some(ext => baseName.toLowerCase().endsWith(ext))) return '';
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

// --- NEW: READ FILE FOR VIEWER ---
async function handleReadFile(event, filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size > 2 * 1024 * 1024) return { error: 'File is too large to display.' };
        if (IGNORED_EXTENSIONS.some(ext => filePath.toLowerCase().endsWith(ext))) {
            return { error: 'Binary or ignored file type.' };
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        // --- NEW HIGHLIGHTING LOGIC ---
        // Try to detect language based on content
        const highlighted = hljs.highlightAuto(content);

        return {
            content: content, // Keep raw content just in case
            html: highlighted.value, // The colored HTML
            language: highlighted.language // The detected language
        };
        // ------------------------------

    } catch (error) {
        return { error: error.message };
    }
}

function generateTreeStructureString(node, prefix = '', isLast = true, isRoot = true) {
    // [KEEP EXISTING LOGIC]
    let result = '';
    if (isRoot) {
        result += `${node.name}/\n`;
    } else {
        const connector = isLast ? '└── ' : '├── ';
        result += `${prefix}${connector}${node.name}${node.type === 'directory' ? '/' : ''}\n`;
    }
    if (node.type === 'directory' && node.children && node.children.length > 0) {
        let childPrefix = prefix;
        if (!isRoot) childPrefix += isLast ? '    ' : '│   ';
        const sortedChildren = node.children.sort((a, b) => {
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

// --- GIT HELPER ---
function getGitStagedFiles(rootPath) {
    return new Promise((resolve) => {
        exec('git diff --name-only --cached', { cwd: rootPath }, (error, stdout) => {
            if (error) {
                console.error("Git error or not a repo:", error.message);
                resolve([]);
                return;
            }
            const files = stdout.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const absolutePaths = [];
            for (const file of files) {
                const fullPath = path.join(rootPath, file);
                if (fs.existsSync(fullPath)) absolutePaths.push(fullPath);
            }
            resolve(absolutePaths);
        });
    });
}

function createMenu() {
    // [KEEP EXISTING MENU]
    const isMac = process.platform === 'darwin';
    const template = [
        ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
        { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }] },
        { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { label: 'Zoom In', accelerator: 'CommandOrControl+=', role: 'zoomIn' }, { label: 'Zoom Out', accelerator: 'CommandOrControl+-', role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
        { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }] : [{ role: 'close' }])] }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// --- IPC HANDLERS ---
async function handleDirectoryOpen() {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return null;
    const rootPath = filePaths[0];
    startWatching(rootPath);
    return { name: path.basename(rootPath), path: rootPath, type: 'directory', children: generateFileTree(rootPath) };
}

async function handleRefreshTree(event, dirPath) {
    if (!dirPath) return null;
    try { return { name: path.basename(dirPath), path: dirPath, type: 'directory', children: generateFileTree(dirPath) }; } catch (e) { return null; }
}

async function handleCopyMultiple(event, { paths, rootPath }) {
    try {
        let finalContent = '';
        let count = 0;
        for (const itemPath of paths) {
            const content = getPathContentAsString(itemPath, rootPath);
            if (content) {
                finalContent += content;
                count++;
            }
        }
        if (!finalContent) return "No text content found.";
        clipboard.writeText(finalContent);
        return `✅ Success! Copied ${count} items (${finalContent.length.toLocaleString()} chars).`;
    } catch (error) {
        return `❌ Error: ${error.message}`;
    }
}

async function handleCopyStructure(event, { rootPath }) {
    try {
        const fileTree = generateFileTree(rootPath, true);
        const rootNode = { name: path.basename(rootPath), path: rootPath, type: 'directory', children: fileTree };
        const treeString = generateTreeStructureString(rootNode);
        clipboard.writeText(treeString);
        return `✅ Copied directory structure.`;
    } catch (error) {
        return `❌ Error: ${error.message}`;
    }
}

function getGitDiff(rootPath) {
    return new Promise((resolve) => {
        // 'git diff --cached' returns ONLY the changes that have been 'git add'-ed.
        exec('git diff --cached', {
            cwd: rootPath,
            maxBuffer: 10 * 1024 * 1024 // <--- FIX: Increase limit to 10MB (default was 1MB)
        }, (error, stdout, stderr) => {
            if (error) {
                console.error("[Git] Error:", error.message);

                // Specific error handling
                if (error.message.includes('maxBuffer')) {
                    resolve({ error: "Staged content is too large (>10MB). Unstage large files like lock-files." });
                } else {
                    resolve({ error: "Git error. Check terminal for details." });
                }
                return;
            }
            resolve({ content: stdout });
        });
    });
}


async function handleGetGitStaged(event, rootPath) {
    return await getGitStagedFiles(rootPath);
}

// --- APP LIFECYCLE ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200, // Increased default width for 3 columns
        height: 800,
        minWidth: 800,
        minHeight: 500,
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    mainWindow.loadFile('index.html');
}

async function handleCopyGitDiff(event, rootPath) {
    const result = await getGitDiff(rootPath);

    if (result.error) return `❌ Error: ${result.error}`;

    if (!result.content || result.content.trim() === '') {
        // Specific message helping the user understand why it's empty
        return "No staged changes. (Did you run 'git add'?)";
    }

    clipboard.writeText(result.content);
    return "✅ Copied staged changes to clipboard";
}
app.whenReady().then(() => {
    createMenu();
    ipcMain.handle('dialog:openDirectory', handleDirectoryOpen);
    ipcMain.handle('file:refreshTree', handleRefreshTree);
    ipcMain.handle('file:readFile', handleReadFile); // <--- New Handler
    ipcMain.handle('context:copyMultiple', handleCopyMultiple);
    ipcMain.handle('context:copyStructure', handleCopyStructure);
    ipcMain.handle('git:getStaged', handleGetGitStaged);
    ipcMain.handle('git:copyDiff', handleCopyGitDiff); // <--- ADD THIS
    ipcMain.on('window:minimize', () => mainWindow.minimize());
    ipcMain.on('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
    ipcMain.on('window:close', () => mainWindow.close());

    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });