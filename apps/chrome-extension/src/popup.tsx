import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  buildComparisonReport,
  normalizeFigmaData,
  normalizeWebStyles,
  compareColors,
  ComparisonResult,
  RawFigmaNode,
  RawWebNode
} from '@myapp/compare-engine';

const defaultFigmaNodes: RawFigmaNode[] = [
  {
    nodeId: 'body',
    name: 'Body',
    styles: {
      colors: {
        background: '#ffffff',
        color: '#0f172a'
      },
      typography: {
        fontFamily: 'Inter',
        fontSize: 16,
        lineHeight: 24
      },
      spacing: {
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0
      },
      radius: {},
      layout: {},
      shadows: {}
    }
  }
];

const requestWebNodes = (): Promise<RawWebNode[]> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'collect-styles' }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve((response?.nodes as RawWebNode[]) || []);
    });
  });

const badgeColors: Record<'match' | 'mismatch', string> = {
  match: '#22c55e',
  mismatch: '#f97316'
};

const isFigmaUrl = (text: string): boolean => {
  return /figma\.com\/(file|design)\//.test(text.trim());
};

const parseFigmaUrl = (url: string): { fileKey: string; nodeId: string | null } | null => {
  try {
    const urlObj = new URL(url.trim());
    const pathMatch = urlObj.pathname.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
    if (!pathMatch) return null;
    
    const fileKey = pathMatch[2];
    const nodeIdParam = urlObj.searchParams.get('node-id');
    const nodeId = nodeIdParam ? nodeIdParam.replace('-', ':') : null;
    
    return { fileKey, nodeId };
  } catch {
    return null;
  }
};

const getBackendUrl = async (): Promise<string> => {
  // Try to get from storage, default to localhost:3847 (backend default port)
  const stored = await chrome.storage.local.get('backendUrl');
  return stored.backendUrl || 'http://localhost:3847';
};

const fetchFigmaData = async (figmaUrl: string): Promise<RawFigmaNode[]> => {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    throw new Error('Invalid Figma URL format');
  }

  // Use backend API which automatically uses MCP if available, falls back to Figma API
  const backendUrl = await getBackendUrl();
  const apiUrl = `${backendUrl}/api/figma-only/extract`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      figmaUrl,
      extractionMode: 'both',
      preferredMethod: 'mcp' // Prefer MCP, will fallback to API if needed
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Backend API error: ${error.error || response.statusText}`);
  }

  const result = await response.json();
  
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to extract Figma data');
  }

  const standardizedData = result.data;
  
  // Transform standardized data to RawFigmaNode format
  return transformStandardizedToRaw(standardizedData);
};

const transformStandardizedToRaw = (data: any): RawFigmaNode[] => {
  const nodes: RawFigmaNode[] = [];
  
  // Transform components from standardized format
  const transformComponent = (component: any): RawFigmaNode => {
    const rawNode: RawFigmaNode = {
      nodeId: component.id?.replace(/:/g, '-') || component.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
      name: component.name,
      selector: component.selector,
      styles: {
        colors: {},
        typography: {},
        spacing: {},
        radius: {},
        layout: {},
        shadows: {}
      }
    };

    // Extract colors from properties
    if (component.properties) {
      const props = component.properties;
      
      // Background color
      if (props.backgroundColor || props.background) {
        rawNode.styles!.colors!.background = props.backgroundColor || props.background;
      }
      
      // Text color
      if (props.color || props.textColor) {
        rawNode.styles!.colors!.color = props.color || props.textColor;
      }
      
      // Border color
      if (props.borderColor) {
        rawNode.styles!.colors!.borderColor = props.borderColor;
      }

      // Typography
      if (props.fontFamily || props.fontSize || props.fontWeight) {
        rawNode.styles!.typography = {
          fontFamily: props.fontFamily,
          fontSize: typeof props.fontSize === 'string' ? parseFloat(props.fontSize) : props.fontSize,
          fontWeight: typeof props.fontWeight === 'string' ? parseFloat(props.fontWeight) : props.fontWeight,
          lineHeight: props.lineHeight ? (typeof props.lineHeight === 'string' ? parseFloat(props.lineHeight) : props.lineHeight) : undefined
        };
      }

      // Spacing
      if (props.paddingTop || props.paddingRight || props.paddingBottom || props.paddingLeft) {
        rawNode.styles!.spacing = {
          paddingTop: typeof props.paddingTop === 'string' ? parseFloat(props.paddingTop) : props.paddingTop || 0,
          paddingRight: typeof props.paddingRight === 'string' ? parseFloat(props.paddingRight) : props.paddingRight || 0,
          paddingBottom: typeof props.paddingBottom === 'string' ? parseFloat(props.paddingBottom) : props.paddingBottom || 0,
          paddingLeft: typeof props.paddingLeft === 'string' ? parseFloat(props.paddingLeft) : props.paddingLeft || 0
        };
      }

      // Radius
      if (props.borderRadius || props.cornerRadius) {
        rawNode.styles!.radius!.borderRadius = typeof props.borderRadius === 'string' 
          ? parseFloat(props.borderRadius) 
          : (props.borderRadius || props.cornerRadius);
      }

      // Layout
      if (props.width || props.height) {
        rawNode.styles!.layout = {
          width: typeof props.width === 'string' ? parseFloat(props.width) : props.width,
          height: typeof props.height === 'string' ? parseFloat(props.height) : props.height
        };
      }
    }

    return rawNode;
  };

  // Process all components
  const processComponents = (components: any[]) => {
    components.forEach(component => {
      nodes.push(transformComponent(component));
      if (component.children && Array.isArray(component.children)) {
        processComponents(component.children);
      }
    });
  };

  if (data.components && Array.isArray(data.components)) {
    processComponents(data.components);
  }

  // If no components found, create a default node
  if (nodes.length === 0) {
    nodes.push({
      nodeId: 'root',
      name: 'Root',
      styles: {
        colors: {},
        typography: {},
        spacing: {},
        radius: {},
        layout: {},
        shadows: {}
      }
    });
  }

  return nodes;
};

const Popup = () => {
  const [figmaInput, setFigmaInput] = useState(() => JSON.stringify(defaultFigmaNodes, null, 2));
  const [inputMode, setInputMode] = useState<'json' | 'url'>('json');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [colorSummary, setColorSummary] = useState<ComparisonResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'fetching'>('idle');
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return results.reduce<Record<'match' | 'mismatch', ComparisonResult[]>>(
      (acc, result) => {
        acc[result.status].push(result);
        return acc;
      },
      { match: [], mismatch: [] }
    );
  }, [results]);

  const handleFetchFromUrl = async () => {
    if (!figmaUrl.trim()) {
      setError('Please enter a Figma URL');
      return;
    }

    setStatus('fetching');
    setError(null);
    try {
      const nodes = await fetchFigmaData(figmaUrl);
      setFigmaInput(JSON.stringify(nodes, null, 2));
      setInputMode('json');
      setStatus('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch from Figma URL';
      setError(message);
      setStatus('error');
    }
  };

  const handleCompare = async () => {
    setStatus('loading');
    setError(null);
    try {
      const parsed = JSON.parse(figmaInput) as RawFigmaNode[];
      const webNodes = await requestWebNodes();
      if (!webNodes.length) {
        throw new Error('No measurable nodes were found on this page. Add data-figma-node-id attributes.');
      }
      const normalizedFigma = normalizeFigmaData(parsed);
      const normalizedWeb = normalizeWebStyles(webNodes);
      const comparison = buildComparisonReport(normalizedFigma, normalizedWeb, { normalizeInput: false });
      const colorComparisons = normalizedFigma.flatMap(figmaNode => {
        const target = normalizedWeb.find(webNode => webNode.nodeId === figmaNode.nodeId);
        if (!target) return [];
        return compareColors(figmaNode.nodeId, figmaNode.styles.colors, target.styles.colors);
      });
      setResults(comparison);
      setColorSummary(colorComparisons);
      setStatus('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to complete comparison';
      setError(message);
      setStatus('error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <header>
        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>DesignQA Compare</h1>
        <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: '#94a3b8' }}>
          Compare Figma designs with live web pages
        </p>
      </header>
      
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <button
          onClick={() => setInputMode('url')}
          style={{
            flex: 1,
            padding: '0.4rem',
            borderRadius: '0.4rem',
            border: '1px solid #1e293b',
            background: inputMode === 'url' ? '#1e3a8a' : '#0f172a',
            color: '#e2e8f0',
            fontSize: '0.75rem',
            cursor: 'pointer'
          }}
        >
          From URL
        </button>
        <button
          onClick={() => setInputMode('json')}
          style={{
            flex: 1,
            padding: '0.4rem',
            borderRadius: '0.4rem',
            border: '1px solid #1e293b',
            background: inputMode === 'json' ? '#1e3a8a' : '#0f172a',
            color: '#e2e8f0',
            fontSize: '0.75rem',
            cursor: 'pointer'
          }}
        >
          Paste JSON
        </button>
      </div>

      {inputMode === 'url' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', gap: '0.3rem' }}>
            Figma URL
            <input
              type="text"
              value={figmaUrl}
              onChange={e => setFigmaUrl(e.target.value)}
              placeholder="https://www.figma.com/design/..."
              style={{
                width: '100%',
                borderRadius: '0.5rem',
                background: '#020617',
                border: '1px solid #1e293b',
                color: '#e2e8f0',
                fontSize: '0.8rem',
                padding: '0.5rem'
              }}
            />
          </label>
          <button
            onClick={handleFetchFromUrl}
            disabled={status === 'fetching'}
            style={{
              padding: '0.55rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#2563eb',
              color: '#f8fafc',
              fontWeight: 600,
              cursor: status === 'fetching' ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem'
            }}
          >
            {status === 'fetching' ? 'Fetching…' : 'Fetch from Figma'}
          </button>
          <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0 }}>
            💡 Uses Figma MCP (if Figma Desktop is running) or falls back to API. Backend must be running at <code style={{ fontSize: '0.65rem', background: '#1e293b', padding: '0.1rem 0.2rem', borderRadius: '0.2rem' }}>http://localhost:3847</code>
          </p>
        </div>
      ) : (
      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', gap: '0.3rem' }}>
        Figma nodes JSON
        <textarea
          value={figmaInput}
          onChange={event => setFigmaInput(event.target.value)}
          rows={6}
          style={{
            width: '100%',
            borderRadius: '0.5rem',
            background: '#020617',
            border: '1px solid #1e293b',
            color: '#e2e8f0',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '0.72rem',
            padding: '0.5rem'
          }}
        />
      </label>
      )}
      <button
        onClick={handleCompare}
        disabled={status === 'loading'}
        style={{
          padding: '0.55rem',
          borderRadius: '0.5rem',
          border: 'none',
          background: '#2563eb',
          color: '#f8fafc',
          fontWeight: 600,
          cursor: status === 'loading' ? 'not-allowed' : 'pointer'
        }}
      >
        {status === 'loading' ? 'Comparing…' : 'Compare Current Tab'}
      </button>
      {error && (
        <div style={{ background: '#7f1d1d', padding: '0.5rem', borderRadius: '0.4rem', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}
      <section>
        <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.25rem 0' }}>Color summary</h2>
        {colorSummary.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Run a comparison to evaluate colors.</p>
        ) : (
          <div style={{ fontSize: '0.8rem' }}>
            <div>Checked colors: {colorSummary.length}</div>
            <div>Mismatches: {colorSummary.filter(result => result.status === 'mismatch').length}</div>
          </div>
        )}
      </section>
      <section>
        <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.25rem 0' }}>Results</h2>
        {results.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Run a comparison to see diffs.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '240px', overflowY: 'auto' }}>
            {(['mismatch', 'match'] as const).map(group => (
              <div key={group}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.2rem' }}>
                  {grouped[group].length} {group}
                </div>
                {grouped[group].length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: '#475569', margin: 0 }}>No {group} entries.</p>
                ) : (
                  grouped[group].map(entry => (
                    <div
                      key={`${entry.nodeId}-${entry.property}`}
                      style={{
                        border: '1px solid #1e293b',
                        padding: '0.4rem',
                        borderRadius: '0.4rem',
                        marginBottom: '0.35rem',
                        background: '#0b1120'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{entry.property}</span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.1rem 0.35rem',
                            borderRadius: '999px',
                            background: badgeColors[entry.status],
                            color: '#020617'
                          }}
                        >
                          {entry.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.7rem', display: 'grid', gap: '0.15rem' }}>
                        <div>Figma: {String(entry.figma ?? '—')}</div>
                        <div>Web: {String(entry.web ?? '—')}</div>
                        <div>Diff: {entry.diff}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
