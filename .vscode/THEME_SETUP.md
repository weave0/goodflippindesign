# VS Code Dark Theme Setup 🌌

## Overview

Your workspace is now configured with a modern, dark theme with a cool space vibe. Everything uses dark backgrounds (#0d1117) with bright light text (#e6edf3) for a smooth, eye-friendly experience.

## Theme Configuration

### Active Theme

- **Color Theme**: Dracula Official
- **Icon Theme**: Dracula Official
- **Font**: JetBrains Mono with ligatures enabled

### Color Palette

- **Background**: Deep space black (#0d1117)
- **Text**: Bright white (#e6edf3)
- **Accents**: Cool blues, purples, and greens
- **UI Elements**: Dark grays (#161b22) with bright highlights

## Features

### Dark Everywhere

✅ Editor background dark
✅ Sidebar dark
✅ Terminal dark
✅ Status bar dark
✅ Activity bar dark
✅ All panels dark

### Bright, Clear Text

✅ High contrast white text
✅ Syntax highlighting with cool colors
✅ Easy-to-read line numbers
✅ Clear focus indicators

### Space Vibes

✅ Cool blue accents (#58a6ff)
✅ Purple highlights (#bc8ef7)
✅ Cyan accents (#79c0ff)
✅ Minimal visual noise

## Recommended Extensions

Install these for the complete experience:

### Themes (choose one or rotate them)

```bash
code --install-extension dracula-theme.theme-dracula
code --install-extension GitHub.github-vscode-theme
code --install-extension arcticicestudio.nord-visual-studio-code
code --install-extension enkia.tokyo-night
```

### Development Tools

```bash
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
code --install-extension github.copilot
code --install-extension github.copilot-chat
code --install-extension eamodio.gitlens
```

### UI Enhancements

```bash
code --install-extension dracula-theme.theme-dracula-icon-theme
code --install-extension PKief.material-icon-theme
code --install-extension Gruntfuggly.todo-tree
```

## Settings Highlights

### Editor

- Font size: 13px (comfortable for long sessions)
- Line height: 1.6 (spacious, readable)
- Font ligatures: enabled (modern look)
- Minimap: enabled (navigation)
- Bracket pair colorization: enabled (easier code reading)

### Terminal

- PowerShell configured as default
- Space theme colors applied
- Same font as editor (consistency)

### Auto-save & Formatting

- Auto-save enabled (1000ms delay)
- Format on save enabled
- ESLint integration active

## Keyboard Shortcuts for Theme

| Action            | Shortcut        |
| ----------------- | --------------- |
| Change theme      | `Ctrl+K Ctrl+T` |
| Change icon theme | `Ctrl+K Ctrl+I` |
| Toggle sidebar    | `Ctrl+B`        |
| Toggle terminal   | `Ctrl+~`        |
| Zen mode          | `Ctrl+K Z`      |

## Tips for Maximum Comfort

1. **Brightness** - If text is too bright at night, use OS dark mode + blue light filter
2. **Font Size** - Press `Ctrl++` to increase, `Ctrl+-` to decrease
3. **Terminal** - Use `Ctrl+~` to toggle terminal for distraction-free coding
4. **Zen Mode** - Use `Ctrl+K Z` for full-screen, distraction-free editing

## Troubleshooting

**Theme not applying?**

- Open Command Palette (`Ctrl+Shift+P`)
- Type "Reload Window"
- Select "Developer: Reload Window"

**Colors look off?**

- Verify `workbench.colorTheme` is set to "Dracula Official"
- Check that no other theme-related extensions are conflicting
- Ensure VS Code is updated to latest version

**Font not rendering correctly?**

- Install fonts: JetBrains Mono, Fira Code, or Hack
- Verify `editor.fontFamily` setting has fallbacks

## Customization

All theme colors are defined in `.vscode/settings.json` under `workbench.colorCustomizations`. Feel free to tweak any colors:

```json
"workbench.colorCustomizations": {
  "editor.background": "#0d1117",
  "editor.foreground": "#e6edf3",
  // ... more customizations
}
```

Enjoy your dark, chill coding experience! 🚀

---

Last updated: 2026-01-28
