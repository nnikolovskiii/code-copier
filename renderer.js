// --- VIEW ELEMENTS ---
const viewWelcome = document.getElementById('view-welcome');
const viewWorkspace = document.getElementById('view-workspace');
const welcomeOpenBtn = document.getElementById('welcome-open-btn');
const recentListEl = document.getElementById('recent-projects-list');

// --- WORKSPACE ELEMENTS ---
const selectFolderBtn = document.getElementById('select-folder-btn');
const gitStagedBtn = document.getElementById('git-staged-btn');
const copyStructureBtn = document.getElementById('copy-structure-btn');
const messageBox = document.getElementById('message-box');
const lineNumbersEl = document.getElementById('line-numbers');
const copyDiffBtn = document.getElementById('copy-diff-btn');

// Layout Elements
const leftSidebar = document.getElementById('left-sidebar');
const rightSidebar = document.getElementById('right-sidebar');
const toggleLeftBtn = document.getElementById('toggle-left');
const toggleRightBtn = document.getElementById('toggle-right');
const resizerLeft = document.getElementById('resizer-left');
const resizerRight = document.getElementById('resizer-right');

// Tree & Editor
const fileTreeContainer = document.getElementById('file-tree-container');
const currentFileNameEl = document.getElementById('current-file-name');
const codeContentEl = document.getElementById('code-content');

// Search Elements
const searchContainer = document.getElementById('file-tree-search-container');
const searchInput = document.getElementById('file-tree-search-input');
const searchCloseBtn = document.getElementById('file-tree-search-close');
const searchResultsCount = document.getElementById('search-results-count');
const searchShortcutHint = document.getElementById('search-shortcut-hint');

// Editor Search Elements
const editorSearchContainer = document.getElementById('editor-search-container');
const editorSearchInput = document.getElementById('editor-search-input');
const editorSearchCloseBtn = document.getElementById('editor-search-close');
const editorSearchPrevBtn = document.getElementById('editor-search-prev');
const editorSearchNextBtn = document.getElementById('editor-search-next');
const editorSearchCount = document.getElementById('editor-search-count');

// Staging
const stagingList = document.getElementById('staging-list');
const stagingCount = document.getElementById('staging-count');
const clearAllBtn = document.getElementById('clear-all-btn');
const copyAllBtn = document.getElementById('copy-all-btn');

// --- STATE ---
let rootPath = '';
let selectedItems = new Map();
let isSearchActive = false;
let isEditorSearchActive = false;
let hasFileOpen = false; // <-- NEW: explicit flag for whether a file is loaded

// Optimization State
let treeSearchCache = [];
let originalEditorHTML = '';
let expandedPaths = new Set();

// Editor Search State
let editorSearchMatches = [];
let currentEditorMatchIndex = -1;
let editorSearchQuery = '';

// --- HELPER: DEBOUNCE ---
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- ICON CONFIGURATION ---
const ICON_BASE_PATH = './assets/icons/';
const EXACT_FILENAMES = {
    'package.json': 'file_type_npm.svg', 'package-lock.json': 'file_type_npm.svg', 'yarn.lock': 'file_type_yarn.svg',
    'dockerfile': 'file_type_docker.svg', 'docker-compose.yml': 'file_type_docker.svg', 'readme.md': 'file_type_markdown.svg',
    'license': 'file_type_license.svg', '.gitignore': 'file_type_git.svg', '.env': 'file_type_dotenv.svg',
    'tsconfig.json': 'file_type_tsconfig_official.svg', 'node_modules': 'folder_type_node.svg', '.github': 'folder_type_github.svg', '.vscode': 'folder_type_vscode.svg'
};
const FILE_EXTENSIONS = {
    'js': 'file_type_js.svg', 'jsx': 'file_type_reactjs.svg', 'ts': 'file_type_typescript.svg', 'tsx': 'file_type_reactts.svg',
    'html': 'file_type_html.svg', 'css': 'file_type_css.svg', 'scss': 'file_type_scss.svg', 'json': 'file_type_json.svg',
    'py': 'file_type_python.svg', 'java': 'file_type_java.svg', 'c': 'file_type_c.svg', 'cpp': 'file_type_cpp.svg',
    'cs': 'file_type_csharp.svg', 'go': 'file_type_go.svg', 'rs': 'file_type_rust.svg', 'php': 'file_type_php.svg',
    'rb': 'file_type_ruby.svg', 'sql': 'file_type_sql.svg', 'md': 'file_type_markdown.svg', 'yml': 'file_type_yaml.svg'
};

const UI_ICONS = {
    chevron: '<svg class="svg-icon icon-chevron" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    plus: '<img src="./assets/plus.png" class="btn-icon-state2" alt="+">',
    check: '<img src="./assets/check (1).png" class="btn-icon-state" alt="v">',
    remove: '<img src="./assets/unselect.png" class="btn-icon-state1" alt="-">'
};

function getIconPath(node) {
    if (node.type === 'directory') {
        if (EXACT_FILENAMES[node.name.toLowerCase()]) return ICON_BASE_PATH + EXACT_FILENAMES[node.name.toLowerCase()];
        return ICON_BASE_PATH + 'default_folder.svg';
    }
    const nameLower = node.name.toLowerCase();
    if (EXACT_FILENAMES[nameLower]) return ICON_BASE_PATH + EXACT_FILENAMES[nameLower];
    const dotIndex = nameLower.lastIndexOf('.');
    if (dotIndex !== -1) {
        const ext = nameLower.substring(dotIndex + 1);
        if (FILE_EXTENSIONS[ext]) return ICON_BASE_PATH + FILE_EXTENSIONS[ext];
    }
    return ICON_BASE_PATH + 'default_file.svg';
}

// --- VIEW NAVIGATION ---
function showWelcomeView() {
    viewWorkspace.classList.add('hidden');
    viewWelcome.classList.remove('hidden');
    loadRecentProjects();
}

function showWorkspaceView() {
    viewWelcome.classList.add('hidden');
    viewWorkspace.classList.remove('hidden');
}

// --- WELCOME SCREEN LOGIC ---
async function loadRecentProjects() {
    const history = await window.electronAPI.getRecentProjects();

    if (!history || history.length === 0) {
        recentListEl.innerHTML = '<div style="color:var(--text-muted); font-style:italic;">No recent projects</div>';
        return;
    }

    recentListEl.innerHTML = '';

    history.forEach(pathStr => {
        const item = document.createElement('div');
        item.className = 'recent-row';
        const name = pathStr.split(/[/\\]/).pop();

        item.innerHTML = `
            <img src="./assets/folder.png" class="recent-row-icon"/>
            <div class="recent-details">
                <span class="recent-name">${name}</span>
                <span class="recent-path">${pathStr}</span>
            </div>
        `;

        item.addEventListener('click', async () => {
            try {
                const fileTreeData = await window.electronAPI.openRecentProject(pathStr);
                if (fileTreeData && !fileTreeData.error) {
                    handleProjectLoaded(fileTreeData);
                    showWorkspaceView();
                } else {
                    alert('Folder not found or access denied.');
                }
            } catch (e) {
                console.error(e);
            }
        });

        recentListEl.appendChild(item);
    });
}

welcomeOpenBtn.addEventListener('click', () => triggerOpenFolder());

// --- CORE LOGIC ---
async function triggerOpenFolder() {
    try {
        const fileTreeData = await window.electronAPI.selectFolder();
        if (fileTreeData) {
            handleProjectLoaded(fileTreeData);
            showWorkspaceView();
        }
    } catch (err) {
        console.error("Error opening folder:", err);
    }
}

function handleProjectLoaded(fileTreeData) {
    rootPath = fileTreeData.path;
    selectedItems.clear();
    hasFileOpen = false; // <-- Reset

    currentFileNameEl.innerHTML = '<span style="opacity:0.5;font-style:italic">No file selected</span>';
    codeContentEl.textContent = '';
    lineNumbersEl.textContent = '';
    originalEditorHTML = '';

    refreshTreeLogic(true);
    updateStagingView();
    messageBox.textContent = '';
}

// --- LAYOUT & RESIZERS ---
toggleLeftBtn.addEventListener('click', () => leftSidebar.classList.toggle('collapsed'));
toggleRightBtn.addEventListener('click', () => rightSidebar.classList.toggle('collapsed'));

function setupResizer(resizer, element, isLeft) {
    let isResizing = false;
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        resizer.classList.add('resizing');
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        if (isLeft) {
            const newWidth = e.clientX;
            if (newWidth > 150 && newWidth < 600) element.style.width = newWidth + 'px';
        } else {
            const newWidth = document.body.clientWidth - e.clientX;
            if (newWidth > 200 && newWidth < 600) element.style.width = newWidth + 'px';
        }
    });
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizer.classList.remove('resizing');
        }
    });
}
setupResizer(resizerLeft, leftSidebar, true);
setupResizer(resizerRight, rightSidebar, false);

// --- VIEWER LOGIC ---
async function openFileInViewer(node) {
    if (node.type !== 'file') return;

    if (isEditorSearchActive) {
        closeEditorSearch();
    }

    const iconPath = getIconPath(node);
    currentFileNameEl.innerHTML = `<img src="${iconPath}" class="tree-icon" /> ${node.name}`;

    codeContentEl.textContent = 'Loading...';
    lineNumbersEl.textContent = '';
    codeContentEl.className = 'language-plaintext';
    hasFileOpen = false; // <-- Not loaded yet

    try {
        const result = await window.electronAPI.readFile(node.path);

        if (result.error) {
            codeContentEl.textContent = `Unable to display file.\n\nReason: ${result.error}`;
            lineNumbersEl.textContent = '';
            originalEditorHTML = '';
            hasFileOpen = false;
        } else {
            codeContentEl.innerHTML = result.html;
            originalEditorHTML = result.html;
            hasFileOpen = true; // <-- Successfully loaded

            const langClass = result.language ? `language-${result.language}` : 'language-plaintext';
            codeContentEl.className = `hljs ${langClass}`;

            const lineCount = result.content.split(/\r\n|\r|\n/).length;
            let linesHtml = '';
            for (let i = 1; i <= lineCount; i++) {
                linesHtml += i + '\n';
            }
            lineNumbersEl.textContent = linesHtml;
        }
    } catch (e) {
        console.error(e);
        codeContentEl.textContent = "Error reading file.";
        lineNumbersEl.textContent = '';
        originalEditorHTML = '';
        hasFileOpen = false;
    }
}

// --- STAGING LOGIC ---
function addItem(node) {
    if (selectedItems.has(node.path)) return;
    selectedItems.set(node.path, { name: node.name, type: node.type });
    updateStagingView();
}
function removeItem(path) {
    selectedItems.delete(path);
    updateStagingView();
    refreshTreeLogic(true);
}
function updateStagingView() {
    stagingList.innerHTML = '';
    stagingCount.textContent = `Selected Files (${selectedItems.size})`;
    copyAllBtn.disabled = selectedItems.size === 0;

    if (selectedItems.size === 0) {
        stagingList.innerHTML = `<div class="empty-state"><p>No files selected.</p></div>`;
        return;
    }

    selectedItems.forEach((item, path) => {
        const div = document.createElement('div');
        div.className = 'selected-item';
        const iconPath = getIconPath(item);
        div.innerHTML = `
            <div class="selected-item-info">
                <span class="selected-item-name"><img src="${iconPath}" class="tree-icon" style="width:16px;height:16px"/> ${item.name}</span>
                <span class="selected-item-path" title="${path}">${path}</span>
            </div>
            <button class="remove-btn">✕</button>
        `;
        div.querySelector('.remove-btn').onclick = () => removeItem(path);
        stagingList.appendChild(div);
    });
}

// --- TREE RENDERING ---
function createTree(nodes, expandedPaths = new Set(), ancestorSelected = false) {
    const ul = document.createElement('ul');
    ul.className = 'file-tree';
    nodes.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
    });

    for (const node of nodes) {
        const li = document.createElement('li');
        li.dataset.path = node.path;
        const itemDiv = document.createElement('div');
        itemDiv.className = 'tree-item';

        treeSearchCache.push({
            element: itemDiv,
            text: node.name.toLowerCase(),
            path: node.path,
            isDir: node.type === 'directory'
        });

        const isExplicitlySelected = selectedItems.has(node.path);
        const isEffectivelySelected = isExplicitlySelected || ancestorSelected;
        if (isEffectivelySelected) itemDiv.classList.add('added');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'item-content';
        const iconPath = getIconPath(node);
        const folderChevron = node.type === 'directory' ? UI_ICONS.chevron + ' ' : '';
        const iconHtml = `<img src="${iconPath}" class="tree-icon" />`;

        if (node.type === 'directory') {
            li.classList.add('directory');
            if (expandedPaths.has(node.path)) li.classList.add('open');
        } else {
            li.classList.add('file');
        }

        contentDiv.innerHTML = `${folderChevron}${iconHtml} <span class="tree-label">${node.name}</span>`;

        const addBtn = document.createElement('button');
        addBtn.className = 'tree-add-btn';

        if (ancestorSelected) {
            addBtn.innerHTML = UI_ICONS.check;
            addBtn.classList.add('is-implicit');
        } else if (isExplicitlySelected) {
            addBtn.innerHTML = UI_ICONS.check;
            addBtn.classList.add('is-selected');
            addBtn.addEventListener('mouseenter', () => addBtn.innerHTML = UI_ICONS.remove);
            addBtn.addEventListener('mouseleave', () => addBtn.innerHTML = UI_ICONS.check);
            addBtn.addEventListener('click', (e) => { e.stopPropagation(); removeItem(node.path); });
        } else {
            addBtn.innerHTML = UI_ICONS.plus;
            addBtn.addEventListener('click', (e) => { e.stopPropagation(); addItem(node); refreshTreeLogic(true); });
        }

        itemDiv.appendChild(contentDiv);
        itemDiv.appendChild(addBtn);
        li.appendChild(itemDiv);

        itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            if (node.type === 'directory') {
                const isOpen = li.classList.toggle('open');
                const img = itemDiv.querySelector('img.tree-icon');
                if (img) {
                    if (img.src.includes('default_folder')) {
                        img.src = ICON_BASE_PATH + (isOpen ? 'default_folder_opened.svg' : 'default_folder.svg');
                    } else {
                        const currentSrc = img.src;
                        if(isOpen && !currentSrc.includes('_opened.svg')) img.src = currentSrc.replace('.svg', '_opened.svg');
                        else if (!isOpen && currentSrc.includes('_opened.svg')) img.src = currentSrc.replace('_opened.svg', '.svg');
                    }
                }
            } else {
                openFileInViewer(node);
            }
        });

        if (node.type === 'directory' && node.children && node.children.length > 0) {
            li.appendChild(createTree(node.children, expandedPaths, isEffectivelySelected));
        }
        ul.appendChild(li);
    }
    return ul;
}

// --- BUTTON HANDLERS (WORKSPACE) ---
selectFolderBtn.addEventListener('click', () => triggerOpenFolder());

async function refreshTreeLogic(isAuto = false) {
    if (!rootPath) return;
    
    expandedPaths.clear();
    expandedPaths.add(rootPath);
    fileTreeContainer.querySelectorAll('.directory.open').forEach(el => {
        if (el.dataset.path) expandedPaths.add(el.dataset.path);
    });

    if (!isAuto) messageBox.textContent = 'Refreshing...';
    
    const fileTreeData = await window.electronAPI.refreshTree(rootPath);
    if (fileTreeData) {
        fileTreeContainer.innerHTML = '';
        treeSearchCache = [];
        fileTreeContainer.appendChild(createTree([fileTreeData], expandedPaths));
        if (!isAuto) { messageBox.textContent = 'Refreshed'; setTimeout(() => messageBox.textContent = '', 2000); }
    }
}

window.electronAPI.onFileSystemChange(() => refreshTreeLogic(true));

gitStagedBtn.addEventListener('click', async () => {
    if (!rootPath) { messageBox.textContent = 'Open a folder first'; return; }
    messageBox.textContent = 'Checking Git...';
    try {
        const stagedFiles = await window.electronAPI.getGitStaged(rootPath);
        if (stagedFiles.length === 0) { messageBox.textContent = 'No staged files found'; setTimeout(() => messageBox.textContent = '', 3000); return; }
        let addedCount = 0;
        const getBaseName = (p) => p.split(/[/\\]/).pop();
        stagedFiles.forEach(fullPath => {
            if (!selectedItems.has(fullPath)) {
                selectedItems.set(fullPath, { name: getBaseName(fullPath), type: 'file' });
                addedCount++;
            }
        });
        if (addedCount > 0) { updateStagingView(); refreshTreeLogic(true); messageBox.textContent = `Added ${addedCount} staged files`; }
        else { messageBox.textContent = 'Files already selected'; }
        setTimeout(() => messageBox.textContent = '', 3000);
    } catch (error) { console.error(error); messageBox.textContent = 'Error checking git'; }
});

copyStructureBtn.addEventListener('click', async () => {
    messageBox.textContent = 'Generating...';
    const msg = await window.electronAPI.copyStructure({ rootPath });
    messageBox.textContent = msg;
    setTimeout(() => messageBox.textContent = '', 3000);
});

copyDiffBtn.addEventListener('click', async () => {
    if (!rootPath) { messageBox.textContent = 'Open a folder first'; return; }
    const originalText = copyDiffBtn.innerHTML;
    copyDiffBtn.disabled = true;
    messageBox.textContent = 'Generating diff...';
    try {
        const resultMsg = await window.electronAPI.copyGitDiff(rootPath);
        messageBox.textContent = resultMsg;
        if (resultMsg.includes('Success') || resultMsg.includes('Copied')) {
            copyDiffBtn.innerHTML = `✅ Copied`;
        }
    } catch (error) {
        console.error(error);
        messageBox.textContent = 'Error generating diff';
    }
    setTimeout(() => {
        copyDiffBtn.disabled = false;
        copyDiffBtn.innerHTML = originalText;
        messageBox.textContent = '';
    }, 2000);
});

clearAllBtn.addEventListener('click', () => {
    selectedItems.clear();
    updateStagingView();
    refreshTreeLogic(true);
});

copyAllBtn.addEventListener('click', async () => {
    if (selectedItems.size === 0) return;
    const originalText = copyAllBtn.innerHTML;
    copyAllBtn.disabled = true;
    copyAllBtn.textContent = 'Processing...';
    messageBox.textContent = 'Reading files...';
    const pathsToCopy = Array.from(selectedItems.keys());
    const result = await window.electronAPI.copyMultiple({ paths: pathsToCopy, rootPath: rootPath });
    messageBox.textContent = result;
    copyAllBtn.disabled = false;
    copyAllBtn.innerHTML = originalText;
    if(result.includes('Success')) setTimeout(() => messageBox.textContent = '', 4000);
});

document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());

// --- FILE TREE SEARCH FUNCTIONALITY ---
function openSearch() {
    if (!rootPath) return;
    isSearchActive = true;
    searchContainer.classList.remove('hidden');
    searchShortcutHint.style.display = 'none';
    searchInput.value = '';
    searchResultsCount.textContent = '';
    searchInput.focus();
    leftSidebar.classList.remove('collapsed');
}

function closeSearch() {
    isSearchActive = false;
    searchContainer.classList.add('hidden');
    searchShortcutHint.style.display = '';
    searchInput.value = '';
    searchResultsCount.textContent = '';
    
    document.querySelectorAll('.tree-item.hidden-by-search').forEach(el => el.classList.remove('hidden-by-search'));
    document.querySelectorAll('.tree-item.match-search').forEach(el => el.classList.remove('match-search'));
    document.querySelectorAll('.directory.has-matching-children').forEach(el => el.classList.remove('has-matching-children'));

    document.querySelectorAll('.directory').forEach(dir => {
        const path = dir.dataset.path;
        if (path && expandedPaths.has(path)) {
            dir.classList.add('open');
        } else {
            dir.classList.remove('open');
        }
    });
}

function performSearch(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    document.querySelectorAll('.tree-item.hidden-by-search').forEach(el => el.classList.remove('hidden-by-search'));
    document.querySelectorAll('.tree-item.match-search').forEach(el => el.classList.remove('match-search'));
    document.querySelectorAll('.directory.has-matching-children').forEach(el => el.classList.remove('has-matching-children'));
    
    if (!lowerQuery) {
        searchResultsCount.textContent = '';
        document.querySelectorAll('.directory').forEach(dir => {
            const path = dir.dataset.path;
            if (path && expandedPaths.has(path)) {
                dir.classList.add('open');
            } else {
                dir.classList.remove('open');
            }
        });
        return;
    }
    
    if (expandedPaths.size === 1 && document.querySelectorAll('.directory.open').length > 0) {
        expandedPaths.clear();
        expandedPaths.add(rootPath);
        document.querySelectorAll('.directory.open').forEach(dir => {
            if (dir.dataset.path) expandedPaths.add(dir.dataset.path);
        });
    }
    
    let matchCount = 0;
    
    treeSearchCache.forEach(item => {
        const isMatch = item.text.includes(lowerQuery);
        
        if (isMatch) {
            matchCount++;
            item.element.classList.add('match-search');
            
            let parent = item.element.closest('li');
            if (parent) {
                let dirObj = parent.parentElement?.closest('.directory');
                while (dirObj) {
                    dirObj.classList.add('open', 'has-matching-children');
                    dirObj = dirObj.parentElement?.closest('.directory');
                }
            }
        } else {
            item.element.classList.add('hidden-by-search');
        }
    });

    const parentsWithMatches = document.getElementsByClassName('has-matching-children');
    for (let parent of parentsWithMatches) {
        const item = parent.querySelector(':scope > .tree-item');
        if (item) item.classList.remove('hidden-by-search');
    }
    
    if (matchCount === 0) {
        searchResultsCount.textContent = 'No matches found';
    } else {
        searchResultsCount.textContent = `${matchCount} match${matchCount === 1 ? '' : 'es'}`;
    }
}

searchCloseBtn.addEventListener('click', closeSearch);

searchInput.addEventListener('input', debounce((e) => {
    performSearch(e.target.value);
}, 150));

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
        fileTreeContainer.focus();
    }
});

// =============================================
// EDITOR SEARCH — REWRITTEN
// =============================================

function openEditorSearch() {
    // Only open editor search if a file is actually loaded
    if (!hasFileOpen) {
        openSearch();
        return;
    }
    
    isEditorSearchActive = true;
    editorSearchContainer.classList.remove('hidden');
    editorSearchInput.value = editorSearchQuery || '';
    editorSearchInput.focus();
    editorSearchInput.select();
    
    if (editorSearchQuery) {
        performEditorSearch(editorSearchQuery);
    }
}

function closeEditorSearch() {
    isEditorSearchActive = false;
    editorSearchContainer.classList.add('hidden');
    editorSearchQuery = '';
    
    // Restore clean highlighted HTML in one shot
    if (originalEditorHTML) {
        codeContentEl.innerHTML = originalEditorHTML;
    }
    
    editorSearchMatches = [];
    currentEditorMatchIndex = -1;
    editorSearchCount.textContent = '';
}

/**
 * Fixed editor search: collects text nodes as a snapshot first,
 * then for each node builds a complete replacement DocumentFragment
 * in a single pass. Never re-visits already-processed nodes.
 */
function performEditorSearch(query) {
    editorSearchQuery = query;
    editorSearchMatches = [];
    currentEditorMatchIndex = -1;
    
    // 1. Reset to the clean syntax-highlighted HTML
    if (originalEditorHTML) {
        codeContentEl.innerHTML = originalEditorHTML;
    }

    if (!query || !query.trim()) {
        editorSearchCount.textContent = '';
        return;
    }
    
    const lowerQuery = query.toLowerCase();
    
    // 2. Collect ALL text nodes that contain the query (snapshot)
    const matchingTextNodes = [];
    const walker = document.createTreeWalker(
        codeContentEl,
        NodeFilter.SHOW_TEXT,
        null
    );
    let walkerNode;
    while ((walkerNode = walker.nextNode())) {
        if (walkerNode.textContent.toLowerCase().includes(lowerQuery)) {
            matchingTextNodes.push(walkerNode);
        }
    }
    
    // 3. For each text node, find ALL matches and build a single replacement fragment
    for (const textNode of matchingTextNodes) {
        const fullText = textNode.textContent;
        const lowerText = fullText.toLowerCase();
        const parent = textNode.parentNode;
        
        // Skip if parent was removed (shouldn't happen with snapshot, but be safe)
        if (!parent) continue;
        
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let searchPos = 0;
        
        while ((searchPos = lowerText.indexOf(lowerQuery, lastIndex)) !== -1) {
            // Text before this match
            if (searchPos > lastIndex) {
                fragment.appendChild(
                    document.createTextNode(fullText.substring(lastIndex, searchPos))
                );
            }
            
            // The highlighted match
            const span = document.createElement('span');
            span.className = 'editor-search-highlight';
            span.textContent = fullText.substring(searchPos, searchPos + query.length);
            span.dataset.matchIndex = editorSearchMatches.length;
            fragment.appendChild(span);
            editorSearchMatches.push(span);
            
            lastIndex = searchPos + query.length;
        }
        
        // Remaining text after last match
        if (lastIndex < fullText.length) {
            fragment.appendChild(
                document.createTextNode(fullText.substring(lastIndex))
            );
        }
        
        // Single DOM operation: swap the text node for the fragment
        parent.replaceChild(fragment, textNode);
    }
    
    // 4. Update count and highlight first match
    if (editorSearchMatches.length === 0) {
        editorSearchCount.textContent = '0/0';
    } else {
        currentEditorMatchIndex = 0;
        highlightCurrentMatch();
        scrollToCurrentMatch();
    }
}

function highlightCurrentMatch() {
    // Remove 'current' from all, add to active one
    for (let i = 0; i < editorSearchMatches.length; i++) {
        if (i === currentEditorMatchIndex) {
            editorSearchMatches[i].classList.add('current');
        } else {
            editorSearchMatches[i].classList.remove('current');
        }
    }
    
    if (editorSearchMatches.length > 0) {
        editorSearchCount.textContent = `${currentEditorMatchIndex + 1}/${editorSearchMatches.length}`;
    }
}

function scrollToCurrentMatch() {
    if (currentEditorMatchIndex >= 0 && currentEditorMatchIndex < editorSearchMatches.length) {
        editorSearchMatches[currentEditorMatchIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}

function navigateToNextMatch() {
    if (editorSearchMatches.length === 0) return;
    currentEditorMatchIndex = (currentEditorMatchIndex + 1) % editorSearchMatches.length;
    highlightCurrentMatch();
    scrollToCurrentMatch();
}

function navigateToPreviousMatch() {
    if (editorSearchMatches.length === 0) return;
    currentEditorMatchIndex = (currentEditorMatchIndex - 1 + editorSearchMatches.length) % editorSearchMatches.length;
    highlightCurrentMatch();
    scrollToCurrentMatch();
}

editorSearchCloseBtn.addEventListener('click', closeEditorSearch);

editorSearchInput.addEventListener('input', debounce((e) => {
    performEditorSearch(e.target.value);
}, 150));

editorSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeEditorSearch();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            navigateToPreviousMatch();
        } else {
            navigateToNextMatch();
        }
    }
});

editorSearchNextBtn.addEventListener('click', navigateToNextMatch);
editorSearchPrevBtn.addEventListener('click', navigateToPreviousMatch);

// =============================================
// GLOBAL KEYBOARD SHORTCUTS — SIMPLIFIED
// =============================================
document.addEventListener('keydown', (e) => {
    // Ctrl+F / Cmd+F — always searches the current file if one is open
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (viewWorkspace.classList.contains('hidden')) return;
        
        if (hasFileOpen) {
            // A file is loaded in the editor → search inside it
            if (isSearchActive) closeSearch(); // close tree search if open
            openEditorSearch();
        } else {
            // No file open → fall back to tree search
            if (isEditorSearchActive) closeEditorSearch();
            openSearch();
        }
        return;
    }
    
    // Escape closes whichever search is active
    if (e.key === 'Escape') {
        if (isEditorSearchActive) {
            e.preventDefault();
            closeEditorSearch();
        } else if (isSearchActive) {
            e.preventDefault();
            closeSearch();
        }
    }
    
    // F3 navigates matches in editor search
    if (e.key === 'F3' && isEditorSearchActive) {
        e.preventDefault();
        if (e.shiftKey) {
            navigateToPreviousMatch();
        } else {
            navigateToNextMatch();
        }
    }
});

// Close search panels when clicking outside
document.addEventListener('click', (e) => {
    if (isSearchActive && !searchContainer.contains(e.target) && !e.target.closest('#left-sidebar')) {
        closeSearch();
    }
    // Don't auto-close editor search on outside click — it's too easy to
    // accidentally dismiss it. Users can press Escape or the ✕ button.
});

// --- INIT ---
showWelcomeView();