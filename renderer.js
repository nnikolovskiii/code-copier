const selectFolderBtn = document.getElementById('select-folder-btn');
const fileTreeContainer = document.getElementById('file-tree-container');
const statusArea = document.getElementById('status-area');

let rootPath = ''; // Stores the path of the selected root folder

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
            statusArea.textContent = `Copying: ${node.name}...`;
            const resultMessage = await window.electronAPI.copyPath({ targetPath: node.path, rootPath: rootPath });
            statusArea.textContent = resultMessage;
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
    statusArea.textContent = 'Loading file tree...';
    fileTreeContainer.innerHTML = '';
    const fileTreeData = await window.electronAPI.selectFolder();
    if (fileTreeData) {
        rootPath = fileTreeData.path; // Store the root path
        const rootUl = createTree([fileTreeData]);
        fileTreeContainer.appendChild(rootUl);
        statusArea.textContent = 'Ready. Click a folder to expand or a button to copy.';
    } else {
        statusArea.textContent = 'No folder selected. Select a folder to begin.';
    }
});

fileTreeContainer.addEventListener('click', (event) => {
    const content = event.target.closest('.item-content');
    if (content) {
        const parentLi = content.closest('li.directory');
        if (parentLi) {
            parentLi.classList.toggle('open');
        }
    }
});