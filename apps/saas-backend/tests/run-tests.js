#!/usr/bin/env node

/**
 * Test Runner Script
 * Executes all tests with proper setup and reporting
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';

const TEST_CATEGORIES = {
  unit: {
    name: 'Unit Tests',
    pattern: 'tests/unit/.*\\.test\\.js$',
    description: 'Individual module tests'
  },
  integration: {
    name: 'Integration Tests', 
    pattern: 'tests/integration/.*\\.test\\.js$',
    description: 'Module interaction tests'
  },
  api: {
    name: 'API Tests',
    pattern: 'tests/api/.*\\.test\\.js$', 
    description: 'REST API endpoint tests'
  },
  e2e: {
    name: 'End-to-End Tests',
    pattern: 'tests/e2e/.*\\.test\\.js$',
    description: 'Complete workflow tests'
  },
  performance: {
    name: 'Performance Tests',
    pattern: 'tests/performance/.*\\.test\\.js$',
    description: 'Load and performance tests'
  }
};

class TestRunner {
  constructor() {
    this.results = {};
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.startTime = Date.now();
  }

  async runTests(categories = Object.keys(TEST_CATEGORIES)) {
    console.log(chalk.blue.bold('🧪 Figma-Web Comparison Tool Test Suite'));
    console.log(chalk.blue('=' .repeat(60)));
    console.log('');
    this.runCoverage = categories.length === Object.keys(TEST_CATEGORIES).length;

    // Setup test environment
    await this.setupTestEnvironment();

    // Run tests for each category
    for (const category of categories) {
      if (TEST_CATEGORIES[category]) {
        await this.runTestCategory(category);
      } else {
        console.log(chalk.red(`❌ Unknown test category: ${category}`));
      }
    }

    // Generate final report
    await this.generateReport();
  }

  async setupTestEnvironment() {
    console.log(chalk.yellow('🔧 Setting up test environment...'));
    
    try {
      // Use a writable local data dir for tests
      this.testDataDir = path.resolve('output', 'test-data');
      process.env.DESIGNQA_DATA_DIR = this.testDataDir;
      await fs.mkdir(this.testDataDir, { recursive: true });

      // Ensure test directories exist
      const testDirs = [
        'tests/fixtures/screenshots',
        'tests/fixtures/reports',
        'output/screenshots',
        'output/reports',
        path.join(this.testDataDir, 'credentials'),
        path.join(this.testDataDir, 'design-systems'),
        path.join(this.testDataDir, 'reports'),
        path.join(this.testDataDir, 'sessions')
      ];

      for (const dir of testDirs) {
        await fs.mkdir(dir, { recursive: true });
      }

      // Create test config if it doesn't exist
      const testConfigPath = 'tests/fixtures/test-config.json';
      try {
        await fs.access(testConfigPath);
      } catch {
        const testConfig = {
          figma: {
            accessToken: 'test-token',
            fileId: 'test-file-id',
            nodeId: 'test-node-id'
          },
          comparison: {
            thresholds: {
              fontSize: 2,
              spacing: 4,
              borderRadius: 2,
              colorTolerance: 5
            }
          },
          puppeteer: {
            headless: "new",
            viewport: { width: 1920, height: 1080 },
            timeout: 30000
          }
        };
        
        await fs.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
      }

      console.log(chalk.green('✅ Test environment ready'));
      console.log('');
    } catch (error) {
      console.error(chalk.red('❌ Failed to setup test environment:'), error.message);
      process.exit(1);
    }
  }

  async runTestCategory(category) {
    const categoryInfo = TEST_CATEGORIES[category];
    console.log(chalk.cyan.bold(`📋 ${categoryInfo.name}`));
    console.log(chalk.gray(`   ${categoryInfo.description}`));
    console.log('');

    try {
      const result = await this.executeJest(categoryInfo.pattern);
      this.results[category] = result;
      
      if (result.success) {
        console.log(chalk.green(`✅ ${categoryInfo.name} completed successfully`));
        console.log(chalk.green(`   Tests: ${result.numPassedTests}/${result.numTotalTests} passed`));
      } else {
        console.log(chalk.red(`❌ ${categoryInfo.name} failed`));
        console.log(chalk.red(`   Tests: ${result.numPassedTests}/${result.numTotalTests} passed`));
        console.log(chalk.red(`   Failures: ${result.numFailedTests}`));
      }
      
      this.totalTests += result.numTotalTests;
      this.passedTests += result.numPassedTests;
      this.failedTests += result.numFailedTests;
      
    } catch (error) {
      console.error(chalk.red(`❌ Error running ${categoryInfo.name}:`), error.message);
      this.results[category] = { success: false, error: error.message };
    }
    
    console.log('');
  }

  async executeJest(pattern, extraArgs = []) {
    return new Promise((resolve, reject) => {
      const outputFile = path.resolve(
        this.testDataDir || '.',
        `jest-results-${Date.now()}.json`
      );
      const jestArgs = [
        '--testPathPattern=' + pattern,
        '--verbose',
        '--json',
        '--outputFile=' + outputFile,
        '--coverage=false', // Disable coverage for individual runs
        '--runInBand',
        ...extraArgs
      ];

      const jest = spawn('npx', ['jest', ...jestArgs], {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DESIGNQA_DATA_DIR: this.testDataDir || process.env.DESIGNQA_DATA_DIR,
          SKIP_PUPPETEER: 'true',
          SKIP_SERVER_TESTS: 'true',
          SKIP_WEB_EXTRACTOR_TESTS: 'true',
          NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --experimental-vm-modules`.trim()
        }
      });

      jest.on('close', (code) => {
        fs.readFile(outputFile, 'utf-8')
          .then((resultRaw) => {
            const result = JSON.parse(resultRaw);
            resolve({
              success: code === 0,
              numTotalTests: result.numTotalTests || 0,
              numPassedTests: result.numPassedTests || 0,
              numFailedTests: result.numFailedTests || 0,
              testResults: result.testResults || []
            });
          })
          .catch((error) => {
            reject(new Error(`Failed to parse Jest output: ${error.message}`));
          });
      });

      jest.on('error', (error) => {
        reject(error);
      });
    });
  }

  async generateReport() {
    const endTime = Date.now();
    const duration = (endTime - this.startTime) / 1000;

    console.log(chalk.blue.bold('📊 Test Results Summary'));
    console.log(chalk.blue('=' .repeat(60)));
    console.log('');

    // Overall statistics
    console.log(chalk.bold('Overall Results:'));
    console.log(`  Total Tests: ${this.totalTests}`);
    console.log(`  Passed: ${chalk.green(this.passedTests)}`);
    console.log(`  Failed: ${chalk.red(this.failedTests)}`);
    console.log(`  Success Rate: ${this.totalTests > 0 ? Math.round((this.passedTests / this.totalTests) * 100) : 0}%`);
    console.log(`  Duration: ${duration.toFixed(2)}s`);
    console.log('');

    // Category breakdown
    console.log(chalk.bold('Category Breakdown:'));
    for (const [category, result] of Object.entries(this.results)) {
      const categoryInfo = TEST_CATEGORIES[category];
      const status = result.success ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
      const stats = result.numTotalTests ? 
        `${result.numPassedTests}/${result.numTotalTests}` : 
        'No tests found';
      
      console.log(`  ${status} ${categoryInfo.name}: ${stats}`);
    }
    console.log('');

    // Generate coverage report if all tests passed
    if (this.failedTests === 0 && this.totalTests > 0 && this.runCoverage) {
      console.log(chalk.yellow('📈 Generating coverage report...'));
      await this.generateCoverageReport();
    }

    // Final status
    if (this.failedTests === 0 && this.totalTests > 0) {
      console.log(chalk.green.bold('🎉 All tests passed!'));
    } else if (this.totalTests === 0) {
      console.log(chalk.yellow.bold('⚠️ No tests found!'));
    } else {
      console.log(chalk.red.bold('💥 Some tests failed!'));
      process.exit(1);
    }
  }

  async generateCoverageReport() {
    try {
      await this.executeJest('tests/.*\\.test\\.js$', ['--coverage']);
      console.log(chalk.green('✅ Coverage report generated in ./coverage/'));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Failed to generate coverage report:', error.message));
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const runner = new TestRunner();

  if (args.length === 0) {
    // Run all test categories
    await runner.runTests();
  } else if (args[0] === '--help' || args[0] === '-h') {
    console.log(chalk.blue.bold('Figma-Web Comparison Tool Test Runner'));
    console.log('');
    console.log(chalk.bold('Usage:'));
    console.log('  npm run test                 # Run all tests');
    console.log('  node tests/run-tests.js      # Run all tests');
    console.log('  node tests/run-tests.js unit # Run only unit tests');
    console.log('');
    console.log(chalk.bold('Available test categories:'));
    for (const [key, info] of Object.entries(TEST_CATEGORIES)) {
      console.log(`  ${key.padEnd(12)} - ${info.description}`);
    }
    console.log('');
    console.log(chalk.bold('Examples:'));
    console.log('  node tests/run-tests.js unit integration');
    console.log('  node tests/run-tests.js api');
  } else {
    // Run specific categories
    const categories = args.filter(arg => TEST_CATEGORIES[arg]);
    const invalid = args.filter(arg => !TEST_CATEGORIES[arg]);
    
    if (invalid.length > 0) {
      console.log(chalk.red(`❌ Invalid test categories: ${invalid.join(', ')}`));
      console.log(chalk.yellow('Available categories:'), Object.keys(TEST_CATEGORIES).join(', '));
      process.exit(1);
    }
    
    await runner.runTests(categories);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ Unhandled rejection:'), error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught exception:'), error);
  process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('❌ Test runner failed:'), error);
    process.exit(1);
  });
}

export default TestRunner; 
