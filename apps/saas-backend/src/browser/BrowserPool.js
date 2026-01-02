/**
 * Browser Pool Manager
 * Manages a pool of browser instances to prevent memory leaks and improve performance
 */

import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import os from 'os';
import { join } from 'path';
import { loadConfig } from '../config/index.js';
import { getBrowserConfig, validateBrowserAvailability } from '../utils/browserDetection.js';
import { getResourceManager } from '../utils/ResourceManager.js';

const isDesktopMode = () =>
  process.env.RUNNING_IN_ELECTRON === 'true' || process.env.DEPLOYMENT_MODE === 'desktop';

const shouldPersistSessions = () => {
  if (!isDesktopMode()) return false;
  const flag = process.env.PERSIST_BROWSER_SESSIONS;
  if (!flag) return true;
  return !['0', 'false', 'no', 'off'].includes(String(flag).toLowerCase());
};

const sanitizeDirName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'default';

class BrowserPool {
  constructor() {
    this.browsers = new Map(); // browserKey -> browser instance
    this.pages = new Map(); // pageId -> { browser, page, lastUsed }
    this.config = null;
    this.isShuttingDown = false;
    this.maxBrowsers = 5; // Increased for concurrent extractions
    this.maxPagesPerBrowser = 20; // Increased to prevent premature cleanup
    this.maxIdleTime = 10 * 60 * 1000; // 10 minutes for long extractions
    this.queue = [];
    this.activeJobs = 0;
    this.maxConcurrentJobs = 3;
    this.resourceManager = getResourceManager();
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdlePages();
    }, 60000); // Check every minute
  }

  async initialize() {
    if (!this.config) {
      this.config = await loadConfig();
      if (this.config?.browserPool?.maxConcurrentJobs) {
        this.maxConcurrentJobs = this.config.browserPool.maxConcurrentJobs;
      }
      if (this.config?.browserPool?.maxBrowsers) {
        this.maxBrowsers = this.config.browserPool.maxBrowsers;
      }
      if (this.config?.browserPool?.maxPagesPerBrowser) {
        this.maxPagesPerBrowser = this.config.browserPool.maxPagesPerBrowser;
      }
      if (this.config?.browserPool?.maxIdleMinutes) {
        this.maxIdleTime = this.config.browserPool.maxIdleMinutes * 60 * 1000;
      }
    }
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.activeJobs >= this.maxConcurrentJobs) {
      return;
    }

    const nextJob = this.queue.shift();
    if (!nextJob) {
      return;
    }

    this.activeJobs += 1;

    try {
      const result = await nextJob.task();
      nextJob.resolve(result);
    } catch (error) {
      nextJob.reject(error);
    } finally {
      this.activeJobs -= 1;
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Get or create a browser instance
   */
  async getBrowser(options = {}) {
    await this.initialize();
    
    if (this.isShuttingDown) {
      throw new Error('Browser pool is shutting down');
    }

    // Desktop mode: persist cookies/localStorage on disk per-domain so auth/session survives across runs.
    if (shouldPersistSessions()) {
      const sessionKey = options.sessionKey || options.profileKey || (() => {
        const url = options.profileUrl || options.url;
        if (!url) return null;
        try {
          return new URL(url).hostname;
        } catch {
          return null;
        }
      })();

      if (sessionKey && !options.userDataDir) {
        const base =
          process.env.BROWSER_PROFILE_BASE_DIR ||
          process.env.DESIGNQA_USER_DATA_DIR ||
          join(os.homedir(), '.designqa');

        const dir = join(base, 'browser-profiles', sanitizeDirName(sessionKey));
        try {
          mkdirSync(dir, { recursive: true });
          options.userDataDir = dir;
        } catch (error) {
          console.warn(`⚠️ Failed to create browser profile dir at ${dir}:`, error.message);
        }
      }
    }

    const browserKey = this.getBrowserKey(options);
    
    // Return existing browser if available
    if (this.browsers.has(browserKey)) {
      const browser = this.browsers.get(browserKey);
      if (browser && browser.isConnected()) {
        return browser;
      } else {
        // Clean up disconnected browser
        this.browsers.delete(browserKey);
      }
    }

    // Create new browser if under limit
    if (this.browsers.size >= this.maxBrowsers) {
      // Find least used browser to reuse
      const [reusableBrowser] = this.browsers.values();
      if (reusableBrowser && reusableBrowser.isConnected()) {
        return reusableBrowser;
      }
    }

    // Launch new browser with cross-platform configuration
    try {
      // Validate browser availability first
      const browserInfo = await validateBrowserAvailability();
      console.log(`🌐 Browser info:`, browserInfo);
      
      // Get optimized browser configuration
      const launchOptions = getBrowserConfig({
        headless: this.config.puppeteer.headless,
        timeout: this.config.puppeteer.timeout,
        protocolTimeout: this.config.puppeteer.protocolTimeout,
        // Allow explicit overrides in local/desktop mode without changing code.
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(',') : undefined,
        pipe: process.env.PUPPETEER_PIPE ? process.env.PUPPETEER_PIPE === 'true' : undefined,
        ...options
      });

      console.log(`🚀 Launching browser with config:`, {
        executablePath: launchOptions.executablePath || 'bundled',
        headless: launchOptions.headless,
        platform: process.platform
      });

      const browser = await puppeteer.launch(launchOptions);
      this.browsers.set(browserKey, browser);
      
      // Track browser in resource manager
      const browserId = this.resourceManager.generateResourceId('browser');
      this.resourceManager.track(browserId, browser, 'browser', {
        browserKey,
        platform: process.platform,
        executablePath: launchOptions.executablePath
      });
      
      // Handle browser disconnection
      browser.on('disconnected', () => {
        console.log(`🔌 Browser disconnected: ${browserKey}`);
        this.browsers.delete(browserKey);
        this.cleanupPagesForBrowser(browser);
      });

      console.log(`✅ Browser launched successfully: ${browserKey}`);
      return browser;
    } catch (error) {
      console.error(`❌ Failed to launch browser: ${error.message}`);
      throw new Error(`Failed to launch browser: ${error.message}`);
    }
  }

  /**
   * Create a new page with proper lifecycle management
   */
  async createPage(options = {}) {
    return this.enqueue(async () => {
      const browser = await this.getBrowser(options);
    
      // Check if this browser has too many pages
      const browserPages = Array.from(this.pages.values())
        .filter(pageInfo => pageInfo.browser === browser);
      
      if (browserPages.length >= this.maxPagesPerBrowser) {
        // Prefer closing an inactive page; never evict an active page as it can abort in-flight extractions.
        const oldestInactivePage = browserPages
          .filter(pageInfo => !pageInfo.isActive)
          .sort((a, b) => a.lastUsed - b.lastUsed)[0];

        if (oldestInactivePage) {
          await this.closePage(oldestInactivePage.pageId);
        } else {
          // All pages are active: wait briefly for a slot instead of killing an active page.
          await this.waitForAvailableSlot(browser, this.maxPagesPerBrowser, {
            timeoutMs: options.waitForSlotTimeoutMs ?? 30000,
            pollIntervalMs: 250
          });
        }
      }

      const page = await browser.newPage();
      const pageId = this.generatePageId();
      
      // Configure page
      await page.setViewport({ 
        width: options.width || 1920, 
        height: options.height || 1080 
      });
      
      await page.setUserAgent(
        options.userAgent || 
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Store page info
      this.pages.set(pageId, {
        browser,
        page,
        pageId,
        lastUsed: Date.now(),
        createdAt: Date.now(),
        isActive: false // Track if page is actively being used
      });
      
      // Track page in resource manager
      this.resourceManager.track(pageId, page, 'page', {
        browserId: this.getBrowserKey(options),
        viewport: { width: options.width || 1920, height: options.height || 1080 }
      });
      
      // Add cleanup handlers
      page.on('close', () => {
        console.log(`📄 Page closed: ${pageId}`);
        this.pages.delete(pageId);
      });
      
      page.on('error', (error) => {
        console.warn(`❌ Page ${pageId} error:`, error.message);
        this.pages.delete(pageId);
      });

      console.log(`✅ Page created: ${pageId}`);
      return { page, pageId };
    });
  }

  async waitForAvailableSlot(browser, maxPagesPerBrowser, { timeoutMs = 30000, pollIntervalMs = 250 } = {}) {
    const startTime = Date.now();

    // If we're already under limit (due to a concurrent close), return immediately.
    const countPagesForBrowser = () =>
      Array.from(this.pages.values()).filter(pageInfo => pageInfo.browser === browser).length;

    while (Date.now() - startTime < timeoutMs) {
      if (countPagesForBrowser() < maxPagesPerBrowser) return;

      const inactivePages = Array.from(this.pages.values())
        .filter(pageInfo => pageInfo.browser === browser)
        .filter(pageInfo => !pageInfo.isActive)
        .sort((a, b) => a.lastUsed - b.lastUsed);

      if (inactivePages.length > 0) {
        await this.closePage(inactivePages[0].pageId);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(
      `Browser pool is at capacity (${maxPagesPerBrowser} active pages). ` +
        `Try again after current extractions finish, or increase BROWSER_POOL_MAX_PAGES / BROWSER_POOL_MAX_BROWSERS.`
    );
  }

  /**
   * Update page last used time
   */
  updatePageActivity(pageId) {
    const pageInfo = this.pages.get(pageId);
    if (pageInfo) {
      pageInfo.lastUsed = Date.now();
      this.resourceManager.touch(pageId);
    }
  }

  /**
   * Mark page as actively being used (protects from cleanup)
   */
  markPageActive(pageId) {
    const pageInfo = this.pages.get(pageId);
    if (pageInfo) {
      pageInfo.isActive = true;
      pageInfo.lastUsed = Date.now();
      this.resourceManager.touch(pageId);
    }
  }

  /**
   * Mark page as inactive (allows cleanup)
   */
  markPageInactive(pageId) {
    const pageInfo = this.pages.get(pageId);
    if (pageInfo) {
      pageInfo.isActive = false;
      pageInfo.lastUsed = Date.now();
      this.resourceManager.touch(pageId);
    }
  }

  /**
   * Close a specific page
   */
  async closePage(pageId) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      return;
    }

    if (pageInfo.isActive) {
      pageInfo.isActive = false;
    }

    this.pages.delete(pageId);

    try {
      // Delegate actual teardown to ResourceManager so it can remove listeners and
      // de-track the resource (prevents stale-tracker buildup and double-closes).
      await this.resourceManager.cleanup(pageId);
    } catch (error) {
      console.warn(`Error closing page ${pageId}:`, error.message);
    }
  }

  /**
   * Clean up idle pages
   */
  async cleanupIdlePages() {
    const now = Date.now();
    const idlePages = Array.from(this.pages.entries())
      .filter(([pageId, pageInfo]) => 
        !pageInfo.isActive && // Don't cleanup active pages
        now - pageInfo.lastUsed > this.maxIdleTime
      );

    if (idlePages.length > 0) {
      console.log(`🧹 Cleaning up ${idlePages.length} idle pages...`);
      for (const [pageId] of idlePages) {
        await this.closePage(pageId);
      }
    }
  }

  /**
   * Clean up pages for a specific browser
   */
  cleanupPagesForBrowser(browser) {
    const browserPages = Array.from(this.pages.entries())
      .filter(([pageId, pageInfo]) => pageInfo.browser === browser);
    
    for (const [pageId] of browserPages) {
      this.pages.delete(pageId);
    }
  }

  /**
   * Generate browser key for reuse
   */
  getBrowserKey(options) {
    const keyOptions = {
      headless: options.headless || this.config?.puppeteer?.headless || 'new',
      args: JSON.stringify(options.args || this.config?.puppeteer?.args || []),
      userDataDir: options.userDataDir || null
    };
    return JSON.stringify(keyOptions);
  }

  /**
   * Generate unique page ID
   */
  generatePageId() {
    return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const connectedBrowsers = Array.from(this.browsers.values())
      .filter(browser => browser.isConnected()).length;
    
    const activePagesCount = this.pages.size;
    const pagesByBrowser = new Map();
    
    for (const pageInfo of this.pages.values()) {
      const browserKey = Array.from(this.browsers.entries())
        .find(([key, browser]) => browser === pageInfo.browser)?.[0] || 'unknown';
      
      pagesByBrowser.set(browserKey, (pagesByBrowser.get(browserKey) || 0) + 1);
    }

    return {
      connectedBrowsers,
      totalBrowsers: this.browsers.size,
      activePagesCount,
      pagesByBrowser: Object.fromEntries(pagesByBrowser),
      maxBrowsers: this.maxBrowsers,
      maxPagesPerBrowser: this.maxPagesPerBrowser
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.isShuttingDown = true;
    
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all pages
    const pageClosePromises = Array.from(this.pages.keys())
      .map(pageId => this.closePage(pageId));
    await Promise.allSettled(pageClosePromises);

    // Close all browsers
    const browserClosePromises = Array.from(this.browsers.values())
      .map(browser => {
        if (browser.isConnected()) {
          return browser.close();
        }
        return Promise.resolve();
      });
    
    await Promise.allSettled(browserClosePromises);
    
    this.browsers.clear();
    this.pages.clear();
  }
}

// Singleton instance
let browserPool = null;

export function getBrowserPool() {
  if (!browserPool) {
    browserPool = new BrowserPool();
  }
  return browserPool;
}

export async function shutdownBrowserPool() {
  if (browserPool) {
    await browserPool.shutdown();
    browserPool = null;
  }
}

export default getBrowserPool; 
