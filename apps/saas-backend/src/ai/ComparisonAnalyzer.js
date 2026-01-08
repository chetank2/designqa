import natural from 'natural';
import compromise from 'compromise';
import { getLLMIntegrator } from './llmIntegrator.js';
import { getConfig } from '../config/index.js';

class ComparisonAnalyzer {
  constructor() {
    this.sentiment = new natural.SentimentAnalyzer('English', 
      natural.PorterStemmer, 'afinn');
    this.tokenizer = new natural.WordTokenizer();
    
    // Design pattern recognition
    this.designPatterns = {
      layout: ['grid', 'flexbox', 'float', 'position', 'display'],
      typography: ['font', 'text', 'letter-spacing', 'line-height'],
      color: ['color', 'background', 'border', 'shadow'],
      spacing: ['margin', 'padding', 'gap', 'space'],
      responsive: ['media', 'breakpoint', 'mobile', 'tablet', 'desktop']
    };
    
    // Common issues database
    this.commonIssues = {
      'font-mismatch': {
        severity: 'medium',
        category: 'typography',
        description: 'Font family or size differences detected',
        suggestion: 'Ensure consistent font loading and fallbacks'
      },
      'color-variance': {
        severity: 'low',
        category: 'visual',
        description: 'Color values differ slightly',
        suggestion: 'Check color profiles and display calibration'
      },
      'spacing-inconsistency': {
        severity: 'high',
        category: 'layout',
        description: 'Significant spacing differences',
        suggestion: 'Review CSS box model and margin/padding values'
      },
      'missing-element': {
        severity: 'critical',
        category: 'structure',
        description: 'Element present in design but missing in implementation',
        suggestion: 'Add missing elements or update design specifications'
      },
      'responsive-issue': {
        severity: 'high',
        category: 'responsive',
        description: 'Layout breaks at certain screen sizes',
        suggestion: 'Implement proper responsive design patterns'
      }
    };
  }

  /**
   * Analyze comparison results and provide AI-powered insights
   */
  async analyzeComparison(comparisonData) {
    try {
      const analysis = {
        timestamp: new Date().toISOString(),
        overallScore: 0,
        insights: [],
        recommendations: [],
        issueBreakdown: {},
        designPatternAnalysis: {},
        aiSummary: '',
        actionItems: []
      };

      // Analyze visual differences
      if (comparisonData.visualDifferences) {
        analysis.insights.push(...this.analyzeVisualDifferences(comparisonData.visualDifferences));
      }

      // Analyze structural differences
      if (comparisonData.structuralDifferences) {
        analysis.insights.push(...this.analyzeStructuralDifferences(comparisonData.structuralDifferences));
      }

      // Analyze CSS differences
      if (comparisonData.cssDifferences) {
        analysis.insights.push(...this.analyzeCssDifferences(comparisonData.cssDifferences));
      }

      // Calculate overall score
      analysis.overallScore = this.calculateOverallScore(analysis.insights);

      // Generate design pattern analysis
      analysis.designPatternAnalysis = this.analyzeDesignPatterns(comparisonData);

      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis.insights);

      // Create issue breakdown
      analysis.issueBreakdown = this.createIssueBreakdown(analysis.insights);

      // Generate AI summary (enhanced with LLM if available)
      analysis.aiSummary = await this.generateEnhancedAISummary(comparisonData, analysis);

      // Create action items
      analysis.actionItems = this.generateActionItems(analysis.insights);

      // Generate quick wins
      analysis.quickWins = this.generateQuickWins(analysis.insights);

      return analysis;
    } catch (error) {
      console.error('AI Analysis error:', error);
      return {
        timestamp: new Date().toISOString(),
        overallScore: 0,
        insights: [],
        recommendations: ['Unable to perform AI analysis. Please check the comparison data.'],
        error: error.message
      };
    }
  }

  /**
   * Analyze visual differences using computer vision techniques
   */
  analyzeVisualDifferences(visualDiffs) {
    const insights = [];
    
    if (!visualDiffs || !visualDiffs.comparisons) {
      return insights;
    }

    // Analyze each visual comparison
    visualDiffs.comparisons.forEach((comparison, index) => {
      const similarity = comparison.similarity || 0;
      
      if (similarity < 70) {
        insights.push({
          type: 'visual-mismatch',
          severity: similarity < 50 ? 'critical' : similarity < 60 ? 'high' : 'medium',
          category: 'visual',
          title: `Significant Visual Difference Detected`,
          description: `Visual similarity is ${similarity.toFixed(1)}% (expected >70%)`,
          suggestion: 'Review layout, colors, and spacing to improve visual consistency',
          confidence: 0.9,
          location: comparison.location || { x: 0, y: 0, width: 100, height: 100 }
        });
      }
      
      // Analyze specific visual aspects
      if (comparison.colorDifference > 30) {
        insights.push({
          type: 'color-inconsistency',
          severity: 'medium',
          category: 'visual',
          title: 'Color Inconsistency',
          description: 'Significant color differences detected between design and implementation',
          suggestion: 'Verify brand colors and ensure consistent color usage',
          confidence: 0.8
        });
      }
    });
    
    if (visualDiffs.pixelDifference) {
      const pixelDiffPercentage = visualDiffs.pixelDifference.percentage || 0;
      
      if (pixelDiffPercentage > 10) {
        insights.push({
          type: 'visual-major-difference',
          severity: 'high',
          category: 'visual',
          title: 'Significant Visual Differences Detected',
          description: `${pixelDiffPercentage.toFixed(2)}% of pixels differ between design and implementation`,
          impact: 'High visual inconsistency may affect user experience',
          suggestion: 'Review layout, colors, and spacing for major discrepancies',
          confidence: 0.9
        });
      } else if (pixelDiffPercentage > 3) {
        insights.push({
          type: 'visual-minor-difference',
          severity: 'medium',
          category: 'visual',
          title: 'Minor Visual Differences',
          description: `${pixelDiffPercentage.toFixed(2)}% pixel difference detected`,
          impact: 'Small inconsistencies that may be noticeable to users',
          suggestion: 'Fine-tune spacing, colors, or font rendering',
          confidence: 0.8
        });
      }
    }

    // Analyze color differences
    if (visualDiffs.colorAnalysis) {
      const colorVariance = visualDiffs.colorAnalysis.variance || 0;
      if (colorVariance > 0.15) {
        insights.push({
          type: 'color-variance',
          severity: 'medium',
          category: 'visual',
          title: 'Color Inconsistencies',
          description: 'Significant color differences detected',
          impact: 'Brand consistency may be affected',
          suggestion: 'Verify color profiles and ensure consistent color values',
          confidence: 0.85
        });
      }
    }

    return insights;
  }

  /**
   * Analyze structural differences in DOM elements
   */
  analyzeStructuralDifferences(structuralDiffs) {
    const insights = [];

    if (structuralDiffs.missingElements && structuralDiffs.missingElements.length > 0) {
      insights.push({
        type: 'missing-elements',
        severity: 'critical',
        category: 'structure',
        title: 'Missing Elements Detected',
        description: `${structuralDiffs.missingElements.length} elements from design not found in implementation`,
        impact: 'Critical functionality or content may be missing',
        suggestion: 'Add missing elements or update design specifications',
        details: structuralDiffs.missingElements.slice(0, 5), // Show first 5
        confidence: 0.95
      });
    }

    if (structuralDiffs.extraElements && structuralDiffs.extraElements.length > 0) {
      insights.push({
        type: 'extra-elements',
        severity: 'low',
        category: 'structure',
        title: 'Additional Elements Found',
        description: `${structuralDiffs.extraElements.length} extra elements in implementation`,
        impact: 'May indicate over-implementation or debugging elements',
        suggestion: 'Review if additional elements are intentional',
        confidence: 0.7
      });
    }

    return insights;
  }

  /**
   * Analyze CSS differences and styling issues
   */
  analyzeCssDifferences(cssDiffs) {
    const insights = [];

    // Analyze font differences
    if (cssDiffs.typography) {
      const fontIssues = this.analyzeFontDifferences(cssDiffs.typography);
      insights.push(...fontIssues);
    }

    // Analyze spacing differences
    if (cssDiffs.spacing) {
      const spacingIssues = this.analyzeSpacingDifferences(cssDiffs.spacing);
      insights.push(...spacingIssues);
    }

    // Analyze layout differences
    if (cssDiffs.layout) {
      const layoutIssues = this.analyzeLayoutDifferences(cssDiffs.layout);
      insights.push(...layoutIssues);
    }

    return insights;
  }

  /**
   * Analyze font and typography differences
   */
  analyzeFontDifferences(typography) {
    const insights = [];

    if (typography.fontFamily && typography.fontFamily.differs) {
      insights.push({
        type: 'font-family-mismatch',
        severity: 'medium',
        category: 'typography',
        title: 'Font Family Mismatch',
        description: `Expected: ${typography.fontFamily.expected}, Found: ${typography.fontFamily.actual}`,
        impact: 'Typography inconsistency affects visual hierarchy',
        suggestion: 'Ensure correct font loading and fallback fonts',
        confidence: 0.9
      });
    }

    if (typography.fontSize && Math.abs(typography.fontSize.difference) > 2) {
      insights.push({
        type: 'font-size-difference',
        severity: 'medium',
        category: 'typography',
        title: 'Font Size Discrepancy',
        description: `Font size differs by ${typography.fontSize.difference}px`,
        impact: 'Text hierarchy and readability may be affected',
        suggestion: 'Adjust font sizes to match design specifications',
        confidence: 0.85
      });
    }

    return insights;
  }

  /**
   * Analyze spacing and layout differences
   */
  analyzeSpacingDifferences(spacing) {
    const insights = [];

    const significantDifference = 8; // pixels

    ['margin', 'padding'].forEach(property => {
      if (spacing[property]) {
        const diff = Math.abs(spacing[property].difference || 0);
        if (diff > significantDifference) {
          insights.push({
            type: `${property}-difference`,
            severity: diff > 16 ? 'high' : 'medium',
            category: 'spacing',
            title: `${property.charAt(0).toUpperCase() + property.slice(1)} Inconsistency`,
            description: `${property} differs by ${diff}px`,
            impact: 'Layout spacing affects visual balance and alignment',
            suggestion: `Adjust ${property} values to match design specifications`,
            confidence: 0.8
          });
        }
      }
    });

    return insights;
  }

  /**
   * Analyze layout and positioning differences
   */
  analyzeLayoutDifferences(layout) {
    const insights = [];

    if (layout.display && layout.display.differs) {
      insights.push({
        type: 'display-property-mismatch',
        severity: 'high',
        category: 'layout',
        title: 'Display Property Mismatch',
        description: `Expected: ${layout.display.expected}, Found: ${layout.display.actual}`,
        impact: 'Fundamental layout behavior differs from design',
        suggestion: 'Review CSS display properties and layout implementation',
        confidence: 0.95
      });
    }

    if (layout.position && layout.position.differs) {
      insights.push({
        type: 'position-mismatch',
        severity: 'medium',
        category: 'layout',
        title: 'Positioning Inconsistency',
        description: `Position property differs from expected`,
        impact: 'Element positioning may not match design intent',
        suggestion: 'Review CSS positioning and layout flow',
        confidence: 0.8
      });
    }

    return insights;
  }

  /**
   * Calculate overall comparison score
   */
  calculateOverallScore(insights) {
    if (insights.length === 0) return 100;

    const severityWeights = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3
    };

    const totalDeduction = insights.reduce((sum, insight) => {
      return sum + (severityWeights[insight.severity] || 5);
    }, 0);

    return Math.max(0, 100 - totalDeduction);
  }

  /**
   * Analyze design patterns used
   */
  analyzeDesignPatterns(comparisonData) {
    const patterns = {
      layout: { detected: [], confidence: 0 },
      typography: { detected: [], confidence: 0 },
      color: { detected: [], confidence: 0 },
      responsive: { detected: [], confidence: 0 }
    };

    // Analyze CSS for design patterns
    if (comparisonData.cssAnalysis) {
      Object.keys(this.designPatterns).forEach(category => {
        const categoryPatterns = this.designPatterns[category];
        const detectedPatterns = [];

        categoryPatterns.forEach(pattern => {
          if (this.detectPattern(comparisonData.cssAnalysis, pattern)) {
            detectedPatterns.push(pattern);
          }
        });

        patterns[category] = {
          detected: detectedPatterns,
          confidence: detectedPatterns.length / categoryPatterns.length
        };
      });
    }

    return patterns;
  }

  /**
   * Detect specific design patterns in CSS
   */
  detectPattern(cssAnalysis, pattern) {
    const cssText = JSON.stringify(cssAnalysis).toLowerCase();
    return cssText.includes(pattern.toLowerCase());
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(insights) {
    const recommendations = [];
    const issueTypes = {};

    // Group insights by category
    insights.forEach(insight => {
      if (!issueTypes[insight.category]) {
        issueTypes[insight.category] = [];
      }
      issueTypes[insight.category].push(insight);
    });

    // Generate category-specific recommendations
    Object.keys(issueTypes).forEach(category => {
      const categoryInsights = issueTypes[category];
      const highSeverityCount = categoryInsights.filter(i => i.severity === 'critical' || i.severity === 'high').length;

      if (categoryInsights.length > 0) {
        recommendations.push({
          priority: highSeverityCount > 0 ? 'high' : 'medium',
          category,
          title: `Optimize ${category} consistency`,
          description: `${categoryInsights.length} ${category} issues detected`,
          action: `Review and refine ${category}-related implementations`,
          estimatedTime: this.estimateFixTime(categoryInsights)
        });
      }
    });

    return recommendations;
  }

  /**
   * Create issue breakdown by category and severity
   */
  createIssueBreakdown(insights) {
    const breakdown = {
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byCategory: {},
      total: insights.length
    };

    insights.forEach(insight => {
      // Count by severity
      breakdown.bySeverity[insight.severity]++;

      // Count by category
      if (!breakdown.byCategory[insight.category]) {
        breakdown.byCategory[insight.category] = 0;
      }
      breakdown.byCategory[insight.category]++;
    });

    return breakdown;
  }

  /**
   * Generate AI-powered summary
   */
  generateAISummary(analysis) {
    const { overallScore, insights, issueBreakdown } = analysis;
    
    let summary = '';

    if (overallScore >= 90) {
      summary = 'Excellent match! The implementation closely follows the design with minimal discrepancies.';
    } else if (overallScore >= 75) {
      summary = 'Good implementation with some minor inconsistencies that should be addressed.';
    } else if (overallScore >= 50) {
      summary = 'Moderate implementation quality. Several issues need attention to improve design fidelity.';
    } else {
      summary = 'Significant differences detected. Major revisions needed to match the design specifications.';
    }

    // Add specific insights
    if (issueBreakdown.bySeverity.critical > 0) {
      summary += ` ${issueBreakdown.bySeverity.critical} critical issues require immediate attention.`;
    }

    if (issueBreakdown.byCategory.visual > 2) {
      summary += ' Focus on visual consistency improvements.';
    }

    if (issueBreakdown.byCategory.typography > 1) {
      summary += ' Typography refinements will enhance overall quality.';
    }

    return summary;
  }

  /**
   * Generate actionable items with priorities
   */
  generateActionItems(insights) {
    const actionItems = [];
    const priorityMap = { critical: 1, high: 2, medium: 3, low: 4 };

    // Sort insights by severity
    const sortedInsights = insights.sort((a, b) => 
      priorityMap[a.severity] - priorityMap[b.severity]
    );

    sortedInsights.slice(0, 8).forEach((insight, index) => {
      actionItems.push({
        id: index + 1,
        priority: insight.severity,
        title: insight.title,
        description: insight.suggestion,
        category: insight.category,
        estimatedTime: this.estimateFixTime([insight]),
        confidence: insight.confidence
      });
    });

    return actionItems;
  }

  /**
   * Generate enhanced AI summary using LLM integration if available
   * Falls back to original method if LLM is not configured
   */
  async generateEnhancedAISummary(comparisonData, analysis) {
    try {
      const config = await getConfig();
      
      // Check if LLM integration is enabled
      if (config.nextVersion?.enabled && config.nextVersion?.features?.llmIntegration) {
        // Removed: console.log('🤖 Generating enhanced AI summary with LLM...');
        
        const llmIntegrator = getLLMIntegrator();
        const llmSummary = await llmIntegrator.getLLMSummary(comparisonData);
        
        // Combine LLM insights with traditional analysis
        const traditionalSummary = this.generateAISummary(analysis);
        
        return `${llmSummary}

---

Traditional Analysis:
${traditionalSummary}`;
      }
    } catch (error) {
      console.log('⚠️ Enhanced AI summary failed, using traditional method:', error.message);
    }
    
    // Fallback to traditional AI summary
    return this.generateAISummary(analysis);
  }

  /**
   * Estimate time to fix issues
   */
  estimateFixTime(insights) {
    const timeMap = {
      critical: 4, // hours
      high: 2,
      medium: 1,
      low: 0.5
    };

    const totalHours = insights.reduce((sum, insight) => {
      return sum + (timeMap[insight.severity] || 1);
    }, 0);

    if (totalHours < 1) return '< 1 hour';
    if (totalHours < 8) return `${Math.ceil(totalHours)} hours`;
    if (totalHours < 40) return `${Math.ceil(totalHours / 8)} days`;
    return `${Math.ceil(totalHours / 40)} weeks`;
  }

  /**
   * Generate quick wins - high impact, low effort fixes
   */
  generateQuickWins(insights) {
    const quickWins = [];
    
    // Filter for quick win candidates
    const candidates = insights.filter(insight => {
      // Quick wins: low effort + high impact
      const isLowEffort = ['color', 'font-size', 'spacing', 'text'].some(type => 
        insight.type.includes(type)
      );
      const isHighImpact = insight.severity === 'high' || insight.severity === 'critical';
      
      return isLowEffort && isHighImpact;
    });

    // Sort by confidence and take top 3
    candidates
      .sort((a, b) => (b.confidence || 0.5) - (a.confidence || 0.5))
      .slice(0, 3)
      .forEach(insight => {
        quickWins.push({
          title: insight.title || insight.description,
          description: insight.description,
          action: insight.suggestion,
          estimatedTime: '5-15 minutes',
          impact: insight.impact || 'High',
          confidence: insight.confidence || 0.8,
          category: insight.category
        });
      });

    return quickWins;
  }

  /**
   * Generate smart suggestions based on patterns
   */
  generateSmartSuggestions(comparisonData) {
    const suggestions = [];

    // Analyze historical patterns if available
    if (comparisonData.historicalData) {
      const patterns = this.analyzeHistoricalPatterns(comparisonData.historicalData);
      suggestions.push(...patterns);
    }

    // Generate context-aware suggestions
    suggestions.push(...this.generateContextAwareSuggestions(comparisonData));

    return suggestions;
  }

  /**
   * Analyze historical comparison patterns
   */
  analyzeHistoricalPatterns(historicalData) {
    const patterns = [];
    
    // Find recurring issues
    const recurringIssues = this.findRecurringIssues(historicalData);
    
    if (recurringIssues.length > 0) {
      patterns.push({
        type: 'recurring-pattern',
        title: 'Recurring Issues Detected',
        description: 'Similar issues have appeared in previous comparisons',
        suggestion: 'Consider implementing systematic fixes or design system updates',
        confidence: 0.8
      });
    }

    return patterns;
  }

  /**
   * Find recurring issues across comparisons
   */
  findRecurringIssues(historicalData) {
    const issueFrequency = {};
    
    historicalData.forEach(comparison => {
      if (comparison.insights) {
        comparison.insights.forEach(insight => {
          const key = `${insight.type}-${insight.category}`;
          issueFrequency[key] = (issueFrequency[key] || 0) + 1;
        });
      }
    });

    return Object.keys(issueFrequency).filter(key => issueFrequency[key] > 2);
  }

  /**
   * Generate context-aware suggestions
   */
  generateContextAwareSuggestions(comparisonData) {
    const suggestions = [];

    // Device-specific suggestions
    if (comparisonData.deviceType === 'mobile') {
      suggestions.push({
        type: 'mobile-optimization',
        title: 'Mobile-Specific Considerations',
        description: 'Ensure touch targets are at least 44px and text is readable',
        suggestion: 'Review mobile usability guidelines',
        confidence: 0.7
      });
    }

    // Performance suggestions
    if (comparisonData.performanceMetrics) {
      const loadTime = comparisonData.performanceMetrics.loadTime;
      if (loadTime > 3000) {
        suggestions.push({
          type: 'performance-optimization',
          title: 'Performance Optimization Needed',
          description: `Page load time of ${loadTime}ms may affect user experience`,
          suggestion: 'Optimize images, CSS, and JavaScript for better performance',
          confidence: 0.9
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate developer-specific recommendations with actionable code fixes
   */
  async generateDeveloperRecommendations(comparisonData) {
    try {
      const recommendations = {
        cssSelectors: await this.generateOptimalSelectors(comparisonData),
        fileLocations: await this.predictFileLocations(comparisonData),
        designTokens: await this.mapToDesignTokens(comparisonData),
        timeEstimates: this.estimateEffort(comparisonData),
        quickFixes: this.generateAutomatedFixes(comparisonData),
        testingStrategy: this.generateTestingStrategy(comparisonData),
        codeRefactoring: this.suggestCodeRefactoring(comparisonData)
      };

      return recommendations;
    } catch (error) {
      console.error('Failed to generate developer recommendations:', error);
      return {
        error: error.message,
        fallback: this.generateBasicDeveloperRecommendations(comparisonData)
      };
    }
  }

  /**
   * Generate optimal CSS selectors for targeting issues
   */
  async generateOptimalSelectors(comparisonData) {
    const selectors = [];

    if (comparisonData.comparisons) {
      comparisonData.comparisons.forEach(comparison => {
        if (comparison.deviations) {
          comparison.deviations.forEach(deviation => {
            const webElement = comparison.webElement || {};
            const selector = this.buildOptimalSelector(webElement, comparison);

            selectors.push({
              issue: deviation.property || 'unknown',
              selector,
              specificity: this.calculateSpecificity(selector),
              recommendation: this.getSelectedRecommendation(selector, deviation)
            });
          });
        }
      });
    }

    return selectors;
  }

  /**
   * Build optimal CSS selector for targeting
   */
  buildOptimalSelector(webElement, comparison) {
    const componentName = comparison.componentName || '';
    const tag = webElement.tag || webElement.tagName || 'div';
    const className = webElement.className || webElement.class || '';
    const id = webElement.id || '';

    // Build specificity-optimized selector
    if (id) {
      return `#${id}`;
    }

    if (className) {
      const classes = className.split(' ').filter(Boolean);
      if (classes.length > 0) {
        // Use component-specific classes if available
        const componentClass = classes.find(cls =>
          cls.toLowerCase().includes(componentName.toLowerCase().replace(/\s+/g, '-'))
        );

        if (componentClass) {
          return `.${componentClass}`;
        }

        // Use first meaningful class
        return `.${classes[0]}`;
      }
    }

    // Fallback to tag with component context
    if (componentName) {
      const componentClass = componentName.toLowerCase().replace(/\s+/g, '-');
      return `.${componentClass} ${tag}`;
    }

    return tag;
  }

  /**
   * Calculate CSS selector specificity
   */
  calculateSpecificity(selector) {
    const ids = (selector.match(/#/g) || []).length;
    const classes = (selector.match(/\./g) || []).length;
    const elements = (selector.match(/[a-z]/g) || []).length - classes;

    return ids * 100 + classes * 10 + elements;
  }

  /**
   * Get selector-specific recommendations
   */
  getSelectedRecommendation(selector, deviation) {
    const property = deviation.property || 'unknown';

    const recommendations = {
      'color': `Apply color fix with ${selector} { color: ${deviation.figmaValue}; }`,
      'background-color': `Update background with ${selector} { background-color: ${deviation.figmaValue}; }`,
      'font-size': `Adjust font size with ${selector} { font-size: ${deviation.figmaValue}; }`,
      'padding': `Fix spacing with ${selector} { padding: ${deviation.figmaValue}; }`,
      'margin': `Adjust margins with ${selector} { margin: ${deviation.figmaValue}; }`
    };

    return recommendations[property] || `Update ${property} for ${selector}`;
  }

  /**
   * Predict likely file locations for CSS fixes
   */
  async predictFileLocations(comparisonData) {
    const locations = [];

    if (comparisonData.comparisons) {
      comparisonData.comparisons.forEach(comparison => {
        const componentName = comparison.componentName || 'Component';
        const webElement = comparison.webElement || {};

        const predictedPaths = this.generateFilePaths(componentName, webElement);

        locations.push({
          component: componentName,
          likelyPaths: predictedPaths,
          confidence: this.calculatePathConfidence(predictedPaths, componentName)
        });
      });
    }

    return locations;
  }

  /**
   * Generate possible file paths for components
   */
  generateFilePaths(componentName, webElement) {
    const sanitizedName = componentName.replace(/\s+/g, '');
    const kebabName = componentName.toLowerCase().replace(/\s+/g, '-');
    const className = webElement.className || '';

    const paths = [
      // Component-specific paths
      `src/components/${sanitizedName}/${sanitizedName}.css`,
      `src/components/${sanitizedName}/styles.css`,
      `src/components/${sanitizedName}/index.css`,

      // Framework-specific paths
      `src/components/${sanitizedName}/${sanitizedName}.module.css`,
      `src/components/${sanitizedName}/${sanitizedName}.styled.js`,

      // Global style paths
      `src/styles/components/${kebabName}.css`,
      `src/styles/${kebabName}.scss`,
      `styles/${kebabName}.css`,

      // Class-specific paths
      ...(className ? [`src/styles/${className.split(' ')[0]}.css`] : []),

      // Global fallbacks
      'src/styles/global.css',
      'src/styles/main.scss',
      'styles/index.css'
    ];

    return paths;
  }

  /**
   * Calculate confidence for file path predictions
   */
  calculatePathConfidence(paths, componentName) {
    // Higher confidence for component-specific paths
    if (componentName && componentName !== 'Unknown Component') {
      return 0.8;
    }
    return 0.5;
  }

  /**
   * Map issues to design system tokens
   */
  async mapToDesignTokens(comparisonData) {
    const tokenMappings = [];

    if (comparisonData.comparisons) {
      comparisonData.comparisons.forEach(comparison => {
        if (comparison.deviations) {
          comparison.deviations.forEach(deviation => {
            const token = this.inferDesignToken(deviation);

            if (token) {
              tokenMappings.push({
                issue: deviation.property,
                currentValue: deviation.webValue || deviation.actual,
                expectedValue: deviation.figmaValue || deviation.expected,
                designToken: token,
                usage: this.generateTokenUsage(token, deviation)
              });
            }
          });
        }
      });
    }

    return tokenMappings;
  }

  /**
   * Infer design token from deviation
   */
  inferDesignToken(deviation) {
    const property = deviation.property || '';
    const value = deviation.figmaValue || deviation.expected || '';

    const tokenMaps = {
      color: this.mapColorToken(value),
      'background-color': this.mapColorToken(value),
      'font-size': this.mapFontSizeToken(value),
      'font-weight': this.mapFontWeightToken(value),
      'line-height': this.mapLineHeightToken(value),
      padding: this.mapSpacingToken(value),
      margin: this.mapSpacingToken(value),
      'border-radius': this.mapBorderRadiusToken(value)
    };

    return tokenMaps[property] || null;
  }

  /**
   * Generate token usage example
   */
  generateTokenUsage(token, deviation) {
    const property = deviation.property || 'property';
    return `${property}: var(--${token});`;
  }

  /**
   * Estimate development effort for fixes
   */
  estimateEffort(comparisonData) {
    const estimates = [];

    if (comparisonData.comparisons) {
      comparisonData.comparisons.forEach(comparison => {
        if (comparison.deviations) {
          comparison.deviations.forEach(deviation => {
            const effort = this.calculateFixEffort(deviation);
            estimates.push({
              issue: deviation.property,
              component: comparison.componentName,
              effort,
              complexity: this.assessComplexity(deviation),
              dependencies: this.identifyDependencies(deviation, comparison)
            });
          });
        }
      });
    }

    return estimates;
  }

  /**
   * Calculate effort required to fix issue
   */
  calculateFixEffort(deviation) {
    const effortMap = {
      'color': 5,           // minutes
      'background-color': 5,
      'font-size': 10,
      'font-weight': 10,
      'padding': 15,
      'margin': 15,
      'border': 20,
      'layout': 60,         // hours in minutes
      'responsive': 120
    };

    const property = deviation.property || 'unknown';
    const baseEffort = effortMap[property] || 30;

    // Adjust for severity
    const severityMultiplier = {
      critical: 2.0,
      high: 1.5,
      medium: 1.0,
      low: 0.5
    };

    const multiplier = severityMultiplier[deviation.severity] || 1.0;
    return Math.ceil(baseEffort * multiplier);
  }

  /**
   * Assess fix complexity
   */
  assessComplexity(deviation) {
    const complexityFactors = {
      'layout': 'high',
      'responsive': 'high',
      'color': 'low',
      'font-size': 'low',
      'spacing': 'medium'
    };

    const property = deviation.property || 'unknown';
    return complexityFactors[property] || 'medium';
  }

  /**
   * Identify dependencies that might be affected
   */
  identifyDependencies(deviation, comparison) {
    const dependencies = [];

    // Layout changes affect more components
    if (deviation.property?.includes('layout') || deviation.property?.includes('position')) {
      dependencies.push('sibling-components', 'parent-layout');
    }

    // Color changes might affect theme consistency
    if (deviation.property?.includes('color')) {
      dependencies.push('color-theme', 'accessibility-contrast');
    }

    // Typography changes affect hierarchy
    if (deviation.property?.includes('font')) {
      dependencies.push('typography-scale', 'visual-hierarchy');
    }

    return dependencies;
  }

  /**
   * Generate automated fix scripts
   */
  generateAutomatedFixes(comparisonData) {
    const fixes = [];

    if (comparisonData.comparisons) {
      comparisonData.comparisons.forEach(comparison => {
        if (comparison.deviations) {
          comparison.deviations.forEach(deviation => {
            const script = this.generateFixScript(deviation, comparison);
            if (script) {
              fixes.push(script);
            }
          });
        }
      });
    }

    return fixes;
  }

  /**
   * Generate fix script for specific issue
   */
  generateFixScript(deviation, comparison) {
    const property = deviation.property || 'unknown';
    const expectedValue = deviation.figmaValue || deviation.expected || '';
    const webElement = comparison.webElement || {};

    if (!property || !expectedValue) return null;

    // Generate different types of fix scripts
    const scripts = {
      'find-replace': this.generateFindReplaceScript(property, expectedValue),
      'css-injection': this.generateCSSInjectionScript(property, expectedValue, webElement),
      'sed-command': this.generateSedCommand(property, expectedValue)
    };

    return {
      issue: `${property} in ${comparison.componentName}`,
      scripts,
      recommendation: 'Use find-replace for safest application'
    };
  }

  /**
   * Generate testing strategy for fixes
   */
  generateTestingStrategy(comparisonData) {
    return {
      visualRegression: this.generateVisualRegressionTests(comparisonData),
      responsiveTesting: this.generateResponsiveTestPlan(comparisonData),
      crossBrowser: this.generateCrossBrowserTestPlan(comparisonData),
      accessibility: this.generateAccessibilityTestPlan(comparisonData)
    };
  }

  /**
   * Suggest code refactoring opportunities
   */
  suggestCodeRefactoring(comparisonData) {
    const suggestions = [];

    // Identify repeated issues that suggest systematic problems
    const issueCounts = this.countIssueTypes(comparisonData);

    Object.entries(issueCounts).forEach(([issueType, count]) => {
      if (count > 3) {
        suggestions.push({
          type: 'systematic-fix',
          issue: issueType,
          occurrences: count,
          suggestion: this.getSystematicFixSuggestion(issueType),
          priority: 'high'
        });
      }
    });

    return suggestions;
  }

  // Helper methods for token mapping
  mapColorToken(value) {
    const colorMap = {
      '#007bff': 'primary-500',
      '#6c757d': 'gray-500',
      '#28a745': 'success-500',
      '#dc3545': 'error-500'
    };
    return colorMap[value?.toLowerCase()] || 'custom-color';
  }

  mapFontSizeToken(value) {
    const sizeMap = {
      '12px': 'text-xs',
      '14px': 'text-sm',
      '16px': 'text-base',
      '18px': 'text-lg',
      '20px': 'text-xl',
      '24px': 'text-2xl'
    };
    return sizeMap[value] || 'text-custom';
  }

  mapFontWeightToken(value) {
    const weightMap = {
      '300': 'font-light',
      '400': 'font-normal',
      '500': 'font-medium',
      '600': 'font-semibold',
      '700': 'font-bold'
    };
    return weightMap[value] || 'font-custom';
  }

  mapSpacingToken(value) {
    const spacingMap = {
      '4px': 'space-1',
      '8px': 'space-2',
      '12px': 'space-3',
      '16px': 'space-4',
      '24px': 'space-6',
      '32px': 'space-8'
    };
    return spacingMap[value] || 'space-custom';
  }

  // Additional helper methods would go here...
}

export default ComparisonAnalyzer; 