import { normalizeFigmaData } from './extract/normalizeFigma.js';
import { normalizeWebStyles } from './extract/normalizeWebStyles.js';
import { compareColors } from './compare/compareColors.js';
import { compareTypography } from './compare/compareTypography.js';
import { compareSpacing } from './compare/compareSpacing.js';
import { compareRadius } from './compare/compareRadius.js';
import { compareShadows } from './compare/compareShadows.js';
import { compareLayout } from './compare/compareLayout.js';
import {
  ComparisonResult,
  ComparisonOptions,
  NormalizationOptions,
  NormalizedNode,
  RawFigmaNode,
  RawWebNode
} from './types.js';
import { buildResult, unionKeys } from './utils/diffUtils.js';

export * from './types.js';
export {
  normalizeFigmaData,
  normalizeWebStyles,
  compareColors,
  compareTypography,
  compareSpacing,
  compareRadius,
  compareShadows,
  compareLayout
};

export interface BuildComparisonOptions extends ComparisonOptions, NormalizationOptions {
  normalizeInput?: boolean;
}

const compareTokens = (
  nodeId: string,
  figma: Record<string, string | number>,
  web: Record<string, string | number>
): ComparisonResult[] => {
  const results: ComparisonResult[] = [];
  const keys = unionKeys(figma, web);
  keys.forEach(key => {
    const figmaValue = figma[key] ?? null;
    const webValue = web[key] ?? null;
    if (figmaValue === null && webValue === null) {
      return;
    }
    const diff = figmaValue === webValue ? 0 : 100;
    results.push(
      buildResult({
        nodeId,
        property: `token:${key}`,
        figma: figmaValue,
        web: webValue,
        diff,
        tolerance: 0
      })
    );
  });
  return results;
};

const DEFAULT_TOLERANCE = {
  color: 2,
  typography: 0.8,
  spacing: 1,
  radius: 0.8,
  shadows: 3,
  layout: 1.5
};

export const buildComparisonReport = (
  figmaInput: RawFigmaNode[] | NormalizedNode[],
  webInput: RawWebNode[] | NormalizedNode[],
  options: BuildComparisonOptions = {}
): ComparisonResult[] => {
  const shouldNormalize = options.normalizeInput !== false;
  const figmaNodes = shouldNormalize
    ? normalizeFigmaData(figmaInput as RawFigmaNode[], options)
    : (figmaInput as NormalizedNode[]);
  const webNodes = shouldNormalize
    ? normalizeWebStyles(webInput as RawWebNode[], options)
    : (webInput as NormalizedNode[]);

  const tolerances = { ...DEFAULT_TOLERANCE, ...(options.tolerance ?? {}) };
  const webMap = new Map<string, NormalizedNode>();
  webNodes.forEach(node => webMap.set(node.nodeId, node));

  const results: ComparisonResult[] = [];

  figmaNodes.forEach(figmaNode => {
    const webNode = webMap.get(figmaNode.nodeId);
    if (!webNode) {
      results.push(
        buildResult({
          nodeId: figmaNode.nodeId,
          property: 'node',
          figma: 'present',
          web: null,
          diff: Number.MAX_SAFE_INTEGER,
          tolerance: 0
        })
      );
      return;
    }

    results.push(
      ...compareColors(figmaNode.nodeId, figmaNode.styles.colors, webNode.styles.colors, tolerances.color),
      ...compareTypography(figmaNode.nodeId, figmaNode.styles.typography, webNode.styles.typography, tolerances.typography),
      ...compareSpacing(figmaNode.nodeId, figmaNode.styles.spacing, webNode.styles.spacing, tolerances.spacing),
      ...compareRadius(figmaNode.nodeId, figmaNode.styles.radius, webNode.styles.radius, tolerances.radius),
      ...compareShadows(figmaNode.nodeId, figmaNode.styles.shadows, webNode.styles.shadows, tolerances.shadows),
      ...compareLayout(figmaNode.nodeId, figmaNode.styles.layout, webNode.styles.layout, tolerances.layout),
      ...compareTokens(figmaNode.nodeId, figmaNode.styles.tokens, webNode.styles.tokens)
    );
  });

  return results;
};
