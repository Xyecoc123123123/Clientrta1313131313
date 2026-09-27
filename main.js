/* GLBN — main.js: окно, хранилище, запуск xray, пинг */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const SMOKE = process.argv.includes('--smoke-test');

let win = null;
let xrayProc = null;

const DEFAULTS = {
  profiles: [],
  settings: { theme: 'midnight', accent: '#7c5cff', animations: true, xrayPath: '', startMinimized: false, systemProxy: true },
  lastProfileId: null
};

function storePath() { return path.join(app.getPath('userData'), 'glbn-store.json'); }
function configPath() { return path.join(app.getPath('userData'), 'xray-config.json'); }

function readStore() {
  try {
    const data = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    return {
      ...structuredClone(DEFAULTS),
      ...data,
      settings: { ...DEFAULTS.settings, ...(data.settings || {}) }
    };
  } catch (e) {
    return structuredClone(DEFAULTS);
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf8');
}

function psRun(script) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 8000 }, (err, stdout, stderr) => {
        resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || ''), error: err ? err.message : '' });
      });
  });
}

const PS_HEAD = "$key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; " +
  "Add-Type -Namespace Win -Name Inet -MemberDefinition '[DllImport(\"wininet.dll\", SetLastError=true)] public static extern bool InternetSetOption(System.IntPtr h, int o, System.IntPtr b, int l);'; ";
const PS_REFRESH = "[Win.Inet]::InternetSetOption([System.IntPtr]::Zero, 39, [System.IntPtr]::Zero, 0) | Out-Null; " +
  "[Win.Inet]::InternetSetOption([System.IntPtr]::Zero, 37, [System.IntPtr]::Zero, 0) | Out-Null;";

function psSetProxy(server) {
  return psRun(PS_HEAD + "Set-ItemProperty -Path $key -Name ProxyEnable -Value 1; " +
    "Set-ItemProperty -Path $key -Name ProxyServer -Value '" + String(server).replace(/'/g, '') + "'; " + PS_REFRESH);
}

function psUnsetProxy() {
  return psRun(PS_HEAD + "Set-ItemProperty -Path $key -Name ProxyEnable -Value 0; " + PS_REFRESH);
}

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 360,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0b0e17',
    title: 'GLBN',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}

ipcMain.handle('store:get', () => readStore());
ipcMain.handle('store:set', (_e, data) => {
  if (data && typeof data === 'object') writeStore(data);
  return true;
});

ipcMain.handle('win:minimize', () => { if (win) win.minimize(); });
ipcMain.handle('win:close', () => { if (win) win.close(); });

ipcMain.handle('config:write', (_e, cfg) => {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
  return configPath();
});

ipcMain.handle('xray:start', (_e, xrayPath, cfgPath) => new Promise((resolve) => {
  if (xrayProc) return resolve({ ok: true, pid: xrayProc.pid, reused: true });
  let settled = false;
  try {
    xrayProc = spawn(xrayPath, ['run', '-c', cfgPath], { windowsHide: true });
  } catch (err) {
    xrayProc = null;
    return resolve({ ok: false, error: String((err && err.message) || err) });
  }
  const fail = (error) => {
    if (settled) return;
    settled = true;
    try { xrayProc.kill(); } catch (e) { /* noop */ }
    xrayProc = null;
    resolve({ ok: false, error });
  };
  const ok = () => {
    if (settled) return;
    settled = true;
    resolve({ ok: true, pid: xrayProc.pid });
  };
  xrayProc.once('spawn', ok);
  xrayProc.once('error', (err) => fail('Не удалось запустить xray.exe: ' + err.message));
  let errTail = '';
  xrayProc.stderr.on('data', (d) => {
    errTail = (errTail + d.toString()).slice(-4000);
  });
  xrayProc.once('exit', (code) => {
    const exited = xrayProc;
    xrayProc = null;
    if (!settled) {
      fail('xray завершился с кодом ' + code + (errTail ? ': ' + errTail.slice(-400) : ''));
    } else if (win && !win.isDestroyed()) {
      win.webContents.send('xray:exited', code, exited ? exited.pid : null);
    }
  });
  setTimeout(() => fail('xray не ответил за 5 с' + (errTail ? ': ' + errTail.slice(-300) : '')), 5000);
}));

ipcMain.handle('xray:stop', () => {
  if (xrayProc) {
    try { xrayProc.kill(); } catch (e) { /* noop */ }
    xrayProc = null;
  }
  return true;
});

ipcMain.handle('net:ping', (_e, host) => new Promise((resolve) => {
  const h = String(host || '').trim();
  if (!h || /[\r\n"&|<>]/.test(h)) return resolve({ ok: false, ms: null });
  execFile('ping', ['-n', '1', '-w', '2500', h], { windowsHide: true, timeout: 4500 }, (err, stdout) => {
    const out = String(stdout || '');
    const m = /(?:время|time)[=<]\s*(\d+)\s*мс/i.exec(out)
      || /(?:время|time)[=<]\s*(\d+)\s*ms/i.exec(out)
      || /[=<]\s*(\d+)\s*мс/i.exec(out)
      || /[=<]\s*(\d+)\s*ms/i.exec(out);
    if (m) return resolve({ ok: true, ms: +m[1] });
    resolve({ ok: false, ms: null });
  });
}));

ipcMain.handle('sysproxy:on', (_e, server) => psSetProxy(server || 'socks=127.0.0.1:10808'));
ipcMain.handle('sysproxy:off', () => psUnsetProxy());

app.whenReady().then(() => {
  createWindow();
  if (SMOKE) setTimeout(() => app.exit(0), 700);
});

app.on('before-quit', () => {
  if (xrayProc) { try { xrayProc.kill(); } catch (e) { /* noop */ } xrayProc = null; }
});

app.on('window-all-closed', () => {
  psUnsetProxy().finally(() => app.quit());
});
