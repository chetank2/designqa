import { ComparisonResult, NormalizedShadow, ShadowValues } from '../types.js';
import { colorDifference } from '../utils/colorUtils.js';
import { buildResult, unionKeys } from '../utils/diffUtils.js';
import { formatShadow } from '../utils/shadowUtils.js';

const DEFAULT_SHADOW_TOLERANCE = 3;

const computeShadowDiff = (figma?: NormalizedShadow, web?: NormalizedShadow): number => {
  if (!figma && !web) return 0;
  if (!figma || !web) return Number.MAX_SAFE_INTEGER;
  const positionDiff =
    Math.abs(figma.x - web.x) +
    Math.abs(figma.y - web.y) +
    Math.abs(figma.blur - web.blur) +
    Math.abs(figma.spread - web.spread);
  const colorDiff = colorDifference(figma.color, web.color);
  return positionDiff + colorDiff;
};

export function compareShadows(
  nodeId: string,
  figma: ShadowValues,
  web: ShadowValues,
  tolerance: number = DEFAULT_SHADOW_TOLERANCE
): ComparisonResult[] {
  const results: ComparisonResult[] = [];
  const keys = unionKeys(figma, web);

  keys.forEach(key => {
    const figmaLayers = figma[key] ?? [];
    const webLayers = web[key] ?? [];
    const maxLayers = Math.max(figmaLayers.length, webLayers.length);

    if (maxLayers === 0) {
      return;
    }

    for (let idx = 0; idx < maxLayers; idx += 1) {
      const diff = computeShadowDiff(figmaLayers[idx], webLayers[idx]);
      const safeDiff = Number.isFinite(diff) ? diff : Number.MAX_SAFE_INTEGER;
      results.push(
        buildResult({
          nodeId,
          property: `shadows:${key}:${idx}`,
          figma: formatShadow(figmaLayers[idx]),
          web: formatShadow(webLayers[idx]),
          diff: safeDiff,
          tolerance
        })
      );
    }
  });

  return results;
}
