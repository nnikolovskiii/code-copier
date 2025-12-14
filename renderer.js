const selectFolderBtn = document.getElementById('select-folder-btn');
const copyStructureBtn = document.getElementById('copy-structure-btn');
const refreshBtn = document.getElementById('refresh-btn');
const gitStagedBtn = document.getElementById('git-staged-btn'); // <--- New button
const fileTreeContainer = document.getElementById('file-tree-container');
const messageBox = document.getElementById('message-box');
const resizer = document.querySelector('.resizer');

// Staging Area Elements
const stagingList = document.getElementById('staging-list');
const stagingCount = document.getElementById('staging-count');
const clearAllBtn = document.getElementById('clear-all-btn');
const copyAllBtn = document.getElementById('copy-all-btn');

let rootPath = ''; 
let selectedItems = new Map();

// --- SVG HELPERS ---
const ICONS = {
    chevron: '<svg class="svg-icon icon-chevron" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    folder: '<svg class="svg-icon icon-folder" viewBox="0 0 16 16"><path d="M14.5 3H7.71l-.85-.85L6.51 2h-5l-.5.5v11l.5.5h13l.5-.5v-10l-.5-.5z" fill="currentColor"/></svg>',
    file: '<svg class="svg-icon icon-file" viewBox="0 0 16 16"><path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM10 5v-1.5L11.5 5H10z" fill="currentColor"/></svg>',
    plus: '<svg class="svg-icon" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" fill="currentColor"/></svg>',
    check: '<svg class="svg-icon" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" fill="currentColor"/></svg>',
    minus: '<svg class="svg-icon" viewBox="0 0 16 16"><path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z" fill="currentColor"/></svg>'
};

// --- RESIZER LOGIC ---
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
    const containerRect = fileTreeContainer.parentElement.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    if(newWidth > 150 && newWidth < 600) { // Safety constraints
        fileTreeContainer.style.width = newWidth + 'px';
    }
});
document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        resizer.classList.remove('resizing');
        localStorage.setItem('fileTreeWidth', fileTreeContainer.style.width);
    }
});
window.addEventListener('load', () => {
    const savedWidth = localStorage.getItem('fileTreeWidth');
    if (savedWidth) fileTreeContainer.style.width = savedWidth;
    updateStagingView();
});

// --- STAGING AREA LOGIC ---
function addItem(node) {
    if (selectedItems.has(node.path)) return;
    selectedItems.set(node.path, { name: node.name, type: node.type });
    updateStagingView();
}

function removeItem(path) {
    selectedItems.delete(path);
    updateStagingView();
    refreshTreeLogic(true); // Triggers re-render of tree to remove checkmarks
}

function updateStagingView() {
    stagingList.innerHTML = '';
    stagingCount.textContent = `Selected Files (${selectedItems.size})`;
    copyAllBtn.disabled = selectedItems.size === 0;

    if (selectedItems.size === 0) {
        stagingList.innerHTML = `
            <div class="empty-state">
                <svg class="empty-icon" viewBox="0 0 16 16"><path d="M14 1H2a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V2a1 1 0 00-1-1zM2 2h12v12H2V2z" fill="currentColor" fill-opacity="0.5"/></svg>
                <p>No files selected.</p>
                <p style="font-size: 11px; opacity: 0.7">Click + on the left to add files.</p>
            </div>`;
        return;
    }

    selectedItems.forEach((item, path) => {
        const div = document.createElement('div');
        div.className = 'selected-item';
        const icon = item.type === 'directory' ? ICONS.folder : ICONS.file;
        
        div.innerHTML = `
            <div class="selected-item-info">
                <span class="selected-item-name">${icon} ${item.name}</span>
                <span class="selected-item-path" title="${path}">${path}</span>
            </div>
            <button class="remove-btn" title="Remove">✕</button>
        `;
        div.querySelector('.remove-btn').onclick = () => removeItem(path);
        stagingList.appendChild(div);
    });
}

// Window Controls
document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());

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
        
        // --- SELECTION LOGIC ---
        const isExplicitlySelected = selectedItems.has(node.path);
        const isEffectivelySelected = isExplicitlySelected || ancestorSelected;
        
        if (isEffectivelySelected) itemDiv.classList.add('added');
        
        // --- CONTENT (ICON + TEXT) ---
        const contentDiv = document.createElement('div');
        contentDiv.className = 'item-content';
        let iconHtml = node.type === 'directory' ? `${ICONS.chevron} ${ICONS.folder}` : `<span style="width:14px; display:inline-block"></span> ${ICONS.file}`;
        
        if (node.type === 'directory') {
            li.classList.add('directory');
            if (expandedPaths.has(node.path)) li.classList.add('open');
        } else {
            li.classList.add('file');
        }

        contentDiv.innerHTML = `${iconHtml} <span class="tree-label">${node.name}</span>`;
        
        // --- BUTTON LOGIC ---
        const addBtn = document.createElement('button');
        addBtn.className = 'tree-add-btn';
        
        if (ancestorSelected) {
            // Case 1: Locked by parent
            addBtn.innerHTML = ICONS.check;
            addBtn.classList.add('is-implicit');
        } else if (isExplicitlySelected) {
            // Case 2: User selected this -> Allow remove
            addBtn.innerHTML = ICONS.check;
            addBtn.classList.add('is-selected');
            
            // Toggle Icon on Hover
            addBtn.addEventListener('mouseenter', () => addBtn.innerHTML = ICONS.minus);
            addBtn.addEventListener('mouseleave', () => addBtn.innerHTML = ICONS.check);
            
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeItem(node.path);
            });
        } else {
            // Case 3: Not selected -> Allow add
            addBtn.innerHTML = ICONS.plus;
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addItem(node);
                refreshTreeLogic(true); 
            });
        }

        itemDiv.appendChild(contentDiv);
        itemDiv.appendChild(addBtn);
        li.appendChild(itemDiv);
        
        // --- ROW CLICK HANDLER ---
        itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            if (node.type === 'directory') {
                li.classList.toggle('open');
            } else {
                if (!ancestorSelected) {
                    if (isExplicitlySelected) removeItem(node.path);
                    else {
                        addItem(node);
                        refreshTreeLogic(true);
                    }
                }
            }
        });
        
        if (node.type === 'directory' && node.children && node.children.length > 0) {
            li.appendChild(createTree(node.children, expandedPaths, isEffectivelySelected));
        }
        ul.appendChild(li);
    }
    return ul;
}

// --- ACTIONS ---
selectFolderBtn.addEventListener('click', async () => {
    messageBox.textContent = 'Loading...';
    const fileTreeData = await window.electronAPI.selectFolder();
    if (fileTreeData) {
        rootPath = fileTreeData.path;
        selectedItems.clear(); 
        refreshTreeLogic(true);
        updateStagingView();
        messageBox.textContent = '';
    } else {
        messageBox.textContent = '';
    }
});

async function refreshTreeLogic(isAuto = false) {
    if (!rootPath) return;

    // Preserve open folder state
    const expanded = new Set();
    expanded.add(rootPath);
    fileTreeContainer.querySelectorAll('.directory.open').forEach(el => expanded.add(el.dataset.path));
    
    if (!isAuto) messageBox.textContent = 'Refreshing...';
    const fileTreeData = await window.electronAPI.refreshTree(rootPath);
    
    if (fileTreeData) {
        fileTreeContainer.innerHTML = '';
        fileTreeContainer.appendChild(createTree([fileTreeData], expanded));
        if (!isAuto) {
            messageBox.textContent = 'Refreshed';
            setTimeout(() => messageBox.textContent = '', 2000);
        }
    }
}

refreshBtn.addEventListener('click', () => refreshTreeLogic(false));
window.electronAPI.onFileSystemChange(() => refreshTreeLogic(true));

// --- GIT STAGED LOGIC (NEW) ---
gitStagedBtn.addEventListener('click', async () => {
    if (!rootPath) {
        messageBox.textContent = 'Open a folder first';
        return;
    }

    messageBox.textContent = 'Checking Git...';
    
    try {
        const stagedFiles = await window.electronAPI.getGitStaged(rootPath);
        
        if (stagedFiles.length === 0) {
            messageBox.textContent = 'No staged files found';
            setTimeout(() => messageBox.textContent = '', 3000);
            return;
        }

        let addedCount = 0;
        const getBaseName = (p) => p.split(/[/\\]/).pop();

        stagedFiles.forEach(fullPath => {
            if (!selectedItems.has(fullPath)) {
                selectedItems.set(fullPath, { 
                    name: getBaseName(fullPath), 
                    type: 'file' 
                });
                addedCount++;
            }
        });

        if (addedCount > 0) {
            updateStagingView();
            refreshTreeLogic(true);
            messageBox.textContent = `Added ${addedCount} staged files`;
        } else {
            messageBox.textContent = 'Files already selected';
        }

        setTimeout(() => messageBox.textContent = '', 3000);

    } catch (error) {
        console.error(error);
        messageBox.textContent = 'Error checking git';
    }
});

copyStructureBtn.addEventListener('click', async () => {
    messageBox.textContent = 'Generating...';
    const msg = await window.electronAPI.copyStructure({ rootPath });
    messageBox.textContent = msg;
    setTimeout(() => messageBox.textContent = '', 3000);
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
    const result = await window.electronAPI.copyMultiple({
        paths: pathsToCopy,
        rootPath: rootPath
    });
    
    messageBox.textContent = result;
    copyAllBtn.disabled = false;
    copyAllBtn.innerHTML = originalText;
    
    if(result.includes('Success')) {
        setTimeout(() => messageBox.textContent = '', 4000);
    }
});