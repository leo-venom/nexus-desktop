'use strict';

/**
 * NEXUS-DESKTOP — shell desktop.
 *
 * Abre a interface no Chromium embutido (Electron), em janela normal,
 * servida por um servidor local em 127.0.0.1. F11 alterna tela cheia.
 */

const path = require('path');
const { app, BrowserWindow, Menu, screen } = require('electron');
const { startServer } = require('./server');

/* Wayland nativo quando disponível; XWayland como fallback. */
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
/* WM_CLASS estável para o .desktop (StartupWMClass). */
app.commandLine.appendSwitch('class', 'NexusDesktop');

let mainWindow = null;
let localServer = null;

function createWindow(port) {
  /* Janela normal, dimensionada para caber na área útil da tela. */
  const wa = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1600, Math.round(wa.width * 0.9)),
    height: Math.min(900, Math.round(wa.height * 0.9)),
    center: true,
    show: false,
    backgroundColor: '#0e0f13',
    title: 'NEXUS-DESKTOP',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  /* Links abertos por páginas geradas (window.open) ficam dentro do app. */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1200,
          height: 800,
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === 'F12') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL('http://127.0.0.1:' + port + '/');
}

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      localServer = await startServer(8790);
      console.log('NEXUS-DESKTOP: http://127.0.0.1:' + localServer.port + '/');
      createWindow(localServer.port);
    } catch (err) {
      console.error('Falha ao iniciar o servidor local:', err);
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    if (localServer && localServer.server) {
      localServer.server.close();
      localServer = null;
    }
  });
}
