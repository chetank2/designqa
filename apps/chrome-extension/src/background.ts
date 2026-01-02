import { GlobalComparisonPayload, StyleSystemSnapshot } from './lib/styleTypes';
import { BACKEND_URL } from './config';
import { buildComparisonReport, NormalizedNode, ComparisonResult } from '@myapp/compare-engine';

const buildTokens = (snapshot: StyleSystemSnapshot) => {
  const tokens: Record<string, string | number> = {};
  const append = (prefix: string, items: Record<string, string | number>) => {
    Object.entries(items).forEach(([key, value]) => {
      tokens[`${prefix}:${key}`] = value;
    });
  };

  append('font', snapshot.fontFamilies);
  append('font-size', snapshot.fontSizes);
  append('font-weight', snapshot.fontWeights);
  append('line-height', snapshot.lineHeights);
  append('spacing', snapshot.spacing);
  append('radius', snapshot.radius);
  append('shadow', snapshot.shadows);

  return tokens;
};

const snapshotToNode = (snapshot: StyleSystemSnapshot, nodeId: string): NormalizedNode => {
  const colors: Record<string, string> = {};
  Object.entries(snapshot.colors).forEach(([key, value], index) => {
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

const buildSummary = (results: ComparisonResult[]) => {
  const matches = results.filter(result => result.status === 'match').length;
  const total = results.length;
  const mismatches = total - matches;
  const score = total ? Math.round((matches / total) * 100) : 100;
  return { total, matches, mismatches, score };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'global-style-comparison') {
    handleGlobalComparison(message.payload as GlobalComparisonPayload)
      .then(data => sendResponse({ data }))
      .catch(error => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message?.type === 'hybrid-compare') {
    handleHybridComparison(message.payload as GlobalComparisonPayload)
      .then(data => sendResponse({ data }))
      .catch(error => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  return undefined;
});

const handleGlobalComparison = async (payload: GlobalComparisonPayload) => {
  if (!payload?.figmaUrl?.trim()) {
    throw new Error('Figma URL is required.');
  }

  const figmaStyles = await fetchFigmaStylesFromBackend(payload);
  const webStyles = await collectWebStyles();
  return { figmaStyles, webStyles };
};

const handleHybridComparison = async (payload: GlobalComparisonPayload) => {
  if (!payload?.figmaUrl?.trim()) {
    throw new Error('Figma URL is required.');
  }

  const webStyles = await collectWebStyles();
  const { screenshotDataUrl, tab } = await captureActiveTabScreenshot();
  const viewport = await getActiveTabViewport(tab.id);

  const body: Record<string, unknown> = {
    figmaUrl: payload.figmaUrl.trim(),
    preferredMethod: payload.preferredMethod ?? 'auto',
    webStyles,
    webScreenshot: screenshotDataUrl,
    viewport,
    pageUrl: tab.url || null
  };

  if (payload.figmaToken?.trim()) {
    body.figmaPersonalAccessToken = payload.figmaToken.trim();
  }

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/extension/hybrid-compare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(`Failed to reach backend at ${BACKEND_URL}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (response.status === 404) {
    // Backend may be an older build without the hybrid endpoint; fall back to tokens-only mode.
    const figmaStyles = await fetchFigmaStylesFromBackend(payload);
    const figmaNode = snapshotToNode(figmaStyles, 'global');
    const webNode = snapshotToNode(webStyles, 'global');
    const tokenResults = buildComparisonReport([figmaNode], [webNode], { normalizeInput: false });
    return {
      figmaStyles,
      tokenComparison: { results: tokenResults, summary: buildSummary(tokenResults) },
      visualComparison: { status: 'skipped', reason: 'backend_no_hybrid_endpoint' },
      webStyles,
      metadata: { pageUrl: tab.url || null, viewport }
    };
  }

  const text = await response.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`Backend returned invalid JSON (status ${response.status})`);
    }
  }

  if (!response.ok) {
    const backendError = parsed?.error || response.statusText;
    throw new Error(`Backend error ${response.status}: ${backendError}`);
  }

  if (!parsed?.success) {
    throw new Error(parsed?.error || 'Backend failed to complete hybrid comparison.');
  }

  return {
    ...(parsed.data || {}),
    webStyles
  };
};

const fetchFigmaStylesFromBackend = async (payload: GlobalComparisonPayload): Promise<StyleSystemSnapshot> => {
  const body: Record<string, unknown> = {
    figmaUrl: payload.figmaUrl.trim(),
    preferredMethod: payload.preferredMethod ?? 'auto'
  };

  if (payload.figmaToken?.trim()) {
    body.figmaPersonalAccessToken = payload.figmaToken.trim();
  }

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/extension/global-styles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(`Failed to reach backend at ${BACKEND_URL}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`Backend returned invalid JSON (status ${response.status})`);
    }
  }

  if (!response.ok) {
    const backendError = parsed?.error || response.statusText;
    throw new Error(`Backend error ${response.status}: ${backendError}`);
  }

  if (!parsed?.success) {
    throw new Error(parsed?.error || 'Backend failed to extract styles.');
  }

  if (!parsed?.data?.figmaStyles) {
    throw new Error('Backend responded without style data.');
  }

  return parsed.data.figmaStyles as StyleSystemSnapshot;
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
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Receiving end does not exist')) {
      // Content scripts can be missing on restricted pages (chrome://, extensions gallery, etc.)
      // or on tabs that were opened before the extension was installed/updated.
      try {
        return await collectWebStylesViaInjection(tab.id);
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(
          `Failed to collect web styles: ${message}. Fallback injection failed: ${fallbackMessage}. ` +
            `Tip: reload the page and try again; note that Chrome blocks extensions on chrome:// and some protected pages.`
        );
      }
    }
    throw new Error(`Failed to collect web styles: ${message}`);
  }
};

const collectWebStylesViaInjection = async (tabId: number): Promise<StyleSystemSnapshot> => {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const MAX_ELEMENTS = 800;
      const MAX_VALUES = 120;

      const sanitizeKey = (value: string, fallback: string, index: number) => {
        const clean = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        return clean ? `${fallback}-${clean}` : `${fallback}-${index}`;
      };

      const recordFromSet = (values: Set<string>, prefix: string): Record<string, string> => {
        const record: Record<string, string> = {};
        Array.from(values)
          .slice(0, MAX_VALUES)
          .forEach((value, index) => {
            record[sanitizeKey(value, prefix, index)] = value;
          });
        return record;
      };

      const recordFromNumberSet = (values: Set<number>, prefix: string): Record<string, number> => {
        const record: Record<string, number> = {};
        Array.from(values)
          .slice(0, MAX_VALUES)
          .forEach((value, index) => {
            const integer = Number.isFinite(value) ? Number(value.toFixed(2)) : value;
            record[`${prefix}-${index}`] = integer;
          });
        return record;
      };

      const snapshot = {
        colors: {} as Record<string, string>,
        fontFamilies: {} as Record<string, string>,
        fontSizes: {} as Record<string, number>,
        fontWeights: {} as Record<string, number>,
        lineHeights: {} as Record<string, number>,
        spacing: {} as Record<string, number>,
        radius: {} as Record<string, number>,
        shadows: {} as Record<string, string>
      };

      const colors = new Set<string>();
      const fontFamilies = new Set<string>();
      const fontSizes = new Set<number>();
      const fontWeights = new Set<number>();
      const lineHeights = new Set<number>();
      const spacingValues = new Set<number>();
      const radiusValues = new Set<number>();
      const shadowValues = new Set<string>();

      const elements = Array.from(document.querySelectorAll<HTMLElement>('*')).slice(0, MAX_ELEMENTS);

      elements.forEach(element => {
        const styles = window.getComputedStyle(element);
        const addColor = (value?: string | null) => {
          if (!value) return;
          const normalized = value.trim();
          if (!normalized || normalized === 'rgba(0, 0, 0, 0)') return;
          colors.add(normalized);
        };

        addColor(styles.color);
        addColor(styles.backgroundColor);
        addColor(styles.borderTopColor);
        addColor(styles.borderRightColor);
        addColor(styles.borderBottomColor);
        addColor(styles.borderLeftColor);

        if (styles.fontFamily) {
          fontFamilies.add(styles.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
        }
        const size = parseFloat(styles.fontSize);
        if (!Number.isNaN(size)) {
          fontSizes.add(size);
        }
        const weight = parseFloat(styles.fontWeight);
        if (!Number.isNaN(weight)) {
          fontWeights.add(weight);
        }
        const line = parseFloat(styles.lineHeight);
        if (!Number.isNaN(line)) {
          lineHeights.add(line);
        }

        const trackSpacing = (value?: string | null) => {
          const parsed = value ? parseFloat(value) : NaN;
          if (!Number.isNaN(parsed) && parsed > 0) {
            spacingValues.add(parsed);
          }
        };

        trackSpacing(styles.paddingTop);
        trackSpacing(styles.paddingRight);
        trackSpacing(styles.paddingBottom);
        trackSpacing(styles.paddingLeft);
        trackSpacing(styles.marginTop);
        trackSpacing(styles.marginRight);
        trackSpacing(styles.marginBottom);
        trackSpacing(styles.marginLeft);
        trackSpacing(styles.gap);
        trackSpacing(styles.rowGap);
        trackSpacing(styles.columnGap);

        const trackRadius = (value?: string | null) => {
          const parsed = value ? parseFloat(value) : NaN;
          if (!Number.isNaN(parsed) && parsed > 0) {
            radiusValues.add(parsed);
          }
        };

        trackRadius(styles.borderRadius);
        trackRadius(styles.borderTopLeftRadius);
        trackRadius(styles.borderTopRightRadius);
        trackRadius(styles.borderBottomLeftRadius);
        trackRadius(styles.borderBottomRightRadius);

        const trackShadow = (value?: string | null) => {
          if (!value) return;
          const trimmed = value.trim();
          if (!trimmed || trimmed === 'none') return;
          trimmed.split(',').forEach(shadow => {
            const normalized = shadow.trim();
            if (normalized) {
              shadowValues.add(normalized);
            }
          });
        };

        trackShadow(styles.boxShadow);
        trackShadow(styles.textShadow);
      });

      snapshot.colors = recordFromSet(colors, 'color');
      snapshot.fontFamilies = recordFromSet(fontFamilies, 'font');
      snapshot.fontSizes = recordFromNumberSet(fontSizes, 'font-size');
      snapshot.fontWeights = recordFromNumberSet(fontWeights, 'font-weight');
      snapshot.lineHeights = recordFromNumberSet(lineHeights, 'line-height');
      snapshot.spacing = recordFromNumberSet(spacingValues, 'spacing');
      snapshot.radius = recordFromNumberSet(radiusValues, 'radius');
      snapshot.shadows = recordFromSet(shadowValues, 'shadow');

      return snapshot;
    }
  });

  if (!result?.result) {
    throw new Error('No style snapshot returned from injected collector.');
  }
  return result.result as StyleSystemSnapshot;
};

const captureVisibleTab = (windowId: number) =>
  new Promise<string>((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      windowId,
      { format: 'png' },
      dataUrl => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!dataUrl) {
          reject(new Error('Failed to capture tab screenshot.'));
          return;
        }
        resolve(dataUrl);
      }
    );
  });

const captureActiveTabScreenshot = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || typeof tab.windowId !== 'number') {
    throw new Error('No active tab available for screenshot capture.');
  }
  const screenshotDataUrl = await captureVisibleTab(tab.windowId);
  return { screenshotDataUrl, tab };
};

const getActiveTabViewport = async (tabId: number) => {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      })
    });
    return result?.result || null;
  } catch (error) {
    return null;
  }
};
