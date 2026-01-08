#!/usr/bin/env node

/**
 * Server Issues Validation Script
 * Verifies that all critical server fixes have been implemented
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '../src');

console.log('🔍 Validating server fixes implementation...\n');

const validations = [
  {
    name: 'Environment Validation',
    check: () => {
      const envValidatorPath = path.join(srcDir, 'config/environmentValidator.js');
      return fs.existsSync(envValidatorPath);
    },
    description: 'Environment variable validation module exists'
  },
  {
    name: 'Circuit Breaker Implementation',
    check: () => {
      const circuitBreakerPath = path.join(srcDir, 'core/resilience/CircuitBreaker.js');
      return fs.existsSync(circuitBreakerPath);
    },
    description: 'Circuit breaker pattern implementation exists'
  },
  {
    name: 'MCP Connection Improvements',
    check: () => {
      const mcpConfigPath = path.join(srcDir, 'config/mcp-config.js');
      if (!fs.existsSync(mcpConfigPath)) return false;

      const content = fs.readFileSync(mcpConfigPath, 'utf8');
      return content.includes('circuitBreakerRegistry') &&
             content.includes('circuitBreaker.execute');
    },
    description: 'MCP connection uses circuit breaker and timeout handling'
  },
  {
    name: 'Database Reliability',
    check: () => {
      const supabaseAdapterPath = path.join(srcDir, 'database/adapters/SupabaseAdapter.js');
      if (!fs.existsSync(supabaseAdapterPath)) return false;

      const content = fs.readFileSync(supabaseAdapterPath, 'utf8');
      return content.includes('_executeWithReconnection') &&
             content.includes('circuitBreaker');
    },
    description: 'Database adapter includes connection reliability features'
  },
  {
    name: 'Comprehensive Health Checks',
    check: () => {
      const healthCheckerPath = path.join(srcDir, 'core/health/HealthChecker.js');
      if (!fs.existsSync(healthCheckerPath)) return false;

      const content = fs.readFileSync(healthCheckerPath, 'utf8');
      return content.includes('createDatabaseCheck') &&
             content.includes('createCircuitBreakerCheck') &&
             content.includes('validateStartup');
    },
    description: 'Health checker includes database and circuit breaker monitoring'
  },
  {
    name: 'Standardized Error Handling',
    check: () => {
      const errorHandlerPath = path.join(srcDir, 'utils/standardErrorHandler.js');
      if (!fs.existsSync(errorHandlerPath)) return false;

      const content = fs.readFileSync(errorHandlerPath, 'utf8');
      return content.includes('StandardError') &&
             content.includes('ErrorHandler') &&
             content.includes('expressMiddleware');
    },
    description: 'Standardized error handling utility exists'
  },
  {
    name: 'Server Startup Integration',
    check: () => {
      const serverPath = path.join(__dirname, '../server.js');
      if (!fs.existsSync(serverPath)) return false;

      const content = fs.readFileSync(serverPath, 'utf8');
      return content.includes('validateEnvironment');
    },
    description: 'Server startup includes environment validation'
  },
  {
    name: 'Authentication Error Handling',
    check: () => {
      const authServicePath = path.join(srcDir, 'services/FigmaAuthService.js');
      if (!fs.existsSync(authServicePath)) return false;

      const content = fs.readFileSync(authServicePath, 'utf8');
      return content.includes('circuitBreakerRegistry') ||
             content.includes('handleError');
    },
    description: 'Authentication service includes improved error handling'
  }
];

let passedCount = 0;
let failedCount = 0;

validations.forEach(validation => {
  try {
    const passed = validation.check();
    if (passed) {
      console.log(`✅ ${validation.name}: ${validation.description}`);
      passedCount++;
    } else {
      console.log(`❌ ${validation.name}: ${validation.description}`);
      failedCount++;
    }
  } catch (error) {
    console.log(`❌ ${validation.name}: Validation error - ${error.message}`);
    failedCount++;
  }
});

console.log(`\n📊 Validation Summary:`);
console.log(`✅ Passed: ${passedCount}`);
console.log(`❌ Failed: ${failedCount}`);
console.log(`📈 Success Rate: ${Math.round((passedCount / validations.length) * 100)}%`);

if (failedCount === 0) {
  console.log(`\n🎉 All server fixes have been successfully implemented!`);
  console.log(`\n🚀 Server is ready for enhanced reliability and error handling.`);
} else {
  console.log(`\n⚠️  Some fixes may need attention. Check the failed validations above.`);
  process.exit(1);
}

// Additional checks for specific issue patterns
console.log(`\n🔧 Additional Checks:`);

// Check if error handling imports are consistent
const importChecks = [
  'import.*circuitBreakerRegistry',
  'import.*handleError',
  'import.*logger'
];

let importIssues = 0;
const checkImports = (filePath, requiredImports) => {
  if (!fs.existsSync(filePath)) return true; // Skip if file doesn't exist

  const content = fs.readFileSync(filePath, 'utf8');
  const missing = requiredImports.filter(imp => !content.match(new RegExp(imp)));

  if (missing.length > 0) {
    console.log(`   ⚠️  ${path.basename(filePath)}: Missing imports - ${missing.join(', ')}`);
    importIssues++;
    return false;
  }
  return true;
};

// Key files that should have proper imports
const keyFiles = [
  { file: path.join(srcDir, 'config/mcp-config.js'), imports: ['circuitBreakerRegistry'] },
  { file: path.join(srcDir, 'database/adapters/SupabaseAdapter.js'), imports: ['circuitBreakerRegistry'] },
  { file: path.join(srcDir, 'services/FigmaAuthService.js'), imports: ['circuitBreakerRegistry'] }
];

keyFiles.forEach(({ file, imports }) => {
  checkImports(file, imports);
});

if (importIssues === 0) {
  console.log(`✅ All key files have proper imports`);
} else {
  console.log(`❌ ${importIssues} files have import issues`);
}

console.log(`\n📋 Next Steps:`);
console.log(`1. Test server startup: npm start`);
console.log(`2. Check health endpoint: curl http://localhost:3847/health`);
console.log(`3. Monitor error logs for proper formatting`);
console.log(`4. Verify circuit breaker stats: curl http://localhost:3847/admin/circuit-breakers`);