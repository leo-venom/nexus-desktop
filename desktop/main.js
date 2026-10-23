'use strict';

/**
 * NEXUS GAME — shell desktop.
 *
 * Abre a interface no Chromium embutido (Electron), em janela normal,
 * detectando a resolução da tela e ocupando a área útil. Servida por um
 * servidor local em 127.0.0.1. F11 alterna tela cheia.
 */

const path = require('path');
const { app, BrowserWindow, Menu } = require('electron');
const { startServer, stopServer } = require('./server');

/* Wayland nativo quando disponível; XWayland como fallback. */
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
/* WM_CLASS estável para o .desktop (StartupWMClass). */
app.commandLine.appendSwitch('class', 'NexusGame');
/* Desempenho máximo: GPU ligada (nunca --disable-gpu), rasterização na GPU,
   sem throttling de renderer/background quando a janela perde foco. */
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let mainWindow = null;
let localServer = null;
let shuttingDown = false;

function createWindow(port) {
  /* Sem bounds fixos: no Wayland o compositor ignora setBounds. Criar a janela
     sem tamanho e chamar maximize() deixa o compositor decidir a área útil. */
  mainWindow = new BrowserWindow({
    show: false,
    backgroundColor: '#0e0f13',
    title: 'NEXUS GAME',
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
    mainWindow.maximize();
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
      console.log('NEXUS GAME: http://127.0.0.1:' + localServer.port + '/');
      createWindow(localServer.port);
    } catch (err) {
      console.error('Falha ao iniciar o servidor local:', err);
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    const active = localServer;
    localServer = null;
    if (active && active.server) await stopServer(active.server);
  }

  app.on('before-quit', (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shutdown().then(() => app.quit()).catch(() => app.quit());
  });

  /* Fechar pelo terminal/gerenciador de processos também precisa liberar a
     porta; sem listener o processo recebe o sinal e pode pular o teardown. */
  process.once('SIGINT', () => app.quit());
  process.once('SIGTERM', () => app.quit());
}
