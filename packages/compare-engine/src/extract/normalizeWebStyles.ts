import {
  NormalizedNode,
  NormalizedNodeStyles,
  NormalizationOptions,
  RawWebNode,
  TypographyValues,
  SpacingValues,
  RadiusValues,
  LayoutValues,
  NormalizedShadow
} from '../types.js';
import { normalizeColorValue } from '../utils/colorUtils.js';
import { parseUnitValue, roundTo } from '../utils/numberUtils.js';
import { parseShadowString } from '../utils/shadowUtils.js';

type TypographyNumericKey = 'fontSize' | 'lineHeight' | 'letterSpacing';

const createEmptyStyles = (): NormalizedNodeStyles => ({
  colors: {},
  typography: {},
  spacing: {},
  radius: {},
  shadows: {},
  layout: {},
  tokens: {}
});

const camelize = (value: string) => value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

const readStyleValue = (styles: Record<string, string | number>, prop: string): string | number | undefined => {
  return styles[prop] ?? styles[camelize(prop)];
};

const normalizeTypography = (
  styles: Record<string, string | number>,
  baseFontSize: number
): TypographyValues => {
  const typography: TypographyValues = {};
  const fontFamily = readStyleValue(styles, 'font-family');
  if (typeof fontFamily === 'string' && fontFamily.trim()) {
    typography.fontFamily = fontFamily.replace(/"/g, '').trim();
  }
  const textTransform = readStyleValue(styles, 'text-transform');
  if (typeof textTransform === 'string') {
    typography.textTransform = textTransform.toLowerCase();
  }

  const mapNumeric = (prop: string, target: TypographyNumericKey) => {
    const rawValue = readStyleValue(styles, prop);
    const parsed = parseUnitValue(rawValue as string | number | undefined, { baseFontSize });
    if (parsed !== null) {
      typography[target] = roundTo(parsed, 4);
    }
  };

  mapNumeric('font-size', 'fontSize');
  mapNumeric('line-height', 'lineHeight');
  mapNumeric('letter-spacing', 'letterSpacing');
  const weight = readStyleValue(styles, 'font-weight');
  const parsedWeight = parseUnitValue(weight as string | number | undefined, { baseFontSize });
  if (parsedWeight !== null) {
    typography.fontWeight = roundTo(parsedWeight, 2);
  }

  return typography;
};

const normalizeSpacing = (
  styles: Record<string, string | number>,
  baseFontSize: number
): SpacingValues => {
  const spacing: SpacingValues = {};
  const spacingProps: Array<{ css: string; key: keyof SpacingValues }> = [
    { css: 'padding-top', key: 'paddingTop' },
    { css: 'padding-right', key: 'paddingRight' },
    { css: 'padding-bottom', key: 'paddingBottom' },
    { css: 'padding-left', key: 'paddingLeft' },
    { css: 'margin-top', key: 'marginTop' },
    { css: 'margin-right', key: 'marginRight' },
    { css: 'margin-bottom', key: 'marginBottom' },
    { css: 'margin-left', key: 'marginLeft' },
    { css: 'gap', key: 'gap' },
    { css: 'row-gap', key: 'gap' },
    { css: 'column-gap', key: 'gap' }
  ];

  spacingProps.forEach(({ css, key }) => {
    const rawValue = readStyleValue(styles, css);
    const parsed = parseUnitValue(rawValue as string | number | undefined, { baseFontSize });
    if (parsed !== null) {
      spacing[key] = roundTo(parsed, 4);
    }
  });

  return spacing;
};

const normalizeRadius = (
  styles: Record<string, string | number>,
  baseFontSize: number
): RadiusValues => {
  const radius: RadiusValues = {};
  const radiusProps: Array<{ css: string; key: keyof RadiusValues }> = [
    { css: 'border-radius', key: 'borderRadius' },
    { css: 'border-top-left-radius', key: 'borderTopLeftRadius' },
    { css: 'border-top-right-radius', key: 'borderTopRightRadius' },
    { css: 'border-bottom-left-radius', key: 'borderBottomLeftRadius' },
    { css: 'border-bottom-right-radius', key: 'borderBottomRightRadius' }
  ];

  radiusProps.forEach(({ css, key }) => {
    const rawValue = readStyleValue(styles, css);
    const parsed = parseUnitValue(rawValue as string | number | undefined, { baseFontSize });
    if (parsed !== null) {
      radius[key] = roundTo(parsed, 4);
    }
  });

  return radius;
};

const normalizeLayout = (
  styles: Record<string, string | number>,
  baseFontSize: number
): LayoutValues => {
  const layout: LayoutValues = {};
  const layoutProps: Array<{ css: string; key: keyof LayoutValues }> = [
    { css: 'width', key: 'width' },
    { css: 'height', key: 'height' },
    { css: 'min-width', key: 'minWidth' },
    { css: 'min-height', key: 'minHeight' },
    { css: 'max-width', key: 'maxWidth' },
    { css: 'max-height', key: 'maxHeight' },
    { css: 'top', key: 'top' },
    { css: 'left', key: 'left' }
  ];

  layoutProps.forEach(({ css, key }) => {
    const rawValue = readStyleValue(styles, css);
    const parsed = parseUnitValue(rawValue as string | number | undefined, { baseFontSize });
    if (parsed !== null) {
      layout[key] = roundTo(parsed, 4);
    }
  });

  return layout;
};

const normalizeShadows = (
  styles: Record<string, string | number>,
  baseFontSize: number
): Record<string, NormalizedShadow[]> => {
  const shadows: Record<string, NormalizedShadow[]> = {};
  const boxShadow = readStyleValue(styles, 'box-shadow');
  if (typeof boxShadow === 'string' && boxShadow.trim() && boxShadow !== 'none') {
    const layers = boxShadow.split(',').map(layer => layer.trim());
    const normalizedLayers = layers
      .map(layer => parseShadowString(layer, baseFontSize))
      .filter((layer): layer is NonNullable<ReturnType<typeof parseShadowString>> => !!layer);
    if (normalizedLayers.length > 0) {
      shadows.boxShadow = normalizedLayers;
    }
  }
  return shadows;
};

const normalizeColors = (styles: Record<string, string | number>): Record<string, string> => {
  const colors: Record<string, string> = {};
  const colorProps: Record<string, string> = {
    color: 'text',
    'background-color': 'background',
    'border-color': 'border',
    'border-top-color': 'borderTop',
    'border-right-color': 'borderRight',
    'border-bottom-color': 'borderBottom',
    'border-left-color': 'borderLeft'
  };

  Object.entries(colorProps).forEach(([cssProp, key]) => {
    const rawValue = readStyleValue(styles, cssProp);
    const normalized = normalizeColorValue(rawValue as string | undefined);
    if (normalized) {
      colors[key] = normalized;
    }
  });

  return colors;
};

const extractTokens = (styles: Record<string, string | number>): Record<string, string | number> => {
  const tokens: Record<string, string | number> = {};
  Object.entries(styles).forEach(([key, value]) => {
    if (key.startsWith('--')) {
      tokens[key] = value;
    }
  });
  return tokens;
};

export const normalizeWebStyles = (
  nodes: RawWebNode[],
  options: NormalizationOptions = {}
): NormalizedNode[] => {
  const baseFontSize = options.baseFontSize ?? 16;

  return nodes.map(node => {
    const styles = createEmptyStyles();
    const computed = node.computedStyles ?? {};

    styles.colors = normalizeColors(computed);
    styles.typography = normalizeTypography(computed, baseFontSize);
    styles.spacing = normalizeSpacing(computed, baseFontSize);
    styles.radius = normalizeRadius(computed, baseFontSize);
    styles.layout = normalizeLayout(computed, baseFontSize);
    styles.shadows = normalizeShadows(computed, baseFontSize);
    styles.tokens = { ...extractTokens(computed), ...(node.tokens ?? {}) };

    return {
      nodeId: node.nodeId,
      name: node.name,
      selector: node.selector,
      styles
    };
  });
};
