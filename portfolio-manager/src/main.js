const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        backgroundColor: '#0d0d0d',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        title: 'Portfolio Manager - Good Flippin Design',
        icon: path.join(__dirname, '../assets/icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handlers for file operations
ipcMain.handle('load-portfolio-data', async () => {
    // Use absolute path to portfolio data
    const dataPath = 'Z:\\GFD\\PORTFOLIO_ANALYSIS.json';
    console.log('Attempting to load data from:', dataPath);

    try {
        if (!fs.existsSync(dataPath)) {
            console.error('File not found:', dataPath);
            throw new Error(`Portfolio data file not found at ${dataPath}`);
        }
        const data = fs.readFileSync(dataPath, 'utf-8');
        console.log('Successfully loaded portfolio data, size:', data.length, 'bytes');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading portfolio data:', error);
        throw error;
    }
});

ipcMain.handle('open-project', async (event, projectName) => {
    const { shell } = require('electron');
    const projectPath = `Z:\\GFD\\GFD Dev Projects\\${projectName}`;
    console.log('Opening project:', projectPath);

    try {
        if (fs.existsSync(projectPath)) {
            await shell.openPath(projectPath);
        } else {
            console.error('Project path not found:', projectPath);
        }
    } catch (error) {
        console.error('Error opening project:', error);
    }
});

ipcMain.handle('get-project-readme', async (event, projectPath) => {
    const readmePath = path.join(projectPath, 'README.md');
    try {
        if (fs.existsSync(readmePath)) {
            return fs.readFileSync(readmePath, 'utf-8');
        }
        return null;
    } catch (error) {
        return null;
    }
});
