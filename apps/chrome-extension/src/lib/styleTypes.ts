export interface StyleSystemSnapshot {
  colors: Record<string, string>;
  fontFamilies: Record<string, string>;
  fontSizes: Record<string, number>;
  fontWeights: Record<string, number>;
  lineHeights: Record<string, number>;
  spacing: Record<string, number>;
  radius: Record<string, number>;
  shadows: Record<string, string>;
}

export interface GlobalComparisonPayload {
  figmaUrl: string;
  figmaToken: string;
}

export const createEmptySnapshot = (): StyleSystemSnapshot => ({
  colors: {},
  fontFamilies: {},
  fontSizes: {},
  fontWeights: {},
  lineHeights: {},
  spacing: {},
  radius: {},
  shadows: {}
});
