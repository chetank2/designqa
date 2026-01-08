import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

const getKeyPath = (): string => join(app.getPath('userData'), 'figma-api-key.enc');

export function saveFigmaApiKey(apiKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system. Cannot securely store API key.');
  }

  const keyPath = getKeyPath();
  mkdirSync(dirname(keyPath), { recursive: true });

  // Encrypt the API key using Electron's safeStorage
  const encryptedKey = safeStorage.encryptString(apiKey);
  const data = {
    encryptedApiKey: encryptedKey.toString('base64'),
    updatedAt: new Date().toISOString()
  };

  writeFileSync(keyPath, JSON.stringify(data, null, 2), 'utf-8');
}

export function getFigmaApiKey(): string | null {
  const keyPath = getKeyPath();
  if (!existsSync(keyPath)) return null;

  if (!safeStorage.isEncryptionAvailable()) {
    console.error('Encryption is not available on this system. Cannot decrypt stored API key.');
    return null;
  }

  try {
    const payload = JSON.parse(readFileSync(keyPath, 'utf-8'));

    if (!payload.encryptedApiKey) {
      console.error('No encrypted API key found in storage file.');
      return null;
    }

    // Decrypt the API key using Electron's safeStorage
    const encryptedBuffer = Buffer.from(payload.encryptedApiKey, 'base64');
    const decryptedApiKey = safeStorage.decryptString(encryptedBuffer);

    return typeof decryptedApiKey === 'string' ? decryptedApiKey : null;
  } catch (error) {
    console.error('Failed to decrypt API key:', error);
    return null;
  }
}

export function deleteFigmaApiKey(): void {
  const keyPath = getKeyPath();
  if (existsSync(keyPath)) {
    unlinkSync(keyPath);
  }
}

export function hasApiKey(): boolean {
  const keyPath = getKeyPath();
  if (!existsSync(keyPath)) return false;
  const apiKey = getFigmaApiKey();
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}
