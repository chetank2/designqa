interface ElectronAPI {
  openExternal: (url: string) => void;
  startLocalServer: () => Promise<{ success: boolean; port?: number; error?: string; alreadyRunning?: boolean }>;
  stopLocalServer: () => Promise<{ success: boolean; error?: string; alreadyStopped?: boolean }>;
  getServerStatus: () => Promise<{ running: boolean; port: number | null }>;
  getModePreference: () => Promise<{ mode: 'cloud' | 'local' }>;
  saveModePreference: (mode: 'cloud' | 'local') => Promise<{ success: boolean }>;
  // Add other methods as needed
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};