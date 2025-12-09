import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildComparisonReport, compareColors, ComparisonResult, NormalizedNode } from '@myapp/compare-engine';
import { GlobalComparisonPayload, StyleSystemSnapshot } from './lib/styleTypes';

type SectionKey = 'colors' | 'typography' | 'spacing' | 'radius' | 'shadows';

interface ComparisonSections {
  colors: ComparisonResult[];
  typography: ComparisonResult[];
  spacing: ComparisonResult[];
  radius: ComparisonResult[];
  shadows: ComparisonResult[];
}

interface ComparisonSummary {
  total: number;
  matches: number;
  mismatches: number;
  score: number;
}

const defaultState: ComparisonSections = {
  colors: [],
  typography: [],
  spacing: [],
  radius: [],
  shadows: []
};

const STORAGE_KEYS = {
  token: 'figmaToken',
  url: 'figmaUrl'
};

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

const requestGlobalStyles = (payload: GlobalComparisonPayload) =>
  new Promise<{ figmaStyles: StyleSystemSnapshot; webStyles: StyleSystemSnapshot }>((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'global-style-comparison', payload }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });

const buildBuckets = (results: ComparisonResult[]): ComparisonSections => {
  const sections: ComparisonSections = { ...defaultState, colors: [], typography: [], spacing: [], radius: [], shadows: [] };

  results.forEach(result => {
    if (result.property.startsWith('color:')) {
      sections.colors.push(result);
    } else if (
      result.property.startsWith('token:font') ||
      result.property.startsWith('token:font-size') ||
      result.property.startsWith('token:font-weight') ||
      result.property.startsWith('token:line-height')
    ) {
      sections.typography.push(result);
    } else if (result.property.startsWith('token:spacing')) {
      sections.spacing.push(result);
    } else if (result.property.startsWith('token:radius')) {
      sections.radius.push(result);
    } else if (result.property.startsWith('token:shadow')) {
      sections.shadows.push(result);
    }
  });

  return sections;
};

const buildSummary = (results: ComparisonResult[]): ComparisonSummary => {
  const matches = results.filter(result => result.status === 'match').length;
  const total = results.length;
  const mismatches = total - matches;
  const score = total ? Math.round((matches / total) * 100) : 100;
  return { total, matches, mismatches, score };
};

const Popup = () => {
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaToken, setFigmaToken] = useState('');
  const [rememberToken, setRememberToken] = useState(false);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [sections, setSections] = useState<ComparisonSections>(defaultState);
  const [summary, setSummary] = useState<ComparisonSummary>({ total: 0, matches: 0, mismatches: 0, score: 0 });
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chrome?.storage?.sync) return;
    chrome.storage.sync.get([STORAGE_KEYS.token, STORAGE_KEYS.url], data => {
      if (data[STORAGE_KEYS.url]) {
        setFigmaUrl(data[STORAGE_KEYS.url]);
      }
      if (data[STORAGE_KEYS.token]) {
        setFigmaToken(data[STORAGE_KEYS.token]);
        setRememberToken(true);
      }
    });
  }, []);

  const savePreferences = (url: string, token: string, remember: boolean) => {
    if (!chrome?.storage?.sync) return;
    const payload: Record<string, string> = {};
    if (url) payload[STORAGE_KEYS.url] = url;
    if (remember && token) {
      payload[STORAGE_KEYS.token] = token;
    } else {
      chrome.storage.sync.remove(STORAGE_KEYS.token);
    }
    chrome.storage.sync.set(payload);
  };

  const filteredSections = useMemo(() => sections, [sections]);

  const handleCompare = async () => {
    setStatus('loading');
    setError(null);
    try {
      if (!figmaUrl.trim()) {
        throw new Error('Enter a Figma file or frame URL.');
      }

      const token = figmaToken.trim();
      const { figmaStyles, webStyles } = await requestGlobalStyles({
        figmaUrl: figmaUrl.trim(),
        figmaToken: token || undefined
      });

      savePreferences(figmaUrl.trim(), token, rememberToken);

      const figmaNode = snapshotToNode(figmaStyles, 'figma');
      const webNode = snapshotToNode(webStyles, 'web');

      const comparison = buildComparisonReport([figmaNode], [webNode], { normalizeInput: false });

      // Augment with color similarity coverage between systems to capture unique cases
      const colorOnly = compareColors('global-color', figmaNode.styles.colors, webNode.styles.colors);
      const combinedResults = [...comparison, ...colorOnly];

      setResults(combinedResults);
      setSections(buildBuckets(combinedResults));
      setSummary(buildSummary(combinedResults));
      setStatus('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to complete comparison.';
      setError(message);
      setStatus('error');
    }
  };

  const renderSection = (key: SectionKey, title: string) => {
    const entries = filteredSections[key];
    const mismatches = entries.filter(entry => entry.status === 'mismatch');
    return (
      <section key={key} style={{ border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{title}</h3>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {entries.length - mismatches.length} / {entries.length} match
          </span>
        </header>
        {entries.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0 }}>No data found for this category.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
            {entries.map(entry => (
              <div
                key={`${entry.property}-${entry.nodeId}`}
                style={{
                  borderRadius: '0.35rem',
                  border: '1px solid #1e293b',
                  padding: '0.5rem',
                  background: entry.status === 'match' ? '#0f172a' : '#2f1c1c'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', fontSize: '0.8rem' }}>
                  <strong>{entry.property}</strong>
                  <span style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: entry.status === 'match' ? '#22c55e' : '#f97316' }}>
                    {entry.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#cbd5f5' }}>
                  <div>Design: {String(entry.figma ?? '—')}</div>
                  <div>Web: {String(entry.web ?? '—')}</div>
                  <div>Diff: {Number.isFinite(entry.diff) ? Number(entry.diff).toFixed(2) : entry.diff}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header>
        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Global Style Compare</h1>
        <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: '#94a3b8' }}>
          Paste a Figma file or frame URL and compare its design tokens against the current page.
        </p>
      </header>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
        Figma URL
        <input
          type="url"
          value={figmaUrl}
          onChange={event => setFigmaUrl(event.target.value)}
          placeholder="https://www.figma.com/file/..."
          style={{
            borderRadius: '0.5rem',
            border: '1px solid #1e293b',
            background: '#020617',
            color: '#e2e8f0',
            padding: '0.5rem'
          }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
          <span>Figma Personal Access Token</span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>(optional)</span>
        </span>
        <input
          type="password"
          value={figmaToken}
          onChange={event => setFigmaToken(event.target.value)}
          placeholder="figd_xxx"
          style={{
            borderRadius: '0.5rem',
            border: '1px solid #1e293b',
            background: '#020617',
            color: '#e2e8f0',
            padding: '0.5rem'
          }}
        />
        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
          The backend prefers MCP/REST connections automatically. Add a PAT only if your server asks for one.
        </span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
        <input
          type="checkbox"
          checked={rememberToken}
          onChange={event => setRememberToken(event.target.checked)}
        />
        Remember token on this device
      </label>
      <button
        onClick={handleCompare}
        disabled={status === 'loading'}
        style={{
          padding: '0.65rem',
          borderRadius: '0.5rem',
          border: 'none',
          background: '#2563eb',
          color: '#f8fafc',
          fontWeight: 600,
          cursor: status === 'loading' ? 'not-allowed' : 'pointer'
        }}
      >
        {status === 'loading' ? 'Analyzing…' : 'Compare Style Systems'}
      </button>
      {error && (
        <div style={{ background: '#7f1d1d', padding: '0.6rem', borderRadius: '0.5rem', color: '#fecdd3', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}
      {summary.total > 0 && (
        <section style={{ border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem' }}>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Summary</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <div>
              <div>Score</div>
              <strong>{summary.score}%</strong>
            </div>
            <div>
              <div>Matches</div>
              <strong>{summary.matches}</strong>
            </div>
            <div>
              <div>Mismatches</div>
              <strong>{summary.mismatches}</strong>
            </div>
            <div>
              <div>Total Checks</div>
              <strong>{summary.total}</strong>
            </div>
          </div>
        </section>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {renderSection('colors', 'Colors')}
        {renderSection('typography', 'Typography')}
        {renderSection('spacing', 'Spacing & Gaps')}
        {renderSection('radius', 'Radius')}
        {renderSection('shadows', 'Shadows')}
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
