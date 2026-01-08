// Main exports for shared types
export * from './extractor';
export * from './api';
export * from './comparison';

// Re-export commonly used types
export type {
  FigmaData,
  WebData,
  ExtractedData,
  ExtractorOptions
} from './extractor';

export type {
  ApiResponse,
  AuthenticationConfig,
  ComparisonRequest,
  ComparisonResult,
  ComparisonData,
  ProgressStage,
  ApiError,
  Typography
} from './api';

export type {
  ComparisonSettings,
  ScreenshotComparisonRequest,
  Discrepancy
} from './comparison';