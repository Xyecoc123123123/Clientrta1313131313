/* GLBN — verify.js: функциональная проверка интерфейса в реальном Electron.
 * Запуск: npx electron verify.js
 */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const storeFile = () => path.join(app.getPath('userData'), 'glbn-store.json');

app.whenReady().then(async () => {
  const sf = storeFile();
  let seeded = false;
  if (!fs.existsSync(sf)) {
    fs.writeFileSync(sf, JSON.stringify({
      profiles: [
        { id: 'demo1', name: 'Германия · Frankfurt', protocol: 'vless', address: 'de1.example.com', port: 443, uuid: 'u1', params: { type: 'ws', security: 'tls' }, raw: '', addedAt: 1 },
        { id: 'demo2', name: 'Япония · Tokyo', protocol: 'vmess', address: 'jp1.example.com', port: 8443, uuid: 'u2', params: { type: 'ws', security: 'tls', aid: '0' }, raw: '', addedAt: 2 }
      ],
      settings: { theme: 'aurora', accent: '#22d3a5', animations: true, xrayPath: '', startMinimized: false, systemProxy: true },
      lastProfileId: 'demo2'
    }, null, 2), 'utf8');
    seeded = true;
  }

  ipcMain.handle('store:get', () => { try { return JSON.parse(fs.readFileSync(sf, 'utf8')); } catch (e) { return null; } });
  ipcMain.handle('store:set', () => true);
  ipcMain.handle('net:ping', () => ({ ok: false, ms: null }));
  ipcMain.handle('sysproxy:on', () => ({ ok: true }));
  ipcMain.handle('sysproxy:off', () => ({ ok: true }));
  ipcMain.handle('config:write', () => null);
  ipcMain.handle('xray:start', () => ({ ok: false, error: 'verify' }));
  ipcMain.handle('xray:stop', () => true);

  const win = new BrowserWindow({
    width: 420, height: 720, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  await win.loadFile('index.html');
  await new Promise((r) => setTimeout(r, 1800));

  const before = await win.webContents.executeJavaScript(`(function () {
    var srvs = [].slice.call(document.querySelectorAll('#server-list .srv'));
    return {
      serverCount: srvs.length,
      names: srvs.map(function (e) { return e.querySelector('.srv-name').textContent; }),
      protos: srvs.map(function (e) { return e.querySelector('.proto-tag').textContent; }),
      selectedCount: document.querySelectorAll('.srv.selected').length,
      currentName: document.getElementById('cur-name').textContent,
      currentFlag: document.getElementById('cur-flag').textContent,
      theme: document.documentElement.getAttribute('data-theme'),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      navTabs: [].slice.call(document.querySelectorAll('.nav-btn')).map(function (b) { return b.dataset.view; }),
      emptyHidden: document.getElementById('server-empty').hidden,
      bodyState: document.body.dataset.state,
      animOff: document.body.classList.contains('no-anim'),
      themeTiles: document.querySelectorAll('.theme-tile').length,
      accents: document.querySelectorAll('.acc').length
    };
  })()`);

  // сценарий 2: добавление через модалку
  await win.webContents.executeJavaScript(`(function(){ document.getElementById('btn-add').click(); return true; })()`);
  await new Promise((r) => setTimeout(r, 350));
  await win.webContents.executeJavaScript(`(function(){
    document.getElementById('inp-link').value = 'vless://11111111-2222-3333-4444-555555555555@nl1.example.com:443?type=ws&security=tls&sni=nl1.example.com#Добавленный%20Нидерланды';
    document.getElementById('modal-save').click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 700));
  const after = await win.webContents.executeJavaScript(`(function () {
    var srvs = [].slice.call(document.querySelectorAll('#server-list .srv'));
    return {
      serverCount: srvs.length,
      last: srvs.length ? srvs[srvs.length - 1].querySelector('.srv-name').textContent : null,
      selected: (document.querySelector('.srv.selected .srv-name') || {}).textContent || null,
      modalClosed: document.getElementById('modal-back').hidden,
      activeView: [].slice.call(document.querySelectorAll('.nav-btn')).filter(function(b){return b.classList.contains('active');}).map(function(b){return b.dataset.view;})[0]
    };
  })()`);

  // сценарий 3: переключение настроек
  await win.webContents.executeJavaScript(`(function(){
    document.querySelector('.theme-tile[data-theme="sunset"]').click();
    document.querySelector('.acc[data-accent="#ff7a59"]').click();
    document.getElementById('opt-anim').checked = false;
    document.getElementById('opt-anim').dispatchEvent(new Event('change'));
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  const afterSettings = await win.webContents.executeJavaScript(`(function () {
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      animOff: document.body.classList.contains('no-anim'),
      activeTile: (document.querySelector('.theme-tile.active') || {}).dataset ? document.querySelector('.theme-tile.active').dataset.theme : null
    };
  })()`);

  console.log('=== ЭТАП 1: чтение хранилища ===');
  console.log(JSON.stringify(before, null, 2));
  console.log('=== ЭТАП 2: добавление через модалку ===');
  console.log(JSON.stringify(after, null, 2));
  console.log('=== ЭТАП 3: настройки ===');
  console.log(JSON.stringify(afterSettings, null, 2));

  if (seeded) { try { fs.rmSync(sf, { force: true }); } catch (e) { /* noop */ } }
  app.exit(0);
});
