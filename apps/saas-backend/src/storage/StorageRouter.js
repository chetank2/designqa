/**
 * Storage Router
 * Routes storage operations to appropriate providers and repositories
 */

import { getStorageProvider } from '../config/storage-config.js';
import { DesignSystemRepository } from '../database/repositories/DesignSystemRepository.js';
import { ReportRepository } from '../database/repositories/ReportRepository.js';

// Repository instances cache
let credentialsRepository = null;
let designSystemRepository = null;
let reportRepository = null;

/**
 * Get credentials repository (adapter that wraps storage provider)
 * @returns {Object|null} Credentials adapter with repository-like interface
 */
export function getCredentialsRepository() {
  try {
    const storageProvider = getStorageProvider();
    if (storageProvider && typeof storageProvider.listCredentials === 'function') {
      // Return adapter that matches expected repository interface
      return {
        async list(filters = {}) {
          return await storageProvider.listCredentials(filters);
        },
        async create(data) {
          return await storageProvider.saveCredential(data, {});
        },
        async findById(id) {
          return await storageProvider.getCredential(id);
        },
        async update(id, data) {
          // For local storage, we need to get existing and merge
          const existing = await storageProvider.getCredential(id);
          if (!existing) throw new Error('Credential not found');
          const updated = { ...existing, ...data };
          return await storageProvider.saveCredential(updated, { id });
        },
        async delete(id) {
          return await storageProvider.deleteCredential(id);
        },
        async decrypt(id) {
          return await storageProvider.decryptCredential(id);
        }
      };
    }
    console.warn('Storage provider does not support credential operations');
    return null;
  } catch (error) {
    console.warn('Failed to get storage provider for credentials:', error.message);
    return null;
  }
}

/**
 * Get design system repository
 * @returns {DesignSystemRepository|null} Design system repository instance
 */
export function getDesignSystemRepository() {
  if (!designSystemRepository) {
    try {
      const storageProvider = getStorageProvider();
      if (storageProvider) {
        designSystemRepository = new DesignSystemRepository(storageProvider);
      }
    } catch (error) {
      console.warn('Failed to initialize design system repository:', error.message);
      return null;
    }
  }
  return designSystemRepository;
}

/**
 * Get report repository
 * @returns {ReportRepository|null} Report repository instance
 */
export function getReportRepository() {
  if (!reportRepository) {
    try {
      const storageProvider = getStorageProvider();
      if (storageProvider) {
        reportRepository = new ReportRepository(storageProvider);
      }
    } catch (error) {
      console.warn('Failed to initialize report repository:', error.message);
      return null;
    }
  }
  return reportRepository;
}

/**
 * Reset all repositories (for testing or provider changes)
 */
export function resetRepositories() {
  credentialsRepository = null;
  designSystemRepository = null;
  reportRepository = null;
}

export default {
  getCredentialsRepository,
  getDesignSystemRepository,
  getReportRepository,
  resetRepositories
};