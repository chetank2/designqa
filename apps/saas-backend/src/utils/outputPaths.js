import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_DATA_DIR = path.join(os.homedir(), 'DesignQA', 'data');

function resolveCustomDir() {
  if (process.env.DESIGNQA_DATA_DIR) {
    return path.isAbsolute(process.env.DESIGNQA_DATA_DIR)
      ? process.env.DESIGNQA_DATA_DIR
      : path.resolve(process.env.DESIGNQA_DATA_DIR);
  }

  if (process.env.DESIGNQA_USER_DATA_DIR) {
    const resolved = path.isAbsolute(process.env.DESIGNQA_USER_DATA_DIR)
      ? process.env.DESIGNQA_USER_DATA_DIR
      : path.resolve(process.env.DESIGNQA_USER_DATA_DIR);
    return path.join(resolved, 'data');
  }

  return null;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveBaseDir() {
  const custom = resolveCustomDir();
  const target = custom || DEFAULT_DATA_DIR;
  ensureDir(target);
  return target;
}

function resolveSubDir(...segments) {
  const baseDir = resolveBaseDir();
  const dir = path.join(baseDir, ...segments);
  ensureDir(dir);
  return dir;
}

export function getOutputBaseDir() {
  return resolveBaseDir();
}

export function getSubDir(...segments) {
  return resolveSubDir(...segments);
}

export function getCredentialsDir() {
  return resolveSubDir('credentials');
}

export function getDesignSystemsDir() {
  return resolveSubDir('design-systems');
}

export function getReportsDir() {
  return resolveSubDir('reports');
}

export function getSessionsDir() {
  return resolveSubDir('sessions');
}

export function getScreenshotsDir() {
  return resolveSubDir('screenshots');
}

export function getImagesDir() {
  return resolveSubDir('images');
}

export function resolveOutputPath(...segments) {
  const baseDir = getOutputBaseDir();
  const target = path.join(baseDir, ...segments);
  ensureDir(path.dirname(target));
  return target;
}

export default {
  getOutputBaseDir,
  getSubDir,
  getCredentialsDir,
  getDesignSystemsDir,
  getReportsDir,
  getSessionsDir,
  getScreenshotsDir,
  getImagesDir,
  resolveOutputPath
};
