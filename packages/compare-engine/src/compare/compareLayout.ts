import { ComparisonResult, LayoutValues } from '../types.js';
import { numericDiff } from '../utils/numberUtils.js';
import { buildResult } from '../utils/diffUtils.js';

const LAYOUT_PROPS: (keyof LayoutValues)[] = [
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'top',
  'left'
];

const DEFAULT_LAYOUT_TOLERANCE = 1.5;

export function compareLayout(
  nodeId: string,
  figma: LayoutValues,
  web: LayoutValues,
  tolerance: number = DEFAULT_LAYOUT_TOLERANCE
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  LAYOUT_PROPS.forEach(prop => {
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
        property: `layout:${prop}`,
        figma: figmaValue,
        web: webValue,
        diff: safeDiff,
        tolerance
      })
    );
  });

  return results;
}
