/**
 * Preload Script
 * Exposes safe APIs to renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // MCP status
  getMCPStatus: () => ipcRenderer.invoke('mcp:status'),
  
  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  
  // Platform info
  getPlatform: () => process.platform,
  
  // Mode switching
  startLocalServer: () => ipcRenderer.invoke('mode:start-local-server'),
  stopLocalServer: () => ipcRenderer.invoke('mode:stop-local-server'),
  getServerStatus: () => ipcRenderer.invoke('mode:get-status'),
  saveModePreference: (mode) => ipcRenderer.invoke('mode:save-preference', mode),
  getModePreference: () => ipcRenderer.invoke('mode:get-preference'),
  
  // Figma API Key management
  saveApiKey: (apiKey) => ipcRenderer.invoke('apikey:save', apiKey),
  getApiKey: () => ipcRenderer.invoke('apikey:get'),
  deleteApiKey: () => ipcRenderer.invoke('apikey:delete'),
  hasApiKey: () => ipcRenderer.invoke('apikey:has')
});
