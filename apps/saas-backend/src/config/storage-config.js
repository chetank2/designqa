import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';

let storageProviderInstance = null;

export function getStorageProvider(userId = null) {
  if (!storageProviderInstance) {
    storageProviderInstance = new LocalStorageProvider();
  }
  return storageProviderInstance;
}

export function getStorageMode() {
  return 'local';
}

export function resetStorageProvider() {
  storageProviderInstance = null;
}

export default {
  getStorageProvider,
  getStorageMode,
  resetStorageProvider
};
