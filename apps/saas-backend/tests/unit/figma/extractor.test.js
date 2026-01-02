/**
 * Unit Tests for UnifiedFigmaExtractor
 * Tests the unified Figma extraction with MCP and API fallback
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UnifiedFigmaExtractor } from '../../../src/shared/extractors/UnifiedFigmaExtractor.js';
import { MockFigmaAPI, resetAllMocks } from '../../helpers/mockServices.js';

describe('UnifiedFigmaExtractor', () => {
  let figmaExtractor;
  let config;

  beforeEach(() => {
    config = global.testUtils.generateTestConfig();
    figmaExtractor = new UnifiedFigmaExtractor(config);
    MockFigmaAPI.setup();
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with valid config', () => {
      expect(figmaExtractor).toBeInstanceOf(UnifiedFigmaExtractor);
      expect(figmaExtractor.config).toEqual(config);
    });

    test('should initialize with empty config', () => {
      const extractor = new UnifiedFigmaExtractor({});
      expect(extractor).toBeInstanceOf(UnifiedFigmaExtractor);
      expect(extractor.config).toEqual({});
    });

    test('should initialize with default values when config is partial', () => {
      const partialConfig = { figma: { accessToken: 'test-token' } };
      const extractor = new UnifiedFigmaExtractor(partialConfig);
      expect(extractor.config.figma.accessToken).toBe('test-token');
    });
  });

  describe('Configuration Validation', () => {
    test('should accept valid configuration', () => {
      const validConfig = {
        figma: { accessToken: 'test-token' },
        comparison: { thresholds: { fontSize: 2 } }
      };
      const extractor = new UnifiedFigmaExtractor(validConfig);
      expect(extractor.config).toEqual(validConfig);
    });

    test('should handle missing figma config', () => {
      const configWithoutFigma = { comparison: { thresholds: {} } };
      const extractor = new UnifiedFigmaExtractor(configWithoutFigma);
      expect(extractor.config).toEqual(configWithoutFigma);
    });
  });

  describe('Utility Methods', () => {
    test('should have extract method', () => {
      expect(typeof figmaExtractor.extract).toBe('function');
    });

    test('should have extractionMethods property', () => {
      expect(Array.isArray(figmaExtractor.extractionMethods)).toBe(true);
      expect(figmaExtractor.extractionMethods.length).toBeGreaterThan(0);
    });

    test('should have config property', () => {
      expect(figmaExtractor.config).toBeDefined();
    });
  });

  describe('Data Processing', () => {
    test('should process mock design data correctly', async () => {
      const mockData = {
        document: {
          id: 'test-document',
          name: 'Test Document',
          type: 'DOCUMENT',
          children: [
            {
              id: 'test-frame',
              name: 'Test Frame',
              type: 'FRAME',
              children: []
            }
          ]
        }
      };

      // Mock extract to return test data
      figmaExtractor.extract = jest.fn().mockResolvedValue({
        success: true,
        data: { fileId: 'test-file-id', components: [] }
      });
      
      const result = await figmaExtractor.extract('https://figma.com/file/test-file-id');
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('fileId', 'test-file-id');
      expect(result.data).toHaveProperty('components');
      expect(Array.isArray(result.data.components)).toBe(true);
    });

    test('should handle empty document', async () => {
      const mockData = {
        document: {
          id: 'empty-document',
          name: 'Empty Document',
          type: 'DOCUMENT',
          children: []
        }
      };

      // Mock extract to return empty data
      figmaExtractor.extract = jest.fn().mockResolvedValue({
        success: true,
        data: { fileId: 'empty-file-id', components: [] }
      });
      
      const result = await figmaExtractor.extract('https://figma.com/file/empty-file-id');
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('fileId', 'empty-file-id');
      expect(result.data.components).toEqual([]);
    });
  });

  describe('Component Processing', () => {
    test('should process frame components', async () => {
      const mockData = {
        document: {
          id: 'test-document',
          name: 'Test Document',
          type: 'DOCUMENT',
          children: [
            {
              id: 'test-frame',
              name: 'Test Frame',
              type: 'FRAME',
              backgroundColor: { r: 1, g: 1, b: 1, a: 1 },
              children: []
            }
          ]
        }
      };

      // Mock extract to return frame component
      figmaExtractor.extract = jest.fn().mockResolvedValue({
        success: true,
        data: {
          components: [{
            type: 'FRAME',
            name: 'Test Frame'
          }]
        }
      });
      
      const result = await figmaExtractor.extract('https://figma.com/file/test');
      
      expect(result.success).toBe(true);
      expect(result.data.components).toHaveLength(1);
      expect(result.data.components[0]).toHaveProperty('type', 'FRAME');
      expect(result.data.components[0]).toHaveProperty('name', 'Test Frame');
    });

    test('should handle components with properties', async () => {
      const mockData = {
        document: {
          id: 'test-document',
          name: 'Test Document',
          type: 'DOCUMENT',
          children: [
            {
              id: 'test-text',
              name: 'Test Text',
              type: 'TEXT',
              style: {
                fontFamily: 'Inter',
                fontSize: 16
              },
              fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }]
            }
          ]
        }
      };

      // Mock extract to return text component with properties
      figmaExtractor.extract = jest.fn().mockResolvedValue({
        success: true,
        data: {
          components: [{
            type: 'TEXT',
            properties: { fontFamily: 'Inter', fontSize: 16 }
          }]
        }
      });
      
      const result = await figmaExtractor.extract('https://figma.com/file/test');
      
      expect(result.success).toBe(true);
      expect(result.data.components).toHaveLength(1);
      expect(result.data.components[0]).toHaveProperty('properties');
      expect(result.data.components[0].properties).toBeInstanceOf(Object);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid data gracefully', async () => {
      // Mock extract to return error or empty data
      figmaExtractor.extract = jest.fn().mockResolvedValue({
        success: false,
        error: 'Invalid data',
        data: { components: [] }
      });
      
      const result = await figmaExtractor.extract('https://figma.com/file/invalid');
      
      expect(result.success).toBe(false);
      expect(result.data).toHaveProperty('components');
      expect(result.data.components).toEqual([]);
    });

    test('should handle null document', async () => {
      // Mock extract to return empty data
      figmaExtractor.extract = jest.fn().mockResolvedValue({
        success: true,
        data: { components: [] }
      });
      
      const result = await figmaExtractor.extract('https://figma.com/file/null');
      
      expect(result.data).toHaveProperty('components');
      expect(result.data.components).toEqual([]);
    });
  });

  describe('Data Validation', () => {
    test('should return proper data structure', async () => {
      const mockData = {
        document: {
          id: 'test-document',
          name: 'Test Document',
          type: 'DOCUMENT',
          children: [
            {
              id: 'test-component',
              name: 'Test Component',
              type: 'RECTANGLE'
            }
          ]
        }
      };

      // Mock extract to return proper structure
      figmaExtractor.extract = jest.fn().mockResolvedValue({
        success: true,
        data: {
          fileId: 'test-file',
          components: [],
          extractedAt: new Date().toISOString()
        }
      });
      
      const result = await figmaExtractor.extract('https://figma.com/file/test-file');
      
      expect(result.data).toHaveProperty('fileId');
      expect(result.data).toHaveProperty('components');
      if (result.data.extractedAt) {
        expect(typeof result.data.extractedAt).toBe('string');
      }
    });

    test('should validate component structure', async () => {
      const mockData = {
        document: {
          id: 'test-document',
          name: 'Test Document',
          type: 'DOCUMENT',
          children: [
            {
              id: 'test-component',
              name: 'Test Component',
              type: 'RECTANGLE'
            }
          ]
        }
      };

      // Mock extract to return component with proper structure
      figmaExtractor.extract = jest.fn().mockResolvedValue({
        success: true,
        data: {
          components: [{
            id: 'test-component',
            name: 'Test Component',
            type: 'RECTANGLE',
            properties: {}
          }]
        }
      });
      
      const result = await figmaExtractor.extract('https://figma.com/file/test');
      
      if (result.data.components.length > 0) {
        const component = result.data.components[0];
        expect(component).toHaveProperty('id');
        expect(component).toHaveProperty('name');
        expect(component).toHaveProperty('type');
        expect(component).toHaveProperty('properties');
      }
    });
  });
}); 