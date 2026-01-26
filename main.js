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
let customIgnorePatterns = []; // Stores { pattern: RegExp, isNegation: boolean, matchPath: boolean }

// --- PERSISTENCE SETTINGS ---
const HISTORY_FILE = path.join(app.getPath('userData'), 'recent-projects.json');
const MAX_RECENT_PROJECTS = 10;

// --- CONFIGURATION ---
const IGNORED_EXTENSIONS = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.heic',
    '.mp3', '.mp4', '.mov', '.avi', '.wav', '.flac', '.mkv', '.webm',
    '.obj', '.fbx', '.blend', '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz', '.jar', '.war', '.ear',
    '.apk', '.aab', '.ipa', '.exe', '.dll', '.so', '.dylib', '.bin',
    '.o', '.a', '.class', '.pyc', '.pyo', '.pyd', '.gem',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.rtf',
    '.psd', '.ai', '.eps', '.indd', '.sketch', '.fig',
    '.db', '.sqlite', '.sqlite3', '.mdb', '.accde', '.frm', '.ibd',
    '.map', '.css.map', '.js.map',
    '.pem', '.crt', '.key', '.p12', '.pfx', '.keystore', '.jks',
    '.DS_Store', 'Thumbs.db', 'desktop.ini'
];

// Full file names that should be ignored (not extensions)
const IGNORED_FILES = [
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'Gemfile.lock', 'composer.lock', 'Cargo.lock'
];

const IGNORED_DIRS = [
    '.git', '.svn', '.hg', '.DS_Store', 'Trash', 'tmp', 'temp',
    '.idea', '.vscode', '.vs', '.settings', '.project', '.classpath', 'nbproject',
    'node_modules', 'bower_components', 'jspm_packages', '.npm', '.yarn',
    '__pycache__', 'venv', '.venv', 'env', '.env', 'pip-wheel-metadata', '.pytest_cache', '.mypy_cache',
    'dist', 'build', 'out', 'target', 'bin', 'obj', 'pkg', '_build', 'deps',
    '.next', '.nuxt', '.output', '.docusaurus',
    '.gradle', 'gradle', '.m2', 'Pods', 'DerivedData', '.xcworkspace',
    'vendor', '.bundle', '.terraform', '.serverless', '.aws-sam', '.vercel', '.netlify',
    'coverage', '.nyc_output', 'test-results', 'logs', 'log',
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
    try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2)); } catch (e) {}
    return history;
}

// --- IMPROVED CUSTOM IGNORE LOGIC (.codecopierignore) ---

/**
 * Converts a gitignore-style glob pattern to a RegExp
 * Supports: *, **, ?, negation (!), directory markers (/)
 */
function globToRegex(glob) {
    let isNegation = false;
    let matchPath = false;

    // Handle negation
    if (glob.startsWith('!')) {
        isNegation = true;
        glob = glob.slice(1);
    }

    // If pattern contains a slash (not at end), it should match against the path
    if (glob.includes('/') && !glob.endsWith('/')) {
        matchPath = true;
    }

    // Remove leading slash (it means "from root")
    if (glob.startsWith('/')) {
        glob = glob.slice(1);
    }

    // Remove trailing slash (directory indicator)
    if (glob.endsWith('/')) {
        glob = glob.slice(0, -1);
    }

    // Escape special regex characters except * and ?
    let regexStr = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');

    // Handle ** (match any number of directories)
    regexStr = regexStr.replace(/\*\*/g, '{{GLOBSTAR}}');

    // Handle * (match anything except /)
    regexStr = regexStr.replace(/\*/g, '[^/]*');

    // Handle ? (match single character except /)
    regexStr = regexStr.replace(/\?/g, '[^/]');

    // Replace globstar placeholder
    regexStr = regexStr.replace(/\{\{GLOBSTAR\}\}/g, '.*');

    // For patterns without path separators, match against just the name
    // For patterns with path separators, match against the relative path
    const regex = new RegExp(`(^|/)${regexStr}$`);

    return { regex, isNegation, matchPath };
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
                // Skip empty lines and comments
                if (!line || line.startsWith('#')) continue;

                const patternInfo = globToRegex(line);
                customIgnorePatterns.push(patternInfo);
            }
            console.log("Loaded custom ignores:", customIgnorePatterns.length, "patterns");
        } catch (e) {
            console.error("Error reading .codecopierignore:", e);
        }
    }
}

/**
 * Check if a file/directory should be ignored
 * @param {string} name - Base name of the file/directory
 * @param {boolean} isDir - Whether it's a directory
 * @param {string} relativePath - Relative path from root (optional, for custom patterns)
 */
function shouldIgnore(name, isDir, relativePath = null) {
    const nameLower = name.toLowerCase();

    // 1. Check hardcoded directories
    if (isDir && IGNORED_DIRS.includes(name)) return true;

    // 2. Check hardcoded full file names
    if (!isDir && IGNORED_FILES.includes(name)) return true;

    // 3. Check hardcoded extensions
    if (!isDir) {
        for (const ext of IGNORED_EXTENSIONS) {
            if (nameLower.endsWith(ext.toLowerCase())) return true;
        }
    }

    // 4. Check custom patterns from .codecopierignore
    if (customIgnorePatterns.length > 0) {
        // Normalize the relative path for matching
        const normalizedPath = relativePath
            ? relativePath.replace(/\\/g, '/')
            : name;

        let ignored = false;

        for (const { regex, isNegation, matchPath } of customIgnorePatterns) {
            // Decide what to test against
            const testString = matchPath ? normalizedPath : name;

            if (regex.test(testString)) {
                if (isNegation) {
                    ignored = false; // Negation pattern matched, un-ignore
                } else {
                    ignored = true; // Ignore pattern matched
                }
            }
        }

        if (ignored) return true;
    }

    return false;
}

// --- FILE WATCHER ---
function startWatching(targetPath) {
    if (currentWatcher) currentWatcher.close();

    currentWatcher = chokidar.watch(targetPath, {
        ignored: (pathStr) => {
            const name = path.basename(pathStr);
            const relativePath = path.relative(targetPath, pathStr);

            // Always ignore .git
            if (pathStr.includes('/.git/') || pathStr.includes('\\.git\\')) return true;
            if (name === '.git') return true;

            // Check our ignore rules
            try {
                const stat = fs.statSync(pathStr);
                return shouldIgnore(name, stat.isDirectory(), relativePath);
            } catch {
                return false;
            }
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

// --- FILE OPERATIONS ---
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
                const isDir = stat.isDirectory();

                // Check if ignored (with relative path for custom patterns)
                if (shouldIgnore(item, isDir, relativePath)) continue;

                if (isDir) {
                    tree.push({
                        name: item,
                        path: fullPath,
                        type: 'directory',
                        children: generateFileTree(fullPath, rootPath)
                    });
                } else if (stat.isFile()) {
                    tree.push({ name: item, path: fullPath, type: 'file' });
                }
            } catch (e) {
                // Ignore access errors for individual files
                console.log(`Skipping ${fullPath}: ${e.message}`);
            }
        }
        return tree;
    } catch (e) {
        console.error(`Error reading directory ${directoryPath}: ${e.message}`);
        return [];
    }
}

/**
 * Get content as string for copying - with proper error handling
 */
function getPathContentAsString(targetPath, rootPath) {
    try {
        const stat = fs.statSync(targetPath);
        const baseName = path.basename(targetPath);
        const relativePath = path.relative(rootPath, targetPath);
        const isDir = stat.isDirectory();

        // Check if ignored (but only for recursive calls, not for explicitly selected items)
        // Note: We don't skip explicitly selected items, but we do skip their ignored children
        if (shouldIgnore(baseName, isDir, relativePath)) {
            return '';
        }

        if (stat.isFile()) {
            try {
                // Check if file is likely binary
                const ext = path.extname(baseName).toLowerCase();
                const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
                    '.mp3', '.mp4', '.mov', '.avi', '.wav', '.zip', '.tar',
                    '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.pdf'];
                if (binaryExts.includes(ext)) {
                    return `--- Binary file skipped: ${relativePath.replace(/\\/g, '/')} ---\n\n`;
                }

                const content = fs.readFileSync(targetPath, 'utf-8');
                const relPath = relativePath.replace(/\\/g, '/');
                return `--- File: ${relPath} ---\n${content}\n\n`;
            } catch (e) {
                const relPath = relativePath.replace(/\\/g, '/');
                return `--- Could not read file: ${relPath} (${e.message}) ---\n\n`;
            }
        }

        if (isDir) {
            let combinedContent = [];
            try {
                const allItems = fs.readdirSync(targetPath);
                for (const item of allItems) {
                    const fullPath = path.join(targetPath, item);
                    const childContent = getPathContentAsString(fullPath, rootPath);
                    if (childContent) {
                        combinedContent.push(childContent);
                    }
                }
            } catch (e) {
                console.log(`Could not read directory ${targetPath}: ${e.message}`);
            }
            return combinedContent.join('');
        }

        return '';
    } catch (e) {
        // File/directory doesn't exist or can't be accessed
        console.log(`Skipping ${targetPath}: ${e.message}`);
        return '';
    }
}

/**
 * Explicit content getter - doesn't apply ignore rules to the top-level item
 * Use this for items the user explicitly selected
 */
function getExplicitPathContent(targetPath, rootPath) {
    try {
        const stat = fs.statSync(targetPath);
        const relativePath = path.relative(rootPath, targetPath);

        if (stat.isFile()) {
            try {
                const content = fs.readFileSync(targetPath, 'utf-8');
                const relPath = relativePath.replace(/\\/g, '/');
                return `--- File: ${relPath} ---\n${content}\n\n`;
            } catch (e) {
                const relPath = relativePath.replace(/\\/g, '/');
                return `--- Could not read file: ${relPath} (${e.message}) ---\n\n`;
            }
        }

        if (stat.isDirectory()) {
            // For directories, recursively get content (children will be filtered)
            let combinedContent = [];
            try {
                const allItems = fs.readdirSync(targetPath);
                for (const item of allItems) {
                    const fullPath = path.join(targetPath, item);
                    const childContent = getPathContentAsString(fullPath, rootPath);
                    if (childContent) {
                        combinedContent.push(childContent);
                    }
                }
            } catch (e) {
                console.log(`Could not read directory ${targetPath}: ${e.message}`);
            }
            return combinedContent.join('');
        }

        return '';
    } catch (e) {
        console.log(`Cannot access ${targetPath}: ${e.message}`);
        return '';
    }
}

async function handleReadFile(event, filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size > 2 * 1024 * 1024) return { error: 'File is too large to display (>2MB).' };

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

function getGitDiff(rootPath) {
    return new Promise((resolve) => {
        exec('git diff --cached', {
            cwd: rootPath,
            maxBuffer: 10 * 1024 * 1024
        }, (error, stdout, stderr) => {
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
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return null;

    const rootPath = filePaths[0];
    currentRootPath = rootPath;

    // Load custom ignores FIRST before generating tree
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
    // Reload ignores on refresh in case the file changed
    loadCustomIgnores(dirPath);
    try {
        return {
            name: path.basename(dirPath),
            path: dirPath,
            type: 'directory',
            children: generateFileTree(dirPath, dirPath)
        };
    } catch (e) {
        return null;
    }
}

async function handleCopyMultiple(event, { paths, rootPath }) {
    try {
        let finalContent = '';
        let successCount = 0;
        let errorCount = 0;

        for (const itemPath of paths) {
            // Use explicit getter (doesn't filter the selected item itself)
            const content = getExplicitPathContent(itemPath, rootPath);
            if (content && content.trim()) {
                finalContent += content;
                successCount++;
            } else {
                errorCount++;
            }
        }

        if (!finalContent.trim()) {
            return "No text content found to copy.";
        }

        clipboard.writeText(finalContent);

        let msg = `✅ Success! Copied ${successCount} item(s) (${finalContent.length.toLocaleString()} chars).`;
        if (errorCount > 0) {
            msg += ` ${errorCount} item(s) had no content.`;
        }
        return msg;
    } catch (error) {
        console.error('Copy error:', error);
        return `❌ Error: ${error.message}`;
    }
}

async function handleCopyStructure(event, { rootPath }) {
    try {
        const fileTree = generateFileTree(rootPath, rootPath);
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

async function handleCopyGitDiff(event, rootPath) {
    const result = await getGitDiff(rootPath);
    if (result.error) return `❌ Error: ${result.error}`;
    if (!result.content || result.content.trim() === '') return "No staged changes.";
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

function createMenu() {
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

// --- APP LIFECYCLE ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 500,
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createMenu();
    ipcMain.handle('dialog:openDirectory', handleDirectoryOpen);
    ipcMain.handle('file:refreshTree', handleRefreshTree);
    ipcMain.handle('file:readFile', handleReadFile);
    ipcMain.handle('context:copyMultiple', handleCopyMultiple);
    ipcMain.handle('context:copyStructure', handleCopyStructure);
    ipcMain.handle('git:getStaged', handleGetGitStaged);
    ipcMain.handle('git:copyDiff', handleCopyGitDiff);
    ipcMain.handle('history:get', handleGetRecent);
    ipcMain.handle('history:open', handleOpenSpecificPath);

    ipcMain.on('window:minimize', () => mainWindow.minimize());
    ipcMain.on('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
    ipcMain.on('window:close', () => mainWindow.close());

    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });