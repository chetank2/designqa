import { getApiBaseUrl } from '../utils/environment';
import axios from 'axios';
import { AuthenticationConfig, ComparisonResult } from '../types';
import { FigmaData, WebData, ApiError as SharedApiError } from '@designqa/shared-types';

export interface FigmaOnlyResponse {
  success: boolean;
  data: any;
  error?: string;
}

export interface WebOnlyResponse {
  success: boolean;
  data: any;
  error?: string;
}

// Temporary dev-only helper used by some API calls.
// Must be defined in both browser and Electron builds to avoid runtime ReferenceError.
const enableLoggingIfElectron = async (): Promise<void> => {
  try {
    const isElectron =
      typeof window !== 'undefined' && typeof (window as any).electronAPI !== 'undefined';
    if (!isElectron) return;

    // No-op for now: keep hook for future Electron-only logging toggles.
    // Intentionally does not rely on preload APIs (not exposed today).
  } catch {
    // Ignore logging setup failures
  }
};

// API Configuration
const API_CONFIG = {
  // Extended timeout for comparison operations that include web extraction with authentication
  timeout: 600000, // 10 minutes - allows for slow web extraction + login flows
  retries: 3
};

// API response interface
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}


class ApiService {
  private timeout: number
  private retries: number

  constructor() {
    this.timeout = API_CONFIG.timeout
    this.retries = API_CONFIG.retries
  }

  /**
   * Get the base URL dynamically (respects mode changes)
   * @returns The current API base URL
   */
  private getBaseURL(): string {
    // Get base URL dynamically to respect mode changes
    return getApiBaseUrl();
  }

  /**
   * Get the correct API URL based on environment and endpoint
   * @param url The API endpoint path
   * @returns The complete URL to use
   */
  private getApiUrl(url: string): string {
    const baseURL = this.getBaseURL();
    // Prevent duplication if the URL already contains the base URL
    if (url.startsWith(baseURL)) {
      return url;
    }

    // Always use local server - no Netlify Functions
    return `${baseURL}${url}`;
  }

  private async fetchWithRetry(url: string, options: RequestInit = {}, retryCount = 0): Promise<Response> {
    // Get the correct API URL
    const apiUrl = this.getApiUrl(url);

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(new Error(`Client request timeout after ${this.timeout}ms`)), this.timeout)
    try {
      // Removed: console.log(`🌐 API Request: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)

      // Normalize abort errors with a helpful message
      if ((error as Error).name === 'AbortError' || /aborted/i.test((error as Error).message)) {
        const friendly = new Error(`Request aborted: timed out after ${Math.round(this.timeout / 1000)}s`)
          ; (friendly as any).code = 'ABORT_TIMEOUT'
        throw friendly
      }

      if (retryCount < this.retries) {
        console.warn(`API request failed, retrying... (${retryCount + 1}/${this.retries})`)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000))
        return this.fetchWithRetry(url, options, retryCount + 1)
      }

      throw error
    }
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      let errorDetails = '';

      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorData.message || errorMessage
        errorDetails = errorData.details || errorData.stack || '';
      } catch {
        // If response is not JSON, use status text
      }

      const error: ApiError = {
        message: errorMessage,
        status: response.status,
        code: response.status.toString(),
        details: errorDetails
      }
      throw error
    }

    try {
      const jsonData = await response.json();
      return jsonData;
    } catch (error) {
      throw new Error('Invalid JSON response from server')
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await this.fetchWithRetry(endpoint, { method: 'GET' })
    return this.handleResponse<T>(response)
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    // No cache busting
    const dataWithCacheBuster = data || {};

    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dataWithCacheBuster)
    };

    const response = await this.fetchWithRetry(endpoint, options);
    return this.handleResponse<T>(response);
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    const response = await this.fetchWithRetry(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
    return this.handleResponse<T>(response)
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await this.fetchWithRetry(endpoint, { method: 'DELETE' })
    return this.handleResponse<T>(response)
  }

  async healthCheck(): Promise<any> {
    return this.get('/api/health')
  }

  async getReports(): Promise<any> {
    // Backend exposes reports via /api/reports/list
    return this.get('/api/reports/list')
  }

  async getCurrentSettings(): Promise<any> {
    return this.get('/api/settings/current')
  }

  async saveSettings(settings: any): Promise<any> {
    return this.post('/api/settings/save', settings)
  }

  async testConnection(data: any): Promise<any> {
    return this.post('/api/settings/test-connection', data)
  }

  // Figma OAuth API methods
  async saveFigmaCredentials(clientId: string, clientSecret: string): Promise<any> {
    return this.post('/api/auth/figma/setup', { clientId, clientSecret })
  }

  async connectFigma(): Promise<{ success: boolean; url: string }> {
    return this.get('/api/auth/figma/connect')
  }

  async getFigmaStatus(): Promise<{ success: boolean; hasCredentials: boolean; connected: boolean }> {
    return this.get('/api/auth/figma/status')
  }

  async getFigmaData(comparisonId: string): Promise<any> {
    return this.get(`/api/figma-data/${comparisonId}`)
  }

  async getWebData(comparisonId: string): Promise<any> {
    return this.get(`/api/web-data/${comparisonId}`)
  }

  getConfig() {
    return {
      baseURL: this.getBaseURL(),
      timeout: this.timeout,
      retries: this.retries
    }
  }

  // Use axios for specific cases where fetch doesn't work well
  async postAxios<T = any>(url: string, data: any, options?: { headers?: Record<string, string> }): Promise<T> {
    try {
      const apiUrl = this.getApiUrl(url);
      // Removed: console.log(`🌐 Axios Request: ${apiUrl}`);

      const headers = options?.headers || {};

      // Don't set Content-Type for FormData - let axios handle it
      if (!(data instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await axios.post(apiUrl, data, {
        headers,
        timeout: this.timeout
      });

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const apiError: SharedApiError = {
          message: error.response?.data?.error || error.message,
          status: error.response?.status,
          code: error.code,
          details: error.response?.data?.details
        };
        throw apiError;
      }
      throw error;
    }
  }

  async getAxios(url: string) {
    try {
      const apiUrl = this.getApiUrl(url);
      // Removed: console.log(`🌐 Axios Request: ${apiUrl}`);

      const response = await axios.get(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: this.timeout
      });

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const apiError: SharedApiError = {
          message: error.response?.data?.error || error.message,
          status: error.response?.status,
          code: error.code,
          details: error.response?.data?.details
        };
        throw apiError;
      }
      throw error;
    }
  }

  createEventSource(url: string) {
    const apiUrl = this.getApiUrl(url);
    return new EventSource(apiUrl);
  }
}

const apiService = new ApiService()

export default apiService

export interface ComparisonRequest {
  figmaUrl: string
  webUrl: string
  includeVisual?: boolean
  nodeId?: string | null
  extractionMode?: 'frame-only' | 'global-styles' | 'both'
  designSystemId?: string
  authentication?: {
    type?: 'credentials' | 'cookies' | 'headers'
    figmaToken?: string
    loginUrl?: string
    username?: string
    password?: string
    waitTime?: number
    successIndicator?: string
    webAuth?: {
      username?: string
      password?: string
    }
  } | null
}

// ... existing code ...

export interface FigmaExtractionOptions {
  figmaUrl: string;
  extractionMode?: 'frame-only' | 'global-styles' | 'both';
  designSystemId?: string;
}

export const extractFigmaOnly = async (options: FigmaExtractionOptions): Promise<FigmaOnlyResponse['data']> => {
  // Auto-enable logging for development debugging (temporary feature)
  await enableLoggingIfElectron();

  try {
    const apiService = new ApiService();

    // Add a timestamp to prevent caching
    const timestamp = new Date().getTime();
    const url = `${options.figmaUrl}${options.figmaUrl.includes('?') ? '&' : '?'}_t=${timestamp}`;

    const response = await apiService.post<any>('/api/figma-only/extract', {
      figmaUrl: url,
      extractionMode: options.extractionMode || 'both',
      designSystemId: options.designSystemId
    });

    // Removed: console.log('Raw API response:', response);

    // Check if the response is in the expected format (with success field)
    if (response && typeof response === 'object') {
      if ('success' in response && response.success) {
        // Standard format with success field
        const data = response.data;
        // Removed: console.log('Returning response.data:', data);

        // Ensure all required fields are present - map new API structure to expected format
        return {
          components: data.elements || data.components || [],
          colors: data.colorPalette || data.colors || [],
          typography: data.typography || [],
          spacing: data.spacing || [],
          borderRadius: data.borderRadius || [],
          styles: data.styles || {},
          fileName: data.fileName || data.metadata?.fileName || 'Unknown',
          fileId: data.fileId || data.metadata?.fileKey || '',
          nodeId: data.nodeId || data.metadata?.nodeId || '',
          extractedAt: data.extractedAt || data.metadata?.extractedAt || new Date().toISOString(),
          metadata: {
            fileName: data.metadata?.fileName || data.fileName || 'Unknown',
            fileKey: data.metadata?.fileKey || data.fileId || '',
            nodeId: data.metadata?.nodeId || data.nodeId || '',
            extractionMethod: data.metadata?.extractionMethod || 'figma-api',
            totalComponents: data.metadata?.totalElements || data.elements?.length || data.components?.length || 0,
            colorCount: data.colorPalette?.length || data.colors?.length || 0,
            typographyCount: data.typography?.fontFamilies?.length || data.typography?.length || 0
          },
          reportPath: data.reportPath
        };
      } else if ('success' in response && !response.success) {
        throw new Error(response.error || 'Failed to extract Figma data');
      } else {
        // Fallback: treat as direct data response
        return {
          components: response.elements || response.components || [],
          colors: response.colorPalette || response.colors || [],
          typography: response.typography || [],
          styles: response.styles || {},
          fileName: response.fileName || 'Unknown',
          fileId: response.fileId || '',
          nodeId: response.nodeId || '',
          extractedAt: response.extractedAt || new Date().toISOString(),
          metadata: response.metadata || {
            fileName: 'Unknown',
            fileKey: '',
            nodeId: '',
            extractionMethod: 'figma-api',
            totalComponents: 0,
            colorCount: 0,
            typographyCount: 0
          }
        };
      }
    }

    throw new Error('Invalid response format from server');
  } catch (error) {
    console.error('Error extracting Figma data:', error);
    throw error;
  }
}

// Extract Web data only
export const extractWebOnly = async (
  webUrl: string,
  webSelector?: string,
  authentication?: AuthenticationConfig,
  designSystemId?: string
): Promise<WebOnlyResponse['data']> => {
  // Auto-enable logging for development debugging (temporary feature)
  await enableLoggingIfElectron();
  try {
    // Removed: console.log('Extracting Web-only data from URL:', webUrl);

    // Use the UnifiedWebExtractor endpoint with FreightTiger authentication fixes
    const endpoint = '/api/web/extract-v3';

    const response = await apiService.post<any>(endpoint, {
      url: webUrl, // UnifiedWebExtractor expects 'url', not 'webUrl'
      authentication,
      designSystemId, // Pass the design system ID
      options: {
        includeScreenshot: false,
        viewport: { width: 1920, height: 1080 },
        timeout: webUrl.includes('freighttiger.com') ? 600000 : 180000 // Extended timeout for FreightTiger (10 min vs 3 min)
      }
    });

    // Log response structure for debugging
      // console.log('📥 Raw API response structure:', {
      //   hasSuccess: typeof response?.success === 'boolean',
      //   success: response?.success,
      //   hasData: !!response?.data,
      //   hasElements: !!response?.elements || !!response?.data?.elements,
      //   topLevelKeys: Object.keys(response || {}).slice(0, 15),
      //   dataKeys: response?.data ? Object.keys(response.data).slice(0, 15) : []
    // });

    // Handle response structure - backend returns both { success, data } and top-level fields
    const hasSuccessFlag = typeof response?.success === 'boolean';
    const success = hasSuccessFlag ? response.success : true;
    const errorMessage = hasSuccessFlag ? response.error : undefined;

    // Extract webData - prefer response.data, fallback to response itself
    // Backend spreads webData both in data and at top level, so either should work
    let webData = hasSuccessFlag ? (response.data ?? response) : response;

    // If webData is empty object but response has elements at top level, use response
    if ((!webData || Object.keys(webData).length === 0) && response?.elements) {
      console.warn('⚠️ response.data is empty, using top-level response');
      webData = response;
    }

    // Validate success flag
    if (!success) {
      const errorDetails = {
        errorMessage,
        responseStructure: {
          hasSuccess: hasSuccessFlag,
          hasData: !!response.data,
          hasElements: !!webData?.elements,
          elementsLength: Array.isArray(webData?.elements) ? webData.elements.length : 0,
          responseKeys: Object.keys(response || {}).slice(0, 10)
        }
      };
      console.error('❌ Extraction failed - success flag is false:', errorDetails);
      throw new Error(errorMessage || 'Failed to extract web data');
    }

    // Validate webData exists and is not empty
    if (!webData || typeof webData !== 'object') {
      const errorDetails = {
        webDataType: typeof webData,
        webDataValue: webData,
        responseStructure: {
          hasSuccess: hasSuccessFlag,
          hasData: !!response.data,
          responseKeys: Object.keys(response || {}).slice(0, 10)
        }
      };
      console.error('❌ Extraction failed - invalid webData:', errorDetails);
      throw new Error('Invalid response format: webData is missing or invalid');
    }

    // Validate that elements array exists and has content
    const elements = webData.elements;
    if (!Array.isArray(elements)) {
      const errorDetails = {
        elementsType: typeof elements,
        elementsValue: elements,
        webDataKeys: Object.keys(webData || {}).slice(0, 10),
        responseStructure: {
          hasSuccess: hasSuccessFlag,
          hasData: !!response.data,
          responseKeys: Object.keys(response || {}).slice(0, 10)
        }
      };
      console.error('❌ Extraction failed - elements is not an array:', errorDetails);
      throw new Error('Invalid response format: elements array is missing or invalid');
    }

    if (elements.length === 0) {
      const errorDetails = {
        elementsLength: 0,
        webDataKeys: Object.keys(webData || {}).slice(0, 10),
        url: webData.url || webUrl,
        extractedAt: webData.extractedAt
      };
      console.warn('⚠️ Extraction returned 0 elements:', errorDetails);
      // Don't throw error for 0 elements - let the UI handle it
      // The backend already validates this and returns 422 if needed
    }

    console.log('✅ Web extraction successful:', {
      elementsCount: elements.length,
      hasColors: !!webData.colorPalette,
      hasTypography: !!webData.typography,
      url: webData.url || webUrl
    });
    return webData;
  } catch (error) {
    console.error('Error extracting Web-only data:', error);

    // Enhance error message with more context if it's a generic error
    if (error instanceof Error && error.message === 'Failed to extract web data') {
      const enhancedError = new Error(
        `Failed to extract web data from ${webUrl}. ` +
        `Please check the browser console for detailed error information.`
      );
      (enhancedError as any).originalError = error;
      throw enhancedError;
    }

    throw error;
  }
};

// Export convenience functions that use the singleton
export const testConnection = async (data: { figmaPersonalAccessToken: string }) => {
  return apiService.testConnection(data);
};

// Export OAuth convenience functions
export const saveFigmaCredentials = async (clientId: string, clientSecret: string) => {
  return apiService.saveFigmaCredentials(clientId, clientSecret);
};

export const connectFigma = async () => {
  return apiService.connectFigma();
};

export const getFigmaStatus = async () => {
  return apiService.getFigmaStatus();
};

// Screenshot Comparison API Functions
export const uploadScreenshots = async (formData: FormData): Promise<{ uploadId: string }> => {
  try {
    // Removed: console.log('🌐 Uploading screenshots with FormData:', formData);

    // Debug FormData contents
    // Removed: console.log('📝 FormData contents before upload:');
    for (const [key, value] of formData.entries()) {
      // Removed: console.log(`  ${key}:`, value instanceof File ? `File(${value.name}, ${value.size} bytes)` : value);
    }

    const response = await apiService.postAxios<ApiResponse<{ uploadId: string }>>(
      '/api/screenshots/upload',
      formData
    );

    if (!response.success) {
      throw new Error(response.error || 'Screenshot upload failed');
    }

    return response.data as { uploadId: string };
  } catch (error) {
    console.error('Error uploading screenshots:', error);
    throw error;
  }
};

export const startScreenshotComparison = async (
  uploadId: string,
  settings: any
): Promise<any> => {
  try {
    const response = await apiService.postAxios<ApiResponse<any>>(
      '/api/screenshots/compare',
      { uploadId, settings }
    );

    if (!response.success) {
      throw new Error(response.error || 'Screenshot comparison failed');
    }

    return response.data;
  } catch (error) {
    console.error('Error starting screenshot comparison:', error);
    throw error;
  }
};

export const getScreenshotComparisonStatus = async (
  comparisonId: string
): Promise<any> => {
  try {
    const response = await apiService.getAxios(
      `/api/screenshots/compare/${comparisonId}`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to get comparison status');
    }

    return response.data;
  } catch (error) {
    console.error('Error getting comparison status:', error);
    throw error;
  }
};

export const listScreenshotComparisons = async (): Promise<any[]> => {
  try {
    const response = await apiService.getAxios(
      '/api/screenshots/list'
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to list comparisons');
    }

    return response.data as any[];
  } catch (error) {
    console.error('Error listing comparisons:', error);
    throw error;
  }
}; 
