/**
 * SupabaseDesignSystemRepository
 * Uses SupabaseStorageProvider for cloud-backed design systems.
 */
import { DesignSystemRepository } from '../../database/repositories/DesignSystemRepository.js';
import { SupabaseStorageProvider } from '../SupabaseStorageProvider.js';

export class SupabaseDesignSystemRepository extends DesignSystemRepository {
  constructor(adapter = null) {
    super(adapter);
    const userId = adapter?.userId || null;
    this.storage = new SupabaseStorageProvider(userId);
  }

  async create(data) {
    return this.storage.saveDesignSystem(data);
  }

  async findById(id) {
    try {
      return await this.storage.getDesignSystem(id);
    } catch {
      return null;
    }
  }

  async findBySlug(slug) {
    const systems = await this.storage.listDesignSystems();
    return systems.find(system => system.slug === slug) || null;
  }

  async update(id, data) {
    const existing = await this.findById(id);
    const merged = { ...(existing || {}), ...(data || {}), id };
    return this.storage.saveDesignSystem(merged);
  }

  async delete(id) {
    return this.storage.deleteDesignSystem(id);
  }

  async list(filters = {}) {
    return this.storage.listDesignSystems(filters);
  }
}
