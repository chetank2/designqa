import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { generateCSSIncludes } from './utils/cssIncludes.js';
import { IssueFormatter } from '../services/reports/IssueFormatter.js';
import { getReportsDir } from '../utils/outputPaths.js';
import {
  generateProgressBar,
  generateCircularProgress,
  generateDonutChart,
  generateEnhancedSummaryCard,
  generateCollapsibleSection,
  generateThemeToggle,
  generateInteractiveJS,
  generateEnhancedColorSwatch,
  generateStickyNav
} from './utils/templateHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

/**
 * Report Generator
 * Generates HTML reports from comparison results
 */
export class ReportGenerator {
  constructor(config = {}) {
    this.config = {
      templatePath: path.join(__dirname, 'templates/report.html'),
      webTemplatePath: path.join(__dirname, 'templates/web-extraction-report.html'),
      figmaTemplatePath: path.join(__dirname, 'templates/figma-extraction-report.html'),
      outputDir: getReportsDir(),
      ...config
    };
  }

  /**
   * Generate HTML report from comparison results
   * @param {Object} comparisonResults - Comparison results
   * @param {Object} options - Report options
   * @returns {Promise<string>} Path to generated report
   */
  async generateReport(comparisonResults, options = {}) {
    const { outputPath } = options;

    logger.info('Generating HTML report');

    try {
      // Ensure output directory exists
      const actualOutputPath = outputPath || path.join(this.config.outputDir, `report_${Date.now()}.html`);
      await fs.mkdir(path.dirname(actualOutputPath), { recursive: true });

      // Generate HTML content
      const htmlContent = await this.generateHtmlContent(comparisonResults);

      // Write HTML to file
      await fs.writeFile(actualOutputPath, htmlContent);

      logger.info(`Report generated at ${actualOutputPath}`);
      return actualOutputPath;
    } catch (error) {
      logger.error('Failed to generate report', error);
      throw error;
    }
  }

  /**
   * Generate HTML content from comparison results
   * @param {Object} comparisonResults - Comparison results
   * @returns {Promise<string>} HTML content
   */
  async generateHtmlContent(comparisonResults) {
    try {
      // Determine extraction type and select appropriate template
      const extractionType = comparisonResults.metadata?.extractionType || 'comparison';
      let templatePath;

      if (extractionType === 'web-only') {
        templatePath = this.config.webTemplatePath;
      } else if (extractionType === 'figma-only') {
        templatePath = this.config.figmaTemplatePath;
      } else {
        templatePath = this.config.templatePath; // comparison template
      }

      // Load template
      let template;
      try {
        template = await fs.readFile(templatePath, 'utf8');
      } catch (error) {
        logger.warn(`Template not found at ${templatePath}, using default template`);
        template = this.getDefaultTemplate();
      }

      // Generate CSS includes
      const cssIncludes = await generateCSSIncludes({
        inline: true // Use inline CSS for standalone reports
      });

      // Replace CSS placeholder
      template = template.replace('{{cssIncludes}}', cssIncludes);

      // Replace placeholders with actual data based on extraction type
      const html = this.replacePlaceholders(template, comparisonResults, extractionType);

      return html;
    } catch (error) {
      logger.error('Failed to generate HTML content', error);
      throw error;
    }
  }

  /**
   * Replace placeholders in template with actual data
   * @param {string} template - HTML template
   * @param {Object} comparisonResults - Comparison results
   * @param {string} extractionType - Type of extraction (web-only, figma-only, comparison)
   * @returns {string} HTML content
   */
  replacePlaceholders(template, comparisonResults, extractionType = 'comparison') {
    // Basic info
    let html = template;

    if (extractionType === 'web-only') {
      return this.replaceWebOnlyPlaceholders(html, comparisonResults);
    } else if (extractionType === 'figma-only') {
      return this.replaceFigmaOnlyPlaceholders(html, comparisonResults);
    }

    // Basic info for standard comparison or DevRev report
    const title = extractionType === 'devrev-issues' ? 'DevRev Issues Report' : (comparisonResults.title || 'Figma vs Web Comparison Report');
    html = html.replaceAll('{{title}}', title);
    html = html.replaceAll('{{figmaFileName}}', comparisonResults.figmaData?.fileName || 'Figma Design');
    html = html.replaceAll('{{webUrl}}', comparisonResults.webData?.url || 'URL');
    html = html.replaceAll('{{timestamp}}', new Date(comparisonResults.timestamp || Date.now()).toLocaleString());

    const comparisons = this.getComparisons(comparisonResults);

    // Stats and Counts
    const summary = this.getSummary(comparisonResults);
    const figmaCount = comparisonResults.figmaData?.components?.length || comparisonResults.figmaData?.metadata?.componentCount || 0;
    const webCount = comparisonResults.webData?.elements?.length || 0;

    html = html.replaceAll('{{componentsAnalyzed}}', summary.componentsAnalyzed || figmaCount);
    html = html.replaceAll('{{figmaComponentsCount}}', figmaCount);
    html = html.replaceAll('{{webElementsCount}}', webCount);
    html = html.replaceAll('{{matchPercentage}}', summary.overallMatchPercentage || 0);
    html = html.replaceAll('{{overallSeverity}}', summary.overallSeverity || 'info');

    // Severity counts
    const counts = summary.severityCounts || { high: 0, medium: 0, low: 0 };
    html = html.replaceAll('{{highSeverityCount}}', counts.high);
    html = html.replaceAll('{{mediumSeverityCount}}', counts.medium);
    html = html.replaceAll('{{lowSeverityCount}}', counts.low);

    // Total issues count for DevRev reports
    const issueCount = summary.componentsAnalyzed || comparisons.length || 0;
    html = html.replaceAll('{{totalIssues}}', issueCount);

    // Total comparisons count for tab badges
    const comparisonCount = comparisons.length || 0;
    html = html.replaceAll('{{totalComparisons}}', comparisonCount);

    // Generate Sections
    html = html.replaceAll('{{designSystemValidation}}', this.generateDesignSystemValidationHtml(comparisonResults));
    html = html.replaceAll('{{comparisonTables}}', this.generateComparisonTables(comparisons));
    html = html.replaceAll('{{devrevIssuesTable}}', this.generateDevRevIssuesTable(comparisonResults));

    // Visual Analysis Sections
    html = html.replaceAll('{{colorsAnalysis}}', this.generateColorsAnalysis(comparisonResults));
    html = html.replaceAll('{{typographyAnalysis}}', this.generateTypographyAnalysis(comparisonResults));
    html = html.replaceAll('{{spacingAnalysis}}', this.generateSpacingAnalysis(comparisonResults));
    html = html.replaceAll('{{borderRadiusAnalysis}}', this.generateBorderRadiusAnalysis(comparisonResults));

    // Tab Counts
    html = html.replaceAll('{{colorCount}}', this.getColorCount(comparisonResults));
    html = html.replaceAll('{{typographyCount}}', this.getTypographyCount(comparisonResults));
    html = html.replaceAll('{{spacingCount}}', this.getSpacingCount(comparisonResults));
    html = html.replaceAll('{{borderCount}}', this.getBorderRadiusCount(comparisonResults));

    // Add DevRev table styles and scripts
    html = html.replaceAll('{{devrevTableStyles}}', this.getDevRevTableStyles());
    html = html.replaceAll('{{devrevTableScripts}}', this.getDevRevTableScripts());

    // JSON Data for interactivity
    const jsonData = JSON.stringify({
      comparisons,
      summary: summary
    }).replace(/</g, '\\u003c');
    html = html.replaceAll('{{jsonData}}', jsonData);

    return html;
  }

  /**
   * Add enhanced interactive components to the HTML
   * @param {string} html - HTML template
   * @param {Object} comparisonResults - Comparison results
   * @returns {string} Enhanced HTML
   */
  addEnhancedComponents(html, comparisonResults) {
    const summary = comparisonResults.summary || {};
    const matchStats = summary.matchStats || {};

    // Generate progress bars
    const colorPercentage = matchStats.colors?.percentage || 0;
    const typographyPercentage = matchStats.typography?.percentage || 0;
    const overallPercentage = summary.overallMatchPercentage || 0;

    html = html.replaceAll('{{colorProgress}}', generateProgressBar(colorPercentage, colorPercentage > 80 ? 'success' : colorPercentage > 60 ? 'warning' : 'danger'));
    html = html.replaceAll('{{typographyProgress}}', generateProgressBar(typographyPercentage, typographyPercentage > 80 ? 'success' : typographyPercentage > 60 ? 'warning' : 'danger'));
    html = html.replaceAll('{{overallProgress}}', generateProgressBar(overallPercentage, overallPercentage > 80 ? 'success' : overallPercentage > 60 ? 'warning' : 'danger'));
    html = html.replaceAll('{{componentsProgress}}', generateProgressBar(Math.min(100, (summary.componentsAnalyzed || 0) * 10), 'primary'));

    // Generate severity donut chart
    const severityCounts = summary.severityCounts || { high: 0, medium: 0, low: 0 };
    const total = severityCounts.high + severityCounts.medium + severityCounts.low;
    const severityData = {
      success: total > 0 ? Math.round((severityCounts.low / total) * 100) : 0,
      warning: total > 0 ? Math.round((severityCounts.medium / total) * 100) : 0,
      danger: total > 0 ? Math.round((severityCounts.high / total) * 100) : 0
    };
    html = html.replaceAll('{{severityChart}}', generateDonutChart(severityData, 'Issues'));

    // Generate sticky navigation
    const sections = [
      { id: 'summary', title: 'Summary' },
      { id: 'comparison-results', title: 'Results' },
      { id: 'details', title: 'Details' }
    ];
    html = html.replaceAll('{{stickyNav}}', generateStickyNav(sections));

    // Add theme toggle and interactive JavaScript
    html = html.replaceAll('{{themeToggle}}', generateThemeToggle());
    html = html.replaceAll('{{interactiveJS}}', generateInteractiveJS());

    // Add DevRev table styles and scripts
    html = html.replaceAll('{{devrevTableStyles}}', this.getDevRevTableStyles());
    html = html.replaceAll('{{devrevTableScripts}}', this.getDevRevTableScripts());

    return html;
  }

  /**
   * Generate comparison tables HTML
   * @param {Array<Object>} comparisons - Comparison results
   * @returns {string} HTML content
   */
  generateComparisonTables(comparisons) {
    if (!comparisons || comparisons.length === 0) {
      return '<div class="no-data">No comparison data available</div>';
    }

    let tablesHtml = '';

    // Group comparisons by property type (from comparison.mismatches)
    const propertyGroups = {
      colors: [],
      typography: [],
      spacing: [],
      radius: [],
      layout: [],
      shadows: [],
      other: []
    };

    comparisons.forEach(comp => {
      // Determine primary property type from mismatches
      const mismatches = comp.mismatches || [];
      const propertyTypes = new Set();
      
      mismatches.forEach(m => {
        const propType = m.property?.split(':')[0];
        if (propType) propertyTypes.add(propType);
      });

      // Categorize comparison based on property types
      if (propertyTypes.has('color')) {
        propertyGroups.colors.push(comp);
      } else if (propertyTypes.has('typography')) {
        propertyGroups.typography.push(comp);
      } else if (propertyTypes.has('spacing')) {
        propertyGroups.spacing.push(comp);
      } else if (propertyTypes.has('radius')) {
        propertyGroups.radius.push(comp);
      } else if (propertyTypes.has('layout')) {
        propertyGroups.layout.push(comp);
      } else if (propertyTypes.has('shadows')) {
        propertyGroups.shadows.push(comp);
      } else {
        propertyGroups.other.push(comp);
      }
    });

    // Property type labels and icons
    const propertyLabels = {
      colors: { label: 'Colors', icon: '🎨', description: 'Color mismatches between Figma and implementation' },
      typography: { label: 'Typography', icon: '📝', description: 'Font size, weight, and text style differences' },
      spacing: { label: 'Spacing & Padding', icon: '📏', description: 'Margin, padding, and spacing inconsistencies' },
      radius: { label: 'Border Radius', icon: '⭕', description: 'Corner radius and roundness differences' },
      layout: { label: 'Layout & Sizing', icon: '📐', description: 'Width, height, and positioning mismatches' },
      shadows: { label: 'Shadows & Effects', icon: '✨', description: 'Box shadow and visual effect differences' },
      other: { label: 'Other Properties', icon: '🔧', description: 'Additional property mismatches' }
    };

    // Generate sections for each property type
    Object.entries(propertyGroups).forEach(([propType, comps]) => {
      if (comps.length === 0) return;

      const { label, icon, description } = propertyLabels[propType];
      
      tablesHtml += `
        <div class="property-group property-${propType}" id="property-${propType}">
          <div class="property-group-header">
            <h3><span class="property-icon">${icon}</span> ${label} <span class="property-count">(${comps.length})</span></h3>
            <p class="property-description">${description}</p>
          </div>
          <div class="property-group-items">
            ${comps.map(comp => this.generateComparisonTable(comp)).join('')}
          </div>
        </div>
      `;
    });

    return tablesHtml;
  }

  getComparisons(comparisonResults = {}) {
    return comparisonResults.comparisons ||
      comparisonResults.comparison?.comparisons ||
      comparisonResults.result?.comparisons ||
      comparisonResults.result?.comparison?.comparisons ||
      [];
  }

  getSummary(comparisonResults = {}) {
    const summary = comparisonResults.summary ||
      comparisonResults.comparison?.summary ||
      comparisonResults.result?.summary ||
      comparisonResults.result?.comparison?.summary ||
      {};

    return {
      ...summary,
      overallMatchPercentage: summary.overallMatchPercentage ??
        summary.overallSimilarity ??
        comparisonResults.comparison?.overallSimilarity ??
        comparisonResults.result?.comparison?.overallSimilarity ??
        0,
      severityCounts: summary.severityCounts || summary.severity || { high: 0, medium: 0, low: 0 }
    };
  }

  /**
   * Generate a single comparison table
   * @param {Object} comparison - Comparison result
   * @returns {string} HTML content
   */
  generateComparisonTable(comparison) {
    const component = this.resolveComponent(comparison);
    const element = this.resolveElement(comparison);
    const matchScore = comparison.matchScore?.toFixed(2) || '0.00';
    const matchPercentage = comparison.overallDeviation?.matchPercentage?.toFixed(2) || '0.00';
    const severity = comparison.overallDeviation?.severity || 'low';
    const componentName = component.name || (component.id ? `Component ${component.id}` : 'Component');
    const componentId = component.id || 'N/A';
    const componentType = component.type || 'Component';
    const elementFallback = comparison.status === 'no_match' ? 'Not matched' : 'Not available';
    const elementTag = element.tagName || elementFallback;
    const elementId = element.id || (comparison.status === 'no_match' ? 'Not matched' : 'N/A');
    const elementClasses = element.classes?.length
      ? element.classes
      : element.className
        ? element.className.split(/\s+/).filter(Boolean)
        : [];
    const elementPath = element.path || element.selector || (comparison.status === 'no_match' ? 'Not matched' : 'N/A');

    // Generate progress bar for match percentage
    const progressClass = matchPercentage >= 80 ? 'success' : matchPercentage >= 60 ? 'warning' : 'danger';
    const progressBar = `
      <div class="progress-bar">
        <div class="progress-fill ${progressClass}" style="width: ${matchPercentage}%"></div>
      </div>
    `;

    const propertyComparisons = comparison.propertyComparisons || this.buildPropertyComparisons(comparison);

    return `
      <div class="comparison-item severity-${severity}">
        <div class="comparison-header">
          <h4>${this.escapeHtml(componentName)}
              <span class="badge badge-${severity}">${severity.toUpperCase()}</span></h4>
          <div class="comparison-meta">
            <span class="match-score">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Match Score: <strong>${matchScore}</strong>
            </span>
            <span class="match-percentage">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Match: <strong>${matchPercentage}%</strong>
            </span>
          </div>
          ${progressBar}
        </div>

        <div class="comparison-details">
          <div class="component-info">
          <div class="info-label">
            <span class="w-1.5 h-1.5 rounded-full bg-foreground" style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#fff; margin-right:8px;"></span>
            FIGMA DESIGN
          </div>
          <div class="info-row">
            <span>Name:</span>
            <strong>${this.escapeHtml(componentName)}</strong>
          </div>
          <div class="info-row">
            <span>ID:</span>
            <code>${this.escapeHtml(componentId)}</code>
          </div>
          <div class="info-row">
            <span>Type:</span>
            <span class="badge badge-info">${this.escapeHtml(componentType)}</span>
          </div>
        </div>

        <div class="element-info">
          <div class="info-label">
            <span class="w-1.5 h-1.5 rounded-full opacity-50" style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#a1a1aa; margin-right:8px;"></span>
            WEB IMPLEMENTATION
          </div>
          <div class="info-row">
            <span>Tag:</span>
            <code>${this.escapeHtml(elementTag)}</code>
          </div>
          <div class="info-row">
            <span>ID:</span>
            ${elementId ? `<code>${this.escapeHtml(elementId)}</code>` : '<span style="color:#71717a">None</span>'}
          </div>
          <div class="info-row">
            <span>Selector:</span>
            <code>${this.escapeHtml(elementPath)}</code>
          </div>
          <div class="info-row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
            <span>Classes:</span>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${elementClasses.length
        ? elementClasses.slice(0, 5).map(cls => `<code>${this.escapeHtml(cls)}</code>`).join('') + (elementClasses.length > 5 ? `<small style="color:#71717a"> +${elementClasses.length - 5}</small>` : '')
        : '<span style="color:#71717a">None</span>'
      }
            </div>
          </div>
        </div>
      </div>

        <table class="property-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Expected (Figma)</th>
              <th>Actual (Web)</th>
              <th>Status</th>
              <th>Deviation</th>
            </tr>
          </thead>
          <tbody>
            ${this.generatePropertyRows(propertyComparisons)}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Generate property comparison rows
   * @param {Array<Object>} propertyComparisons - Property comparisons
   * @returns {string} HTML content
   */
  generatePropertyRows(propertyComparisons) {
    if (!propertyComparisons || propertyComparisons.length === 0) {
      return `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2rem; color: #6b7280;">
            <strong>No property comparisons available</strong>
            <br><small>This comparison may be missing detailed property analysis.</small>
          </td>
        </tr>
      `;
    }

    return propertyComparisons.map(prop => {
      const statusClass = prop.matches ? 'match' : 'mismatch';
      const deviation = typeof prop.deviation === 'number'
        ? `${prop.deviation.toFixed(2)}${typeof prop.deviation === 'number' && prop.property?.includes('color') ? ' ΔE' : ''}`
        : prop.deviation || 'N/A';

      // Format property values with appropriate styling
      const figmaValue = this.formatPropertyValueEnhanced(prop.figmaValue, prop.property);
      const webValue = this.formatPropertyValueEnhanced(prop.webValue, prop.property);

      // Add severity indicator based on deviation
      let severityIndicator = '';
      if (typeof prop.deviation === 'number' && !prop.matches) {
        if (prop.deviation > 10) severityIndicator = ' <span class="badge badge-danger">High</span>';
        else if (prop.deviation > 5) severityIndicator = ' <span class="badge badge-warning">Medium</span>';
        else severityIndicator = ' <span class="badge badge-info">Low</span>';
      }

      return `
        <tr class="${statusClass}">
          <td><strong>${this.formatPropertyName(prop.property)}</strong></td>
          <td>${figmaValue}</td>
          <td>${webValue}</td>
          <td class="status-cell ${statusClass}">${prop.matches ? 'Match' : 'Mismatch'}</td>
          <td>${deviation}${severityIndicator}</td>
        </tr>
      `;
    }).join('');
  }

  buildPropertyComparisons(comparison) {
    const propertyComparisons = [];
    const deviations = Array.isArray(comparison.deviations) ? comparison.deviations : [];
    const matches = Array.isArray(comparison.matches) ? comparison.matches : [];

    deviations.forEach(deviation => {
      propertyComparisons.push({
        property: deviation.property,
        figmaValue: deviation.figmaValue ?? deviation.expected,
        webValue: deviation.webValue ?? deviation.actual,
        deviation: deviation.difference ?? deviation.diff ?? deviation.delta,
        matches: false
      });
    });

    matches.forEach(match => {
      propertyComparisons.push({
        property: match.property,
        figmaValue: match.figmaValue ?? match.expected ?? match.value,
        webValue: match.webValue ?? match.actual ?? match.value,
        deviation: 0,
        matches: true
      });
    });

    return propertyComparisons;
  }

  resolveComponent(comparison) {
    const base = comparison.component || comparison.figmaComponent || {};
    return {
      id: base.id || comparison.componentId || comparison.figmaComponent?.id,
      name: base.name || comparison.componentName || comparison.figmaComponent?.name,
      type: base.type || comparison.componentType || comparison.figmaComponent?.type
    };
  }

  resolveElement(comparison) {
    const base = comparison.element || comparison.webElement || {};
    const selector = base.selector || comparison.selector || base.path;
    const className = base.className || base.class || '';
    const classes = Array.isArray(base.classes)
      ? base.classes
      : className
        ? className.split(/\s+/).filter(Boolean)
        : [];
    const tagName = base.tagName || base.tag || base.type || this.inferTagFromSelector(selector);
    const id = base.id || base.domId || base.attributes?.id;
    const path = base.path || selector;

    return {
      tagName,
      id,
      classes,
      className,
      selector,
      path
    };
  }

  inferTagFromSelector(selector) {
    if (!selector || typeof selector !== 'string') return null;
    return selector.split(/[#.]/)[0] || null;
  }

  /**
   * Enhanced property value formatting with visual indicators
   * @param {*} value - Property value
   * @param {string} property - Property name for context
   * @returns {string} Formatted property value
   */
  formatPropertyValueEnhanced(value, property) {
    if (value === undefined || value === null) {
      return '<span style="color: #a1a1aa; font-style: italic;">N/A</span>';
    }

    if (typeof value === 'object') {
      return `<code>${JSON.stringify(value)}</code>`;
    }

    const valueStr = value.toString();
    const normalizedProp = property?.toLowerCase() || '';

    // 1. Color values
    if (normalizedProp.includes('color') && valueStr.match(/^#|rgba|rgb|hsl/)) {
      return `
      <div class="preview-container">
        <div class="preview-swatch" style="background-color: ${valueStr};"></div>
        <code>${valueStr}</code>
      </div>
    `;
    }

    // 2. Typography previews
    if (normalizedProp.includes('font') && normalizedProp.includes('family')) {
      return `
      <div class="preview-container" style="gap: 12px;">
        <div class="preview-typo" style="font-family: ${valueStr};">Aa</div>
        <div style="display:flex; flex-direction:column; gap:2px;">
           <span style="font-size: 11px; font-weight: 500; color: #f4f4f5;">${valueStr}</span>
        </div>
      </div>
    `;
    }

    // 3. Spacing / Padding / Dimensions (Bars)
    if (normalizedProp.includes('spacing') || normalizedProp.includes('padding') || normalizedProp.includes('margin') || normalizedProp.includes('gap')) {
      const num = parseInt(valueStr);
      if (!isNaN(num)) {
        return `
        <div class="preview-container" style="flex-direction: column; align-items: flex-start; gap: 4px;">
          <div class="preview-bar" style="width: ${Math.min(num * 2, 80)}px;"></div>
          <code>${valueStr}</code>
        </div>
      `;
      }
    }

    // 4. Border Radius (Radius Box)
    if (normalizedProp.includes('radius') || normalizedProp.includes('rounding')) {
      return `
      <div class="preview-container">
        <div class="preview-radius" style="border-radius: ${valueStr};"></div>
        <code>${valueStr}</code>
      </div>
    `;
    }

    // Default formatting
    return `<code>${this.escapeHtml(valueStr)}</code>`;
  }

  /**
   * Generate DevRev-ready issues table
   * @param {Object} comparisonResults - Comparison results
   * @returns {string} HTML content for DevRev issues table
   */
  generateDevRevIssuesTable(comparisonResults) {
    try {
      // Transform comparison results into DevRev issues
      const formatter = new IssueFormatter();
      const issues = formatter.transform(comparisonResults);

      // If no issues, show success message
      if (!issues || issues.length === 0) {
        return `
          <div class="no-data">
            <p><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 6px;"><polyline points="20 6 9 17 4 12"/></svg> No issues found - All components match the design specifications!</p>
          </div>
        `;
      }

      // Generate table HTML
      return `
        <section class="devrev-issues-section" id="devrev-issues">
          <div class="section-header">
            <div class="section-heading-row">
              <span class="section-pill">DevRev Export</span>
              <h2><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 8px;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> Comparison Issues (DevRev Format)</h2>
            </div>
            <p class="section-description">
              Structured issue log engineered for DevRev ingestion. Filter, triage, and export without leaving the browser.
            </p>
          </div>
          
          <div class="table-controls">
            <div class="control-group">
              <button onclick="exportDevRevTableToCSV()" class="btn btn-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export CSV
              </button>
              <button onclick="exportDeveloperCSV()" class="btn btn-developer" title="Download enhanced CSV with actionable fixes for developers">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>
                Dev CSV
              </button>
              <button onclick="copyDevRevTableToClipboard()" class="btn btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy All
              </button>
            </div>
            <input 
              type="search" 
              placeholder="Filter by component, severity, or status..." 
              id="devrev-filter-input"
              class="table-filter"
              onkeyup="filterDevRevTable()"
            >
            <div class="issue-stats">
              <span class="stat-badge stat-critical"><span class="dot dot-critical"></span> Critical <strong>${issues.filter(i => i.severity === 'Critical').length}</strong></span>
              <span class="stat-badge stat-major"><span class="dot dot-major"></span> Major <strong>${issues.filter(i => i.severity === 'Major').length}</strong></span>
              <span class="stat-badge stat-minor"><span class="dot dot-minor"></span> Minor <strong>${issues.filter(i => i.severity === 'Minor').length}</strong></span>
            </div>
          </div>
          
          <div class="table-wrapper">
            <table class="devrev-issues-table" id="devrev-issues-table">
              <thead>
                <tr>
                  <th class="sortable" onclick="sortDevRevTable(0)">Issue ID</th>
                  <th class="sortable" onclick="sortDevRevTable(1)">Title / Summary</th>
                  <th class="sortable" onclick="sortDevRevTable(2)">Description</th>
                  <th class="sortable" onclick="sortDevRevTable(3)">Module</th>
                  <th class="sortable" onclick="sortDevRevTable(4)">Frame / Component Name</th>
                  <th>Figma ID</th>
                  <th>Type</th>
                  <th>Web Element</th>
                  <th class="sortable" onclick="sortDevRevTable(8)">Severity</th>
                  <th class="sortable" onclick="sortDevRevTable(9)">Priority</th>
                  <th>Status</th>
                  <th>Expected Result</th>
                  <th>Actual Result</th>
                  <th>Environment</th>
                  <th>Created Date</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${issues.map(issue => this.generateDevRevIssueRow(issue)).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="table-footer">
            <div class="footer-label">📊 Visible: <span id="devrev-visible-count"><strong>${issues.length}</strong> issues</span></div>
            <div class="footer-actions">
              <small>💡 Click headers to sort · Press ⌘/Ctrl + F to jump to filter</small>
            </div>
          </div>
        </section>
      `;
    } catch (error) {
      logger.error('Failed to generate DevRev issues table', error);
      return '<div class="error">Failed to generate DevRev issues table</div>';
    }
  }

  /**
   * Generate Design System Validation HTML
   * @param {Object} comparisonResults - Comparison results
   * @returns {string} HTML content
   */
  generateDesignSystemValidationHtml(comparisonResults) {
    const comparisons = comparisonResults.comparisons || [];
    if (comparisons.length === 0) return '';

    // Find the first result with design system data
    const firstWithDS = comparisons.find(c => c.designSystemResults);
    if (!firstWithDS || !firstWithDS.designSystemResults) {
      return '';
    }

    const results = firstWithDS.designSystemResults;
    const figmaMatches = results.figma?.matches || [];
    const figmaDeviations = results.figma?.deviations || [];
    const webMatches = results.web?.matches || [];
    const webDeviations = results.web?.deviations || [];

    if (figmaMatches.length === 0 && figmaDeviations.length === 0 &&
      webMatches.length === 0 && webDeviations.length === 0) {
      return '';
    }

    return `
      <section class="ds-validation-section" id="ds-validation">
        <div class="ds-validation-header">
          <h2>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Design System Alignment
          </h2>
          <span class="badge ${results.summary === 'consistent' ? 'badge-success' : 'badge-warning'}">
            ${results.summary === 'consistent' ? 'Consistent' : 'Deviations Found'}
          </span>
        </div>
        
        <div class="ds-grid">
          <div class="ds-column">
            <h3>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l5 5"/><path d="M11 11l1 1"/>
              </svg>
              Figma vs Design System
            </h3>
            <div class="ds-items-container">
              ${this.generateDSItemsHtml(figmaMatches, figmaDeviations)}
            </div>
          </div>
          
          <div class="ds-column">
            <h3>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              Web vs Design System
            </h3>
            <div class="ds-items-container">
              ${this.generateDSItemsHtml(webMatches, webDeviations)}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Generate HTML for Design System items (matches and deviations)
   */
  generateDSItemsHtml(matches, deviations) {
    let html = '';

    // Deviations first
    deviations.forEach(dev => {
      const propertyLabel = this.formatPropertyName(dev.property);
      const visualPreview = this.getPropertyVisualPreview(dev.property, dev.value);

      html += `
        <div class="ds-item ds-item-deviation">
          <div class="ds-item-header">
            <span>${propertyLabel}</span>
            <span class="badge badge-danger">Mismatch</span>
          </div>
          <div class="ds-item-message">
            <div class="preview-container">
              ${visualPreview}
              <span>Value: <strong>${dev.value}</strong></span>
            </div>
          </div>
          <div class="ds-suggestion">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span>Suggestion: Use <span class="ds-token-badge">${dev.suggestedToken}</span></span>
          </div>
        </div>
      `;
    });

    // Matches
    matches.forEach(match => {
      const propertyLabel = this.formatPropertyName(match.property);
      const visualPreview = this.getPropertyVisualPreview(match.property, match.value);

      html += `
        <div class="ds-item ds-item-match">
          <div class="ds-item-header">
            <span>${propertyLabel}</span>
            <span class="badge badge-success">Match</span>
          </div>
          <div class="ds-item-message">
            <div class="preview-container">
              ${visualPreview}
              <span>Value <strong>${match.value}</strong> matched token <span class="ds-token-badge">${match.token}</span></span>
            </div>
          </div>
        </div>
      `;
    });

    if (html === '') {
      return '<div class="no-data">No design system properties found</div>';
    }

    return html;
  }

  /**
   * Helper to get visual preview for DS items
   */
  getPropertyVisualPreview(property, value) {
    const p = property.toLowerCase();
    if (p.includes('color')) {
      return `<div class="preview-swatch" style="background-color: ${value};"></div>`;
    }
    if (p.includes('font-family')) {
      return `<div class="preview-typo" style="font-family: ${value};">Aa</div>`;
    }
    if (p.includes('border-radius') || p.includes('corner-radius')) {
      return `<div class="preview-radius" style="border-radius: ${value};"></div>`;
    }
    return '';
  }

  /**
   * Generate a single DevRev issue row
   * @param {Object} issue - Issue object
   * @returns {string} HTML content for table row
   */
  generateDevRevIssueRow(issue) {
    return `
      <tr class="severity-${issue.severity?.toLowerCase()}" data-severity="${issue.severity}" data-priority="${issue.priority}">
        <td class="issue-id">${issue.issueId}</td>
        <td class="issue-title">${this.escapeHtml(issue.title)}</td>
        <td class="issue-description"><div class="truncate-text">${this.escapeHtml(issue.description)}</div></td>
        <td>${this.escapeHtml(issue.module)}</td>
        <td class="component-name"><code>${this.escapeHtml(issue.frameComponentName)}</code></td>
        <td class="figma-id"><small>${this.escapeHtml(issue.figmaComponentId)}</small></td>
        <td><small>${this.escapeHtml(issue.figmaComponentType)}</small></td>
        <td class="web-element"><code>${this.escapeHtml(issue.webElement)}</code></td>
        <td><span class="badge badge-${issue.severity?.toLowerCase()}">${issue.severity}</span></td>
        <td><span class="badge badge-priority-${issue.priority?.toLowerCase()}">${issue.priority}</span></td>
        <td><span class="badge badge-status">${issue.status}</span></td>
        <td class="expected-result"><div class="truncate-text">${this.escapeHtml(issue.expectedResult)}</div></td>
        <td class="actual-result"><div class="truncate-text">${this.escapeHtml(issue.actualResult)}</div></td>
        <td>${this.escapeHtml(issue.environment)}</td>
        <td class="date">${issue.createdDate}</td>
        <td class="remarks"><div class="truncate-text">${this.escapeHtml(issue.remarks)}</div></td>
      </tr>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Format property name for display
   * @param {string} property - Property name
   * @returns {string} Formatted property name
   */
  formatPropertyName(property) {
    if (!property) return 'Unknown';

    // Convert camelCase to Title Case with spaces
    return property
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
  }

  /**
   * Format property value for display
   * @param {*} value - Property value
   * @returns {string} Formatted property value
   */
  formatPropertyValue(value) {
    if (value === undefined || value === null) {
      return 'N/A';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return value.toString();
  }

  /**
   * Capitalize first letter of a string
   * @param {string} str - Input string
   * @returns {string} Capitalized string
   */
  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  asArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (value instanceof Set) return Array.from(value);
    if (typeof value === 'object') {
      if (Array.isArray(value.items)) return value.items;
      if (Array.isArray(value.values)) return value.values;
      return Object.values(value).flatMap(item => Array.isArray(item) ? item : [item]);
    }
    return [value];
  }

  uniqueTokens(tokens) {
    const seen = new Set();
    return this.asArray(tokens).filter(token => {
      const key = this.getTokenValue(token).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getTokenValue(token) {
    if (token === undefined || token === null) return '';
    if (typeof token !== 'object') return String(token);
    return String(
      token.value ??
      token.hex ??
      token.color ??
      token.fontFamily ??
      token.family ??
      token.name ??
      ''
    );
  }

  collectStyleTokens(items, properties) {
    const values = [];
    this.asArray(items).forEach(item => {
      const styleSources = [
        item?.styles,
        item?.style,
        item?.computedStyles,
        item?.css,
        item
      ];

      styleSources.forEach(styles => {
        if (!styles || typeof styles !== 'object') return;
        properties.forEach(property => {
          const value = styles[property];
          if (value !== undefined && value !== null && value !== '') {
            values.push(value);
          }
        });
      });
    });
    return values;
  }

  normalizeTypographyTokens(tokens) {
    if (!tokens) return [];
    if (!Array.isArray(tokens) && typeof tokens === 'object') {
      const families = this.asArray(tokens.fontFamilies);
      const sizes = this.asArray(tokens.fontSizes);
      const weights = this.asArray(tokens.fontWeights);

      if (families.length || sizes.length || weights.length) {
        const count = Math.max(families.length, sizes.length, weights.length);
        return Array.from({ length: count }, (_, index) => ({
          fontFamily: families[index] || families[0] || 'Unknown',
          fontSize: sizes[index] || sizes[0] || '',
          fontWeight: weights[index] || weights[0] || ''
        }));
      }
    }
    return this.asArray(tokens);
  }

  getVisualTokens(comparisonResults, source, category) {
    const data = comparisonResults?.[`${source}Data`] || {};
    const details = comparisonResults?.extractionDetails?.[source] || {};
    const components = source === 'figma'
      ? (data.components || data.elements || [])
      : (data.elements || data.components || []);

    const tokenSources = {
      colors: [
        data.colors,
        data.colorPalette,
        data.designTokens?.colors,
        details.colors,
        source === 'figma' ? comparisonResults?.colorAnalysis?.figmaColors : comparisonResults?.colorAnalysis?.webColors,
        source === 'figma' ? comparisonResults?.comparison?.colorAnalysis?.figmaColors : comparisonResults?.comparison?.colorAnalysis?.webColors,
        this.collectStyleTokens(components, ['color', 'backgroundColor', 'background-color', 'fill', 'stroke'])
      ],
      typography: [
        data.typography,
        data.fonts,
        data.designTokens?.typography,
        details.typography,
        this.collectStyleTokens(components, ['fontFamily', 'font-family', 'fontSize', 'font-size'])
      ],
      spacing: [
        data.spacing,
        data.designTokens?.spacing,
        details.spacing,
        this.collectStyleTokens(components, [
          'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
          'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
          'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
          'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
          'gap', 'rowGap', 'columnGap', 'row-gap', 'column-gap'
        ])
      ],
      borderRadius: [
        data.borderRadius,
        data.borders,
        data.radius,
        data.designTokens?.borderRadius,
        data.designTokens?.radius,
        details.borderRadius,
        details.radius,
        this.collectStyleTokens(components, [
          'borderRadius', 'border-radius',
          'borderTopLeftRadius', 'border-top-left-radius',
          'borderTopRightRadius', 'border-top-right-radius',
          'borderBottomLeftRadius', 'border-bottom-left-radius',
          'borderBottomRightRadius', 'border-bottom-right-radius'
        ])
      ]
    };

    const tokens = tokenSources[category]?.flatMap(value =>
      category === 'typography' ? this.normalizeTypographyTokens(value) : this.asArray(value)
    ) || [];

    return this.uniqueTokens(tokens);
  }

  calculateTokenMatch(figmaTokens, webTokens) {
    const webValues = new Set(webTokens.map(token => this.getTokenValue(token).toLowerCase()));
    const matches = figmaTokens.filter(token => webValues.has(this.getTokenValue(token).toLowerCase())).length;
    const total = Math.max(figmaTokens.length, webTokens.length);
    return {
      matches,
      issues: Math.abs(figmaTokens.length - webTokens.length),
      percentage: total ? Math.round((matches / total) * 100) : 0
    };
  }

  /**
   * Get default HTML template
   * @returns {string} HTML template
   */
  getDefaultTemplate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <title>{{title}}</title>
  <style>
    :root {
      /* Palette: Zinc (Dark Mode) */
      --color-zinc-50: #fafafa;
      --color-zinc-100: #f4f4f5;
      --color-zinc-200: #e4e4e7;
      --color-zinc-300: #d4d4d8;
      --color-zinc-400: #a1a1aa;
      --color-zinc-500: #71717a;
      --color-zinc-600: #52525b;
      --color-zinc-700: #3f3f46;
      --color-zinc-800: #27272a;
      --color-zinc-900: #18181b;
      --color-zinc-950: #09090b;

      /* Palette: Indigo */
      --color-indigo-400: #818cf8;
      --color-indigo-500: #6366f1;
      --color-indigo-600: #4f46e5;
      
      /* Status */
      --color-success: #22c55e;
      --color-warning: #fbbf24;
      --color-danger: #ef4444;

      /* Semantic Tokens */
      --bg-page: var(--color-zinc-950);
      --bg-card: rgba(24, 24, 27, 0.6);
      --bg-card-hover: rgba(39, 39, 42, 0.7);
      
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-default: rgba(255, 255, 255, 0.15);

      --text-main: var(--color-zinc-50);
      --text-muted: var(--color-zinc-400);

      --accent: var(--color-indigo-500);
      --accent-glow: rgba(99, 102, 241, 0.4);

      /* Typography */
      --font-ui: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-ui);
      background-color: var(--bg-page);
      color: var(--text-main);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      padding-bottom: 4rem;
    }

    body::before {
      content: '';
      position: fixed;
      top: -20%;
      left: -20%;
      width: 140%;
      height: 140%;
      background: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.07), transparent 40%),
                  radial-gradient(circle at 80% 10%, rgba(34, 197, 94, 0.03), transparent 30%);
      z-index: -1;
      pointer-events: none;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
    }

    /* Header */
    header {
      margin-top: 4rem;
      margin-bottom: 3rem;
      padding: 3rem;
      background: linear-gradient(180deg, rgba(39, 39, 42, 0.2) 0%, rgba(24, 24, 27, 0.2) 100%);
      border: 1px solid var(--border-default);
      background-color: var(--bg-card);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
      background: linear-gradient(to right, #fff, #a1a1aa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    /* Summary */
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .summary-card {
      padding: 1.5rem;
      background: rgba(39, 39, 42, 0.4);
      border: 1px solid var(--border-subtle);
      border-radius: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .summary-card h3 {
      font-size: 0.825rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin: 0;
    }

    .summary-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--text-main);
      font-feature-settings: "tnum";
    }

    /* Comparison Items */
    .comparison-item {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 1rem;
      margin-bottom: 2rem;
      overflow: hidden;
    }

    .comparison-header {
      padding: 1.5rem 2rem;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--border-subtle);
    }

    .comparison-header h4 {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0;
      margin-bottom: 0.5rem;
    }

    .comparison-details {
      padding: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
    }

    .component-info, .element-info {
      padding: 0;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 0.5rem;
      border: 1px solid var(--border-subtle);
      width: 100%;
      height: 100%;
    }

     .info-row {
      display: flex;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
    }
    
    .info-row span {
      font-weight: 600;
      min-width: 80px;
      color: var(--text-muted);
    }

    .property-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    .property-table th {
      text-align: left;
      padding: 1rem 2rem;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-default);
      font-weight: 500;
    }

    .property-table td {
      padding: 1rem 2rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .status-cell.match { color: var(--color-success); }
    .status-cell.mismatch { color: var(--color-danger); }

    code {
      font-family: var(--font-mono);
      font-size: 0.85em;
      padding: 0.2rem 0.4rem;
      border-radius: 0.25rem;
      background: rgba(255, 255, 255, 0.05); /* very light zinc */
      color: var(--color-zinc-200);
      word-break: break-all;
    }

    footer {
      text-align: center;
      margin-top: 4rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border-subtle);
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>{{title}}</h1>
      <div class="metadata">
        <div class="metadata-item">
          <strong>File:</strong> {{figmaFileName}}
        </div>
        <div class="metadata-item">
          <strong>URL:</strong> {{webUrl}}
        </div>
      </div>
    </header>
    
    <div class="summary">
      <div class="summary-card">
        <h3>Components Analyzed</h3>
        <div class="summary-value">{{componentsAnalyzed}}</div>
      </div>
      <div class="summary-card">
        <h3>Match Percentage</h3>
        <div class="summary-value">{{matchPercentage}}%</div>
      </div>
    </div>

    <div class="comparison-results">
      {{comparisonTables}}
    </div>
    
    <footer>
      <p>Generated by DesignQA</p>
    </footer>
  </div>
</body>
</html>`;
  }

  /**
   * Replace placeholders for web-only extraction reports
   * @param {string} html - HTML template
   * @param {Object} comparisonResults - Comparison results
   * @returns {string} HTML content
   */
  replaceWebOnlyPlaceholders(html, comparisonResults) {
    const webData = comparisonResults.webData || {};
    const elements = webData.elements || [];
    const colorPalette = webData.colorPalette || [];
    const typography = webData.typography || { fontFamilies: [], fontSizes: [], fontWeights: [] };

    // Basic info
    html = html.replaceAll('{{title}}', `Web Extraction Report - ${new Date().toLocaleString()}`);
    html = html.replaceAll('{{webUrl}}', webData.url || 'Unknown Web URL');
    html = html.replaceAll('{{timestamp}}', comparisonResults.timestamp || new Date().toISOString());

    // Summary data
    html = html.replaceAll('{{totalElements}}', elements.length);
    html = html.replaceAll('{{colorCount}}', colorPalette.length);
    html = html.replaceAll('{{fontFamilyCount}}', typography.fontFamilies?.length || 0);

    // Generate element breakdown
    const elementBreakdown = this.generateElementBreakdown(elements);
    html = html.replaceAll('{{elementBreakdown}}', elementBreakdown);

    // Generate color palette
    const colorPaletteHtml = this.generateColorPalette(colorPalette);
    html = html.replaceAll('{{colorPalette}}', colorPaletteHtml);

    // Generate typography styles
    const typographyStylesHtml = this.generateTypographyStyles(typography);
    html = html.replaceAll('{{typographyStyles}}', typographyStylesHtml);

    return html;
  }

  /**
   * Replace placeholders for figma-only extraction reports
   * @param {string} html - HTML template
   * @param {Object} comparisonResults - Comparison results
   * @returns {string} HTML content
   */
  replaceFigmaOnlyPlaceholders(html, comparisonResults) {
    const figmaData = comparisonResults.figmaData || {};
    const components = figmaData.components || [];

    // Basic info
    html = html.replaceAll('{{title}}', `Figma Extraction Report - ${new Date().toLocaleString()}`);
    html = html.replaceAll('{{figmaFileName}}', figmaData.fileName || 'Unknown Figma File');
    html = html.replaceAll('{{timestamp}}', comparisonResults.timestamp || new Date().toISOString());

    // Summary data
    html = html.replaceAll('{{totalComponents}}', components.length);
    html = html.replaceAll('{{designTokenCount}}', components.length); // Simplified for now

    // Generate component list
    const componentListHtml = this.generateComponentList(components);
    html = html.replaceAll('{{componentList}}', componentListHtml);

    // Generate design tokens
    const designTokensHtml = this.generateDesignTokens(figmaData);
    html = html.replaceAll('{{designTokens}}', designTokensHtml);

    return html;
  }

  /**
   * Generate element breakdown HTML for web extraction
   * @param {Array} elements - Web elements
   * @returns {string} HTML content
   */
  generateElementBreakdown(elements) {
    const breakdown = {};
    elements.forEach(element => {
      const tag = element.type || element.tagName || 'unknown';
      breakdown[tag] = (breakdown[tag] || 0) + 1;
    });

    return Object.entries(breakdown)
      .sort(([, a], [, b]) => b - a) // Sort by count descending
      .map(([tag, count]) => `
        <div class="element-type">
          <div class="element-count">${count}</div>
          <div class="element-label">${tag}</div>
        </div>
      `).join('');
  }

  /**
   * Generate color palette HTML
   * @param {Array} colors - Color palette
   * @returns {string} HTML content
   */
  generateColorPalette(colors) {
    if (!colors || colors.length === 0) {
      return '<div class="text-gray-600">No colors detected</div>';
    }

    return colors.map(color => `
      <div class="color-item">
        <div class="color-swatch" style="background-color: ${color};"></div>
        <div class="color-value">${color}</div>
      </div>
    `).join('');
  }

  /**
   * Generate typography styles HTML
   * @param {Object} typography - Typography data
   * @returns {string} HTML content
   */
  generateTypographyStyles(typography) {
    const sections = [];

    if (typography.fontFamilies && typography.fontFamilies.length > 0) {
      sections.push(`
        <div class="typography-item">
          <h4>Font Families</h4>
          <div class="typography-values">
            ${typography.fontFamilies.map(font => `<span class="typography-tag">${font}</span>`).join('')}
          </div>
        </div>
      `);
    }

    if (typography.fontSizes && typography.fontSizes.length > 0) {
      sections.push(`
        <div class="typography-item">
          <h4>Font Sizes</h4>
          <div class="typography-values">
            ${typography.fontSizes.map(size => `<span class="typography-tag">${size}</span>`).join('')}
          </div>
        </div>
      `);
    }

    if (typography.fontWeights && typography.fontWeights.length > 0) {
      sections.push(`
        <div class="typography-item">
          <h4>Font Weights</h4>
          <div class="typography-values">
            ${typography.fontWeights.map(weight => `<span class="typography-tag">${weight}</span>`).join('')}
          </div>
        </div>
      `);
    }

    return sections.length > 0 ? sections.join('') : '<div class="text-gray-600">No typography styles detected</div>';
  }

  /**
   * Generate component list HTML for Figma extraction
   * @param {Array} components - Figma components
   * @returns {string} HTML content
   */
  generateComponentList(components) {
    if (!components || components.length === 0) {
      return '<div class="text-gray-600">No components found</div>';
    }

    return components.map(component => `
      <div class="component-item">
        <div class="component-header">
          <div class="component-name">${component.name || 'Unnamed Component'}</div>
          <div class="component-type">${component.type || 'Unknown'}</div>
        </div>
        <div class="component-details">
          ID: ${component.id || 'N/A'}
        </div>
      </div>
    `).join('');
  }

  /**
   * Generate design tokens HTML for Figma extraction
   * @param {Object} figmaData - Figma data
   * @returns {string} HTML content
   */
  generateDesignTokens(figmaData) {
    // This is a simplified implementation
    // In a real scenario, you'd extract actual design tokens from Figma
    return `
      <div class="token-group">
        <h4>Colors</h4>
        <div class="token-values">
          <span class="token-tag">Extract from Figma</span>
        </div>
      </div>
      <div class="token-group">
        <h4>Typography</h4>
        <div class="token-values">
          <span class="token-tag">Extract from Figma</span>
        </div>
      </div>
    `;
  }

  /**
   * Get DevRev table styles
   * @returns {string} CSS styles for DevRev table
   */
  getDevRevTableStyles() {
    try {
      const stylesPath = path.join(__dirname, 'utils/devrevTableStyles.css');
      logger.info(`Loading DevRev table styles from: ${stylesPath}`);
      const styles = readFileSync(stylesPath, 'utf8');
      logger.info(`Loaded DevRev table styles: ${styles.length} characters`);
      return `<style>${styles}</style>`;
    } catch (error) {
      logger.error('Failed to load DevRev table styles', { path: path.join(__dirname, 'utils/devrevTableStyles.css'), error: error.message, stack: error.stack });
      return '<style>/* DevRev table styles not found */</style>';
    }
  }

  /**
   * Get DevRev table scripts
   * @returns {string} JavaScript for DevRev table functionality
   */
  getDevRevTableScripts() {
    try {
      const scriptsPath = path.join(__dirname, 'utils/devrevTableScripts.js');
      logger.info(`Loading DevRev table scripts from: ${scriptsPath}`);
      const scripts = readFileSync(scriptsPath, 'utf8');
      logger.info(`Loaded DevRev table scripts: ${scripts.length} characters`);
      return `<script>${scripts}</script>`;
    } catch (error) {
      logger.error('Failed to load DevRev table scripts', { path: path.join(__dirname, 'utils/devrevTableScripts.js'), error: error.message, stack: error.stack });
      return '<script>// DevRev table scripts not found</script>';
    }
  }

  /**
   * Generate Colors Analysis HTML
   * @param {Object} comparisonResults - Comparison results
   * @returns {string} HTML for colors analysis
   */
  generateColorsAnalysis(comparisonResults) {
    const figmaColors = this.getVisualTokens(comparisonResults, 'figma', 'colors');
    const webColors = this.getVisualTokens(comparisonResults, 'web', 'colors');
    const colorMatch = this.calculateTokenMatch(figmaColors, webColors);
    const figmaCount = comparisonResults.figmaData?.components?.length || comparisonResults.figmaData?.metadata?.componentCount || comparisonResults.extractionDetails?.figma?.componentCount || 0;
    const webCount = comparisonResults.webData?.elements?.length || comparisonResults.webData?.metadata?.elementCount || comparisonResults.extractionDetails?.web?.elementCount || 0;

    return `
      <div class="visual-analysis-section">
        <div class="analysis-header">
          <h2>🎨 Color Palette Analysis</h2>
          <div class="match-summary">
            <span class="match-percentage">${colorMatch.percentage}%</span>
            <span class="match-label">MATCH</span>
          </div>
        </div>

        <div class="analysis-grid">
          <div class="analysis-column">
            <h3>🔴 FIGMA TOKENS</h3>
            <div class="color-grid">
              ${figmaColors.map(color => `
                <div class="color-swatch" style="background-color: ${this.escapeHtml(this.getTokenValue(color))}">
                  <span class="color-label">${this.escapeHtml(color.name || this.getTokenValue(color))}</span>
                </div>
              `).join('')}
            </div>
            <div class="color-stats">
              <span>${figmaCount} Figma • ${figmaColors.length} Colors</span>
            </div>
          </div>

          <div class="analysis-column">
            <h3>🌐 WEB EXTRACTION</h3>
            <div class="color-grid">
              ${webColors.map(color => `
                <div class="color-swatch" style="background-color: ${this.escapeHtml(this.getTokenValue(color))}">
                  <span class="color-label">${this.escapeHtml(color.name || this.getTokenValue(color))}</span>
                </div>
              `).join('')}
            </div>
            <div class="color-stats">
              <span>${webCount} Web • ${webColors.length} Colors</span>
            </div>
          </div>
        </div>

        <div class="extraction-details">
          <h3>Raw Extraction Data</h3>
          <div class="extraction-stats">
            <div class="stat-box">
              <h4>FIGMA DATA</h4>
              <div class="stat-item">Colors: <strong>${figmaColors.length}</strong></div>
            </div>
            <div class="stat-box">
              <h4>WEB DATA</h4>
              <div class="stat-item">Colors: <strong>${webColors.length}</strong></div>
            </div>
            <div class="stat-box">
              <h4>COMPARISON</h4>
              <div class="stat-item">Matches: <strong>${colorMatch.matches}</strong></div>
              <div class="stat-item">Issues: <strong>${colorMatch.issues}</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate Typography Analysis HTML
   * @param {Object} comparisonResults - Comparison results
   * @returns {string} HTML for typography analysis
   */
  generateTypographyAnalysis(comparisonResults) {
    const figmaFonts = this.getVisualTokens(comparisonResults, 'figma', 'typography');
    const webFonts = this.getVisualTokens(comparisonResults, 'web', 'typography');
    const typographyMatch = this.calculateTokenMatch(figmaFonts, webFonts);

    return `
      <div class="visual-analysis-section">
        <div class="analysis-header">
          <h2>📝 Typography Analysis</h2>
          <div class="match-summary">
            <span class="match-percentage">${typographyMatch.percentage}%</span>
            <span class="match-label">MATCH</span>
          </div>
        </div>

        <div class="analysis-grid">
          <div class="analysis-column">
            <h3>🔤 FIGMA TOKENS</h3>
            <div class="typography-samples">
              ${figmaFonts.map(font => `
                <div class="typography-sample">
                  <div class="sample-text" style="font-family: ${font.fontFamily || font.family || 'inherit'}; font-size: ${font.fontSize || '16px'}; font-weight: ${font.fontWeight || '400'};">Aa</div>
                  <div class="font-details">
                    <div class="font-family">${font.fontFamily || font.family || 'Unknown'}</div>
                    <div class="font-size">${font.fontSize || '16'} • ${font.fontWeight || '400'}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="analysis-column">
            <h3>🌐 WEB EXTRACTION</h3>
            <div class="typography-samples">
              ${webFonts.map(font => `
                <div class="typography-sample">
                  <div class="sample-text" style="font-family: ${font.fontFamily || font.family || 'inherit'}; font-size: ${font.fontSize || '16px'}; font-weight: ${font.fontWeight || '400'};">Aa</div>
                  <div class="font-details">
                    <div class="font-family">${font.fontFamily || font.family || 'Unknown'}</div>
                    <div class="font-size">${font.fontSize || '16'} • ${font.fontWeight || '400'}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate Spacing Analysis HTML
   * @param {Object} comparisonResults - Comparison results
   * @returns {string} HTML for spacing analysis
   */
  generateSpacingAnalysis(comparisonResults) {
    const figmaSpacing = this.getVisualTokens(comparisonResults, 'figma', 'spacing');
    const webSpacing = this.getVisualTokens(comparisonResults, 'web', 'spacing');
    const spacingMatch = this.calculateTokenMatch(figmaSpacing, webSpacing);

    return `
      <div class="visual-analysis-section">
        <div class="analysis-header">
          <h2>📏 Spacing Analysis</h2>
          <div class="match-summary">
            <span class="match-percentage">${spacingMatch.percentage}%</span>
            <span class="match-label">MATCH</span>
          </div>
        </div>

        <div class="analysis-grid">
          <div class="analysis-column">
            <h3>📐 FIGMA TOKENS</h3>
            <div class="spacing-grid">
              ${figmaSpacing.map(spacing => `
                <div class="spacing-sample">
                  <div class="spacing-bar" style="width: ${Math.min(parseInt(spacing.value || spacing) / 2, 100)}px; height: 20px; background: var(--accent);"></div>
                  <span class="spacing-value">${spacing.value || spacing}px</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="analysis-column">
            <h3>🌐 WEB EXTRACTION</h3>
            <div class="spacing-grid">
              ${webSpacing.map(spacing => `
                <div class="spacing-sample">
                  <div class="spacing-bar" style="width: ${Math.min(parseInt(spacing.value || spacing) / 2, 100)}px; height: 20px; background: var(--accent);"></div>
                  <span class="spacing-value">${spacing.value || spacing}px</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate Border Radius Analysis HTML
   * @param {Object} comparisonResults - Comparison results
   * @returns {string} HTML for border radius analysis
   */
  generateBorderRadiusAnalysis(comparisonResults) {
    const figmaBorders = this.getVisualTokens(comparisonResults, 'figma', 'borderRadius');
    const webBorders = this.getVisualTokens(comparisonResults, 'web', 'borderRadius');
    const borderMatch = this.calculateTokenMatch(figmaBorders, webBorders);

    return `
      <div class="visual-analysis-section">
        <div class="analysis-header">
          <h2>🔲 Border Radius Analysis</h2>
          <div class="match-summary">
            <span class="match-percentage">${borderMatch.percentage}%</span>
            <span class="match-label">MATCH</span>
          </div>
        </div>

        <div class="analysis-grid">
          <div class="analysis-column">
            <h3>⭕ FIGMA TOKENS</h3>
            <div class="border-grid">
              ${figmaBorders.map(border => `
                <div class="border-sample">
                  <div class="border-preview" style="border-radius: ${border.value || border}px; width: 24px; height: 24px; background: rgba(99, 102, 241, 0.2); border: 1px solid var(--accent);"></div>
                  <span class="border-value">${border.value || border}px</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="analysis-column">
            <h3>🌐 WEB EXTRACTION</h3>
            <div class="border-grid">
              ${webBorders.map(border => `
                <div class="border-sample">
                  <div class="border-preview" style="border-radius: ${border.value || border}px; width: 24px; height: 24px; background: rgba(99, 102, 241, 0.2); border: 1px solid var(--accent);"></div>
                  <span class="border-value">${border.value || border}px</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get color count for tab badge
   */
  getColorCount(comparisonResults) {
    const figmaColors = this.getVisualTokens(comparisonResults, 'figma', 'colors');
    const webColors = this.getVisualTokens(comparisonResults, 'web', 'colors');
    return Math.max(figmaColors.length, webColors.length);
  }

  /**
   * Get typography count for tab badge
   */
  getTypographyCount(comparisonResults) {
    const figmaFonts = this.getVisualTokens(comparisonResults, 'figma', 'typography');
    const webFonts = this.getVisualTokens(comparisonResults, 'web', 'typography');
    return Math.max(figmaFonts.length, webFonts.length);
  }

  /**
   * Get spacing count for tab badge
   */
  getSpacingCount(comparisonResults) {
    const figmaSpacing = this.getVisualTokens(comparisonResults, 'figma', 'spacing');
    const webSpacing = this.getVisualTokens(comparisonResults, 'web', 'spacing');
    return Math.max(figmaSpacing.length, webSpacing.length);
  }

  /**
   * Get border radius count for tab badge
   */
  getBorderRadiusCount(comparisonResults) {
    const figmaBorders = this.getVisualTokens(comparisonResults, 'figma', 'borderRadius');
    const webBorders = this.getVisualTokens(comparisonResults, 'web', 'borderRadius');
    return Math.max(figmaBorders.length, webBorders.length);
  }
}

export default ReportGenerator; 
