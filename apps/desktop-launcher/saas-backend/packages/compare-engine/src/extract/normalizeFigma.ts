import {
  NormalizedNode,
  NormalizedNodeStyles,
  NormalizationOptions,
  RawFigmaNode,
  RawShadowInput,
  TypographyValues,
  SpacingValues,
  RadiusValues,
  LayoutValues,
  NormalizedShadow
} from '../types.js';
import { normalizeColorRecord, normalizeColorValue, parseColor } from '../utils/colorUtils.js';
import { normalizeNumericRecord, parseUnitValue, roundTo } from '../utils/numberUtils.js';
import { parseShadowString } from '../utils/shadowUtils.js';

const createEmptyStyles = (): NormalizedNodeStyles => ({
  colors: {},
  typography: {},
  spacing: {},
  radius: {},
  shadows: {},
  layout: {},
  tokens: {}
});

const normalizeTypography = (
  values: Partial<TypographyValues> | undefined,
  baseFontSize: number
): TypographyValues => {
  const typography: TypographyValues = {};
  if (!values) return typography;

  if (values.fontFamily) {
    typography.fontFamily = values.fontFamily;
  }
  if (values.textTransform) {
    typography.textTransform = values.textTransform.toLowerCase();
  }

  const numericFields: Array<'fontSize' | 'lineHeight' | 'letterSpacing' | 'fontWeight'> = ['fontSize', 'lineHeight', 'letterSpacing', 'fontWeight'];
  numericFields.forEach(field => {
    const rawValue = values[field];
    if (rawValue === undefined || rawValue === null) return;
    const parsed = parseUnitValue(rawValue as string | number, { baseFontSize });
    if (parsed !== null) {
      typography[field] = roundTo(parsed, 4);
    }
  });

  return typography;
};

const normalizeSpacing = (
  values: Partial<Record<keyof SpacingValues, string | number>> | undefined,
  baseFontSize: number
): SpacingValues => {
  if (!values) return {};
  return normalizeNumericRecord(values as Record<string, string | number>, { baseFontSize }) as SpacingValues;
};

const normalizeRadius = (
  values: Partial<Record<keyof RadiusValues, string | number>> | undefined,
  baseFontSize: number
): RadiusValues => {
  if (!values) return {};
  return normalizeNumericRecord(values as Record<string, string | number>, { baseFontSize }) as RadiusValues;
};

const normalizeLayout = (
  values: Partial<Record<keyof LayoutValues, string | number>> | undefined,
  baseFontSize: number
): LayoutValues => {
  if (!values) return {};
  return normalizeNumericRecord(values as Record<string, string | number>, { baseFontSize }) as LayoutValues;
};

const normalizeShadowInput = (
  value: RawShadowInput | string,
  baseFontSize: number
): NormalizedShadow | null => {
  if (typeof value === 'string') {
    return parseShadowString(value, baseFontSize);
  }
  const x = parseUnitValue(value.offsetX, { baseFontSize });
  const y = parseUnitValue(value.offsetY, { baseFontSize });
  const blur = parseUnitValue(value.blurRadius, { baseFontSize }) ?? 0;
  const spread = parseUnitValue(value.spreadRadius ?? 0, { baseFontSize }) ?? 0;
  if (x === null || y === null) {
    return null;
  }
  const color = normalizeColorValue(value.color) ?? 'rgba(0, 0, 0, 1)';
  const parsed = parseColor(color);
  return {
    x,
    y,
    blur,
    spread,
    color,
    alpha: parsed?.a ?? 1
  };
};

const normalizeShadows = (
  value: Record<string, RawShadowInput[] | RawShadowInput | string> | undefined,
  baseFontSize: number
): Record<string, NormalizedShadow[]> => {
  const result: Record<string, NormalizedShadow[]> = {};
  if (!value) return result;

  Object.entries(value as Record<string, RawShadowInput[] | string | RawShadowInput>).forEach(([key, shadowValue]) => {
    const entries = Array.isArray(shadowValue) ? shadowValue : [shadowValue];
    const normalizedLayers = entries
      .map(layer => normalizeShadowInput(layer, baseFontSize))
      .filter((layer): layer is NormalizedShadow => layer !== null);
    if (normalizedLayers.length > 0) {
      result[key] = normalizedLayers;
    }
  });

  return result;
};

export const normalizeFigmaData = (
  nodes: RawFigmaNode[],
  options: NormalizationOptions = {}
): NormalizedNode[] => {
  const baseFontSize = options.baseFontSize ?? 16;

  return nodes.map(node => {
    const styles = createEmptyStyles();
    const rawStyles = node.styles ?? {};

    if (rawStyles.colors) {
      styles.colors = normalizeColorRecord(rawStyles.colors as Record<string, any>);
    }
    styles.typography = normalizeTypography(rawStyles.typography as TypographyValues | undefined, baseFontSize);
    styles.spacing = normalizeSpacing(rawStyles.spacing as Record<string, string | number> | undefined, baseFontSize);
    styles.radius = normalizeRadius(rawStyles.radius as Record<string, string | number> | undefined, baseFontSize);
    styles.layout = normalizeLayout(rawStyles.layout as Record<string, string | number> | undefined, baseFontSize);
    styles.shadows = normalizeShadows(rawStyles.shadows as Record<string, RawShadowInput[] | RawShadowInput | string> | undefined, baseFontSize);
    styles.tokens = { ...(rawStyles.tokens ?? {}) };

    return {
      nodeId: node.nodeId,
      name: node.name,
      selector: node.selector,
      styles
    };
  });
};
