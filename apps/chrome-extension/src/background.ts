import { GlobalComparisonPayload, StyleSystemSnapshot, createEmptySnapshot } from './lib/styleTypes';
import { BACKEND_URL } from './config';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'global-style-comparison') {
    handleGlobalComparison(message.payload as GlobalComparisonPayload)
      .then(data => sendResponse({ data }))
      .catch(error => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  return undefined;
});

const handleGlobalComparison = async (payload: GlobalComparisonPayload) => {
  if (!payload?.figmaUrl) {
    throw new Error('Figma URL is required.');
  }
  if (!payload?.figmaToken) {
    throw new Error('Figma Personal Access Token is required.');
  }

  const figmaStyles = await fetchFigmaStylesFromBackend(payload);
  const webStyles = await collectWebStyles();
  return { figmaStyles, webStyles };
};

const parseFigmaUrl = (url: string): { fileKey: string; nodeId: string | null } => {
  try {
    const urlObj = new URL(url.trim());
    const pathMatch = urlObj.pathname.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
    if (!pathMatch) {
      throw new Error('Invalid Figma URL format');
    }
    
    const fileKey = pathMatch[2];
    const nodeIdParam = urlObj.searchParams.get('node-id');
    const nodeId = nodeIdParam ? nodeIdParam.replace(/-/g, ':') : null;
    
    return { fileKey, nodeId };
  } catch (error) {
    throw new Error(`Failed to parse Figma URL: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const fetchFigmaStylesFromBackend = async (payload: GlobalComparisonPayload): Promise<StyleSystemSnapshot> => {
  const { fileKey, nodeId } = parseFigmaUrl(payload.figmaUrl);
  
  // Build Figma API URL
  let apiUrl = `https://api.figma.com/v1/files/${fileKey}`;
  if (nodeId) {
    apiUrl += `/nodes?ids=${encodeURIComponent(nodeId)}`;
  }

  // Fetch from Figma API
  const response = await fetch(apiUrl, {
    headers: {
      'X-Figma-Token': payload.figmaToken
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Figma API error (${response.status}): ${errorText || response.statusText}`);
  }

  const figmaData = await response.json();
  return transformFigmaDataToSnapshot(figmaData, nodeId);
};

const transformFigmaDataToSnapshot = (figmaData: any, nodeId: string | null): StyleSystemSnapshot => {
  const snapshot = createEmptySnapshot();
  
  // Get the document node
  const document = nodeId && figmaData.nodes?.[nodeId]?.document
    ? figmaData.nodes[nodeId].document
    : figmaData.document;

  if (!document) {
    return snapshot;
  }

  const colors = new Set<string>();
  const fontFamilies = new Set<string>();
  const fontSizes = new Set<number>();
  const fontWeights = new Set<number>();
  const lineHeights = new Set<number>();
  const spacingValues = new Set<number>();
  const radiusValues = new Set<number>();
  const shadowValues = new Set<string>();

  const rgbToRgba = (color: { r: number; g: number; b: number; a?: number }): string => {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = color.a !== undefined ? color.a : 1;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const traverseNode = (node: any) => {
    if (!node) return;

    // Extract colors from fills
    if (node.fills && Array.isArray(node.fills)) {
      node.fills.forEach((fill: any) => {
        if (fill.type === 'SOLID' && fill.color) {
          colors.add(rgbToRgba(fill.color));
        }
      });
    }

    // Extract colors from strokes
    if (node.strokes && Array.isArray(node.strokes)) {
      node.strokes.forEach((stroke: any) => {
        if (stroke.type === 'SOLID' && stroke.color) {
          colors.add(rgbToRgba(stroke.color));
        }
      });
    }

    // Extract typography
    if (node.style) {
      if (node.style.fontFamily) {
        fontFamilies.add(node.style.fontFamily);
      }
      if (node.style.fontSize) {
        fontSizes.add(node.style.fontSize);
      }
      if (node.style.fontWeight) {
        fontWeights.add(node.style.fontWeight);
      }
      if (node.style.lineHeightPx) {
        lineHeights.add(node.style.lineHeightPx);
      } else if (node.style.lineHeightPercentFontSize) {
        // Convert percentage to pixel value (approximate)
        const fontSize = node.style.fontSize || 16;
        lineHeights.add((fontSize * node.style.lineHeightPercentFontSize) / 100);
      }
    }

    // Extract spacing from auto-layout padding
    if (node.paddingLeft !== undefined) spacingValues.add(node.paddingLeft);
    if (node.paddingRight !== undefined) spacingValues.add(node.paddingRight);
    if (node.paddingTop !== undefined) spacingValues.add(node.paddingTop);
    if (node.paddingBottom !== undefined) spacingValues.add(node.paddingBottom);

    // Extract spacing from layout gaps
    if (node.itemSpacing !== undefined) spacingValues.add(node.itemSpacing);
    if (node.layoutMode === 'VERTICAL' || node.layoutMode === 'HORIZONTAL') {
      if (node.counterAxisSpacing !== undefined) spacingValues.add(node.counterAxisSpacing);
    }

    // Extract corner radius
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      radiusValues.add(node.cornerRadius);
    }
    if (node.topLeftRadius !== undefined) radiusValues.add(node.topLeftRadius);
    if (node.topRightRadius !== undefined) radiusValues.add(node.topRightRadius);
    if (node.bottomLeftRadius !== undefined) radiusValues.add(node.bottomLeftRadius);
    if (node.bottomRightRadius !== undefined) radiusValues.add(node.bottomRightRadius);

    // Extract shadows
    if (node.effects && Array.isArray(node.effects)) {
      node.effects.forEach((effect: any) => {
        if ((effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && effect.color) {
          const rgba = rgbToRgba(effect.color);
          const offset = effect.offset || { x: 0, y: 0 };
          const radius = effect.radius || 0;
          const spread = effect.spread || 0;
          const shadowType = effect.type === 'INNER_SHADOW' ? 'inset' : '';
          const shadow = `${shadowType} ${offset.x}px ${offset.y}px ${radius}px ${spread}px ${rgba}`.trim();
          shadowValues.add(shadow);
        }
      });
    }

    // Traverse children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverseNode);
    }
  };

  traverseNode(document);

  // Convert sets to records
  const recordFromSet = (values: Set<string>, prefix: string): Record<string, string> => {
    const record: Record<string, string> = {};
    Array.from(values).forEach((value, index) => {
      record[`${prefix}-${index}`] = value;
    });
    return record;
  };

  const recordFromNumberSet = (values: Set<number>, prefix: string): Record<string, number> => {
    const record: Record<string, number> = {};
    Array.from(values).forEach((value, index) => {
      const integer = Number.isFinite(value) ? Number(value.toFixed(2)) : value;
      record[`${prefix}-${index}`] = integer;
    });
    return record;
  };

  snapshot.colors = recordFromSet(colors, 'color');
  snapshot.fontFamilies = recordFromSet(fontFamilies, 'font');
  snapshot.fontSizes = recordFromNumberSet(fontSizes, 'font-size');
  snapshot.fontWeights = recordFromNumberSet(fontWeights, 'font-weight');
  snapshot.lineHeights = recordFromNumberSet(lineHeights, 'line-height');
  snapshot.spacing = recordFromNumberSet(spacingValues, 'spacing');
  snapshot.radius = recordFromNumberSet(radiusValues, 'radius');
  snapshot.shadows = recordFromSet(shadowValues, 'shadow');

  return snapshot;
};

const collectWebStyles = async (): Promise<StyleSystemSnapshot> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab available for style collection.');
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'collect-global-styles' });
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    if (response?.error) {
      throw new Error(response.error);
    }
    return response.styles as StyleSystemSnapshot;
  } catch (error) {
    throw new Error(`Failed to collect web styles: ${error instanceof Error ? error.message : String(error)}`);
  }
};
