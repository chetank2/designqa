// Comparison-related type definitions
export interface ComparisonSettings {
  threshold: number; // 0.1 - 1.0
  colorTolerance: number; // 0-255
  ignoreAntiAliasing: boolean;
  includeTextAnalysis: boolean;
  layoutAnalysis: boolean;
  colorAnalysis: boolean;
  spacingAnalysis: boolean;
}

export interface ScreenshotComparisonRequest {
  figmaScreenshot: File;
  developedScreenshot: File;
  settings: ComparisonSettings;
  metadata?: {
    projectName?: string;
    componentName?: string;
    description?: string;
  };
}

export interface Discrepancy {
  id: string;
  type: 'color' | 'layout' | 'text' | 'spacing' | 'missing-element' | 'extra-element';
  severity: 'high' | 'medium' | 'low';
  description: string;
  location: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  figmaValue?: string;
  developedValue?: string;
  recommendation?: string;
}