import { ComparisonResult, SpacingValues } from '../types.js';
import { numericDiff } from '../utils/numberUtils.js';
import { buildResult } from '../utils/diffUtils.js';

const SPACING_PROPS: (keyof SpacingValues)[] = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'gap'
];

const DEFAULT_SPACING_TOLERANCE = 1;

export function compareSpacing(
  nodeId: string,
  figma: SpacingValues,
  web: SpacingValues,
  tolerance: number = DEFAULT_SPACING_TOLERANCE
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  SPACING_PROPS.forEach(prop => {
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
        property: `spacing:${prop}`,
        figma: figmaValue,
        web: webValue,
        diff: safeDiff,
        tolerance
      })
    );
  });

  return results;
}
