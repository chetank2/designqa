// API-related type definitions
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    stage?: string;
    details?: any;
  };
  timestamp?: string;
  processingTime?: string;
}

export interface AuthenticationConfig {
  type: 'form' | 'credentials' | 'cookies' | 'headers' | 'manual' | 'none';
  loginUrl?: string;
  username?: string;
  password?: string;
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
  }>;
  headers?: Record<string, string>;
  waitTime?: number;
  successIndicator?: string;
  figmaToken?: string;
}

export interface ComparisonRequest {
  figmaUrl: string;
  webUrl: string;
  webSelector?: string;
  nodeId?: string | null;
  authentication?: AuthenticationConfig;
  includeVisual?: boolean;
  designSystemId?: string | null;
  extractionMode?: 'both' | 'frame-only' | 'global-styles';
}

export interface ComparisonResult extends ApiResponse {
  comparisonId?: string;
  id?: string;
  reportPath?: string | null;
  extractionDetails?: any;
  figmaData?: any;
  webData?: any;
  comparison?: ComparisonData;
}

// Progress tracking types
export interface ProgressStage {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  stage: string;
  progress: number;
}

// Enhanced error handling
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: any;
}

// Typography type definitions
export interface Typography {
  fontFamilies?: string[];
  fontSizes?: string[];
  fontWeights?: string[];
}

// Enhanced comparison interface
export interface ComparisonData {
  overallSimilarity: number;
  totalComparisons: number;
  matchedElements: number;
  discrepancies: number;
  colorAnalysis?: any;
  summary?: {
    regressionRisk?: string;
    totalMatches?: number;
    totalComponents?: number;
  };
  remediationLinks?: any[];
}