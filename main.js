const { app, BrowserWindow, ipcMain, screen, dialog, Tray, Menu, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const {
  normalizeCrosshair,
  normalizeState,
  readState,
  writeState
} = require('./storage');

let mainWindow;
let overlayWindow;
let tray = null;
let configPath;
let persistedState = normalizeState({ crosshairs: [] });

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function getConfigPath() {
  if (!configPath) configPath = path.join(app.getPath('userData'), 'crosshairs.json');
  return configPath;
}

function loadPersistedState() {
  const result = readState(getConfigPath());
  persistedState = result.state;
  if (result.error) {
    console.error('[main] Impossible de lire la sauvegarde, état réinitialisé:', result.error.message);
  } else if (result.recovered) {
    console.warn('[main] Sauvegarde principale corrompue, copie .bak restaurée en mémoire.');
  }
  return persistedState;
}

function savePersistedState(value) {
  persistedState = writeState(getConfigPath(), normalizeState(value));
  return persistedState;
}

function findCrosshair(id) {
  return persistedState.crosshairs.find((crosshair) => String(crosshair.id) === String(id));
}

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
  const left = Math.min(...displays.map((display) => display.bounds.x));
  const top = Math.min(...displays.map((display) => display.bounds.y));
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));
  const width = right - left;
  const height = bottom - top;

  const windowInstance = new BrowserWindow({
    x: left,
    y: top,
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
  overlayWindow = windowInstance;

  windowInstance.setIgnoreMouseEvents(true, { forward: true });
  // Le niveau screen-saver est le plus haut niveau disponible pour un overlay Electron.
  // Il fonctionne avec les jeux en plein écran fenêtré/borderless.
  windowInstance.setAlwaysOnTop(true, 'screen-saver');
  windowInstance.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  windowInstance.setFullScreenable(false);
  
  windowInstance.loadFile('overlay.html');

  windowInstance.webContents.on('did-finish-load', () => {
    if (!windowInstance.isDestroyed()) {
      windowInstance.showInactive();
      windowInstance.webContents.send('load-crosshair', crosshair);
    }
  });

  windowInstance.on('closed', () => {
    if (overlayWindow === windowInstance) {
      overlayWindow = null;
      isOverlayVisible = false;
      sendOverlayStatus(false);
    }
  });
}

function sendOverlayStatus(active) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-toggled', active);
  }
}

function closeOverlayWindow() {
  isOverlayVisible = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
  overlayWindow = null;
  sendOverlayStatus(false);
}

// Variable pour stocker le dernier crosshair utilisé
let lastUsedCrosshair = null;
let isOverlayVisible = false;
let f2Registered = false;
let f2FallbackRegistered = false;

function toggleOverlay() {
  if (isOverlayVisible) {
    closeOverlayWindow();
    return { success: true, active: false };
  }
  if (!lastUsedCrosshair) {
    sendOverlayStatus(false);
    return { success: false, active: false, error: 'Aucun crosshair sélectionné' };
  }
  createOverlayWindow(lastUsedCrosshair);
  isOverlayVisible = true;
  sendOverlayStatus(true);
  return { success: true, active: true };
}

app.whenReady().then(() => {
  loadPersistedState();
  lastUsedCrosshair = findCrosshair(persistedState.selectedId) || findCrosshair(persistedState.lastUsedId) || null;
  createMainWindow();
  
  // Raccourci global F2 pour toggle le crosshair.
  f2Registered = globalShortcut.register('F2', toggleOverlay);
  if (!f2Registered) {
    f2FallbackRegistered = globalShortcut.register('CommandOrControl+Shift+F2', toggleOverlay);
    console.warn('[main] F2 est déjà utilisé. Raccourci global de secours:', f2FallbackRegistered ? 'Ctrl+Shift+F2' : 'indisponible');
  }
  
  // Configurer l'auto-updater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
  // Vérifier les mises à jour après 3 secondes
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
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
  try {
    savePersistedState({ ...persistedState, crosshairs });
    return { success: true };
  } catch (error) {
    console.error('[main] save-crosshairs error', error);
    return { success: false, error: error.message };
  }
});

// Sauvegarder l'état complet (crosshairs + sélection + dernier overlay utilisé)
ipcMain.handle('save-app-state', (event, state) => {
  try {
    savePersistedState(state);
    lastUsedCrosshair = findCrosshair(persistedState.lastUsedId) || lastUsedCrosshair;
    return { success: true };
  } catch (error) {
    console.error('[main] save-app-state error', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('save-app-state-sync', (event, state) => {
  try {
    savePersistedState(state);
  } catch (error) {
    console.error('[main] save-app-state-sync error', error);
  }
});

// Charger les crosshairs
ipcMain.handle('load-crosshairs', () => {
  return persistedState.crosshairs;
});

ipcMain.handle('load-app-state', () => {
  return persistedState;
});

// Afficher l'overlay
ipcMain.handle('show-overlay', (event, crosshair) => {
  try {
    lastUsedCrosshair = normalizeCrosshair(crosshair);
    persistedState.lastUsedId = lastUsedCrosshair.id;
    savePersistedState(persistedState);
    createOverlayWindow(lastUsedCrosshair);
    isOverlayVisible = true;
    sendOverlayStatus(true);
    return { success: true };
  } catch (error) {
    console.error('[main] show-overlay error', error);
    return { success: false, error: error.message };
  }
});

// Cacher l'overlay
ipcMain.handle('hide-overlay', () => {
  try {
    closeOverlayWindow();
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

ipcMain.handle('toggle-overlay', () => toggleOverlay());

ipcMain.handle('global-shortcut-status', () => ({ f2: f2Registered, fallback: f2FallbackRegistered }));
