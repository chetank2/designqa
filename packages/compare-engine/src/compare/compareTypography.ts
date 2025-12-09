import { ComparisonResult, TypographyValues } from '../types.js';
import { numericDiff } from '../utils/numberUtils.js';
import { buildResult } from '../utils/diffUtils.js';

const NUMERIC_PROPS: (keyof TypographyValues)[] = ['fontSize', 'lineHeight', 'letterSpacing', 'fontWeight'];
const STRING_PROPS: (keyof TypographyValues)[] = ['fontFamily', 'textTransform'];
const DEFAULT_TYPOGRAPHY_TOLERANCE = 0.8;

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'bold') return 700;
    if (value.toLowerCase() === 'normal') return 400;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function compareTypography(
  nodeId: string,
  figma: TypographyValues,
  web: TypographyValues,
  tolerance: number = DEFAULT_TYPOGRAPHY_TOLERANCE
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  NUMERIC_PROPS.forEach(prop => {
    const figmaValue = coerceNumber(figma[prop] ?? null);
    const webValue = coerceNumber(web[prop] ?? null);
    if (figmaValue === null && webValue === null) {
      return;
    }
    const diff = numericDiff(figmaValue, webValue);
    const safeDiff = Number.isFinite(diff) ? diff : Number.MAX_SAFE_INTEGER;
    results.push(
      buildResult({
        nodeId,
        property: `typography:${prop}`,
        figma: figmaValue,
        web: webValue,
        diff: safeDiff,
        tolerance
      })
    );
  });

  STRING_PROPS.forEach(prop => {
    const figmaValue = figma[prop] ?? null;
    const webValue = web[prop] ?? null;
    if (!figmaValue && !webValue) {
      return;
    }
    const figmaText = typeof figmaValue === 'string' ? figmaValue : String(figmaValue ?? '');
    const webText = typeof webValue === 'string' ? webValue : String(webValue ?? '');
    if (!figmaText && !webText) {
      return;
    }
    const diff = figmaText.toLowerCase() === webText.toLowerCase() ? 0 : 100;
    results.push(
      buildResult({
        nodeId,
        property: `typography:${prop}`,
        figma: figmaValue ?? null,
        web: webValue ?? null,
        diff,
        tolerance: 0
      })
    );
  });

  return results;
}
