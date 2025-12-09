import { ColorValues, ComparisonResult } from '../types.js';
import { colorDifference, normalizeColorValue } from '../utils/colorUtils.js';
import { buildResult, unionKeys } from '../utils/diffUtils.js';

const DEFAULT_COLOR_TOLERANCE = 2;

export function compareColors(
  nodeId: string,
  figma: ColorValues,
  web: ColorValues,
  tolerance: number = DEFAULT_COLOR_TOLERANCE
): ComparisonResult[] {
  const results: ComparisonResult[] = [];
  const keys = unionKeys(figma, web);

  keys.forEach(key => {
    const figmaValue = normalizeColorValue(figma[key]);
    const webValue = normalizeColorValue(web[key]);
    const diff = colorDifference(figmaValue, webValue);
    const safeDiff = Number.isFinite(diff) ? diff : Number.MAX_SAFE_INTEGER;
    results.push(
      buildResult({
        nodeId,
        property: `color:${key}`,
        figma: figmaValue,
        web: webValue,
        diff: safeDiff,
        tolerance
      })
    );
  });

  return results;
}
