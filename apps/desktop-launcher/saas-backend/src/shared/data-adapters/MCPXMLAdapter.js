/**
 * MCP XML Data Adapter
 * Transforms MCP XML canvas data to standardized format
 */

import { BaseDataAdapter } from './interfaces.js';

export class MCPXMLAdapter extends BaseDataAdapter {
  constructor() {
    super('figma-mcp');
  }

  /**
   * Validate MCP data structure (supports both XML and structured data)
   * @param {any} rawData - Raw MCP response
   * @returns {boolean}
   */
  validate(rawData) {
    // Support new structured MCP data format
    if (rawData && rawData.rawMCPData) {
      const { metadata, code, variables } = rawData.rawMCPData || {};
      const hasAny = !!(metadata || code || variables);
      if (!hasAny) return false;

      // If all results are explicit MCP error payloads, treat as invalid input.
      const isErrorPayload = (v) => (v && typeof v === 'object' && v.isError === true);
      if (isErrorPayload(metadata) && isErrorPayload(code) && isErrorPayload(variables)) {
        return false;
      }

      return true;
    }

    // Support legacy XML format
    return rawData &&
      rawData.content &&
      typeof rawData.content === 'string' &&
      rawData.content.includes('<canvas');
  }

  /**
   * Transform MCP data to standardized format (supports both XML and structured data)
   * @param {Object} rawData - Raw MCP response
   * @param {Object} context - Context with figmaUrl, fileId, nodeId
   * @returns {StandardizedFigmaData}
   */
  transform(rawData, context = {}) {
    if (!this.validate(rawData)) {
      throw new Error('Invalid MCP data structure');
    }

    const baseMetadata = this.extractBaseMetadata(context);

    // Ensure designSystem context is preserved
    if (context.designSystem) {
      baseMetadata.designSystem = context.designSystem;
    }

    // Handle new structured MCP data format
    if (rawData.rawMCPData) {
      return this.transformStructuredData(rawData, baseMetadata);
    }

    // Handle legacy XML format
    const xmlContent = rawData.content;
    const components = this.extractComponents(xmlContent);
    // Use enhanced extraction logic (normalized, unique, token-mapped)
    const colors = this.extractColorsFromXMLMetadata({
      content: xmlContent,
      designSystem: baseMetadata.designSystem
    });
    const typography = this.extractTypography(xmlContent);

    return {
      ...baseMetadata,
      metadata: {
        fileName: this.extractFileName(xmlContent) || 'Unknown File',
        componentCount: components.length,
        colorCount: colors.length,
        typographyCount: typography.length,
        source: 'figma-mcp',
        xmlSize: xmlContent.length
      },
      components,
      colors,
      typography,
      rawData: process.env.NODE_ENV === 'development' ? rawData : undefined
    };
  }

  /**
   * Extract components from XML content using proper XML parsing
   * @param {string} xmlContent - XML content
   * @returns {StandardizedComponent[]}
   */
  extractComponents(xmlContent) {
    const components = [];

    // Extract different element types
    const elementTypes = [
      { tag: 'frame', type: 'FRAME' },
      { tag: 'instance', type: 'INSTANCE' },
      { tag: 'text', type: 'TEXT' },
      { tag: 'vector', type: 'VECTOR' },
      { tag: 'ellipse', type: 'ELLIPSE' },
      { tag: 'rectangle', type: 'RECTANGLE' },
      { tag: 'rounded-rectangle', type: 'ROUNDED_RECTANGLE' },
      { tag: 'line', type: 'LINE' },
      { tag: 'regular-polygon', type: 'POLYGON' }
    ];

    elementTypes.forEach(({ tag, type }) => {
      const elements = this.extractElementsByTag(xmlContent, tag, type);
      components.push(...elements);
    });

    return components;
  }

  /**
   * Extract elements by XML tag
   * @param {string} xmlContent - XML content
   * @param {string} tagName - XML tag name
   * @param {string} componentType - Component type
   * @returns {StandardizedComponent[]}
   */
  extractElementsByTag(xmlContent, tagName, componentType) {
    const components = [];

    // Create regex pattern for self-closing and regular tags
    const selfClosingPattern = new RegExp(`<${tagName}([^>]*?)\\s*/>`, 'g');
    const regularPattern = new RegExp(`<${tagName}([^>]*?)>(.*?)</${tagName}>`, 'gs');

    // Process self-closing tags
    let match;
    while ((match = selfClosingPattern.exec(xmlContent)) !== null) {
      const attributes = this.parseAttributes(match[1]);
      if (attributes.id && attributes.name) {
        components.push(this.createComponent(attributes, componentType, null));
      }
    }

    // Process regular tags with content
    while ((match = regularPattern.exec(xmlContent)) !== null) {
      const attributes = this.parseAttributes(match[1]);
      const innerContent = match[2];

      if (attributes.id && attributes.name) {
        const component = this.createComponent(attributes, componentType, innerContent);

        // Extract nested children if present
        if (innerContent) {
          component.children = this.extractComponents(innerContent);
        }

        components.push(component);
      }
    }

    return components;
  }

  /**
   * Parse XML attributes from attribute string
   * @param {string} attributeString - String containing XML attributes
   * @returns {Object}
   */
  parseAttributes(attributeString) {
    const attributes = {};

    // Match attribute="value" patterns
    const attributePattern = /(\w+)="([^"]*)"/g;
    let match;

    while ((match = attributePattern.exec(attributeString)) !== null) {
      const [, name, value] = match;
      attributes[name] = value;
    }

    return attributes;
  }

  /**
   * Create standardized component from XML attributes
   * @param {Object} attributes - Parsed XML attributes
   * @param {string} type - Component type
   * @param {string|null} innerContent - Inner XML content
   * @returns {StandardizedComponent}
   */
  createComponent(attributes, type, innerContent) {
    const properties = { ...attributes };

    // Convert numeric attributes
    ['x', 'y', 'width', 'height'].forEach(attr => {
      if (properties[attr]) {
        properties[attr] = parseFloat(properties[attr]);
      }
    });

    // Handle boolean attributes
    if (properties.hidden !== undefined) {
      properties.visible = properties.hidden !== 'true';
      delete properties.hidden;
    } else {
      properties.visible = true;
    }

    return {
      id: attributes.id,
      name: attributes.name || `Unnamed ${type}`,
      type,
      properties: {
        ...properties,
        extractionMethod: 'mcp-xml',
        hasContent: !!innerContent
      },
      children: []
    };
  }

  /**
   * Extract colors from XML content
   * @param {string} xmlContent - XML content
   * @returns {StandardizedColor[]}
   */
  extractColors(xmlContent) {
    const colors = new Map();

    // Extract fill colors
    const fillPattern = /fill="([^"]+)"/g;
    let match;
    let colorIndex = 0;

    while ((match = fillPattern.exec(xmlContent)) !== null) {
      const fillValue = match[1];

      // Check if it's a color value (hex, rgb, etc.)
      if (this.isColorValue(fillValue)) {
        const colorId = `fill-${colorIndex++}`;
        colors.set(fillValue, {
          id: colorId,
          name: `Fill Color ${colorIndex}`,
          value: fillValue,
          type: 'fill',
          source: 'mcp-xml'
        });
      }
    }

    // Extract stroke colors
    const strokePattern = /stroke="([^"]+)"/g;
    colorIndex = 0;

    while ((match = strokePattern.exec(xmlContent)) !== null) {
      const strokeValue = match[1];

      if (this.isColorValue(strokeValue)) {
        const colorId = `stroke-${colorIndex++}`;
        if (!colors.has(strokeValue)) {
          colors.set(strokeValue, {
            id: colorId,
            name: `Stroke Color ${colorIndex}`,
            value: strokeValue,
            type: 'stroke',
            source: 'mcp-xml'
          });
        }
      }
    }

    return Array.from(colors.values());
  }

  /**
   * Extract typography from XML content
   * @param {string} xmlContent - XML content
   * @returns {StandardizedTypography[]}
   */
  extractTypography(xmlContent) {
    const typography = [];

    // Extract text elements with content
    const textPattern = /<text([^>]*?)>([^<]*?)<\/text>/g;
    let match;
    let textIndex = 0;

    while ((match = textPattern.exec(xmlContent)) !== null) {
      const attributes = this.parseAttributes(match[1]);
      const textContent = match[2].trim();

      if (textContent && attributes.id) {
        typography.push({
          id: attributes.id,
          name: attributes.name || `Text ${++textIndex}`,
          fontFamily: 'Unknown', // XML doesn't typically contain font info
          fontSize: 12, // Default size
          fontWeight: 400, // Default weight
          text: textContent,
          source: 'mcp-xml',
          properties: {
            ...attributes,
            hasTextContent: true
          }
        });
      }
    }

    // Extract text elements with name attributes (even if no content)
    const textElementPattern = /<text[^>]*name="([^"]*)"[^>]*id="([^"]*)"[^>]*>/g;

    while ((match = textElementPattern.exec(xmlContent)) !== null) {
      const name = match[1];
      const id = match[2];

      // Only add if not already added from content extraction
      if (!typography.find(t => t.id === id) && name) {
        typography.push({
          id,
          name,
          fontFamily: 'Unknown',
          fontSize: 12,
          fontWeight: 400,
          text: name, // Use name as text content
          source: 'mcp-xml',
          properties: {
            hasTextContent: false,
            inferredFromName: true
          }
        });
      }
    }

    return typography;
  }

  /**
   * Check if a string represents a color value
   * @param {string} value - String to check
   * @returns {boolean}
   */
  isColorValue(value) {
    // Check for hex colors
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value)) {
      return true;
    }

    // Check for rgb/rgba
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(value)) {
      return true;
    }

    // Check for common color names
    const colorNames = ['red', 'green', 'blue', 'black', 'white', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey'];
    if (colorNames.includes(value.toLowerCase())) {
      return true;
    }

    return false;
  }

  /**
   * Extract file name from XML content
   * @param {string} xmlContent - XML content
   * @returns {string|null}
   */
  extractFileName(xmlContent) {
    // Try to extract from canvas or root element attributes
    const canvasMatch = xmlContent.match(/<canvas[^>]*name="([^"]*)"[^>]*>/);
    if (canvasMatch) {
      return canvasMatch[1];
    }

    // Try to extract from document title or similar
    const titleMatch = xmlContent.match(/<title>([^<]*)<\/title>/);
    if (titleMatch) {
      return titleMatch[1];
    }

    return null;
  }

  /**
   * Transform structured MCP data to standardized format
   * @param {Object} rawData - Raw MCP response with rawMCPData
   * @param {Object} baseMetadata - Base metadata from context
   * @returns {StandardizedFigmaData}
   */
  transformStructuredData(rawData, baseMetadata) {
    // Removed: console.log('🔄 Transforming Structured MCP Data...');
    const { metadata, code, variables } = rawData.rawMCPData;

    // Removed: console.log('  - Metadata:', !!metadata);
    // Removed: console.log('  - Code:', !!code);
    // Removed: console.log('  - Variables:', !!variables);

    // Fail fast on MCP error payloads so callers don't treat them as valid extracted data.
    const isErrorPayload = (v) => (v && typeof v === 'object' && v.isError === true);
    if (isErrorPayload(metadata) || isErrorPayload(code) || isErrorPayload(variables)) {
      const msg =
        metadata?.content?.[0]?.text ||
        code?.content?.[0]?.text ||
        variables?.content?.[0]?.text ||
        'MCP returned an error payload';
      throw new Error(msg);
    }

    // Extract components from MCP code/metadata
    // Removed: console.log('\n📦 Extracting components...');
    const components = this.extractComponentsFromStructuredData(metadata, code);
    // Removed: console.log(`  ✅ Components extracted: ${components.length}`);

    // Extract colors from variables AND XML metadata
    // Removed: console.log('\n🎨 Extracting colors...');
    // Pass design system context for token mapping
    const dsContext = { designSystem: baseMetadata.designSystem };

    // Note: extractColorsFromVariables doesn't accept metadata arg yet, we should update it or pass 2nd arg
    const colorsFromVariables = this.extractColorsFromVariables(variables, dsContext);

    // We mix the raw metadata with our design system context for the XML extractor
    const xmlMetadataWithContext = { ...metadata, ...dsContext };
    const colorsFromXML = this.extractColorsFromXMLMetadata(xmlMetadataWithContext);

    const colors = [...colorsFromVariables, ...colorsFromXML];
    // Removed: console.log(`  ✅ Total colors: ${colors.length} (${colorsFromVariables.length} from variables, ${colorsFromXML.length} from XML)`);

    // Extract typography from code and variables
    // Removed: console.log('\n📝 Extracting typography...');
    const typography = this.extractTypographyFromCode(code, variables);

    // Extract spacing tokens
    // Removed: console.log('\n📏 Extracting spacing...');
    const spacing = this.extractSpacingFromVariables(variables);
    // Removed: console.log(`  ✅ Spacing tokens: ${spacing.length}`);

    // Extract shadows
    // Removed: console.log('\n🌑 Extracting shadows...');
    const shadows = this.extractShadowsFromVariables(variables);
    // Removed: console.log(`  ✅ Shadows: ${shadows.length}`);

    return {
      ...baseMetadata,
      metadata: {
        fileName: rawData.metadata?.name || baseMetadata.metadata?.fileName || 'MCP Figma File',
        fileKey: rawData.fileId || baseMetadata.metadata?.fileKey || 'unknown',
        nodeId: rawData.nodeId || baseMetadata.metadata?.nodeId || null,
        extractionMethod: 'figma-mcp-structured',
        componentCount: components.length,
        colorCount: colors.length,
        typographyCount: typography.length,
        extractedAt: rawData.extractedAt || baseMetadata.metadata?.extractedAt || new Date().toISOString(),
        source: 'mcp-structured'
      },
      components,
      colors,
      typography,
      spacing,
      shadows,
      rawFigmaData: rawData
    };
  }

  /**
   * Extract components from structured MCP data
   */
  extractComponentsFromStructuredData(metadata, code) {
    const components = [];

    // Try to extract from metadata first
    if (metadata && metadata.content) {
      try {
        // Handle both object and string content
        if (typeof metadata.content === 'string') {
          // If it's a string, check if it's XML or JSON
          if (metadata.content.trim().startsWith('<')) {
            // It's XML - parse it properly
            // Removed: console.log('🔄 Parsing XML content from MCP metadata...');
            const xmlComponents = this.extractComponents(metadata.content);
            components.push(...xmlComponents);
            // Removed: console.log(`✅ Extracted ${xmlComponents.length} components from XML metadata`);
          } else {
            // Try JSON parsing
            const parsedMetadata = JSON.parse(metadata.content);
            if (parsedMetadata.children) {
              this.processNodeChildren(parsedMetadata.children, components);
            } else if (parsedMetadata.name) {
              components.push({
                id: parsedMetadata.id || 'mcp-component-1',
                name: parsedMetadata.name,
                type: parsedMetadata.type || 'COMPONENT',
                properties: {
                  source: 'mcp-metadata',
                  ...parsedMetadata
                }
              });
            }
          }
        } else if (Array.isArray(metadata.content)) {
          // Handle array format from MCP (content is array of text objects)
          for (const item of metadata.content) {
            if (item.type === 'text' && item.text && item.text.trim().startsWith('<')) {
              // Removed: console.log('🔄 Parsing XML content from MCP metadata array...');
              const xmlComponents = this.extractComponents(item.text);
              components.push(...xmlComponents);
              // Removed: console.log(`✅ Extracted ${xmlComponents.length} components from XML metadata`);
              break; // Usually only the first item contains the XML
            }
          }
        } else {
          // It's already an object
          const parsedMetadata = metadata.content;
          if (parsedMetadata.children) {
            this.processNodeChildren(parsedMetadata.children, components);
          } else if (parsedMetadata.name) {
            components.push({
              id: parsedMetadata.id || 'mcp-component-1',
              name: parsedMetadata.name,
              type: parsedMetadata.type || 'COMPONENT',
              properties: {
                source: 'mcp-metadata',
                ...parsedMetadata
              }
            });
          } else {
            // Create component from metadata structure itself
            components.push({
              id: parsedMetadata.id || 'mcp-metadata-component',
              name: parsedMetadata.name || 'MCP Component',
              type: parsedMetadata.type || 'COMPONENT',
              properties: {
                source: 'mcp-metadata-direct',
                ...parsedMetadata
              }
            });
          }
        }
      } catch (error) {
        console.warn('Failed to parse metadata content:', error);
        // Fallback: create a single component
        components.push({
          id: 'mcp-fallback-component',
          name: 'MCP Component',
          type: 'COMPONENT',
          properties: {
            source: 'mcp-fallback',
            error: error.message
          }
        });
      }
    }

    // If no components from metadata, create from code
    if (components.length === 0 && code && code.content) {
      const codeLength = typeof code.content === 'string' ? code.content.length : JSON.stringify(code.content).length;
      components.push({
        id: 'mcp-code-component',
        name: 'MCP Component',
        type: 'COMPONENT',
        properties: {
          source: 'mcp-code',
          hasCode: true,
          codeLength
        }
      });
    }

    return components;
  }

  /**
   * Process node children recursively
   */
  processNodeChildren(children, components) {
    children.forEach((child, index) => {
      components.push({
        id: child.id || `mcp-child-${index}`,
        name: child.name || `Component ${index + 1}`,
        type: child.type || 'COMPONENT',
        properties: {
          source: 'mcp-children',
          ...child
        },
        children: child.children ? [] : undefined
      });

      if (child.children && child.children.length > 0) {
        this.processNodeChildren(child.children, components);
      }
    });
  }

  /**
   * Extract colors directly from XML metadata content
   * @param {Object} metadata - MCP metadata containing XML
   * @returns {Array} Array of color objects
   */
  extractColorsFromXMLMetadata(metadata) {
    const colors = [];
    let xmlContent = '';

    // Removed: console.log('🎨 Color Extraction from XML Metadata Debug:');
    // Removed: console.log('  - Metadata present:', !!metadata);
    // Removed: console.log('  - Metadata.content present:', !!(metadata && metadata.content));

    // Get XML content from metadata
    if (metadata && metadata.content) {
      // Removed: console.log('  - Metadata.content type:', typeof metadata.content);
      // Removed: console.log('  - Metadata.content is array:', Array.isArray(metadata.content));

      if (Array.isArray(metadata.content)) {
        // Removed: console.log('  - Metadata.content length:', metadata.content.length);
        for (const item of metadata.content) {
          if (item.type === 'text' && item.text) {
            xmlContent += item.text;
          }
        }
        // Removed: console.log('  - Assembled XML content length:', xmlContent.length);
      } else if (typeof metadata.content === 'string') {
        xmlContent = metadata.content;
        // Removed: console.log('  - XML content length:', xmlContent.length);
      } else {
        console.warn('  - Metadata.content has unexpected type');
      }
    } else {
      console.warn('  - No metadata or metadata.content');
    }

    if (xmlContent) {
      // Use the robust XML color extractor
      const extracted = this.extractColors(xmlContent);

      // Normalize values and de-duplicate by normalized value
      const seen = new Set();
      extracted.forEach((item, index) => {
        const norm = this.normalizeColorString(item.value);
        if (!norm) return;
        if (seen.has(norm)) return;

        seen.add(norm);

        // Map to design system token if available
        let token = null;
        if (metadata?.designSystem) {
          token = this.findTokenForColor(norm, metadata.designSystem);
        }

        colors.push({
          id: `xml-color-${index}`,
          name: item.name || `Color ${colors.length + 1}`,
          value: norm,
          type: 'COLOR',
          source: 'xml-metadata',
          token: token // Attach matched token
        });
      });

      // Removed: console.log(`  ✅ Extracted ${colors.length} colors from XML metadata`);
    } else {
      console.warn('  - No XML content to extract colors from');
    }

    return colors;
  }

  /**
   * Helper to find matching token for a color value
   */
  findTokenForColor(colorValue, designSystem) {
    if (!designSystem || !designSystem.tokens) return null;

    // Check colors section
    const colorTokens = designSystem.tokens.colors || {};

    // Simple exact match first
    for (const [name, tokenValue] of Object.entries(colorTokens)) {
      const normToken = this.normalizeColorString(tokenValue);

      if (normToken === colorValue) {
        return { name, value: tokenValue, type: 'exact' };
      }
    }

    return null;
  }

  /**
   * Extract colors from variables
   */
  extractColorsFromVariables(variables, context = {}) {
    const colors = [];
    const { designSystem } = context;

    // Removed: console.log('🎨 Color Extraction from Variables Debug:');
    // Removed: console.log('  - Variables present:', !!variables);
    // Removed: console.log('  - Variables.content present:', !!(variables && variables.content));

    if (variables && variables.content) {
      try {
        let varsData;

        // Removed: console.log('  - Variables.content type:', typeof variables.content);
        // Removed: console.log('  - Variables.content is array:', Array.isArray(variables.content));

        // Handle array format from MCP
        if (Array.isArray(variables.content)) {
          // Removed: console.log('  - Variables.content length:', variables.content.length);
          // Find the first text item with JSON content
          const textItem = variables.content.find(item => item.type === 'text' && item.text);
          if (textItem && textItem.text) {
            // Removed: console.log('  - Found text item, length:', textItem.text.length);
            try {
              varsData = JSON.parse(textItem.text);
              // Removed: console.log('🎨 Parsing colors from MCP variables array...');
            } catch (e) {
              console.warn('Variables text is not JSON:', textItem.text.substring(0, 100));
              console.warn('Parse error:', e.message);
              return colors;
            }
          } else {
            console.warn('  - No text item found in variables.content array');
            return colors;
          }
        } else {
          // Handle both object and string content (original logic)
          varsData = typeof variables.content === 'string' ?
            JSON.parse(variables.content) : variables.content;
          // Removed: console.log('  - Variables data parsed/extracted');
        }

        // Look for color variables in different possible structures
        // Removed: console.log('  - VarsData has .variables:', !!varsData.variables);
        if (varsData.variables) {
          const colorVars = Object.entries(varsData.variables).filter(([key, value]) => this.isColorVariable(value));
          // Removed: console.log('  - Found', colorVars.length, 'color variables in varsData.variables');
          colorVars.forEach(([key, value]) => {
            const extracted = this.extractColorValue(value);
            const norm = this.normalizeColorString(extracted);
            if (!norm) return;

            // Map to token
            let token = null;
            if (designSystem) {
              token = this.findTokenForColor(norm, designSystem);
            }

            colors.push({
              id: key,
              name: value.name || key,
              value: norm,
              type: 'COLOR',
              source: 'mcp-variables',
              token
            });
          });
        } else if (varsData && typeof varsData === 'object') {
          // Removed: console.log('  - Checking varsData directly for colors...');
          const entries = Object.entries(varsData);
          // Removed: console.log('  - VarsData has', entries.length, 'entries');

          // Try to extract colors from direct variable data
          entries.forEach(([key, value]) => {
            // Handle both structured variables and direct hex values
            if (this.isColorVariable(value)) {
              const extracted = this.extractColorValue(value);
              const norm = this.normalizeColorString(extracted);
              if (!norm) return;

              // Map to token
              let token = null;
              if (designSystem) {
                token = this.findTokenForColor(norm, designSystem);
              }

              colors.push({
                id: key,
                name: value.name || key,
                value: norm,
                type: 'COLOR',
                source: 'mcp-variables-direct',
                token
              });
            } else if (typeof value === 'string' && this.isHexColor(value)) {
              // Direct hex color values like "Primary":"#434F64"
              const norm = this.normalizeColorString(value);
              if (!norm) return;

              // Map to token
              let token = null;
              if (designSystem) {
                token = this.findTokenForColor(norm, designSystem);
              }

              colors.push({
                id: key,
                name: key.replace(/_/g, ' '), // Convert underscores to spaces
                value: norm,
                type: 'COLOR',
                source: 'mcp-variables-hex',
                token
              });
            }
          });
        } else {
          console.warn('  - VarsData is not an object or has unexpected structure');
        }
      } catch (error) {
        console.error('❌ Failed to parse variables content:', error);
        console.error('   Error stack:', error.stack);
      }
    } else {
      console.warn('  - No variables or variables.content - skipping variable color extraction');
    }

    // Removed: console.log(`  ✅ Extracted ${colors.length} colors from variables`);
    return colors;
  }

  /**
   * Extract typography from code and variables
   */
  extractTypographyFromCode(code, variables = null) {
    const typography = [];

    // Enhanced logging for debugging
    // Removed: console.log('📝 Typography Extraction Debug:');
    // Removed: console.log('  - Variables present:', !!variables);
    // Removed: console.log('  - Code present:', !!code);
    if (variables && variables.content) {
      // Removed: console.log('  - Variables type:', typeof variables.content);
      // Removed: console.log('  - Variables array length:', Array.isArray(variables.content) ? variables.content.length : 'N/A');
    }

    // First, try to extract from variables if provided (where Font() declarations are)
    if (variables && variables.content) {
      let varsString = '';

      if (Array.isArray(variables.content)) {
        const textItem = variables.content.find(item => item.type === 'text' && item.text);
        if (textItem) {
          varsString = textItem.text;
          // Removed: console.log('📝 Parsing typography from MCP variables array...');
        }
      } else if (typeof variables.content === 'string') {
        varsString = variables.content;
      }

      if (varsString) {
        // Look for Figma Font() declarations in variables
        const figmaFontMatches = varsString.match(/Font\([^)]+\)/gi) || [];
        const fontKeyMatches = varsString.match(/"([^"]*(?:Title|Body|font)[^"]*)"\s*:\s*"([^"]*Font[^"]*)"/gi) || [];

        figmaFontMatches.forEach((match, index) => {
          const fontProps = this.parseFigmaFont(match);
          if (fontProps) {
            typography.push({
              id: `mcp-vars-font-${index}`,
              name: `Typography ${index + 1}`,
              fontFamily: fontProps.family || 'Unknown',
              fontSize: fontProps.size || 16,
              fontWeight: fontProps.weight || 400,
              source: 'mcp-variables-font'
            });
          }
        });

        // Also extract typography tokens like "Title/Secondary":"Font(...)"
        const tokenMatches = varsString.match(/"([^"]*(?:Title|Body|Heading)[^"]*)"\s*:\s*"([^"]*)"/gi) || [];
        tokenMatches.forEach((match, index) => {
          const [, tokenName, tokenValue] = match.match(/"([^"]*)"\s*:\s*"([^"]*)"/) || [];
          if (tokenName && tokenValue && tokenValue.includes('Font(')) {
            const fontProps = this.parseFigmaFont(tokenValue);
            if (fontProps) {
              typography.push({
                id: `mcp-token-font-${index}`,
                name: tokenName.replace(/[/_]/g, ' '),
                fontFamily: fontProps.family,
                fontSize: fontProps.size,
                fontWeight: fontProps.weight,
                source: 'mcp-typography-token'
              });
            }
          }
        });
      }
    }

    // Then extract from code as fallback
    if (code && code.content) {
      let codeString = '';

      // Handle array format from MCP
      if (Array.isArray(code.content)) {
        // Combine all text content from the array
        code.content.forEach(item => {
          if (item.type === 'text' && item.text) {
            codeString += item.text + '\n';
          }
        });
        // Removed: console.log('📝 Parsing typography from MCP code array...');
      } else {
        // Convert content to string if it's an object (original logic)
        codeString = typeof code.content === 'string' ?
          code.content : JSON.stringify(code.content);
      }

      // Look for font-related properties in the code
      const fontMatches = codeString.match(/font-family:\s*([^;]+)/gi) || [];
      const sizeMatches = codeString.match(/font-size:\s*([^;]+)/gi) || [];

      // Also look for Figma Font() declarations
      const figmaFontMatches = codeString.match(/Font\(([^)]+)\)/gi) || [];

      fontMatches.forEach((match, index) => {
        typography.push({
          id: `mcp-font-${index}`,
          name: `Font ${index + 1}`,
          fontFamily: match.replace(/font-family:\s*/, '').replace(/['"]/g, ''),
          fontSize: sizeMatches[index] ? parseInt(sizeMatches[index].replace(/font-size:\s*/, '')) : 16,
          source: 'mcp-code'
        });
      });

      // Extract Figma Font declarations
      figmaFontMatches.forEach((match, index) => {
        const fontProps = this.parseFigmaFont(match);
        if (fontProps) {
          typography.push({
            id: `mcp-figma-font-${index}`,
            name: fontProps.name || `Figma Font ${index + 1}`,
            fontFamily: fontProps.family,
            fontSize: fontProps.size,
            fontWeight: fontProps.weight,
            source: 'mcp-figma-font'
          });
        }
      });
    }

    // FALLBACK: If no typography found, try extracting from code CSS
    if (typography.length === 0 && code && code.content) {
      console.log('⚠️ No typography in variables, trying CSS extraction fallback...');
      const cssTypography = this.extractTypographyFromCSS(code.content);
      typography.push(...cssTypography);
    }

    // Removed: console.log(`✅ Typography Extraction Complete: ${typography.length} items found`);
    return typography;
  }

  /**
   * Extract typography from CSS code (fallback method)
   */
  extractTypographyFromCSS(cssContent) {
    const typography = [];
    let cssString = '';

    if (Array.isArray(cssContent)) {
      const textItem = cssContent.find(item => item.type === 'text' && item.text);
      if (textItem) cssString = textItem.text;
    } else if (typeof cssContent === 'string') {
      cssString = cssContent;
    }

    if (!cssString) return typography;

    // Removed: console.log('🔍 Extracting typography from CSS (length:', cssString.length, ')');

    // Extract font-family declarations
    const fontFamilyMatches = cssString.match(/font-family:\s*([^;}"'\n]+)/gi) || [];
    const fontFamilies = [...new Set(fontFamilyMatches.map(m => {
      const match = m.match(/font-family:\s*([^;}"'\n]+)/i);
      if (!match) return null;
      return match[1].trim().replace(/["']/g, '').split(',')[0].trim(); // Get first font in stack
    }).filter(Boolean))];

    // Removed: console.log('  - Found font families:', fontFamilies);

    // Extract font-size declarations
    const fontSizes = [...new Set((cssString.match(/font-size:\s*(\d+(?:\.\d+)?(?:px|rem|em))/gi) || [])
      .map(m => {
        const match = m.match(/font-size:\s*(\d+(?:\.\d+)?)(px|rem|em)/i);
        if (!match) return null;
        const value = parseFloat(match[1]);
        const unit = match[2];
        // Convert to px for consistency
        if (unit === 'rem') return value * 16;
        if (unit === 'em') return value * 16;
        return value;
      }).filter(Boolean))];

    // Extract font-weight declarations
    const fontWeights = [...new Set((cssString.match(/font-weight:\s*(\d+|bold|normal|lighter|bolder)/gi) || [])
      .map(m => {
        const match = m.match(/font-weight:\s*(\d+|bold|normal|lighter|bolder)/i);
        if (!match) return null;
        const weight = match[1].toLowerCase();
        // Convert named weights to numeric
        if (weight === 'normal') return 400;
        if (weight === 'bold') return 700;
        if (weight === 'lighter') return 300;
        if (weight === 'bolder') return 700;
        return parseInt(weight);
      }).filter(Boolean))];

    // Removed: console.log('  - Font sizes found:', fontSizes);
    // Removed: console.log('  - Font weights found:', fontWeights);

    // Create typography entries (one per font family)
    fontFamilies.forEach((family, index) => {
      typography.push({
        id: `css-font-${index}`,
        name: family,
        fontFamily: family,
        fontSize: fontSizes[0] || 16, // Use first size or default
        fontWeight: fontWeights[0] || 400, // Use first weight or default
        source: 'css-fallback'
      });
    });

    // Removed: console.log(`  ✅ Extracted ${typography.length} font families from CSS`);
    return typography;
  }

  /**
   * Normalize various color string formats to 6-digit hex (#rrggbb)
   * Returns null if not parseable
   */
  normalizeColorString(value) {
    if (!value || typeof value !== 'string') return null;
    let v = value.trim().toLowerCase();

    // Hex forms: #rgb, #rgba, #rrggbb, #rrggbbaa
    if (v.startsWith('#')) {
      let hex = v.slice(1);
      if (hex.length === 3 || hex.length === 4) {
        // Expand shorthand (#rgb or #rgba) and drop alpha if present
        const r = hex[0];
        const g = hex[1];
        const b = hex[2];
        hex = r + r + g + g + b + b; // ignore alpha (hex[3])
      } else if (hex.length === 8) {
        // Drop alpha (#rrggbbaa -> #rrggbb)
        hex = hex.slice(0, 6);
      } else if (hex.length !== 6) {
        return null;
      }
      return `#${hex}`;
    }

    // rgb/rgba(r, g, b[, a]) -> #rrggbb (ignore alpha)
    const rgbMatch = v.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*([0-9.]+)\s*)?\)$/i);
    if (rgbMatch) {
      const clamp = (n) => Math.max(0, Math.min(255, Math.round(parseFloat(n))));
      const r = clamp(rgbMatch[1]);
      const g = clamp(rgbMatch[2]);
      const b = clamp(rgbMatch[3]);
      const toHex = (n) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // hsl/hsla(h, s, l[, a]) -> #rrggbb
    // Supports commma and space separation
    if (v.startsWith('hsl')) {
      const match = v.match(/^hsla?\((.+)\)$/i);
      if (match) {
        const parts = match[1].split(/[\s,]+/).filter(p => p !== '/' && p.trim() !== '');
        if (parts.length >= 3) {
          let h = parseFloat(parts[0]);
          let s = parseFloat(parts[1].replace('%', ''));
          let l = parseFloat(parts[2].replace('%', ''));

          // Convert HSL to RGB
          s /= 100;
          l /= 100;
          const k = n => (n + h / 30) % 12;
          const a = s * Math.min(l, 1 - l);
          const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

          const r = Math.round(255 * f(0));
          const g = Math.round(255 * f(8));
          const b = Math.round(255 * f(4));

          // rgb to hex
          const toHex = (n) => n.toString(16).padStart(2, '0');
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
      }
    }

    // Basic named colors mapping
    const named = {
      black: '#000000',
      white: '#ffffff',
      red: '#ff0000',
      green: '#008000',
      blue: '#0000ff',
      yellow: '#ffff00',
      orange: '#ffa500',
      purple: '#800080',
      pink: '#ffc0cb',
      gray: '#808080',
      grey: '#808080'
    };
    if (named[v]) return named[v];

    return null;
  }

  /**
   * Check if a variable represents a color
   */
  isColorVariable(value) {
    return value.type === 'COLOR' ||
      (typeof value.value === 'string' && value.value.match(/^#[0-9a-fA-F]{6}$/));
  }

  /**
   * Check if a string is a hex color
   */
  isHexColor(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  }

  /**
   * Parse Figma Font() declaration
   */
  parseFigmaFont(fontString) {
    try {
      // Extract properties from Font(family: \"Inter\", style: Semi Bold, size: 24, weight: 600, lineHeight: 1.4)
      // Handle both escaped quotes (\") and regular quotes (")
      const familyMatch = fontString.match(/family:\s*\\?"([^"]+)\\?"/);
      const sizeMatch = fontString.match(/size:\s*(\d+)/);
      const weightMatch = fontString.match(/weight:\s*(\d+)/);
      const styleMatch = fontString.match(/style:\s*([^,)]+)/);

      const result = {
        family: familyMatch ? familyMatch[1].replace(/\\/g, '') : 'Unknown', // Remove escape characters
        size: sizeMatch ? parseInt(sizeMatch[1]) : 16,
        weight: weightMatch ? parseInt(weightMatch[1]) : 400,
        style: styleMatch ? styleMatch[1].trim() : 'Regular'
      };

      // Successfully parsed font

      return result;
    } catch (error) {
      console.warn('Failed to parse Figma font:', fontString, error);
      return null;
    }
  }

  /**
   * Extract color value from variable
   */
  extractColorValue(value) {
    if (typeof value.value === 'string') {
      return value.value;
    }

    if (value.value && value.value.r !== undefined) {
      // RGB format
      const r = Math.round(value.value.r * 255);
      const g = Math.round(value.value.g * 255);
      const b = Math.round(value.value.b * 255);
      return `rgb(${r}, ${g}, ${b})`;
    }

    return '#000000';
  }

  /**
   * Extract spacing tokens from variables
   */
  extractSpacingFromVariables(variables) {
    const spacing = [];

    if (variables && variables.content) {
      try {
        let varsData;

        // Handle array format from MCP
        if (Array.isArray(variables.content)) {
          const textItem = variables.content.find(item => item.type === 'text' && item.text);
          if (textItem && textItem.text) {
            try {
              varsData = JSON.parse(textItem.text);
              // Removed: console.log('📏 Parsing spacing from MCP variables array...');
            } catch (e) {
              return spacing;
            }
          }
        } else {
          varsData = typeof variables.content === 'string' ?
            JSON.parse(variables.content) : variables.content;
        }

        if (varsData && typeof varsData === 'object') {
          Object.entries(varsData).forEach(([key, value]) => {
            // Look for spacing patterns: x0, x1, x2, spacing-, margin-, padding-, gap-
            if (this.isSpacingVariable(key, value)) {
              spacing.push({
                id: key,
                name: this.formatSpacingName(key),
                value: this.parseSpacingValue(value),
                unit: 'px',
                type: 'SPACING',
                source: 'mcp-spacing'
              });
            }
          });
        }
      } catch (error) {
        console.warn('Failed to parse spacing variables:', error);
      }
    }

    return spacing;
  }

  /**
   * Extract shadows from variables
   */
  extractShadowsFromVariables(variables) {
    const shadows = [];

    if (variables && variables.content) {
      try {
        let varsData;

        // Handle array format from MCP
        if (Array.isArray(variables.content)) {
          const textItem = variables.content.find(item => item.type === 'text' && item.text);
          if (textItem && textItem.text) {
            try {
              varsData = JSON.parse(textItem.text);
              // Removed: console.log('🌟 Parsing shadows from MCP variables array...');
            } catch (e) {
              return shadows;
            }
          }
        } else {
          varsData = typeof variables.content === 'string' ?
            JSON.parse(variables.content) : variables.content;
        }

        if (varsData && typeof varsData === 'object') {
          Object.entries(varsData).forEach(([key, value]) => {
            if (this.isShadowVariable(key, value)) {
              shadows.push({
                id: key,
                name: key.replace(/[/_]/g, ' '),
                value: value,
                type: 'SHADOW',
                source: 'mcp-shadow'
              });
            }
          });
        }
      } catch (error) {
        console.warn('Failed to parse shadow variables:', error);
      }
    }

    return shadows;
  }

  /**
   * Check if a variable represents spacing
   */
  isSpacingVariable(key, value) {
    const spacingPatterns = /^(x\d+|spacing|margin|padding|gap|size)([_-]|$)/i;
    return spacingPatterns.test(key) && (typeof value === 'string' || typeof value === 'number');
  }

  /**
   * Check if a variable represents a shadow
   */
  isShadowVariable(key, value) {
    return /shadow/i.test(key) && typeof value === 'string';
  }

  /**
   * Format spacing name for display
   */
  formatSpacingName(key) {
    if (/^x\d+$/.test(key)) {
      const num = key.replace('x', '');
      return `Spacing ${num}`;
    }
    return key.replace(/[/_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Parse spacing value to number
   */
  parseSpacingValue(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }
}
