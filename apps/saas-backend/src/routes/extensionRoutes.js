import express from 'express';
import { UnifiedFigmaExtractor } from '../shared/extractors/UnifiedFigmaExtractor.js';
import { buildSnapshotFromFigmaData } from '../utils/styleSnapshot.js';
import { validateExtractionUrl } from '../server/middleware.js';

export const createExtensionRoutes = (config) => {
  const router = express.Router();
  // Ensure config.security exists
  const securityConfig = config?.security || {};
  const allowedHosts = securityConfig.allowedHosts || [];
  const validateUrl = validateExtractionUrl(allowedHosts);

  router.post('/global-styles', validateUrl, async (req, res) => {
    try {
      const {
        figmaUrl,
        nodeId = null,
        figmaPersonalAccessToken = null,
        preferredMethod = null
      } = req.body || {};

      if (!figmaUrl) {
        return res.status(400).json({
          success: false,
          error: 'figmaUrl is required'
        });
      }

      const extractor = new UnifiedFigmaExtractor(config);
      const extractionResult = await extractor.extract(figmaUrl, {
        preferredMethod,
        fallbackEnabled: true,
        nodeId,
        apiKey: figmaPersonalAccessToken || undefined,
        timeout: 30000
      });

      if (!extractionResult.success) {
        return res.status(502).json({
          success: false,
          error: extractionResult.error || 'Figma extraction failed'
        });
      }

      const figmaStyles = buildSnapshotFromFigmaData(extractionResult.data);

      return res.json({
        success: true,
        data: {
          figmaStyles,
          metadata: extractionResult.data.metadata || {}
        }
      });
    } catch (error) {
      console.error('❌ Global style extraction failed:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Unexpected server error'
      });
    }
  });

  return router;
};

export default {
  createExtensionRoutes
};
