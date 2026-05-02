const { app, BrowserWindow, Menu } = require('electron');
const { exec } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const DASHBOARD_URL = 'http://localhost:3777';
const PM2_PATH = process.env.PM2_PATH || 'pm2';
const ECOSYSTEM_PATH = path.join(HOME, '.agents/services/ecosystem.config.js');

let mainWindow = null;

function checkDashboardReady(retries = 30) {
  return new Promise((resolve, reject) => {
    function attempt() {
      http.get(DASHBOARD_URL + '/api/health', (res) => resolve(true)).on('error', () => {
        if (retries > 0) { retries--; setTimeout(attempt, 1000); }
        else reject(new Error('Dashboard not responding'));
      });
    }
    attempt();
  });
}

function ensureServicesRunning() {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' };
    exec(`${PM2_PATH} resurrect`, { env }, () => {
      exec(`${PM2_PATH} jlist`, { env }, (err, stdout) => {
        let running = 0;
        try { running = JSON.parse(stdout).length; } catch (e) {}
        if (running === 0) {
          exec(`cd ${path.join(HOME, '.agents/services')} && ${PM2_PATH} start ${ECOSYSTEM_PATH}`, { env }, () => {
            exec(`${PM2_PATH} save`, { env }, () => resolve());
          });
        } else {
          try {
            const list = JSON.parse(stdout);
            const scheduler = list.find(p => p.name === 'scheduler');
            if (!scheduler || scheduler.pm2_env.status !== 'online') {
              exec(`cd ${path.join(HOME, '.agents/services')} && ${PM2_PATH} start ${ECOSYSTEM_PATH}`, { env }, () => resolve());
            } else { resolve(); }
          } catch (e) { resolve(); }
        }
      });
    });
  });
}

async function createWindow() {
  await ensureServicesRunning();
  try { await checkDashboardReady(30); } catch (e) {
    exec(`${PM2_PATH} restart scheduler`, { env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' } });
    try { await checkDashboardReady(15); } catch (e2) {}
  }

  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600,
    title: 'AI Services Dashboard',
    backgroundColor: '#0f0f23',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadURL(DASHBOARD_URL);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [
      { role: 'reload', label: '刷新' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'quit', label: '退出' }
    ]},
    { label: '编辑', submenu: [
      { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
    ]}
  ]));

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform === 'darwin') app.dock.hide(); });
app.on('activate', () => { if (mainWindow === null) { app.dock.show(); createWindow(); } });
