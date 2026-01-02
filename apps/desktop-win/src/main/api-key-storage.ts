import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

const getKeyPath = (): string => join(app.getPath('userData'), 'figma-api-key.json');

export function saveFigmaApiKey(apiKey: string): void {
  const keyPath = getKeyPath();
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(
    keyPath,
    JSON.stringify({ apiKey, updatedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  );
}

export function getFigmaApiKey(): string | null {
  const keyPath = getKeyPath();
  if (!existsSync(keyPath)) return null;
  try {
    const payload = JSON.parse(readFileSync(keyPath, 'utf-8'));
    return typeof payload.apiKey === 'string' ? payload.apiKey : null;
  } catch {
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
