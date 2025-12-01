// main.js - VERSION COMPLÈTE ET CORRIGÉE
const { app, BrowserWindow, ipcMain, screen, dialog, Tray, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow;
let overlayWindow;
let tray = null;
const configPath = path.join(app.getPath('userData'), 'crosshairs.json');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#1a1a2e',
    minWidth: 900,
    minHeight: 600
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createTray();
}

function createTray() {
  if (tray) return;
  
  tray = new Tray(path.join(__dirname, 'logo.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: 'Quitter',
      click: () => {
        app.isQuitting = true;
        if (overlayWindow) {
          overlayWindow.close();
        }
        if (mainWindow) {
          mainWindow.close();
        }
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    } else if (mainWindow) {
      mainWindow.show();
    } else {
      createMainWindow();
    }
  });
}

function createOverlayWindow(crosshair) {
  if (overlayWindow) {
    overlayWindow.close();
  }

  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: width,
    height: height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    focusable: false,
    fullscreen: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setFullScreenable(false);
  
  overlayWindow.loadFile('overlay.html');

  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send('load-crosshair', crosshair);
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();
  
  // Configurer l'auto-updater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
  // Vérifier les mises à jour après 3 secondes
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

// ========== IPC HANDLERS ==========

// Sauvegarder les crosshairs
ipcMain.handle('save-crosshairs', (event, crosshairs) => {
  console.log('[main] save-crosshairs called, saving to', configPath, 'count=', crosshairs && crosshairs.length);
  try {
    fs.writeFileSync(configPath, JSON.stringify(crosshairs, null, 2));
    console.log('[main] save-crosshairs ok');
    return { success: true };
  } catch (error) {
    console.error('[main] save-crosshairs error', error);
    return { success: false, error: error.message };
  }
});

// Charger les crosshairs
ipcMain.handle('load-crosshairs', () => {
  console.log('[main] load-crosshairs called, path=', configPath);
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      console.log('[main] load-crosshairs read file, length=', data.length);
      return JSON.parse(data);
    }
    console.log('[main] load-crosshairs no file, returning []');
    return [];
  } catch (error) {
    console.error('[main] load-crosshairs error', error);
    return [];
  }
});

// Afficher l'overlay
ipcMain.handle('show-overlay', (event, crosshair) => {
  console.log('[main] show-overlay called, crosshair id=', crosshair && crosshair.id);
  try {
    createOverlayWindow(crosshair);
    console.log('[main] createOverlayWindow called');
    return { success: true };
  } catch (error) {
    console.error('[main] show-overlay error', error);
    return { success: false, error: error.message };
  }
});

// Cacher l'overlay
ipcMain.handle('hide-overlay', () => {
  try {
    if (overlayWindow) {
      overlayWindow.close();
      overlayWindow = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Exporter en JSON
ipcMain.handle('export-crosshair', (event, crosshair) => {
  try {
    return { success: true, data: JSON.stringify(crosshair, null, 2) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Sélectionner une image
ipcMain.handle('select-image', async (event) => {
  console.log('[main] select-image called');
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }
      ],
      title: 'Choisir une image'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const imagePath = result.filePaths[0];
      const imageData = fs.readFileSync(imagePath);
      const base64 = imageData.toString('base64');
      const ext = path.extname(imagePath).slice(1).toLowerCase();
      
      let mimeType = 'image/png';
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'bmp') mimeType = 'image/bmp';
      else if (ext === 'webp') mimeType = 'image/webp';
      
      return { success: true, data: `data:${mimeType};base64,${base64}` };
    }
    
    return { success: false };
  } catch (error) {
    console.error('[main] select-image error', error);
    return { success: false, error: error.message };
  }
});

// Sauvegarder une image
ipcMain.handle('save-image', async (event, dataUrl) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'crosshair.png',
      filters: [
        { name: 'PNG Image', extensions: ['png'] }
      ],
      title: 'Exporter en PNG'
    });
    
    if (!result.canceled && result.filePath) {
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(result.filePath, base64Data, 'base64');
      return { success: true };
    }
    
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Contrôles de fenêtre
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// ========== AUTO-UPDATER ==========

// Envoyer le statut de mise à jour au renderer
function sendUpdateStatus(status, data = {}) {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus('available', { version: info.version });
});

autoUpdater.on('update-not-available', () => {
  sendUpdateStatus('not-available');
});

autoUpdater.on('download-progress', (progress) => {
  sendUpdateStatus('downloading', { percent: Math.round(progress.percent) });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus('downloaded', { version: info.version });
  
  // Demander à l'utilisateur s'il veut redémarrer
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Mise à jour prête',
    message: `La version ${info.version} a été téléchargée. Redémarrer maintenant pour installer ?`,
    buttons: ['Redémarrer', 'Plus tard']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus('error', { message: err.message });
});

// IPC pour vérifier manuellement les mises à jour
ipcMain.handle('check-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Obtenir la version actuelle
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

// Installer la mise à jour maintenant
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});