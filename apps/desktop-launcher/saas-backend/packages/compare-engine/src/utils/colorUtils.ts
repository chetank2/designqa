import { ColorInput } from '../types.js';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

type ColorObject = Extract<ColorInput, { r: number; g: number; b: number; a?: number }>;

const HEX_REGEX = /^#([0-9a-f]{3,8})$/i;
const RGB_REGEX = /^rgba?\((.+)\)$/i;
const HSL_REGEX = /^hsla?\((.+)\)$/i;

const clampChannel = (value: number) => Math.max(0, Math.min(255, value));

const normalizeChannel = (value: number) => (value <= 1 ? value * 255 : value);

function fromObject(color: ColorObject): RGBA {
  const r = clampChannel(normalizeChannel(color.r));
  const g = clampChannel(normalizeChannel(color.g));
  const b = clampChannel(normalizeChannel(color.b));
  const a = color.a === undefined ? 1 : Math.max(0, Math.min(1, color.a));
  return { r, g, b, a };
}

function parseHexColor(value: string): RGBA | null {
  const match = value.match(HEX_REGEX);
  if (!match) return null;
  let hex = match[1];

  if (hex.length === 3 || hex.length === 4) {
    hex = hex.split('').map(char => char + char).join('');
  }

  if (hex.length === 6) {
    hex += 'ff';
  }

  if (hex.length !== 8) return null;

  const intVal = parseInt(hex, 16);
  const r = (intVal >> 24) & 255;
  const g = (intVal >> 16) & 255;
  const b = (intVal >> 8) & 255;
  const a = (intVal & 255) / 255;
  return { r, g, b, a };
}

function parseRgbColor(value: string): RGBA | null {
  const match = value.match(RGB_REGEX);
  if (!match) return null;
  const parts = match[1].split(',').map(part => part.trim());
  if (parts.length < 3) return null;
  const r = clampChannel(parseFloat(parts[0]));
  const g = clampChannel(parseFloat(parts[1]));
  const b = clampChannel(parseFloat(parts[2]));
  const a = parts[3] !== undefined ? Math.max(0, Math.min(1, parseFloat(parts[3]))) : 1;
  return { r, g, b, a };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

function parseHslColor(value: string): RGBA | null {
  const match = value.match(HSL_REGEX);
  if (!match) return null;
  const parts = match[1].split(',').map(part => part.trim());
  if (parts.length < 3) return null;

  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  const [r, g, b] = hslToRgb(h, s, l);
  const a = parts[3] !== undefined ? Math.max(0, Math.min(1, parseFloat(parts[3]))) : 1;
  return { r: clampChannel(r), g: clampChannel(g), b: clampChannel(b), a };
}

export function parseColor(value?: string | ColorInput | null): RGBA | null {
  if (!value) return null;
  if (typeof value === 'object') {
    return fromObject(value as ColorObject);
  }

  const trimmed = value.trim();
  return (
    parseHexColor(trimmed) ||
    parseRgbColor(trimmed) ||
    parseHslColor(trimmed)
  );
}

export function rgbaToString(color: RGBA): string {
  const alpha = Number(color.a.toFixed(3));
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

export function normalizeColorValue(value?: string | ColorInput | null): string | null {
  const parsed = parseColor(value ?? undefined);
  return parsed ? rgbaToString(parsed) : null;
}

export function normalizeColorRecord(record: Record<string, string | ColorInput | undefined>): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    const color = normalizeColorValue(value ?? null);
    if (color) {
      normalized[key] = color;
    }
  });
  return normalized;
}

export function colorDifference(colorA?: string | ColorInput | null, colorB?: string | ColorInput | null): number {
  const parsedA = parseColor(colorA ?? undefined);
  const parsedB = parseColor(colorB ?? undefined);
  if (!parsedA || !parsedB) return Number.POSITIVE_INFINITY;
  const diff = Math.sqrt(
    Math.pow(parsedA.r - parsedB.r, 2) +
    Math.pow(parsedA.g - parsedB.g, 2) +
    Math.pow(parsedA.b - parsedB.b, 2) +
    Math.pow((parsedA.a - parsedB.a) * 255, 2)
  );
  return Number((diff / 441) * 100);
}
