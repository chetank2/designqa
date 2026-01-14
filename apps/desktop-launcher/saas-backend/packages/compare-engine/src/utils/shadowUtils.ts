import { NormalizedShadow } from '../types.js';
import { normalizeColorValue, parseColor } from './colorUtils.js';
import { parseUnitValue } from './numberUtils.js';

const SHADOW_COLOR_REGEX = /(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8})/i;

export const parseShadowString = (value: string, baseFontSize: number): NormalizedShadow | null => {
  if (!value) return null;
  const trimmed = value.replace(/inset/gi, '').trim();
  const colorMatch = trimmed.match(SHADOW_COLOR_REGEX);
  const color = colorMatch ? colorMatch[1] : undefined;
  const numericPortion = color ? trimmed.replace(color, '').trim() : trimmed;
  const parts = numericPortion.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const [offsetX, offsetY, blurRadius, spreadRadius] = parts;
  const x = parseUnitValue(offsetX, { baseFontSize });
  const y = parseUnitValue(offsetY, { baseFontSize });
  if (x === null || y === null) {
    return null;
  }
  const blur = parseUnitValue(blurRadius, { baseFontSize }) ?? 0;
  const spread = parseUnitValue(spreadRadius, { baseFontSize }) ?? 0;
  const normalizedColor = normalizeColorValue(color ?? '#000') ?? 'rgba(0, 0, 0, 1)';
  const parsedColor = parseColor(normalizedColor);
  return {
    x,
    y,
    blur,
    spread,
    color: normalizedColor,
    alpha: parsedColor?.a ?? 1
  };
};

export const formatShadow = (shadow?: NormalizedShadow): string | null => {
  if (!shadow) return null;
  return `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`;
};
