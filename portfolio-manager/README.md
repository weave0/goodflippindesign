# Portfolio Manager

**Desktop application for managing Brett Weaver's 34.6M line portfolio ecosystem**

![Portfolio Manager](https://img.shields.io/badge/Electron-28.1.0-blue) ![Chart.js](https://img.shields.io/badge/Chart.js-4.4.1-green) ![Status](https://img.shields.io/badge/Status-Running-success)

---

## 🎯 Purpose

The Portfolio Manager is a **meta-tool** that manages the entire Good Flippin Design portfolio ecosystem. It serves dual purposes:

1. **Practical Utility**: Analyze 284,450 files across 12 projects totaling 41.6GB
2. **Portfolio Showcase**: Demonstrates full-stack desktop development, systems architecture, and developer tooling expertise

---

## ✨ Features

### 📊 **Overview Dashboard**

- Real-time stats: 284,450 files, 41.6GB, 34.6M lines of code
- Storage breakdown with interactive Chart.js visualizations
- Top 5 projects by size
- Technology distribution across portfolio

### 📁 **Project Explorer**

- Grid view of all 12 projects with detailed metrics
- One-click project opening in File Explorer
- Technology stack identification per project
- Test coverage indicators

### 💾 **Storage Analysis**

- Detailed breakdown by project
- Average file size calculations
- Storage optimization opportunities
- Visual pie chart of space usage

### 🔄 **Duplicate Detection**

- 25,801 duplicate files identified
- 1.06GB recoverable storage
- Hash-based detection (MD5)
- Cleanup functionality (coming soon)

### ⚙️ **Technology Stack**

- 29 unique technologies tracked
- Shows which projects use each tech
- Identifies monorepo opportunities (React, Next.js shared across 7 projects)

### ✅ **Test Coverage**

- 5/12 projects have tests
- 7/12 projects need test implementation
- Visual indicators for testing status

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Windows OS (currently optimized for Windows)

### Installation

```powershell
cd Z:\GFD\portfolio-manager
npm install
```

### Run Application

```powershell
npm start
```

### Development Mode (with DevTools)

```powershell
npm run dev
```

---

## 🏗️ Architecture

### File Structure

```
portfolio-manager/
├── src/
│   ├── main.js          # Electron main process (IPC handlers)
│   ├── index.html       # UI layout & dashboard
│   ├── renderer.js      # Frontend logic & Chart.js
│   └── styles.css       # Dark theme design system (embedded)
├── package.json         # Dependencies & build config
└── PORTFOLIO_ANALYSIS.json  # Data source (598,819 lines)
```

### Technology Stack

- **Electron 28.1.0**: Desktop app framework with Chromium engine
- **Chart.js 4.4.1**: Interactive data visualizations
- **SQLite3 5.1.7**: Planned for metadata storage
- **IPC Architecture**: Main process ↔ Renderer communication

### Design System

Inherits from Good Flippin Design:

- **Colors**: `#0d0d0d` background, `#8b5cf6` accent purple, `#10b981` success green
- **Typography**: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto
- **Components**: Cards, grids, badges, charts - all WCAG 2.1 AA compliant

---

## 📊 Current Portfolio Stats

| Metric              | Value       |
| ------------------- | ----------- |
| **Total Projects**  | 12          |
| **Total Files**     | 284,450     |
| **Total Size**      | 41.6 GB     |
| **Lines of Code**   | 34,600,000+ |
| **Duplicate Files** | 25,801      |
| **Duplicate Waste** | 1.06 GB     |
| **Technologies**    | 29 unique   |

### Top 3 Projects by Size

1. **ThyOwn** - 15.3 GB (114,544 files) - Self-sufficient AI framework
2. **SummitView** - 14.9 GB (5,624 files) - Ethical documentary AI pipeline
3. **Weave** - 8.6 GB (2,769 files) - Digital archive & knowledge system

---

## 🎨 Screenshots

### Dashboard Overview

![Dashboard](screenshots/dashboard.png)
_Real-time portfolio statistics and storage visualization_

### Project Grid

![Projects](screenshots/projects.png)
_All 12 projects with metrics and technology tags_

### Storage Analysis

![Storage](screenshots/storage.png)
_Detailed breakdown with Chart.js pie chart_

---

## 🔧 IPC Handlers

### `load-portfolio-data`

Loads PORTFOLIO_ANALYSIS.json (598,819 lines) into memory

**Returns:**

```javascript
{
  summary: { totalProjects, totalFiles, totalSize, totalLines },
  projects: { [name]: { totalFiles, totalSize, technologies, hasTests } },
  duplicates: [{ hash, name, size, count }]
}
```

### `open-project`

Opens project folder in File Explorer

**Parameters:**

- `projectName` - Name of project to open

### `get-project-readme`

Retrieves README content for project (planned)

**Parameters:**

- `projectName` - Name of project

---

## 🚀 Roadmap

### Phase 1: Core Functionality ✅

- [x] Dashboard overview with stats
- [x] Project grid with metrics
- [x] Storage analysis table
- [x] Duplicate detection display
- [x] Technology stack breakdown
- [x] Test coverage tracking

### Phase 2: Interactive Features 🔄

- [ ] Duplicate cleanup with preview
- [ ] Project README viewer in-app
- [ ] Launch projects in VS Code
- [ ] Search/filter projects
- [ ] Export reports (PDF, CSV)

### Phase 3: Advanced Analytics

- [ ] Code quality metrics
- [ ] Dependency graph visualization
- [ ] Git history analysis
- [ ] Build time tracking
- [ ] Custom metric dashboards

### Phase 4: Automation

- [ ] Auto-cleanup node_modules
- [ ] Bulk test runner
- [ ] Deployment pipeline tracker
- [ ] Storage optimization scheduler

---

## 💡 Development Notes

### Why This Exists

This tool solves a real problem: managing 34.6 million lines of code across 12 interconnected projects. It's also a **meta-showcase** - the tool itself demonstrates:

- **Systems Thinking**: Understanding how projects interconnect (ThyOwn → SummitView → Weave)
- **Desktop Development**: Full Electron stack with IPC architecture
- **Data Visualization**: Chart.js integration for meaningful insights
- **UX Design**: Dark theme, responsive grid, intuitive navigation
- **Performance**: Handles 598K line JSON file smoothly

### Design Decisions

1. **Dark Theme**: Matches GFD brand identity, reduces eye strain
2. **Grid Layout**: Optimizes for 1400x900 window size
3. **Chart.js Over D3**: Simpler API for this use case
4. **Embedded Styles**: Single-file philosophy for CSS (like GFD main site)
5. **IPC Pattern**: Separates data processing (main) from UI (renderer)

### Known Issues

- [ ] Chart.js legend overlaps on small screens
- [ ] No error handling for missing PORTFOLIO_ANALYSIS.json
- [ ] Duplicate cleanup is placeholder (alert only)
- [ ] No SQLite integration yet

---

## 🤝 Contributing

This is a personal tool, but the architecture can be adapted for similar use cases:

1. **Fork the approach**: Electron + Chart.js pattern works for any portfolio
2. **Adapt analyze-portfolio.js**: Modify for your project structure
3. **Customize UI**: Change color scheme, add your brand
4. **Extend features**: Add features specific to your workflow

---

## 📝 License

MIT License - Brett Weaver / Good Flippin Design

---

## 🎯 Related Projects

This tool manages the entire Good Flippin Design ecosystem:

- **Main Site**: [goodflippindesign.com](https://goodflippindesign.com) - 97.2% test coverage, WCAG 2.1 AA
- **AI Aimate**: Live AI education platform with RAG search
- **CultureSherpa**: 470+ cultures mapped with MapboxGL
- **ThyOwn**: Self-sufficient AI framework with local inference
- **SummitView**: Documentary production at $1.39/episode (99.8% cost reduction)
- **Weave**: Digital archive with 45K words analysis

---

**Built with ❤️ by Brett Weaver & GitHub Copilot**
_December 2025_
