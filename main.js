const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron/main');
const path = require('node:path');
const fs = require('node:fs');
const chokidar = require('chokidar');
const { exec } = require('node:child_process');

// --- GLOBAL REFERENCES ---
let mainWindow = null;
let currentWatcher = null;

// --- IGNORE CONFIGURATION ---
const IGNORED_EXTENSIONS = [
    // --- Images & Media ---
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.heic',
    '.mp3', '.mp4', '.mov', '.avi', '.wav', '.flac', '.mkv', '.webm',
    '.obj', '.fbx', '.blend', // 3D models

    // --- Fonts ---
    '.woff', '.woff2', '.ttf', '.eot', '.otf',

    // --- Archives & Packages ---
    '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz',
    '.jar', '.war', '.ear', // Java archives
    '.apk', '.aab', '.ipa', // Mobile app packages

    // --- Compiled / Binary / Executable ---
    '.exe', '.dll', '.so', '.dylib', '.bin', // System binaries
    '.o', '.a', '.obj', // C/C++ object files
    '.class', // Java class files
    '.pyc', '.pyo', '.pyd', // Python compiled
    '.gem', // Ruby gems

    // --- Documents (Non-text) ---
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.rtf',

    // --- Design & Adobe ---
    '.psd', '.ai', '.eps', '.indd', '.sketch', '.fig',

    // --- Database Files ---
    '.db', '.sqlite', '.sqlite3', '.mdb', '.accde', '.frm', '.ibd',

    // --- Source Maps (Noisy for AI) ---
    '.map', '.css.map', '.js.map',

    // --- Keys & Certificates (Security) ---
    '.pem', '.crt', '.key', '.p12', '.pfx', '.keystore', '.jks',
    
    // --- Lock Files (Often too verbose for prompts) ---
    '.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Gemfile.lock', 'composer.lock', 'Cargo.lock',
    
    // --- System ---
    '.DS_Store', 'Thumbs.db', 'desktop.ini'
];

const IGNORED_DIRS = [
    // --- General / OS ---
    '.git', '.svn', '.hg',
    '.DS_Store', 'Trash', 'tmp', 'temp',

    // --- IDEs & Editors ---
    '.idea', '.vscode', '.vs', '.settings', '.project', '.classpath', 'nbproject',

    // --- Node / JS ---
    'node_modules', 'bower_components', 'jspm_packages', '.npm', '.yarn',

    // --- Python ---
    '__pycache__', 'venv', '.venv', 'env', '.env', 'pip-wheel-metadata', '.pytest_cache', '.mypy_cache',

    // --- Build Outputs / Dist ---
    'dist', 'build', 'out', 'target', // 'target' catches Rust and Maven builds
    'bin', 'obj', // C# / .NET
    'pkg', // Go
    '_build', 'deps', // Elixir

    // --- Web Frameworks ---
    '.next', '.nuxt', '.output', '.docusaurus', 'public', 'static', // 'public'/'static' are often just assets

    // --- Java / Kotlin / Android ---
    '.gradle', 'gradle', '.m2',

    // --- Mobile (iOS) ---
    'Pods', 'DerivedData', '.xcworkspace',

    // --- PHP / Ruby ---
    'vendor', '.bundle',

    // --- Terraform / Docker / Cloud ---
    '.terraform', '.serverless', '.aws-sam', '.vercel', '.netlify',

    // --- Testing & Logs ---
    'coverage', '.nyc_output', 'test-results',
    'logs', 'log', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*',

    // --- AI / Python Specifics ---
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
function generateFileTree(directoryPath) {
    try {
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
                    if (IGNORED_EXTENSIONS.some(ext => item.toLowerCase().endsWith(ext))) continue;
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
        // 'git diff --name-only --cached' lists files that are staged (green in git status)
        exec('git diff --name-only --cached', { cwd: rootPath }, (error, stdout) => {
            if (error) {
                console.error("Git error or not a repo:", error.message);
                resolve([]);
                return;
            }

            const files = stdout.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const absolutePaths = [];
            
            // Verify files exist (exclude deleted files that are staged)
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
    try {
        return { name: path.basename(dirPath), path: dirPath, type: 'directory', children: generateFileTree(dirPath) };
    } catch (e) { return null; }
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
        const fileTree = generateFileTree(rootPath);
        const rootNode = { name: path.basename(rootPath), path: rootPath, type: 'directory', children: fileTree };
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

// --- APP LIFECYCLE ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        frame: false, // Custom Title Bar
        titleBarStyle: 'hidden',
        webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    ipcMain.handle('dialog:openDirectory', handleDirectoryOpen);
    ipcMain.handle('file:refreshTree', handleRefreshTree);
    ipcMain.handle('context:copyMultiple', handleCopyMultiple);
    ipcMain.handle('context:copyStructure', handleCopyStructure);
    ipcMain.handle('git:getStaged', handleGetGitStaged); // <--- GIT HANDLER

    // Window Controls
    ipcMain.on('window:minimize', () => mainWindow.minimize());
    ipcMain.on('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
    ipcMain.on('window:close', () => mainWindow.close());

    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });