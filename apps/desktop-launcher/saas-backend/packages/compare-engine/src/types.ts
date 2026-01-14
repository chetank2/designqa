export type ComparisonStatus = 'match' | 'mismatch';

export interface ComparisonResult {
  nodeId: string;
  property: string;
  figma: string | number | null;
  web: string | number | null;
  status: ComparisonStatus;
  diff: number;
}

export interface ComparisonToleranceConfig {
  color?: number;
  typography?: number;
  spacing?: number;
  radius?: number;
  shadows?: number;
  layout?: number;
}

export interface ComparisonOptions {
  tolerance?: ComparisonToleranceConfig;
}

export interface NormalizationOptions {
  baseFontSize?: number;
}

export type ColorInput = string | {
  r: number;
  g: number;
  b: number;
  a?: number;
};

export interface RawShadowInput {
  offsetX: string | number;
  offsetY: string | number;
  blurRadius: string | number;
  spreadRadius?: string | number;
  color: ColorInput;
}

export interface NormalizedShadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  alpha: number;
}

export interface TypographyValues {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: string;
}

export interface SpacingValues {
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  gap?: number;
}

export interface RadiusValues {
  borderRadius?: number;
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomLeftRadius?: number;
  borderBottomRightRadius?: number;
}

export interface LayoutValues {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  top?: number;
  left?: number;
}

export interface ColorValues {
  [key: string]: string;
}

export interface ShadowValues {
  [key: string]: NormalizedShadow[];
}

export interface NormalizedNodeStyles {
  colors: ColorValues;
  typography: TypographyValues;
  spacing: SpacingValues;
  radius: RadiusValues;
  shadows: ShadowValues;
  layout: LayoutValues;
  tokens: Record<string, string | number>;
}

export interface NormalizedNode {
  nodeId: string;
  name?: string;
  selector?: string;
  styles: NormalizedNodeStyles;
}

export interface RawFigmaNode {
  nodeId: string;
  name?: string;
  selector?: string;
  styles?: Partial<{
    colors: Record<string, ColorInput>;
    typography: Partial<TypographyValues>;
    spacing: Partial<Record<keyof SpacingValues, string | number>>;
    radius: Partial<Record<keyof RadiusValues, string | number>>;
    shadows: Record<string, RawShadowInput[] | string | RawShadowInput>;
    layout: Partial<Record<keyof LayoutValues, string | number>>;
    tokens: Record<string, string | number>;
  }>;
}

export interface RawWebNode {
  nodeId: string;
  name?: string;
  selector?: string;
  computedStyles: Record<string, string | number>;
  tokens?: Record<string, string | number>;
}
