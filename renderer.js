const selectFolderBtn = document.getElementById('select-folder-btn');
const copyStructureBtn = document.getElementById('copy-structure-btn');
const fileTreeContainer = document.getElementById('file-tree-container');
const statusArea = document.getElementById('status-area');
const resizer = document.querySelector('.resizer');

let rootPath = ''; // Stores the path of the selected root folder

// Resizable divider functionality
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

    // Apply constraints: minimum 200px, maximum 80% of container
    const minWidth = 200;
    const maxWidth = containerRect.width * 0.8;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
        fileTreeContainer.style.width = newWidth + 'px';
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        resizer.classList.remove('resizing');

        // Save the preferred width to localStorage for persistence
        localStorage.setItem('fileTreeWidth', fileTreeContainer.style.width);
    }
});

// Restore saved width on load
window.addEventListener('load', () => {
    const savedWidth = localStorage.getItem('fileTreeWidth');
    if (savedWidth) {
        fileTreeContainer.style.width = savedWidth;
    }
});

function createTree(nodes) {
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
        const contentDiv = document.createElement('div');
        contentDiv.className = 'item-content';
        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon';
        contentDiv.appendChild(iconSpan);
        contentDiv.append(node.name);
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            statusArea.innerHTML = `<div class="welcome-message">Copying: ${node.name}...</div>`;
            const resultMessage = await window.electronAPI.copyPath({ targetPath: node.path, rootPath: rootPath });
            statusArea.innerHTML = `<div class="welcome-message">${resultMessage}</div>`;
        });
        itemDiv.appendChild(contentDiv);
        itemDiv.appendChild(copyBtn);
        li.appendChild(itemDiv);
        if (node.type === 'directory') {
            li.classList.add('directory');
            if (node.children && node.children.length > 0) {
                li.appendChild(createTree(node.children));
            }
        } else {
            li.classList.add('file');
        }
        ul.appendChild(li);
    }
    return ul;
}

selectFolderBtn.addEventListener('click', async () => {
    statusArea.innerHTML = '<div class="welcome-message">Loading file tree...</div>';
    fileTreeContainer.innerHTML = '';
    const fileTreeData = await window.electronAPI.selectFolder();
    if (fileTreeData) {
        rootPath = fileTreeData.path; // Store the root path
        const rootUl = createTree([fileTreeData]);
        fileTreeContainer.appendChild(rootUl);
        statusArea.innerHTML = '<div class="welcome-message">Ready. Click a folder to expand or a file to view its contents.</div>';
    } else {
        statusArea.innerHTML = '<div class="welcome-message">No folder selected. Select a folder to begin.</div>';
    }
});

copyStructureBtn.addEventListener('click', async () => {
    try {
        // Show loading state
        statusArea.innerHTML = '<div class="welcome-message">Generating folder structure...</div>';

        const resultMessage = await window.electronAPI.copyStructure({ rootPath });
        statusArea.innerHTML = `<div class="welcome-message">${resultMessage}</div>`;

    } catch (error) {
        statusArea.innerHTML = `<div class="file-error">Error copying structure: ${error.message}</div>`;
    }
});

fileTreeContainer.addEventListener('click', async (event) => {
    const content = event.target.closest('.item-content');
    if (content) {
        const parentLi = content.closest('li');

        // Handle directory clicks (toggle open/close)
        if (parentLi.classList.contains('directory')) {
            parentLi.classList.toggle('open');
            return;
        }

        // Handle file clicks (display content)
        if (parentLi.classList.contains('file')) {
            const filePath = parentLi.dataset.path;
            if (filePath) {
                await displayFileContent(filePath);
            }
        }
    }
});

async function displayFileContent(filePath) {
    try {
        // Show loading state
        statusArea.innerHTML = '<div class="welcome-message">Loading file...</div>';

        const fileData = await window.electronAPI.readFile({ filePath });

        if (fileData.error) {
            statusArea.innerHTML = `<div class="file-error">Error: ${fileData.error}</div>`;
            return;
        }

        // Display file content
        statusArea.innerHTML = `
            <div class="file-header">
                <div class="file-name">${fileData.fileName}</div>
                <div class="file-path">${fileData.filePath}</div>
            </div>
            <div class="file-content">${escapeHtml(fileData.content)}</div>
        `;

    } catch (error) {
        statusArea.innerHTML = `<div class="file-error">Error reading file: ${error.message}</div>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}