import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { UnifiedWebExtractor } from '../../src/web/UnifiedWebExtractor.js';
import { ComparisonService } from '../../src/services/ComparisonService.js';
import { ErrorHandlingService } from '../../src/utils/ErrorHandlingService.js';

// Mock EnhancedWebExtractor
class MockEnhancedWebExtractor {
  constructor() {
    this.initialized = false;
    this.mockPages = {
      'mock://login': {
        title: 'Login Page',
        elements: [
          { id: 'username', type: 'input', name: 'username' },
          { id: 'password', type: 'input', name: 'password' },
          { id: 'submit', type: 'button', name: 'submit' }
        ]
      },
      'mock://dashboard': {
        title: 'Dashboard',
        elements: [
          { id: 'header', type: 'div', text: 'Welcome' },
          { id: 'content', type: 'div', text: 'Main Content' }
        ]
      }
    };
  }

  async initialize() {
    if (this.initialized) return;
    
    this.page = {
      goto: async (url) => {
        this.currentUrl = url;
        if (!url.startsWith('mock://')) {
          throw new Error('Only mock:// URLs are supported in tests');
        }
        if (!this.mockPages[url]) {
          throw new Error(`Mock page not found: ${url}`);
        }
      },
      waitForSelector: async (selector) => {
        if (this.currentUrl === 'mock://login' && selector.includes('password')) {
          // Simulate auth failure for specific test case
          if (this.shouldFailAuth) {
            throw new Error('Authentication failed');
          }
        }
      },
      type: async () => {},
      click: async () => {},
      waitForNavigation: async () => {}
    };
    
    this.initialized = true;
  }

  async extract(url) {
    if (!this.initialized) {
      throw new Error('Extractor not initialized');
    }

    // Simulate browser crash for specific test case
    if (this.shouldCrash) {
      throw new Error('Browser crashed');
    }

    return {
      elements: this.mockPages[url]?.elements || [],
      version: '1.0.0'
    };
  }

  async cleanup() {
    this.initialized = false;
    this.page = null;
    this.currentUrl = null;
  }
}

// Mock failing extractor
class MockFailingExtractor extends MockEnhancedWebExtractor {
  async initialize() {
    throw new Error('Failed to initialize browser');
  }

  async extract() {
    throw new Error('Extraction failed');
  }
}

describe('Comparison Service Integration Tests', () => {
  let webExtractor;
  let errorHandler;

  beforeEach(async () => {
    webExtractor = new UnifiedWebExtractor();
    errorHandler = new ErrorHandlingService();
  });

  afterEach(async () => {
    // Cleanup if needed
  });

  test('should initialize web extractor', async () => {
    await webExtractor.initialize();
    expect(webExtractor.config).toBeDefined();
  });

  test('should handle extraction errors gracefully', async () => {
    await webExtractor.initialize();
    
    // Test with invalid URL to trigger error handling
    try {
      await webExtractor.extractWebData('invalid-url');
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
    }
  });
}); 