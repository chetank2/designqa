import { logger } from '../../utils/logger.js';

/**
 * IssueFormatter - Transforms comparison discrepancies into DevRev-ready issues
 * 
 * Converts raw comparison data into structured issue format with:
 * - Frame/Component names from Figma
 * - Auto-calculated severity and priority
 * - DevRev-compatible field structure
 */
export class IssueFormatter {
  /**
   * Transform comparison results into DevRev-ready issues
   * @param {Object} comparisonResults - Full comparison results
   * @returns {Array<Object>} Array of formatted issues
   */
  transform(comparisonResults) {
    logger.info('Transforming comparison results into DevRev issues');

    const issues = [];
    let issueId = 1;

    try {
      // Extract all discrepancies from comparisons
      const comparisons = comparisonResults.comparisons || [];
      const metadata = comparisonResults.metadata || {};

      comparisons.forEach(comparison => {
        // Skip comparisons with no deviations or "matches" status
        if (comparison.status === 'matches' || !comparison.deviations || comparison.deviations.length === 0) {
          return;
        }

        // Process each deviation in the deviations array
        comparison.deviations.forEach(deviation => {
          // Determine deviation type and create appropriate issue
          const deviationType = this.detectDeviationType(deviation);

          switch (deviationType) {
            case 'color':
              issues.push(this.createColorIssue(issueId++, deviation, comparison, metadata));
              break;
            case 'typography':
              issues.push(this.createTypographyIssue(issueId++, deviation, comparison, metadata));
              break;
            case 'spacing':
              issues.push(this.createSpacingIssue(issueId++, deviation, comparison, metadata));
              break;
            case 'existence':
              issues.push(this.createExistenceIssue(issueId++, deviation, comparison, metadata));
              break;
            default:
              issues.push(this.createGenericIssue(issueId++, deviation, comparison, metadata));
          }
        });
      });

      logger.info(`Generated ${issues.length} DevRev issues from comparison results`);
      return issues;

    } catch (error) {
      logger.error('Failed to transform comparison results', error);
      return [];
    }
  }

  /**
   * Transform comparison results into developer-friendly issues
   * @param {Object} comparisonResults - Full comparison results
   * @returns {Array<Object>} Array of developer-focused issues
   */
  transformForDevelopers(comparisonResults) {
    logger.info('Transforming comparison results for developer CSV export');

    const issues = [];
    let issueId = 1;

    try {
      const comparisons = comparisonResults.comparisons || [];
      const metadata = comparisonResults.metadata || {};

      comparisons.forEach(comparison => {
        if (comparison.status === 'matches' || !comparison.deviations || comparison.deviations.length === 0) {
          return;
        }

        comparison.deviations.forEach(deviation => {
          const baseIssue = this.createBaseIssue(issueId++, deviation, comparison, metadata);
          const developerEnhancements = this.generateDeveloperEnhancements(deviation, comparison, metadata);

          issues.push({
            ...baseIssue,
            ...developerEnhancements
          });
        });
      });

      logger.info(`Generated ${issues.length} developer-focused issues from comparison results`);
      return issues;

    } catch (error) {
      logger.error('Failed to transform comparison results for developers', error);
      return [];
    }
  }
  
  /**
   * Detect deviation type from deviation object
   */
  detectDeviationType(deviation) {
    const property = (deviation.property || '').toLowerCase();
    
    // Check for existence issues (missing components)
    if (property === 'existence') {
      return 'existence';
    }
    
    // Check for color-related properties
    if (property.includes('color') || property.includes('fill') || property.includes('background')) {
      return 'color';
    }
    
    // Check for typography properties
    if (property.includes('font') || property.includes('text') || property.includes('typography')) {
      return 'typography';
    }
    
    // Check for spacing/layout properties
    if (property.includes('padding') || property.includes('margin') || property.includes('spacing') || 
        property.includes('gap') || property.includes('size') || property.includes('width') || property.includes('height')) {
      return 'spacing';
    }
    
    return 'generic';
  }
  
  /**
   * Create issue for color deviation
   */
  createColorIssue(issueId, deviation, comparison, metadata) {
    const componentName = comparison.componentName || comparison.figmaComponent?.name || 'Unknown Component';
    const componentId = comparison.componentId || comparison.figmaComponent?.id || 'N/A';
    const componentType = comparison.componentType || comparison.figmaComponent?.type || 'N/A';
    const webElement = this.formatWebElement(comparison.webElement);
    
    const figmaValue = deviation.figmaValue || deviation.expected || 'N/A';
    const webValue = deviation.webValue || deviation.actual || 'N/A';
    const difference = deviation.difference || 'N/A';
    
    return {
      issueId,
      title: `Color mismatch in ${componentName}`,
      description: deviation.message || `Expected ${deviation.property || 'color'} to be ${figmaValue} but found ${webValue}. ${typeof difference === 'number' ? `Color difference: ${difference.toFixed(1)}%` : ''}`,
      module: this.extractModule(metadata),
      frameComponentName: componentName,
      figmaComponentId: componentId,
      figmaComponentType: componentType,
      webElement,
      severity: this.calculateColorSeverity(deviation),
      priority: this.calculatePriority(this.calculateColorSeverity(deviation), 'color', componentName),
      reportedBy: 'Figma Comparison Tool',
      assignedTo: '',
      status: 'Open',
      stepsToReproduce: this.generateSteps(metadata, componentName),
      expectedResult: `${deviation.property || 'Color'}: ${figmaValue}`,
      actualResult: `${deviation.property || 'Color'}: ${webValue}`,
      environment: this.extractEnvironment(metadata),
      createdDate: new Date().toISOString().split('T')[0],
      updatedDate: new Date().toISOString().split('T')[0],
      remarks: typeof difference === 'number' ? `Color difference: ${difference.toFixed(1)}%. Check if this variation is intentional.` : 'Check if this color variation is intentional.'
    };
  }
  
  /**
   * Create issue for typography deviation
   */
  createTypographyIssue(issueId, deviation, comparison, metadata) {
    const componentName = comparison.componentName || comparison.figmaComponent?.name || 'Unknown Component';
    const componentId = comparison.componentId || comparison.figmaComponent?.id || 'N/A';
    const componentType = comparison.componentType || comparison.figmaComponent?.type || 'N/A';
    const webElement = this.formatWebElement(comparison.webElement);
    
    const figmaValue = deviation.figmaValue || deviation.expected || 'N/A';
    const webValue = deviation.webValue || deviation.actual || 'N/A';
    
    return {
      issueId,
      title: `Typography mismatch in ${componentName}`,
      description: deviation.message || `Font ${deviation.property || 'style'} mismatch: Expected ${figmaValue} but found ${webValue}`,
      module: this.extractModule(metadata),
      frameComponentName: componentName,
      figmaComponentId: componentId,
      figmaComponentType: componentType,
      webElement,
      severity: 'Major',
      priority: this.calculatePriority('Major', 'typography', componentName),
      reportedBy: 'Figma Comparison Tool',
      assignedTo: '',
      status: 'Open',
      stepsToReproduce: this.generateSteps(metadata, componentName),
      expectedResult: `${deviation.property || 'Font'}: ${figmaValue}`,
      actualResult: `${deviation.property || 'Font'}: ${webValue}`,
      environment: this.extractEnvironment(metadata),
      createdDate: new Date().toISOString().split('T')[0],
      updatedDate: new Date().toISOString().split('T')[0],
      remarks: 'Typography consistency is important for brand identity.'
    };
  }
  
  /**
   * Create issue for spacing deviation
   */
  createSpacingIssue(issueId, deviation, comparison, metadata) {
    const componentName = comparison.componentName || comparison.figmaComponent?.name || 'Unknown Component';
    const componentId = comparison.componentId || comparison.figmaComponent?.id || 'N/A';
    const componentType = comparison.componentType || comparison.figmaComponent?.type || 'N/A';
    const webElement = this.formatWebElement(comparison.webElement);
    
    const figmaValue = deviation.figmaValue || deviation.expected || 'N/A';
    const webValue = deviation.webValue || deviation.actual || 'N/A';
    
    return {
      issueId,
      title: `Spacing issue in ${componentName}`,
      description: deviation.message || `${deviation.property || 'Spacing'} deviation: Expected ${figmaValue} but found ${webValue}`,
      module: this.extractModule(metadata),
      frameComponentName: componentName,
      figmaComponentId: componentId,
      figmaComponentType: componentType,
      webElement,
      severity: 'Minor',
      priority: this.calculatePriority('Minor', 'spacing', componentName),
      reportedBy: 'Figma Comparison Tool',
      assignedTo: '',
      status: 'Open',
      stepsToReproduce: this.generateSteps(metadata, componentName),
      expectedResult: `${deviation.property || 'Spacing'}: ${figmaValue}`,
      actualResult: `${deviation.property || 'Spacing'}: ${webValue}`,
      environment: this.extractEnvironment(metadata),
      createdDate: new Date().toISOString().split('T')[0],
      updatedDate: new Date().toISOString().split('T')[0],
      remarks: 'Minor spacing adjustments may be acceptable for responsive design.'
    };
  }
  
  /**
   * Create issue for overall component deviation
   */
  createOverallIssue(issueId, comparison, metadata) {
    const componentName = comparison.figmaComponent?.name || comparison.componentName || 'Unknown Component';
    const componentId = comparison.figmaComponent?.id || comparison.componentId || 'N/A';
    const webElement = this.formatWebElement(comparison.webElement);
    const deviation = comparison.overallDeviation || {};
    
    return {
      issueId,
      title: `${this.capitalizeFirst(deviation.severity || 'medium')} discrepancy in ${componentName}`,
      description: `Component has ${deviation.severity || 'medium'} severity discrepancies. Match percentage: ${deviation.matchPercentage?.toFixed(1)}%`,
      module: this.extractModule(metadata),
      frameComponentName: componentName,
      figmaComponentId: componentId,
      figmaComponentType: comparison.figmaComponent?.type || comparison.componentType || 'N/A',
      webElement,
      severity: this.mapSeverity(deviation.severity),
      priority: this.calculatePriority(this.mapSeverity(deviation.severity), 'overall', componentName),
      reportedBy: 'Figma Comparison Tool',
      assignedTo: '',
      status: 'Open',
      stepsToReproduce: this.generateSteps(metadata, componentName),
      expectedResult: 'Component should match Figma design specifications',
      actualResult: `Match percentage: ${deviation.matchPercentage?.toFixed(1)}%`,
      environment: this.extractEnvironment(metadata),
      createdDate: new Date().toISOString().split('T')[0],
      updatedDate: new Date().toISOString().split('T')[0],
      remarks: 'Review all component properties for alignment with design system.'
    };
  }
  
  /**
   * Create issue for existence/missing component
   */
  createExistenceIssue(issueId, deviation, comparison, metadata) {
    const componentName = comparison.componentName || comparison.figmaComponent?.name || 'Unknown Component';
    const componentId = comparison.componentId || comparison.figmaComponent?.id || 'N/A';
    const componentType = comparison.componentType || comparison.figmaComponent?.type || 'N/A';
    
    return {
      issueId,
      title: `Missing component: ${componentName}`,
      description: deviation.message || `Component "${componentName}" exists in Figma but was not found in the web implementation.`,
      module: this.extractModule(metadata),
      frameComponentName: componentName,
      figmaComponentId: componentId,
      figmaComponentType: componentType,
      webElement: 'Not found',
      severity: this.mapSeverity(deviation.severity) || 'Critical',
      priority: 'High',
      reportedBy: 'Figma Comparison Tool',
      assignedTo: '',
      status: 'Open',
      stepsToReproduce: this.generateSteps(metadata, componentName),
      expectedResult: `Component "${componentName}" should be present in the web implementation`,
      actualResult: 'Component not found',
      environment: this.extractEnvironment(metadata),
      createdDate: new Date().toISOString().split('T')[0],
      updatedDate: new Date().toISOString().split('T')[0],
      remarks: 'This component is present in the Figma design but missing from the web implementation. Verify if this is intentional or needs to be implemented.'
    };
  }
  
  /**
   * Create issue for generic deviations
   */
  createGenericIssue(issueId, deviation, comparison, metadata) {
    const componentName = comparison.componentName || comparison.figmaComponent?.name || 'Unknown Component';
    const componentId = comparison.componentId || comparison.figmaComponent?.id || 'N/A';
    const componentType = comparison.componentType || comparison.figmaComponent?.type || 'N/A';
    const webElement = this.formatWebElement(comparison.webElement);
    const property = deviation.property || 'property';
    
    return {
      issueId,
      title: `${this.capitalizeFirst(property)} mismatch in ${componentName}`,
      description: deviation.message || `${this.capitalizeFirst(property)} does not match design specifications.`,
      module: this.extractModule(metadata),
      frameComponentName: componentName,
      figmaComponentId: componentId,
      figmaComponentType: componentType,
      webElement,
      severity: this.mapSeverity(deviation.severity) || 'Minor',
      priority: this.calculatePriority(this.mapSeverity(deviation.severity) || 'Minor', 'generic', componentName),
      reportedBy: 'Figma Comparison Tool',
      assignedTo: '',
      status: 'Open',
      stepsToReproduce: this.generateSteps(metadata, componentName),
      expectedResult: deviation.figmaValue || 'Match Figma design specifications',
      actualResult: deviation.webValue || 'Does not match design',
      environment: this.extractEnvironment(metadata),
      createdDate: new Date().toISOString().split('T')[0],
      updatedDate: new Date().toISOString().split('T')[0],
      remarks: `${this.capitalizeFirst(property)} difference detected. Review if this variation is acceptable.`
    };
  }
  
  /**
   * Calculate color severity based on difference percentage
   */
  calculateColorSeverity(deviation) {
    const difference = deviation.difference || 0;
    
    if (difference > 30) return 'Critical';
    if (difference > 10) return 'Major';
    return 'Minor';
  }
  
  /**
   * Map internal severity to DevRev severity
   */
  mapSeverity(internalSeverity) {
    const severityMap = {
      high: 'Critical',
      medium: 'Major',
      low: 'Minor'
    };
    
    return severityMap[internalSeverity?.toLowerCase()] || 'Minor';
  }
  
  /**
   * Calculate priority based on severity, type, and component
   */
  calculatePriority(severity, issueType, componentName) {
    // Start with severity-based priority
    let priority = 'Low';
    
    if (severity === 'Critical') priority = 'High';
    else if (severity === 'Major') priority = 'Medium';
    
    // Boost priority for interactive components (buttons, inputs, links)
    const interactiveKeywords = ['button', 'input', 'link', 'cta', 'submit', 'action'];
    if (interactiveKeywords.some(keyword => componentName.toLowerCase().includes(keyword))) {
      if (priority === 'Low') priority = 'Medium';
      else if (priority === 'Medium') priority = 'High';
      else if (priority === 'High') priority = 'Urgent';
    }
    
    // Boost priority for color issues (visual impact)
    if (issueType === 'color' && priority === 'Low') {
      priority = 'Medium';
    }
    
    return priority;
  }
  
  /**
   * Extract module/feature name from metadata
   */
  extractModule(metadata) {
    // Try to extract from Figma file name
    if (metadata.figmaFileName) {
      return metadata.figmaFileName.replace(/\.(fig|figma)$/i, '');
    }
    
    // Try to extract from web URL
    if (metadata.webUrl) {
      try {
        const url = new URL(metadata.webUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          return this.capitalizeFirst(pathParts[0].replace(/-/g, ' '));
        }
      } catch (e) {
        // Invalid URL, ignore
      }
    }
    
    return 'General';
  }
  
  /**
   * Format web element for display
   */
  formatWebElement(webElement) {
    if (!webElement) return 'N/A';
    
    const tag = webElement.tag || webElement.tagName || '';
    const className = webElement.className || webElement.class || '';
    const id = webElement.id || '';
    
    let formatted = tag;
    if (id) formatted += `#${id}`;
    if (className) formatted += `.${className.split(' ')[0]}`; // First class only
    
    return formatted || 'N/A';
  }
  
  /**
   * Generate steps to reproduce
   */
  generateSteps(metadata, componentName) {
    const steps = [];
    
    if (metadata.webUrl) {
      try {
        const url = new URL(metadata.webUrl);
        steps.push(`1. Navigate to ${url.pathname || url.href}`);
      } catch (e) {
        steps.push(`1. Navigate to ${metadata.webUrl}`);
      }
    } else {
      steps.push('1. Navigate to the application');
    }
    
    steps.push(`2. Locate the "${componentName}" component`);
    steps.push('3. Compare visual appearance with Figma design');
    steps.push('4. Note the discrepancy described in this issue');
    
    return steps.join('\n');
  }
  
  /**
   * Extract environment info
   */
  extractEnvironment(metadata) {
    const parts = [];
    
    if (metadata.webUrl) {
      try {
        const url = new URL(metadata.webUrl);
        if (url.hostname.includes('localhost') || url.hostname.includes('127.0.0.1')) {
          parts.push('Development');
        } else if (url.hostname.includes('staging') || url.hostname.includes('dev')) {
          parts.push('Staging');
        } else {
          parts.push('Production');
        }
      } catch (e) {
        parts.push('Unknown');
      }
    }
    
    parts.push('Web / Chrome');
    
    return parts.join(' ');
  }
  
  /**
   * Capitalize first letter
   */
  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Create base issue structure for developer enhancements
   */
  createBaseIssue(issueId, deviation, comparison, metadata) {
    const componentName = comparison.componentName || comparison.figmaComponent?.name || 'Unknown Component';
    const componentId = comparison.componentId || comparison.figmaComponent?.id || 'N/A';
    const componentType = comparison.componentType || comparison.figmaComponent?.type || 'N/A';

    return {
      issueId,
      componentName,
      componentId,
      componentType,
      issueType: this.detectDeviationType(deviation),
      severity: this.mapSeverity(deviation.severity) || this.calculateColorSeverity(deviation),
      priority: this.calculatePriority(this.mapSeverity(deviation.severity), this.detectDeviationType(deviation), componentName),
      property: deviation.property || 'unknown',
      currentValue: deviation.webValue || deviation.actual || 'N/A',
      expectedValue: deviation.figmaValue || deviation.expected || 'N/A',
      description: deviation.message || `${deviation.property} mismatch in ${componentName}`,
      webElement: comparison.webElement
    };
  }

  /**
   * Generate developer-specific enhancements for issues
   */
  generateDeveloperEnhancements(deviation, comparison, metadata) {
    const webElement = comparison.webElement || {};
    const property = deviation.property || 'unknown';
    const expectedValue = deviation.figmaValue || deviation.expected || '';
    const currentValue = deviation.webValue || deviation.actual || '';

    return {
      cssSelector: this.generateCSSSelector(webElement, comparison),
      propertyToFix: this.normalizePropertyName(property),
      cssFix: this.generateCSSFix(property, expectedValue),
      fileLocation: this.estimateFileLocation(webElement, comparison, metadata),
      lineNumber: this.estimateLineNumber(property, webElement),
      quickFixCommand: this.generateQuickFixCommand(property, expectedValue, webElement),
      testSteps: this.generateDeveloperTestSteps(comparison, metadata),
      screenshotUrls: this.generateScreenshotUrls(comparison, metadata),
      designToken: this.mapToDesignToken(property, expectedValue),
      acceptanceCriteria: this.generateAcceptanceCriteria(property, expectedValue, comparison),
      timeEstimate: this.estimateFixTime(deviation, property)
    };
  }

  /**
   * Generate CSS selector for targeting the element
   */
  generateCSSSelector(webElement, comparison) {
    if (!webElement) return '.component';

    const tag = webElement.tag || webElement.tagName || 'div';
    const className = webElement.className || webElement.class || '';
    const id = webElement.id || '';

    // Build selector with specificity
    let selector = tag;

    if (id) {
      selector = `#${id}`;
    } else if (className) {
      const classes = className.split(' ').filter(Boolean);
      if (classes.length > 0) {
        selector = `.${classes[0]}`;
        // Add additional classes for specificity if needed
        if (classes.length > 1) {
          selector += `.${classes[1]}`;
        }
      }
    }

    // Add component-specific context if available
    const componentName = comparison.componentName;
    if (componentName && !selector.includes(componentName.toLowerCase())) {
      const componentClass = componentName.toLowerCase().replace(/\s+/g, '-');
      selector = `.${componentClass} ${selector}`;
    }

    return selector;
  }

  /**
   * Generate CSS fix rule
   */
  generateCSSFix(property, expectedValue) {
    if (!property || !expectedValue) return '';

    const normalizedProperty = this.normalizePropertyName(property);
    const normalizedValue = this.normalizeValue(expectedValue, property);

    return `${normalizedProperty}: ${normalizedValue};`;
  }

  /**
   * Normalize CSS property names
   */
  normalizePropertyName(property) {
    const propertyMap = {
      'font-size': 'font-size',
      'fontSize': 'font-size',
      'font-weight': 'font-weight',
      'fontWeight': 'font-weight',
      'font-family': 'font-family',
      'fontFamily': 'font-family',
      'color': 'color',
      'background-color': 'background-color',
      'backgroundColor': 'background-color',
      'fill': 'background-color',
      'padding': 'padding',
      'margin': 'margin',
      'width': 'width',
      'height': 'height',
      'border-radius': 'border-radius',
      'borderRadius': 'border-radius'
    };

    return propertyMap[property] || property.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  /**
   * Normalize CSS values
   */
  normalizeValue(value, property) {
    if (!value) return value;

    // Color values
    if (property && (property.includes('color') || property.includes('fill'))) {
      // Ensure hex colors have # prefix
      if (/^[0-9a-fA-F]{6}$/.test(value)) {
        return `#${value}`;
      }
      // Convert rgb() to hex if needed
      if (value.startsWith('rgb(')) {
        return this.rgbToHex(value);
      }
    }

    // Size values - ensure unit
    if (property && (property.includes('size') || property.includes('width') || property.includes('height') || property.includes('padding') || property.includes('margin'))) {
      if (/^\d+$/.test(value)) {
        return `${value}px`;
      }
    }

    return value;
  }

  /**
   * Estimate likely file location for the CSS fix
   */
  estimateFileLocation(webElement, comparison, metadata) {
    const componentName = comparison.componentName || 'Component';
    const tag = webElement?.tag || webElement?.tagName || 'div';
    const className = webElement?.className || webElement?.class || '';

    // Try to determine file location based on component name
    const sanitizedComponentName = componentName.replace(/\s+/g, '');

    // Common file patterns
    const patterns = [
      `src/components/${sanitizedComponentName}/${sanitizedComponentName}.css`,
      `src/components/${sanitizedComponentName}/styles.css`,
      `src/components/${sanitizedComponentName}/index.css`,
      `src/styles/components/${sanitizedComponentName.toLowerCase()}.css`,
      `styles/${sanitizedComponentName.toLowerCase()}.css`,
      `src/styles/global.css`
    ];

    // If we have a specific class name, use that
    if (className) {
      const firstClass = className.split(' ')[0];
      patterns.unshift(`src/styles/${firstClass}.css`);
    }

    return patterns[0]; // Return most likely location
  }

  /**
   * Estimate line number in CSS file
   */
  estimateLineNumber(property, webElement) {
    // Simple heuristic - different properties tend to appear in certain order
    const propertyOrder = {
      'display': 10,
      'position': 15,
      'width': 20,
      'height': 25,
      'margin': 30,
      'padding': 35,
      'background-color': 40,
      'color': 45,
      'font-size': 50,
      'font-weight': 55,
      'font-family': 60,
      'border': 65,
      'border-radius': 70
    };

    const normalizedProperty = this.normalizePropertyName(property);
    return propertyOrder[normalizedProperty] || 50;
  }

  /**
   * Generate quick fix command for automated fixes
   */
  generateQuickFixCommand(property, expectedValue, webElement) {
    if (!property || !expectedValue) return '';

    const normalizedProperty = this.normalizePropertyName(property);
    const normalizedValue = this.normalizeValue(expectedValue, property);

    // Generate sed command for simple replacements
    return `sed -i 's/${normalizedProperty}:.*[;}]/${normalizedProperty}: ${normalizedValue};/g' src/styles/**/*.css`;
  }

  /**
   * Generate developer-specific test steps
   */
  generateDeveloperTestSteps(comparison, metadata) {
    const componentName = comparison.componentName || 'component';
    const steps = [];

    steps.push('1. Apply the CSS fix to the specified file');
    steps.push('2. Refresh the browser or restart the dev server');

    if (metadata.webUrl) {
      steps.push(`3. Navigate to ${metadata.webUrl}`);
    } else {
      steps.push('3. Navigate to the page containing the component');
    }

    steps.push(`4. Locate the "${componentName}" component`);
    steps.push('5. Verify the visual change matches the expected value');
    steps.push('6. Test component in different browser sizes');
    steps.push('7. Ensure no regression in other components');

    return steps.join('\\n');
  }

  /**
   * Generate screenshot URLs for comparison
   */
  generateScreenshotUrls(comparison, metadata) {
    // Generate relative URLs for before/after screenshots
    const baseUrl = metadata.webUrl ? new URL(metadata.webUrl).origin : 'http://localhost:3000';
    const comparisonId = comparison.id || Date.now();

    return [
      `${baseUrl}/api/screenshots/comparison-${comparisonId}-before.png`,
      `${baseUrl}/api/screenshots/comparison-${comparisonId}-after.png`
    ].join(', ');
  }

  /**
   * Map CSS properties to design system tokens
   */
  mapToDesignToken(property, value) {
    if (!property) return '';

    const tokenMaps = {
      'color': this.mapColorToToken(value),
      'background-color': this.mapColorToToken(value),
      'font-size': this.mapFontSizeToToken(value),
      'font-weight': this.mapFontWeightToToken(value),
      'padding': this.mapSpacingToToken(value),
      'margin': this.mapSpacingToToken(value)
    };

    const normalizedProperty = this.normalizePropertyName(property);
    return tokenMaps[normalizedProperty] || '';
  }

  mapColorToToken(value) {
    const colorTokens = {
      '#007bff': 'colors.primary.500',
      '#6c757d': 'colors.gray.500',
      '#28a745': 'colors.success.500',
      '#dc3545': 'colors.error.500',
      '#ffc107': 'colors.warning.500',
      '#17a2b8': 'colors.info.500',
      '#ffffff': 'colors.white',
      '#000000': 'colors.black'
    };

    return colorTokens[value?.toLowerCase()] || 'colors.custom';
  }

  mapFontSizeToToken(value) {
    const sizeTokens = {
      '12px': 'typography.size.xs',
      '14px': 'typography.size.sm',
      '16px': 'typography.size.base',
      '18px': 'typography.size.lg',
      '20px': 'typography.size.xl',
      '24px': 'typography.size.2xl'
    };

    return sizeTokens[value] || 'typography.size.custom';
  }

  mapFontWeightToToken(value) {
    const weightTokens = {
      '300': 'typography.weight.light',
      '400': 'typography.weight.normal',
      '500': 'typography.weight.medium',
      '600': 'typography.weight.semibold',
      '700': 'typography.weight.bold'
    };

    return weightTokens[value] || 'typography.weight.custom';
  }

  mapSpacingToToken(value) {
    const spacingTokens = {
      '4px': 'spacing.1',
      '8px': 'spacing.2',
      '12px': 'spacing.3',
      '16px': 'spacing.4',
      '24px': 'spacing.6',
      '32px': 'spacing.8'
    };

    return spacingTokens[value] || 'spacing.custom';
  }

  /**
   * Generate acceptance criteria for the fix
   */
  generateAcceptanceCriteria(property, expectedValue, comparison) {
    const componentName = comparison.componentName || 'component';
    const normalizedProperty = this.normalizePropertyName(property);

    return `${componentName} ${normalizedProperty} matches design specification (${expectedValue}) across all supported browser sizes`;
  }

  /**
   * Estimate time required to fix the issue
   */
  estimateFixTime(deviation, property) {
    const severity = deviation.severity?.toLowerCase();
    const propertyType = this.detectDeviationType(deviation);

    // Base time estimates
    const timeMap = {
      'color': '5min',
      'typography': '10min',
      'spacing': '15min',
      'existence': '1hr',
      'generic': '30min'
    };

    let baseTime = timeMap[propertyType] || '30min';

    // Adjust based on severity
    if (severity === 'critical' || severity === 'high') {
      // Critical issues might need more investigation
      const timeValue = parseInt(baseTime);
      const unit = baseTime.replace(/\d+/, '');
      baseTime = `${Math.ceil(timeValue * 1.5)}${unit}`;
    }

    return baseTime;
  }

  /**
   * Convert RGB color to hex
   */
  rgbToHex(rgb) {
    const matches = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!matches) return rgb;

    const [, r, g, b] = matches;
    return '#' + [r, g, b].map(x => {
      const hex = parseInt(x).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }
}

export default IssueFormatter;

