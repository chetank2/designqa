/**
 * Design Systems Routes
 * Handles CRUD operations for design systems
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Get design system storage
 */
async function getDesignSystemStorage() {
  try {
    const { getStorageProvider } = await import('../config/storage-config.js');
    return getStorageProvider();
  } catch (error) {
    logger.warn('Failed to get design system storage:', error.message);
    return null;
  }
}

/**
 * GET /api/design-systems - List all design systems
 */
router.get('/', async (req, res) => {
  try {
    const storage = await getDesignSystemStorage();
    if (!storage) {
      return res.status(200).json({ success: true, data: [] });
    }

    const designSystems = await storage.listDesignSystems();
    res.json({
      success: true,
      data: designSystems || []
    });
  } catch (error) {
    logger.error('Failed to list design systems', { error: error.message, stack: error.stack });
    res.status(200).json({
      success: true,
      data: []
    });
  }
});

/**
 * POST /api/design-systems - Create a new design system
 */
router.post('/', async (req, res) => {
  try {
    const { name, slug, tokens, cssUrl, cssText, figmaFileKey, figmaNodeId, isGlobal } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Design system name is required'
      });
    }

    const storage = await getDesignSystemStorage();
    if (!storage) {
      return res.status(500).json({
        success: false,
        error: 'Storage provider not available'
      });
    }

    const designSystemData = {
      id: uuidv4(),
      name: name.trim(),
      slug: slug?.trim() || name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      tokens: tokens || {},
      cssUrl: cssUrl?.trim(),
      cssText: cssText?.trim(),
      figmaFileKey: figmaFileKey?.trim(),
      figmaNodeId: figmaNodeId?.trim(),
      isGlobal: Boolean(isGlobal),
      userId: req.user?.id || null, // For future Supabase integration
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = await storage.saveDesignSystem(designSystemData);
    res.json({
      success: true,
      data: saved
    });
  } catch (error) {
    logger.error('Failed to create design system', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create design system'
    });
  }
});

/**
 * GET /api/design-systems/:id - Get design system by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const storage = await getDesignSystemStorage();

    if (!storage) {
      return res.status(404).json({
        success: false,
        error: 'Design system not found'
      });
    }

    const designSystem = await storage.getDesignSystem(id);
    if (!designSystem) {
      return res.status(404).json({
        success: false,
        error: 'Design system not found'
      });
    }

    res.json({
      success: true,
      data: designSystem
    });
  } catch (error) {
    logger.error('Failed to get design system', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get design system'
    });
  }
});

/**
 * PUT /api/design-systems/:id - Update design system
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, tokens, cssUrl, cssText, figmaFileKey, figmaNodeId, isGlobal } = req.body;

    const storage = await getDesignSystemStorage();
    if (!storage) {
      return res.status(500).json({
        success: false,
        error: 'Storage provider not available'
      });
    }

    // Get existing design system
    const existing = await storage.getDesignSystem(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Design system not found'
      });
    }

    // Update data
    const updatedData = {
      ...existing,
      ...(name && { name: name.trim() }),
      ...(slug && { slug: slug.trim() }),
      ...(tokens && { tokens }),
      ...(cssUrl !== undefined && { cssUrl: cssUrl?.trim() }),
      ...(cssText !== undefined && { cssText: cssText?.trim() }),
      ...(figmaFileKey !== undefined && { figmaFileKey: figmaFileKey?.trim() }),
      ...(figmaNodeId !== undefined && { figmaNodeId: figmaNodeId?.trim() }),
      ...(isGlobal !== undefined && { isGlobal: Boolean(isGlobal) }),
      updatedAt: new Date().toISOString()
    };

    const saved = await storage.saveDesignSystem(updatedData);
    res.json({
      success: true,
      data: saved
    });
  } catch (error) {
    logger.error('Failed to update design system', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update design system'
    });
  }
});

/**
 * DELETE /api/design-systems/:id - Delete design system
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const storage = await getDesignSystemStorage();

    if (!storage) {
      return res.status(500).json({
        success: false,
        error: 'Storage provider not available'
      });
    }

    const deleted = await storage.deleteDesignSystem(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Design system not found'
      });
    }

    res.json({
      success: true,
      message: 'Design system deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete design system', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete design system'
    });
  }
});

/**
 * GET /api/design-systems/:id/css - Get design system CSS
 */
router.get('/:id/css', async (req, res) => {
  try {
    const { id } = req.params;
    const storage = await getDesignSystemStorage();

    if (!storage) {
      return res.status(404).json({
        success: false,
        error: 'Design system not found'
      });
    }

    const css = await storage.getDesignSystemCSS(id);
    if (!css) {
      return res.status(404).json({
        success: false,
        error: 'Design system CSS not found'
      });
    }

    res.set('Content-Type', 'text/css');
    res.send(css);
  } catch (error) {
    logger.error('Failed to get design system CSS', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get design system CSS'
    });
  }
});

export default router;