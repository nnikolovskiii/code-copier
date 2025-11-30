# Code Copier

A desktop application built with Electron that helps you easily copy project code for AI prompts. Select specific files and folders from your project, and the app will combine their contents into a single clipboard entry, perfect for sharing with AI assistants or code review tools.

## Features

- **Visual File Explorer**: Browse your project structure with an intuitive tree view
- **Selective File Copying**: Choose specific files and folders to include in your output
- **Smart File Filtering**: Automatically ignores binary files, dependencies, and other non-essential files
- **Directory Structure Copy**: Copy just the folder structure without file contents
- **Real-time File Watching**: Automatically refreshes when files change in your project
- **Custom Title Bar**: Clean, modern interface with VS Code-inspired design
- **Resizable Panels**: Adjust the file explorer and staging area to your preference

## Screenshots

*(Add screenshots here when available)*

## Installation

### Prerequisites

- Node.js (version 18 or higher)
- npm or yarn

### Setup

1. Clone this repository:
```bash
git clone https://github.com/nnikolovskiii/code-copier.git
cd code-copier
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
npm start
```

## Building for Distribution

### Package the App
```bash
npm run package
```

### Create Distributables
```bash
npm run make
```

This will create platform-specific installers in the `out` directory:
- Windows: `.exe` installer (via Squirrel)
- macOS: `.zip` archive
- Linux: `.deb` and `.rpm` packages

## Usage

1. **Open a Project**: Click "Open Folder" to select your project directory
2. **Select Files**: Use the `+` buttons next to files and folders to add them to your selection
3. **Review Selection**: Your selected items appear in the staging area on the right
4. **Copy to Clipboard**: Click "Copy to Clipboard" to combine all selected files into a single text block
5. **Copy Structure Only**: Use "Copy Tree" to copy just the directory structure without file contents

## File Filtering

The application automatically excludes:

### File Extensions
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, etc.
- Media: `.mp3`, `.mp4`, `.mov`, `.avi`, `.wav`, etc.
- Archives: `.zip`, `.tar`, `.gz`, `.rar`, `.7z`, etc.
- Compiled files: `.exe`, `.dll`, `.so`, `.class`, `.pyc`, etc.
- Documents: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, etc.
- Design files: `.psd`, `.ai`, `.sketch`, `.fig`, etc.
- Database files: `.db`, `.sqlite`, `.mdb`, etc.
- Source maps: `.map`, `.css.map`, `.js.map`
- Security files: `.pem`, `.crt`, `.key`, `.p12`
- Lock files: `package-lock.json`, `yarn.lock`, etc.
- System files: `.DS_Store`, `Thumbs.db`

### Directories
- Version control: `.git`, `.svn`, `.hg`
- Dependencies: `node_modules`, `vendor`, `bower_components`
- Build outputs: `dist`, `build`, `out`, `target`, `bin`
- IDE files: `.idea`, `.vscode`, `.settings`
- Cache directories: `__pycache__`, `.pytest_cache`, `.mypy_cache`
- Framework directories: `.next`, `.nuxt`, `.gradle`, `.m2`
- Logs and coverage: `logs`, `coverage`, `test-results`

## Development

### Project Structure

```
code-copier/
├── main.js           # Electron main process
├── preload.js        # Preload script for security
├── renderer.js       # Frontend logic
├── index.html        # Main UI
├── package.json      # Project configuration
├── forge.config.js   # Electron Forge configuration
└── assets/icons/     # Application icons
```

### Key Technologies

- **Electron**: Cross-platform desktop application framework
- **Chokidar**: File watching for real-time updates
- **Electron Forge**: Application packaging and distribution

### Security

The application follows Electron security best practices:
- Content Security Policy (CSP) headers
- Context isolation enabled
- Preload scripts for secure IPC communication

## Configuration

### Ignored Files

You can customize the ignored file extensions and directories by modifying the `IGNORED_EXTENSIONS` and `IGNORED_DIRS` arrays in `main.js`.

### Window Settings

Window dimensions and behavior can be adjusted in the `createWindow()` function in `main.js`.

## Troubleshooting

### Common Issues

1. **Application won't start**: Ensure Node.js is properly installed and all dependencies are up to date
2. **File access denied**: Make sure the application has permission to read your project directory
3. **Large projects**: For very large projects, the initial scan may take a few seconds

### Getting Help

If you encounter issues:
1. Check the console for error messages (Developer Tools can be opened in the app)
2. Ensure your project directory doesn't contain permission-restricted files
3. Try refreshing the file tree using the refresh button

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -m 'Add some feature'`
5. Push to the branch: `git push origin feature-name`
6. Submit a pull request

## License

This project is licensed under the ISC License - see the package.json file for details.

## Author

Created by **nnikolovskii**

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Packaged with [Electron Forge](https://www.electronforge.io/)
- File watching powered by [Chokidar](https://github.com/paulmillr/chokidar)
- UI design inspired by VS Code's Dark Modern theme
