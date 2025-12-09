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

const Popup = () => {
  const [figmaInput, setFigmaInput] = useState(() => JSON.stringify(defaultFigmaNodes, null, 2));
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [colorSummary, setColorSummary] = useState<ComparisonResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
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
        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Shared Compare Engine</h1>
        <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: '#94a3b8' }}>
          Paste Figma nodes JSON and compare against the active tab.
        </p>
      </header>
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
