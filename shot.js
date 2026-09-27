/* GLBN — shot.js: служебный скрипт для скриншотов интерфейса.
 * Запуск: npx electron shot.js --out=shot-home.png
 */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
}

const OUT = arg('out', 'shot.png');
const SEED = process.argv.includes('--seed');

app.whenReady().then(async () => {
  const storeFile = path.join(app.getPath('userData'), 'glbn-store.json');
  let seeded = false;
  if (SEED && !fs.existsSync(storeFile)) {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({
      profiles: [
        { id: 'demo1', name: 'Германия · Frankfurt', protocol: 'vless', address: 'de1.example.com', port: 443, uuid: 'b831381d-6324-4d53-ad4f-8cda48b30811', params: { type: 'ws', security: 'tls', path: '/ws', sni: 'de1.example.com' }, raw: '', addedAt: Date.now() },
        { id: 'demo2', name: 'Нидерланды · Amsterdam', protocol: 'trojan', address: 'nl1.example.com', port: 443, password: 'x', params: { type: 'tcp', security: 'tls', sni: 'nl1.example.com' }, raw: '', addedAt: Date.now() },
        { id: 'demo3', name: 'Япония · Tokyo', protocol: 'shadowsocks', address: 'jp1.example.com', port: 8388, method: 'aes-256-gcm', password: 'y', params: {}, raw: '', addedAt: Date.now() }
      ],
      settings: { theme: arg('theme', 'midnight'), accent: arg('accent', '#7c5cff'), animations: true, xrayPath: '', startMinimized: false, systemProxy: true },
      lastProfileId: 'demo1'
    }, null, 2), 'utf8');
    seeded = true;
  }

  const win = new BrowserWindow({
    width: 420, height: 720, frame: false, show: true,
    backgroundColor: '#0b0e17',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  ipcMain.handle('store:get', () => { try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch (e) { return null; } });
  ipcMain.handle('store:set', () => true);
  ipcMain.handle('net:ping', () => ({ ok: false, ms: null }));
  ipcMain.handle('sysproxy:on', () => ({ ok: true }));
  ipcMain.handle('sysproxy:off', () => ({ ok: true }));
  ipcMain.handle('config:write', () => null);
  ipcMain.handle('xray:start', () => ({ ok: false, error: 'shot' }));
  ipcMain.handle('xray:stop', () => true);
  await win.loadFile('index.html');
  await new Promise((r) => setTimeout(r, 2200));

  const view = arg('view', 'home');
  if (view !== 'home') {
    await win.webContents.executeJavaScript(
      "document.querySelector('.nav-btn[data-view=\"" + view + "\"]').click(); true;"
    );
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (process.argv.includes('--connect')) {
    await win.webContents.executeJavaScript("document.getElementById('power').click(); true;");
    await new Promise((r) => setTimeout(r, 2800));
  }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.resolve(OUT), img.toPNG());
  console.log('saved ' + path.resolve(OUT));
  if (seeded) { try { fs.rmSync(storeFile, { force: true }); } catch (e) { /* noop */ } }
  app.exit(0);
});
