const UNIT_REGEX = /^(-?\d*\.?\d+)(px|rem|em|%)?$/i;

export interface ParseUnitOptions {
  baseFontSize?: number;
}

export function parseUnitValue(value?: string | number | null, options: ParseUnitOptions = {}): number | null {
  if (value === undefined || value === null) return null;
  const baseFontSize = options.baseFontSize ?? 16;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(UNIT_REGEX);
  if (!match) {
    return null;
  }

  const numeric = parseFloat(match[1]);
  const unit = match[2]?.toLowerCase();

  switch (unit) {
    case 'rem':
      return numeric * baseFontSize;
    case 'em':
      return numeric * baseFontSize;
    case '%':
      return (numeric / 100) * baseFontSize;
    default:
      return numeric;
  }
}

export function roundTo(value: number, precision = 3): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export function numericDiff(a: number | null, b: number | null): number {
  if (a === null || b === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(a - b);
}

export function normalizeNumericRecord(
  record: Record<string, string | number | undefined>,
  options: ParseUnitOptions = {}
): Record<string, number> {
  const normalized: Record<string, number> = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    const parsed = parseUnitValue(value ?? null, options);
    if (parsed !== null) {
      normalized[key] = roundTo(parsed, 4);
    }
  });
  return normalized;
}
