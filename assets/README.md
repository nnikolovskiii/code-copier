# App Icon Setup

Your Electron app is now configured to use custom icons! Here's how to add your logo:

## Directory Structure
```
assets/
└── icons/
    ├── icon.png     # Main icon (PNG format, 512x512px or higher)
    ├── icon.ico     # Windows icon (optional - will be generated from PNG)
    └── icon.icns    # macOS icon (optional - will be generated from PNG)
```

## How to Add Your Logo

### Option 1: Simple PNG Only (Recommended)
1. Place your logo as `assets/icons/icon.png`
2. **Recommended size:** 512x512 pixels or higher
3. **Format:** PNG with transparency support
4. Electron Forge will automatically convert it to ICO/ICNS for Windows and macOS

### Option 2: Platform-Specific Icons (Advanced)
If you want maximum quality control:
- **Windows:** Create `assets/icons/icon.ico` (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)
- **macOS:** Create `assets/icons/icon.icns` (512x512, 256x256, 128x128, 32x32, 16x16)
- **Linux/Other:** Use `assets/icons/icon.png`

## What the Icon Affects
✅ **Taskbar/Dock icon** - Shows when app is running
✅ **Window icon** - Appears in title bar
✅ **Installer icon** - Windows installer will use your icon
✅ **Application menu** - Start menu and application launchers
✅ **Favicon** - Web view icon in the HTML

## Icon Design Tips
- **Keep it simple** - Complex designs may not scale well
- **High contrast** - Looks good on light/dark backgrounds
- **Square format** - Icons should be square or nearly square
- **Transparency** - PNG transparency works well for non-rectangular logos

## Current Configuration
- **Forge Config:** `forge.config.js` points to `./assets/icons/icon`
- **Window Icon:** `main.js` loads icon for the BrowserWindow
- **HTML Favicon:** `index.html` references the same icon

## Next Steps
1. Add your logo file to `assets/icons/icon.png`
2. Run `npm run make` to build with your new icon
3. Test on all platforms to ensure the icon displays correctly

## Icon Generation Tools
If you need to convert PNG to ICO/ICNS formats:
- **Online:** [favicon.io](https://favicon.io/)
- **Command Line:** `png2ico`, `iconutil` (macOS)
- **Design Software:** Photoshop, GIMP, or Figma can export multiple formats