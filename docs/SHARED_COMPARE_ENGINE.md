# Shared Compare Engine Rollout

## 1. Folder structure
```text
my-product/
├─ pnpm-workspace.yaml
├─ package.json
├─ tsconfig.base.json
├─ packages/
│  └─ compare-engine/
│     ├─ package.json
│     ├─ tsconfig.json
│     ├─ src/
│     │  ├─ index.ts
│     │  ├─ types.ts
│     │  ├─ compare/
│     │  │  ├─ compareColors.ts
│     │  │  ├─ compareTypography.ts
│     │  │  ├─ compareSpacing.ts
│     │  │  ├─ compareRadius.ts
│     │  │  ├─ compareShadows.ts
│     │  │  └─ compareLayout.ts
│     │  ├─ extract/
│     │  │  ├─ normalizeFigma.ts
│     │  │  └─ normalizeWebStyles.ts
│     │  └─ utils/
│     │     ├─ colorUtils.ts
│     │     ├─ numberUtils.ts
│     │     ├─ diffUtils.ts
│     │     └─ shadowUtils.ts
│     └─ dist/ (tsc build output)
└─ apps/
   ├─ saas-backend/
   │  ├─ package.json
   │  ├─ src/…
   │  └─ server.js
   ├─ saas-frontend/
   │  └─ package.json + Vite app
   └─ chrome-extension/
      ├─ package.json
      ├─ manifest.json
      ├─ popup.html
      └─ src/
         ├─ popup.tsx
         ├─ background.ts
         └─ contentScript.ts
```

## 2. `packages/compare-engine/package.json`
```json
{
  "name": "@myapp/compare-engine",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --sourcemap --clean",
    "lint": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.6.3"
  }
}
```

## 3. `packages/compare-engine/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Node",
    "declaration": true,
    "emitDeclarationOnly": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

## 4. Comparison function implementations
Each function lives under `packages/compare-engine/src/compare`. Full source is included below for quick reference.

### `compareColors.ts`
```ts
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
```

### `compareTypography.ts`
```ts
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
```

### `compareSpacing.ts`
```ts
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
```

### `compareRadius.ts`
```ts
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
```

### `compareShadows.ts`
```ts
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
```

### `compareLayout.ts`
```ts
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
```

## 5. SaaS backend usage example
`apps/saas-backend/src/compare/comparisonEngine.js` now relies on the shared package:
```js
import { buildComparisonReport, compareColors } from '@myapp/compare-engine';

async compareProperties(figmaComponent, webElement, options = {}) {
  const figmaNode = this.buildSharedFigmaNode(figmaComponent);
  const webNode = this.buildSharedWebNode(figmaComponent, webElement);
  const sharedResults = buildComparisonReport([figmaNode], [webNode], {
    tolerance: this.mapToleranceToSharedConfig(),
    baseFontSize: this.config?.comparison?.baseFontSize,
    normalizeInput: true
  });
  const translated = this.translateSharedResults(sharedResults);
  // accessibility + reporting logic follows…
}
```
Color similarity during target matching also uses the shared color comparator:
```js
const colorComparisons = compareColors(
  figmaComponent.id || 'temp-node',
  { background: figmaColor },
  { background: webElement.styles.backgroundColor },
  this.thresholds.colorDifference
);
```

## 6. Chrome extension usage example
`apps/chrome-extension/src/popup.tsx` imports the shared engine for browser-side diffing:
```tsx
import {
  buildComparisonReport,
  normalizeFigmaData,
  normalizeWebStyles,
  compareColors
} from '@myapp/compare-engine';

const handleCompare = async () => {
  const parsed = JSON.parse(figmaInput) as RawFigmaNode[];
  const webNodes = await requestWebNodes();
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
};
```

## 7. Build instructions
1. Install workspace dependencies (pnpm recommended):
   ```bash
   pnpm install
   ```
2. Build the shared engine:
   ```bash
   pnpm --filter @myapp/compare-engine run build
   ```
3. Bundle the Chrome extension (outputs to `apps/chrome-extension/dist`):
   ```bash
   pnpm --filter @myapp/chrome-extension run build
   ```
4. Backend scripts continue to run from `apps/saas-backend` (`pnpm --filter @myapp/saas-backend run dev`).

## 8. Import examples
Node.js / backend:
```js
import { compareColors, buildComparisonReport } from '@myapp/compare-engine';
```
Browser / bundler (React popup):
```ts
import { buildComparisonReport } from '@myapp/compare-engine';
```
In both environments the package resolves through the workspace alias (`workspace:*`).

## 9. Validation tests
- Type safety: `../../apps/saas-backend/node_modules/.bin/tsc -p packages/compare-engine/tsconfig.json`
- Bundle integrity: `pnpm --filter @myapp/compare-engine run build`
- Chrome extension smoke-test: `pnpm --filter @myapp/chrome-extension run build` and load the `dist/` folder in Chrome's extension manager.
