import express from 'express';
import { UnifiedFigmaExtractor } from '../shared/extractors/UnifiedFigmaExtractor.js';
import { buildSnapshotFromFigmaData } from '../utils/styleSnapshot.js';
import { validateExtractionUrl } from '../server/middleware.js';
import { getMCPClient } from '../config/mcp-config.js';
import { buildComparisonReport } from '@myapp/compare-engine';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import VisualDiff from '../visual/visualDiff.js';

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

  const ensureDir = async (dirPath) => {
    await fs.mkdir(dirPath, { recursive: true });
  };

  const decodeDataUrl = (value) => {
    if (!value || typeof value !== 'string') return null;
    const match = value.match(/^data:(.+?);base64,(.+)$/);
    if (!match) return null;
    return Buffer.from(match[2], 'base64');
  };

  const parseMcpToolJson = (toolResult) => {
    const candidate = toolResult?.result ?? toolResult;
    const text = candidate?.content?.[0]?.text;
    if (typeof text !== 'string') return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const parseMcpImageBuffer = async (toolResult) => {
    const candidate = toolResult?.result ?? toolResult;
    const content = Array.isArray(candidate?.content) ? candidate.content : [];

    const imageItem = content.find(item => item?.type === 'image' && typeof item?.data === 'string');
    if (imageItem?.data) {
      return Buffer.from(imageItem.data, 'base64');
    }

    const textItem = content.find(item => item?.type === 'text' && typeof item?.text === 'string');
    const text = textItem?.text;
    if (!text) return null;

    const dataUrlMatch = text.match(/^data:(.+?);base64,(.+)$/);
    if (dataUrlMatch) {
      return Buffer.from(dataUrlMatch[2], 'base64');
    }

    let parsedJson = null;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      parsedJson = null;
    }

    const urlCandidate =
      parsedJson?.url ||
      parsedJson?.data?.url ||
      parsedJson?.imageUrl ||
      parsedJson?.data?.imageUrl ||
      parsedJson?.screenshotUrl ||
      parsedJson?.data?.screenshotUrl ||
      null;

    if (typeof urlCandidate === 'string' && urlCandidate.startsWith('http')) {
      const response = await fetch(urlCandidate);
      if (!response.ok) {
        throw new Error(`Failed to download image from MCP URL (status ${response.status})`);
      }
      return Buffer.from(await response.arrayBuffer());
    }

    const base64Candidate =
      parsedJson?.data?.imageBase64 ||
      parsedJson?.imageBase64 ||
      parsedJson?.data?.base64 ||
      parsedJson?.base64 ||
      null;

    if (typeof base64Candidate === 'string' && base64Candidate.length > 100) {
      return Buffer.from(base64Candidate, 'base64');
    }

    return null;
  };

  const fetchFigmaImageViaMcp = async ({ fileId, nodeId, scale }) => {
    const mcpClient = await getMCPClient({ mode: 'desktop', autoDetectDesktop: true });
    if (!mcpClient) {
      throw new Error('Desktop MCP client not available. Ensure the desktop app is running in local mode.');
    }
    await mcpClient.connect();

    const exportResult = await mcpClient.exportAssets(fileId, [nodeId], 'png', scale);
    const parsed = parseMcpToolJson(exportResult) ?? exportResult;

    const images =
      parsed?.images ||
      parsed?.data?.images ||
      parsed?.result?.images ||
      parsed?.result?.data?.images ||
      null;

    const url =
      (images && (images[nodeId] || images[nodeId.replace(':', '-')])) ||
      parsed?.url ||
      parsed?.data?.url ||
      null;

    if (!url || typeof url !== 'string') {
      throw new Error('MCP export did not return an image URL.');
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download Figma image (status ${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  };

  const fetchFigmaScreenshotViaMcpSelection = async () => {
    const mcpClient = await getMCPClient({ mode: 'desktop', autoDetectDesktop: true });
    if (!mcpClient) {
      throw new Error('Desktop MCP client not available. Ensure Figma Desktop is running with MCP enabled.');
    }
    await mcpClient.connect();

    const screenshotResult = await mcpClient.callTool('get_screenshot', {});
    const buffer = await parseMcpImageBuffer(screenshotResult);
    if (!buffer) {
      throw new Error('MCP get_screenshot returned no image data.');
    }
    return buffer;
  };

  const fetchFigmaImageViaApi = async ({ fileId, nodeId, scale, token }) => {
    if (!token) {
      throw new Error('No Figma token provided for API image export.');
    }

    const exportUrl = new URL(`https://api.figma.com/v1/images/${fileId}`);
    exportUrl.searchParams.set('ids', nodeId);
    exportUrl.searchParams.set('format', 'png');
    exportUrl.searchParams.set('scale', String(scale));

    const exportResponse = await fetch(exportUrl.toString(), {
      headers: { 'X-Figma-Token': token }
    });
    if (!exportResponse.ok) {
      throw new Error(`Figma images API failed (status ${exportResponse.status})`);
    }
    const exportJson = await exportResponse.json();
    const url = exportJson?.images?.[nodeId] || exportJson?.images?.[nodeId.replace(':', '-')];
    if (!url) {
      throw new Error('Figma images API returned no image URL for the requested node.');
    }

    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download Figma image (status ${imageResponse.status})`);
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  };

  const buildTokens = (snapshot) => {
    const tokens = {};
    const append = (prefix, items) => {
      Object.entries(items || {}).forEach(([key, value]) => {
        tokens[`${prefix}:${key}`] = value;
      });
    };

    append('font', snapshot?.fontFamilies);
    append('font-size', snapshot?.fontSizes);
    append('font-weight', snapshot?.fontWeights);
    append('line-height', snapshot?.lineHeights);
    append('spacing', snapshot?.spacing);
    append('radius', snapshot?.radius);
    append('shadow', snapshot?.shadows);

    return tokens;
  };

  const snapshotToNode = (snapshot, nodeId) => {
    const colors = {};
    Object.entries(snapshot?.colors || {}).forEach(([key, value], index) => {
      colors[key || `color-${index}`] = value;
    });

    return {
      nodeId,
      name: nodeId,
      styles: {
        colors,
        typography: {},
        spacing: {},
        radius: {},
        layout: {},
        shadows: {},
        tokens: buildTokens(snapshot)
      }
    };
  };

  const buildSummary = (results) => {
    const matches = results.filter(r => r.status === 'match').length;
    const total = results.length;
    const mismatches = total - matches;
    const score = total ? Math.round((matches / total) * 100) : 100;
    return { total, matches, mismatches, score };
  };

  router.post('/hybrid-compare', validateUrl, async (req, res) => {
    try {
      const {
        figmaUrl,
        nodeId: nodeIdOverride = null,
        figmaPersonalAccessToken = null,
        preferredMethod = null,
        webStyles = null,
        webScreenshot = null,
        viewport = null,
        pageUrl = null,
        visual = null
      } = req.body || {};

      if (!figmaUrl) {
        return res.status(400).json({
          success: false,
          error: 'figmaUrl is required'
        });
      }

      if (!webStyles) {
        return res.status(400).json({
          success: false,
          error: 'webStyles is required'
        });
      }

      const extractor = new UnifiedFigmaExtractor(config);
      const extractionResult = await extractor.extract(figmaUrl, {
        preferredMethod,
        fallbackEnabled: true,
        nodeId: nodeIdOverride,
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

      const figmaNode = snapshotToNode(figmaStyles, 'global');
      const webNode = snapshotToNode(webStyles, 'global');
      const tokenComparison = buildComparisonReport([figmaNode], [webNode], { normalizeInput: false });
      const tokenResults = tokenComparison;

      const comparisonId = crypto.randomUUID?.() || crypto.randomBytes(16).toString('hex');
      const baseDir = path.join(process.cwd(), 'output', 'images', 'extension', comparisonId);
      await ensureDir(baseDir);

      const decodedWeb = decodeDataUrl(webScreenshot);
      let visualComparison = {
        status: 'skipped',
        reason: 'no_web_screenshot',
        comparisonId
      };

      if (decodedWeb) {
        const parsedFileId = extractor.parseFileId(figmaUrl);
        const parsedNodeId = nodeIdOverride || extractor.parseNodeId(figmaUrl);
        const fileId = parsedFileId;
        const nodeId = parsedNodeId;

        if (!fileId || !nodeId) {
          visualComparison = {
            status: 'skipped',
            reason: !fileId ? 'no_file_id' : 'no_node_id',
            comparisonId
          };
        } else {
          const scale = Number.isFinite(visual?.scale) ? visual.scale : 2;
          const threshold = Number.isFinite(visual?.threshold) ? visual.threshold : 0.1;

          let figmaImageBuffer = null;
          let imageMethod = 'desktop-mcp';
          try {
            figmaImageBuffer = await fetchFigmaImageViaMcp({ fileId, nodeId, scale });
          } catch (error) {
            // Fallback 1: official Desktop MCP screenshot (requires the target frame selected in Figma Desktop)
            try {
              imageMethod = 'desktop-mcp:get_screenshot';
              figmaImageBuffer = await fetchFigmaScreenshotViaMcpSelection();
            } catch (screenshotError) {
              // Fallback 2: Figma REST API export (requires a PAT)
              imageMethod = 'figma-api';
              try {
                figmaImageBuffer = await fetchFigmaImageViaApi({
                  fileId,
                  nodeId,
                  scale,
                  token: figmaPersonalAccessToken || process.env.FIGMA_API_KEY || process.env.FIGMA_TOKEN
                });
              } catch (apiError) {
                const screenshotMessage = screenshotError instanceof Error ? screenshotError.message : String(screenshotError);
                const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
                // Don't fail the whole comparison if visual export can't be performed.
                // Token comparison is still valuable; surface a clear reason to the extension.
                visualComparison = {
                  status: 'skipped',
                  reason: apiMessage.includes('No Figma token provided')
                    ? 'no_figma_token_for_image_export'
                    : 'figma_image_export_failed',
                  message:
                    apiMessage.includes('No Figma token provided')
                      ? `Visual diff needs either a Figma PAT (for image export) or a selected frame in Figma Desktop (for get_screenshot). Details: ${screenshotMessage}`
                      : apiMessage,
                  comparisonId
                };
                figmaImageBuffer = null;
              }
            }
          }

          if (!figmaImageBuffer) {
            // If visualComparison was set to skipped above, continue returning token results.
            // Otherwise, fall back to a generic skipped status.
            if (visualComparison?.status !== 'skipped') {
              visualComparison = { status: 'skipped', reason: 'no_figma_image', comparisonId };
            }
            return res.json({
              success: true,
              data: {
                figmaStyles,
                tokenComparison: {
                  results: tokenResults,
                  summary: buildSummary(tokenResults)
                },
                visualComparison,
                metadata: {
                  figma: extractionResult.data?.metadata || {},
                  pageUrl,
                  viewport
                }
              }
            });
          }

          const figmaPath = path.join(baseDir, 'figma.png');
          const webPath = path.join(baseDir, 'web.png');
          const diffPath = path.join(baseDir, 'diff.png');

          await fs.writeFile(figmaPath, figmaImageBuffer);
          await fs.writeFile(webPath, decodedWeb);

          const visualDiff = new VisualDiff({
            output: { screenshotDir: baseDir }
          });

          const visualResult = await visualDiff.compareImages(figmaPath, webPath, {
            threshold,
            outputPath: diffPath,
            diffFilename: 'diff.png'
          });

          const relativeBase = `/images/extension/${comparisonId}`;
          visualComparison = {
            status: 'completed',
            comparisonId,
            method: imageMethod,
            threshold,
            metrics: visualResult.metrics,
            urls: {
              figma: `${relativeBase}/figma.png`,
              web: `${relativeBase}/web.png`,
              diff: `${relativeBase}/diff.png`
            }
          };
        }
      }

      return res.json({
        success: true,
        data: {
          figmaStyles,
          tokenComparison: {
            results: tokenResults,
            summary: buildSummary(tokenResults)
          },
          visualComparison,
          metadata: {
            figma: extractionResult.data?.metadata || {},
            pageUrl,
            viewport
          }
        }
      });
    } catch (error) {
      console.error('❌ Hybrid comparison failed:', error);
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
