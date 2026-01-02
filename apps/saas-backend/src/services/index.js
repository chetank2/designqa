/**
 * Service Index
 * Exports all services and factory function
 */

import { ComparisonService } from './ComparisonService.js';
import { ReportService } from './ReportService.js';
import { CredentialService } from './CredentialService.js';
import { DesignSystemService } from './DesignSystemService.js';
import { ScreenshotService } from './ScreenshotService.js';
import { FigmaAuthService } from './FigmaAuthService.js';

export { ComparisonService } from './ComparisonService.js';
export { ReportService } from './ReportService.js';
export { CredentialService } from './CredentialService.js';
export { DesignSystemService } from './DesignSystemService.js';
export { ScreenshotService } from './ScreenshotService.js';
export { FigmaAuthService } from './FigmaAuthService.js';

/**
 * Create all services with a given adapter and storage provider
 * @param {DatabaseAdapter} adapter - Database adapter
 * @param {StorageProvider} storageProvider - Storage provider
 * @param {string} encryptionKey - Encryption key for credentials
 * @returns {Object} Service instances
 */
import { SupabaseDesignSystemRepository } from '../storage/supabase/SupabaseDesignSystemRepository.js';
import { LocalDesignSystemRepository } from '../storage/local/LocalDesignSystemRepository.js';

export function createServices(adapter, storageProvider, encryptionKey = null) {
  // Choose Design System Repository based on adapter type
  let designSystemRepo;
  if (adapter.getType() === 'local') {
    designSystemRepo = new LocalDesignSystemRepository(adapter);
  } else {
    // Default to Supabase/Base repo logic
    // Even for Supabase adapter, we might want SupabaseDesignSystemRepository specifically
    // The previous code relied on DesignSystemService creating the base repo, 
    // effectively missing the Supabase-specific overrides unless DesignSystemService was using it?
    // Wait, DesignSystemService imported specific repo?
    // Checking Step 44, it imported '../database/repositories/DesignSystemRepository.js'.
    // BUT SupabaseDesignSystemRepository.js (Step 14) exists and extends it.
    // It seems the original code MIGHT NOT have been using SupabaseDesignSystemRepository!
    // Or maybe I missed where it was injected. 
    // Step 39 shows `designSystems: new DesignSystemService(adapter)`
    // Step 44 shows `import { DesignSystemRepository } from '../database/repositories/DesignSystemRepository.js';`
    // So the original code was using the BASE repository?
    // If so, my 'SupabaseDesignSystemRepository' analysis (Step 14) shows it exists but was UNUSED?
    // Or maybe `apps/saas-backend/src/services/DesignSystemService.js` was relying on behavior I missed?
    // Ah, `SupabaseDesignSystemRepository.js` is in `storage/supabase/`. 
    // The base `DesignSystemRepository.js` logic for `save` doesn't handle CSS upload to cloud storage. 
    // So if the app WAS using Supabase, it might have been missing that feature or I simply missed where it was used.
    // However, for now, let's explicitly use the Supabase one if Supabase adapter.
    designSystemRepo = new SupabaseDesignSystemRepository(adapter);
    // Note: SupabaseDesignSystemRepository constructor (Step 14) takes no args? 
    // `constructor() { super(); this.supabase = getSupabaseClient(false); }`
    // It doesn't take adapter! It gets client from config.
    // Base DesignSystemRepository takes adapter.
    // We should probably check if we need to pass adapter.
  }

  // Re-checking SupabaseDesignSystemRepository constructor:
  // constructor() { super(); this.supabase = getSupabaseClient(false); }
  // It calls super() without args.
  // Base repo constructor(adapter) { this.adapter = adapter; }
  // So SupabaseDesignSystemRepository instance keys `this.adapter` as undefined?
  // But it overrides methods `list`, `save`, `get`, `delete`.
  // It uses `this.supabase` everywhere.
  // So it doesn't need adapter.

  // However, local repo DOES need adapter.

  return {
    comparisons: new ComparisonService(adapter),
    reports: new ReportService(adapter, storageProvider),
    credentials: new CredentialService(adapter, encryptionKey),
    designSystems: new DesignSystemService(adapter, designSystemRepo),
    screenshots: new ScreenshotService(adapter),
    figmaAuth: new FigmaAuthService(adapter, encryptionKey)
  };
}

