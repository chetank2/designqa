/**
 * Repository Index
 * Exports all repositories
 */

import { ComparisonRepository } from './ComparisonRepository.js';
import { ReportRepository } from './ReportRepository.js';
import { CredentialRepository } from './CredentialRepository.js';
import { DesignSystemRepository } from './DesignSystemRepository.js';
import { ScreenshotRepository } from './ScreenshotRepository.js';
import { CacheRepository } from './CacheRepository.js';

export { ComparisonRepository } from './ComparisonRepository.js';
export { ReportRepository } from './ReportRepository.js';
export { CredentialRepository } from './CredentialRepository.js';
export { DesignSystemRepository } from './DesignSystemRepository.js';
export { ScreenshotRepository } from './ScreenshotRepository.js';
export { CacheRepository } from './CacheRepository.js';

/**
 * Create all repositories with a given adapter
 * @param {DatabaseAdapter} adapter - Database adapter
 * @returns {Object} Repository instances
 */
export function createRepositories(adapter) {
  return {
    comparisons: new ComparisonRepository(adapter),
    reports: new ReportRepository(adapter),
    credentials: new CredentialRepository(adapter),
    designSystems: new DesignSystemRepository(adapter),
    screenshots: new ScreenshotRepository(adapter),
    cache: new CacheRepository(adapter)
  };
}

