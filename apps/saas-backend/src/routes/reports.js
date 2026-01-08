/**
 * Reports Routes
 * Handles report listing, viewing, deletion, and serving
 */

import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Common function for listing reports
const handleReportsList = async (req, res) => {
  try {
    // Use ReportService if available, otherwise fall back to StorageProvider
    let reports = [];

    // Try to get reports from the database service first
    if (req.dbServices?.reports) {
      try {
        reports = await req.dbServices.reports.listReports({
          userId: req.user?.id || null,
          format: req.query.format || null,
          comparisonId: req.query.comparisonId || null,
          limit: parseInt(req.query.limit) || 50,
          offset: parseInt(req.query.offset) || 0
        });
        logger.info(`Retrieved ${reports.length} reports from database service`);
      } catch (serviceError) {
        logger.warn('ReportService failed, falling back to StorageProvider:', serviceError.message);
        reports = [];
      }
    }

    // If no reports from database service, try storage provider
    if (reports.length === 0) {
      try {
        const { getStorageProvider } = await import('../config/storage-config.js');
        const storage = getStorageProvider(req.user?.id);
        const filters = {
          userId: req.user?.id,
          format: req.query.format,
          comparisonId: req.query.comparisonId,
          limit: parseInt(req.query.limit) || 50,
          offset: parseInt(req.query.offset) || 0
        };
        reports = await storage.listReports(filters);
        logger.info(`Retrieved ${reports.length} reports from storage provider`);
      } catch (storageError) {
        logger.error('Storage provider failed:', storageError.message);
        reports = [];
      }
    }

    // Transform reports to ensure consistent structure
    const transformedReports = reports.map(report => ({
      id: report.id,
      title: report.title || `Report ${report.id}`,
      figmaUrl: report.figmaUrl || '',
      webUrl: report.webUrl || '',
      status: report.status || 'completed',
      createdAt: report.createdAt || report.created_at || new Date().toISOString(),
      duration: report.duration || 0,
      score: report.score || null,
      issues: report.issues || null,
      url: report.url || `/reports/${report.id}.html`,
      format: report.format || 'html',
      fileSize: report.fileSize || report.file_size || null,
      comparisonId: report.comparisonId || report.comparison_id || null
    }));

    res.json({
      success: true,
      data: transformedReports,
      total: transformedReports.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to list reports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list reports',
      message: error.message
    });
  }
};

/**
 * Default route - same as list
 * GET /api/reports
 */
router.get('/', handleReportsList);

/**
 * List all reports
 * GET /api/reports/list
 */
router.get('/list', handleReportsList);

/**
 * Get a specific report by ID
 * GET /api/reports/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Try database service first
    let report = null;
    if (req.dbServices?.reports) {
      try {
        report = await req.dbServices.reports.findById(id);
      } catch (serviceError) {
        logger.warn('ReportService failed to find report:', serviceError.message);
      }
    }

    // If not found in database, try storage provider
    if (!report) {
      try {
        const { getStorageProvider } = await import('../config/storage-config.js');
        const storage = getStorageProvider(req.user?.id);
        const reportData = await storage.getReport(id);
        report = reportData.metadata;

        // If this is a request for HTML content, return it directly
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
          res.setHeader('Content-Type', 'text/html');
          return res.send(reportData.data);
        }
      } catch (storageError) {
        logger.error('Storage provider failed to get report:', storageError.message);
      }
    }

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    logger.error('Failed to get report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve report',
      message: error.message
    });
  }
});

/**
 * Serve report HTML content
 * GET /api/reports/:id/view
 */
router.get('/:id/view', async (req, res) => {
  try {
    const { id } = req.params;

    // Try to get report content from storage
    const { getStorageProvider } = await import('../config/storage-config.js');
    const storage = getStorageProvider(req.user?.id);

    try {
      const reportData = await storage.getReport(id);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      return res.send(reportData.data);
    } catch (storageError) {
      // Try to regenerate report from comparison data if available
      if (req.dbServices?.comparisons) {
        try {
          const comparisonData = await req.dbServices.comparisons.getComparison(id);
          if (comparisonData) {
            const reportGeneratorModule = await import('../reporting/index.js');
            const reportGenerator = reportGeneratorModule.getReportGenerator();

            const reportDataForGeneration = {
              figmaData: comparisonData.result?.figmaData || comparisonData.figmaData || {},
              webData: comparisonData.result?.webData || comparisonData.webData || {},
              comparisons: comparisonData.result?.comparisons || comparisonData.comparisons || [],
              summary: comparisonData.result?.summary || comparisonData.summary || {},
              timestamp: comparisonData.result?.timestamp || comparisonData.createdAt || new Date().toISOString(),
              metadata: comparisonData.result?.metadata || comparisonData.metadata || {}
            };

            const htmlContent = await reportGenerator.generateHtmlContent(reportDataForGeneration);

            // Save regenerated report
            try {
              const reportEntry = await storage.saveReport(htmlContent, {
                comparisonId: id,
                title: comparisonData.title || `Comparison Report - ${new Date().toLocaleDateString()}`,
                format: 'html'
              });
              logger.info(`Regenerated and saved report for comparison ${id}`);
            } catch (saveError) {
              logger.warn('Failed to save regenerated report:', saveError.message);
            }

            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(htmlContent);
          }
        } catch (dbError) {
          logger.error('Failed to get comparison data for report regeneration:', dbError.message);
        }
      }

      throw storageError;
    }

  } catch (error) {
    logger.error('Failed to serve report:', error);
    res.status(404).json({
      success: false,
      error: 'Report not found or could not be generated',
      message: error.message
    });
  }
});

/**
 * Delete a report
 * DELETE /api/reports/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let deleted = false;

    // Try to delete from database service first
    if (req.dbServices?.reports) {
      try {
        deleted = await req.dbServices.reports.delete(id);
        if (deleted) {
          logger.info(`Deleted report ${id} from database service`);
        }
      } catch (serviceError) {
        logger.warn('ReportService failed to delete report:', serviceError.message);
      }
    }

    // Also try to delete from storage provider
    try {
      const { getStorageProvider } = await import('../config/storage-config.js');
      const storage = getStorageProvider(req.user?.id);
      const storageDeleted = await storage.deleteReport(id);
      if (storageDeleted) {
        deleted = true;
        logger.info(`Deleted report ${id} from storage provider`);
      }
    } catch (storageError) {
      logger.warn('Storage provider failed to delete report:', storageError.message);
    }

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    logger.error('Failed to delete report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete report',
      message: error.message
    });
  }
});

/**
 * Save/Create a new report
 * POST /api/reports/save
 */
router.post('/save', async (req, res) => {
  try {
    const { comparisonId, reportData, reportPath, title, format = 'html' } = req.body;

    if (!comparisonId && !reportData) {
      return res.status(400).json({
        success: false,
        error: 'Either comparison ID or report data is required'
      });
    }

    let reportEntry = null;

    // If reportData is provided, save it directly
    if (reportData) {
      const { getStorageProvider } = await import('../config/storage-config.js');
      const storage = getStorageProvider(req.user?.id);

      reportEntry = await storage.saveReport(reportData, {
        comparisonId,
        title: title || `Report - ${new Date().toLocaleDateString()}`,
        format,
        userId: req.user?.id
      });

      // Also save to database if available
      if (req.dbServices?.reports) {
        try {
          await req.dbServices.reports.create({
            id: reportEntry.id,
            userId: req.user?.id,
            comparisonId,
            title: reportEntry.title,
            format: reportEntry.format,
            storagePath: reportEntry.url,
            fileSize: reportEntry.fileSize,
            createdAt: reportEntry.createdAt
          });
          logger.info(`Saved report metadata to database: ${reportEntry.id}`);
        } catch (dbError) {
          logger.warn('Failed to save report to database:', dbError.message);
        }
      }
    }
    // If only comparisonId is provided, try to find existing report or create a placeholder
    else if (comparisonId) {
      // First, try to generate report from comparison data if database is available
      if (req.dbServices?.comparisons) {
      try {
        const comparisonData = await req.dbServices.comparisons.getComparison(comparisonId);
        if (!comparisonData) {
          return res.status(404).json({
            success: false,
            error: 'Comparison not found'
          });
        }

        const reportGeneratorModule = await import('../reporting/index.js');
        const reportGenerator = reportGeneratorModule.getReportGenerator();

        const reportDataForGeneration = {
          figmaData: comparisonData.result?.figmaData || comparisonData.figmaData || {},
          webData: comparisonData.result?.webData || comparisonData.webData || {},
          comparisons: comparisonData.result?.comparisons || comparisonData.comparisons || [],
          summary: comparisonData.result?.summary || comparisonData.summary || {},
          timestamp: comparisonData.result?.timestamp || comparisonData.createdAt || new Date().toISOString(),
          metadata: comparisonData.result?.metadata || comparisonData.metadata || {}
        };

        const htmlContent = await reportGenerator.generateHtmlContent(reportDataForGeneration);

        const { getStorageProvider } = await import('../config/storage-config.js');
        const storage = getStorageProvider(req.user?.id);

        reportEntry = await storage.saveReport(htmlContent, {
          comparisonId,
          title: comparisonData.title || `Comparison Report - ${new Date().toLocaleDateString()}`,
          format: 'html',
          userId: req.user?.id
        });

        // Save metadata to database
        if (req.dbServices?.reports) {
          try {
            await req.dbServices.reports.create({
              id: reportEntry.id,
              userId: req.user?.id,
              comparisonId,
              title: reportEntry.title,
              format: reportEntry.format,
              storagePath: reportEntry.url,
              fileSize: reportEntry.fileSize,
              createdAt: reportEntry.createdAt
            });
          } catch (dbError) {
            logger.warn('Failed to save report to database:', dbError.message);
          }
        }

      } catch (compError) {
        logger.error('Failed to generate report from comparison:', compError.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to generate report from comparison',
          message: compError.message
        });
      }
      } else {
        // Database service not available, create a placeholder report entry
        logger.warn('Database service not available for report generation, creating placeholder entry');
        const { getStorageProvider } = await import('../config/storage-config.js');
        const storage = getStorageProvider(req.user?.id);

        // Create a placeholder HTML report
        const placeholderHtml = `<!DOCTYPE html>
<html><head><title>Report Placeholder</title></head>
<body>
<h1>Report for Comparison ${comparisonId}</h1>
<p>Report data will be available once the comparison completes.</p>
<p>Generated on: ${new Date().toLocaleString()}</p>
</body></html>`;

        reportEntry = await storage.saveReport(placeholderHtml, {
          comparisonId,
          title: title || `Report - ${new Date().toLocaleDateString()}`,
          format,
          userId: req.user?.id
        });
      }
    }

    if (!reportEntry) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create report entry'
      });
    }

    logger.info(`Report saved successfully: ${reportEntry.id}`);

    res.json({
      success: true,
      data: reportEntry,
      message: 'Report saved successfully'
    });

  } catch (error) {
    logger.error('Failed to save report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save report',
      message: error.message
    });
  }
});

/**
 * Export report in different formats
 * GET /api/reports/:id/export?format=csv|json|pdf
 */
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv' } = req.query;

    // Get report data
    let report = null;
    if (req.dbServices?.reports) {
      try {
        report = await req.dbServices.reports.findById(id);
      } catch (serviceError) {
        logger.warn('ReportService failed:', serviceError.message);
      }
    }

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Get comparison data for export
    let comparisonData = null;
    if (report.comparisonId && req.dbServices?.comparisons) {
      try {
        comparisonData = await req.dbServices.comparisons.getComparison(report.comparisonId);
      } catch (compError) {
        logger.warn('Failed to get comparison data:', compError.message);
      }
    }

    if (!comparisonData) {
      return res.status(404).json({
        success: false,
        error: 'Comparison data not found for export'
      });
    }

    // Generate export based on format
    if (format === 'csv') {
      const { IssueFormatter } = await import('../services/reports/IssueFormatter.js');
      const formatter = new IssueFormatter();
      const issues = formatter.transform(comparisonData);

      // Convert to CSV
      const csvHeaders = [
        'Issue ID', 'Title', 'Description', 'Module', 'Frame/Component Name',
        'Figma ID', 'Type', 'Web Element', 'Severity', 'Priority', 'Status',
        'Expected Result', 'Actual Result', 'Environment', 'Created Date', 'Remarks'
      ];

      const csvRows = issues.map(issue => [
        issue.issueId, issue.title, issue.description, issue.module,
        issue.frameComponentName, issue.figmaComponentId, issue.figmaComponentType,
        issue.webElement, issue.severity, issue.priority, issue.status,
        issue.expectedResult, issue.actualResult, issue.environment,
        issue.createdDate, issue.remarks
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="report_${id}.csv"`);
      return res.send(csvContent);
    }

    else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="report_${id}.json"`);
      return res.json(comparisonData);
    }

    else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported export format. Supported: csv, json'
      });
    }

  } catch (error) {
    logger.error('Failed to export report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export report',
      message: error.message
    });
  }
});

/**
 * Export report in developer-friendly CSV format with actionable fixes
 * GET /api/reports/:id/export-dev-csv
 */
router.get('/:id/export-dev-csv', async (req, res) => {
  try {
    const { id } = req.params;

    // Get report data
    let report = null;
    if (req.dbServices?.reports) {
      try {
        report = await req.dbServices.reports.findById(id);
      } catch (serviceError) {
        logger.warn('ReportService failed:', serviceError.message);
      }
    }

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Get comparison data for export
    let comparisonData = null;
    if (report.comparisonId && req.dbServices?.comparisons) {
      try {
        comparisonData = await req.dbServices.comparisons.getComparison(report.comparisonId);
      } catch (compError) {
        logger.warn('Failed to get comparison data:', compError.message);
      }
    }

    if (!comparisonData) {
      return res.status(404).json({
        success: false,
        error: 'Comparison data not found for export'
      });
    }

    // Generate developer-focused issues
    const { IssueFormatter } = await import('../services/reports/IssueFormatter.js');
    const formatter = new IssueFormatter();
    const developerIssues = formatter.transformForDevelopers(comparisonData);

    // Developer CSV headers with actionable fields
    const devCsvHeaders = [
      'Issue ID', 'Component Name', 'Issue Type', 'Severity', 'Priority',
      'CSS Selector', 'Property to Fix', 'Current Value', 'Expected Value',
      'CSS Fix', 'File Location', 'Line Number', 'Quick Fix Command',
      'Test Steps', 'Screenshots', 'Design Token', 'Acceptance Criteria', 'Time Estimate'
    ];

    // Map developer issues to CSV format
    const devCsvRows = developerIssues.map(issue => [
      issue.issueId,
      issue.componentName,
      issue.issueType,
      issue.severity,
      issue.priority,
      issue.cssSelector || '',
      issue.propertyToFix || '',
      issue.currentValue || '',
      issue.expectedValue || '',
      issue.cssFix || '',
      issue.fileLocation || '',
      issue.lineNumber || '',
      issue.quickFixCommand || '',
      issue.testSteps || '',
      issue.screenshotUrls || '',
      issue.designToken || '',
      issue.acceptanceCriteria || '',
      issue.timeEstimate || ''
    ]);

    const devCsvContent = [devCsvHeaders, ...devCsvRows]
      .map(row => row.map(cell => {
        const cellStr = String(cell).replace(/"/g, '""');
        return `"${cellStr}"`;
      }).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="developer_fixes_${id}.csv"`);
    res.setHeader('X-Total-Issues', developerIssues.length.toString());

    return res.send(devCsvContent);

  } catch (error) {
    logger.error('Failed to export developer CSV:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export developer CSV',
      message: error.message
    });
  }
});

export default router;