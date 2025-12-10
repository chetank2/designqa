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
  getPlatform: () => process.platform
});
