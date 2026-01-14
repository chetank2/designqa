/**
 * Credentials Routes
 * Handles CRUD operations for saved credentials
 */

import express from 'express';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Get credentials repository
 */
async function getCredentialsRepo() {
  try {
    const { getCredentialsRepository } = await import('../storage/StorageRouter.js');
    return getCredentialsRepository();
  } catch (error) {
    logger.warn('Failed to get credentials repository:', error.message);
    return null;
  }
}

/**
 * GET /api/credentials - List all credentials
 */
router.get('/', async (req, res) => {
  try {
    const repo = await getCredentialsRepo();
    if (!repo) {
      return res.status(200).json({ success: true, data: [] });
    }

    const credentials = await repo.list();
    res.json({
      success: true,
      data: credentials || []
    });
  } catch (error) {
    logger.error('Failed to list credentials', { error: error.message, stack: error.stack });
    res.status(200).json({
      success: true,
      data: []
    });
  }
});

/**
 * POST /api/credentials - Create a new credential
 */
router.post('/', async (req, res) => {
  try {
    const { name, url, loginUrl, username, password, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Credential name is required'
      });
    }
    if (!url || !url.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Credential URL is required'
      });
    }

    const { getStorageProvider } = await import('../config/storage-config.js');
    const storage = getStorageProvider();
    if (!storage) {
      throw new Error('Storage provider not available');
    }

    const saved = await storage.saveCredential(
      {
        name: name.trim(),
        url: url.trim(),
        loginUrl: loginUrl?.trim(),
        username: username?.trim() || '',
        password: password?.trim() || '',
        notes: notes?.trim()
      },
      {}
    );

    res.json({
      success: true,
      data: saved
    });
  } catch (error) {
    logger.error('Failed to create credential', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create credential'
    });
  }
});

/**
 * PUT /api/credentials/:id - Update credential
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const repo = await getCredentialsRepo();

    if (!repo) {
      return res.status(500).json({
        success: false,
        error: 'Credentials storage not available'
      });
    }

    const updated = await repo.update(id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found'
      });
    }

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    logger.error('Failed to update credential', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update credential'
    });
  }
});

/**
 * DELETE /api/credentials/:id - Delete credential
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const repo = await getCredentialsRepo();

    if (!repo) {
      return res.status(500).json({
        success: false,
        error: 'Credentials storage not available'
      });
    }

    const deleted = await repo.delete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found'
      });
    }

    res.json({
      success: true,
      message: 'Credential deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete credential', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete credential'
    });
  }
});

/**
 * GET /api/credentials/:id/decrypt - Get decrypted credential
 */
router.get('/:id/decrypt', async (req, res) => {
  try {
    const { id } = req.params;
    const repo = await getCredentialsRepo();

    if (!repo) {
      return res.status(500).json({
        success: false,
        error: 'Credentials storage not available'
      });
    }

    const decrypted = await repo.decrypt(id);
    if (!decrypted) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found'
      });
    }

    res.json({
      success: true,
      data: decrypted
    });
  } catch (error) {
    logger.error('Failed to decrypt credential', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to decrypt credential'
    });
  }
});

export default router;