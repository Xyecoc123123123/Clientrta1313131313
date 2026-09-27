/* GLBN — preload: безопасный мост между renderer и main */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('glbn', {
  storeGet: () => ipcRenderer.invoke('store:get'),
  storeSet: (data) => ipcRenderer.invoke('store:set', data),
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  writeConfig: (cfg) => ipcRenderer.invoke('config:write', cfg),
  xrayStart: (xrayPath, cfgPath) => ipcRenderer.invoke('xray:start', xrayPath, cfgPath),
  xrayStop: () => ipcRenderer.invoke('xray:stop'),
  ping: (host) => ipcRenderer.invoke('net:ping', host),
  sysProxyOn: (server) => ipcRenderer.invoke('sysproxy:on', server),
  sysProxyOff: () => ipcRenderer.invoke('sysproxy:off'),
  onXrayExit: (cb) => ipcRenderer.on('xray:exited', (_e, code) => cb(code))
});
