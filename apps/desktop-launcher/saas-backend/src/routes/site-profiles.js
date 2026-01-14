/**
 * Site Profiles Routes
 * Handles CRUD operations for per-domain extraction settings
 */

import express from 'express';
import { logger } from '../utils/logger.js';

const router = express.Router();

async function getSiteProfilesRepo() {
  try {
    const { getSiteProfilesRepository } = await import('../storage/StorageRouter.js');
    return getSiteProfilesRepository();
  } catch (error) {
    logger.warn('Failed to get site profiles repository:', error.message);
    return null;
  }
}

router.get('/', async (req, res) => {
  try {
    const repo = await getSiteProfilesRepo();
    if (!repo) {
      return res.status(200).json({ success: true, data: [] });
    }
    const profiles = await repo.list();
    res.json({ success: true, data: profiles || [] });
  } catch (error) {
    logger.error('Failed to list site profiles', { error: error.message, stack: error.stack });
    res.status(200).json({ success: true, data: [] });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, domain } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Profile name is required' });
    }
    if (!domain || !domain.trim()) {
      return res.status(400).json({ success: false, error: 'Profile domain is required' });
    }

    const repo = await getSiteProfilesRepo();
    if (!repo) {
      return res.status(500).json({ success: false, error: 'Site profile storage not available' });
    }

    const saved = await repo.create(req.body);
    res.json({ success: true, data: saved });
  } catch (error) {
    logger.error('Failed to create site profile', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to create site profile' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const repo = await getSiteProfilesRepo();
    if (!repo) {
      return res.status(500).json({ success: false, error: 'Site profile storage not available' });
    }

    const updated = await repo.update(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Site profile not found' });
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Failed to update site profile', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to update site profile' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const repo = await getSiteProfilesRepo();
    if (!repo) {
      return res.status(500).json({ success: false, error: 'Site profile storage not available' });
    }

    const deleted = await repo.delete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Site profile not found' });
    }

    res.json({ success: true, message: 'Site profile deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete site profile', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to delete site profile' });
  }
});

export default router;
