import { ComparisonResult, RadiusValues } from '../types.js';
import { numericDiff } from '../utils/numberUtils.js';
import { buildResult } from '../utils/diffUtils.js';

const RADIUS_PROPS: (keyof RadiusValues)[] = [
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius'
];

const DEFAULT_RADIUS_TOLERANCE = 0.8;

export function compareRadius(
  nodeId: string,
  figma: RadiusValues,
  web: RadiusValues,
  tolerance: number = DEFAULT_RADIUS_TOLERANCE
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  RADIUS_PROPS.forEach(prop => {
    const figmaValue = figma[prop] ?? null;
    const webValue = web[prop] ?? null;
    if (figmaValue === null && webValue === null) {
      return;
    }
    const diff = numericDiff(figmaValue, webValue);
    const safeDiff = Number.isFinite(diff) ? diff : Number.MAX_SAFE_INTEGER;
    results.push(
      buildResult({
        nodeId,
        property: `radius:${prop}`,
        figma: figmaValue,
        web: webValue,
        diff: safeDiff,
        tolerance
      })
    );
  });

  return results;
}
