'use strict';

/**
 * NEXUS-DESKTOP — shell desktop.
 *
 * Abre a interface no Chromium embutido (Electron), em janela normal,
 * detectando a resolução da tela e ocupando a área útil. Servida por um
 * servidor local em 127.0.0.1. F11 alterna tela cheia.
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

/* Tela onde a janela está; na abertura, a tela do cursor. */
function targetDisplay(win) {
  if (win && !win.isDestroyed()) return screen.getDisplayMatching(win.getBounds());
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

/* Ocupa a área útil da tela detectada (resolução/DPI atuais). */
function fitToDisplay(win) {
  if (!win || win.isDestroyed() || win.isFullScreen()) return;
  win.setBounds(targetDisplay(win).workArea);
}

function createWindow(port) {
  /* Detecta a resolução da tela e ocupa a área útil, sem tamanho fixo. */
  const { workArea } = targetDisplay(null);
  mainWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
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
    fitToDisplay(mainWindow);
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

  /* Resolução/DPI/monitores mudaram: reajusta à área útil detectada. */
  const refit = () => fitToDisplay(mainWindow);
  screen.on('display-metrics-changed', refit);
  screen.on('display-added', refit);
  screen.on('display-removed', refit);

  mainWindow.on('closed', () => {
    screen.removeListener('display-metrics-changed', refit);
    screen.removeListener('display-added', refit);
    screen.removeListener('display-removed', refit);
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
