/**
 * Supabase Database Adapter
 * Implements DatabaseAdapter interface for Supabase Postgres
 */

import { DatabaseAdapter } from './DatabaseAdapter.js';
import { getSupabaseClient } from '../../config/supabase.js';
import { randomUUID } from 'crypto';
import { circuitBreakerRegistry } from '../../core/resilience/CircuitBreaker.js';
import { logger } from '../../utils/logger.js';

export class SupabaseAdapter extends DatabaseAdapter {
  constructor(userId = null) {
    super();
    this.userId = userId;
    this.supabase = null;
    this.connected = false;
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;

    // Initialize circuit breaker for database operations
    this.circuitBreaker = circuitBreakerRegistry.getOrCreate('supabase-db', {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 10000,
      resetTimeout: 30000
    });
  }

  async connect() {
    const fallback = () => {
      logger.warn('Supabase connection failed, using fallback (disconnected state)');
      this.connected = false;
      return false;
    };

    return this.circuitBreaker.execute(async () => {
      return this._connectWithRetry();
    }, fallback);
  }

  async _connectWithRetry() {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(`Supabase connection attempt ${attempt}/${this.maxRetries}`);

        this.supabase = getSupabaseClient(false); // Use public client with RLS
        if (!this.supabase) {
          throw new Error('Supabase client not configured');
        }

        // Test connection with timeout
        const connectionTest = this.supabase.from('profiles').select('id').limit(1);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });

        const { error } = await Promise.race([connectionTest, timeoutPromise]);

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned, which is OK
          throw error;
        }

        this.connected = true;
        this.connectionRetries = 0;
        logger.info('Supabase connection established successfully');
        return true;

      } catch (error) {
        this.connectionRetries = attempt;
        const isLastAttempt = attempt === this.maxRetries;

        logger.error(`Supabase connection attempt ${attempt} failed: ${error.message}`);

        if (isLastAttempt) {
          this.connected = false;
          throw new Error(`Failed to connect to Supabase after ${this.maxRetries} attempts: ${error.message}`);
        }

        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        logger.info(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async disconnect() {
    this.connected = false;
    this.supabase = null;
  }

  /**
   * Execute database operation with automatic reconnection
   */
  async _executeWithReconnection(operation, operationName = 'database operation') {
    if (!this.connected) {
      logger.warn(`Attempting ${operationName} while disconnected, trying to reconnect...`);
      const reconnected = await this.connect();
      if (!reconnected) {
        throw new Error(`Cannot perform ${operationName}: database connection failed`);
      }
    }

    try {
      return await operation();
    } catch (error) {
      // Check if it's a connection-related error
      const isConnectionError = error.message.includes('connection') ||
                               error.message.includes('network') ||
                               error.code === 'PGRST301' ||
                               error.code === 'ECONNREFUSED';

      if (isConnectionError && this.connectionRetries < this.maxRetries) {
        logger.warn(`${operationName} failed due to connection issue, attempting reconnection...`);
        this.connected = false;

        const reconnected = await this.connect();
        if (reconnected) {
          logger.info(`Reconnected successfully, retrying ${operationName}...`);
          return await operation();
        }
      }

      throw error;
    }
  }

  async query(query, params = []) {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }
    // Supabase uses its own query builder, so raw SQL queries are limited
    // This is a placeholder - most operations should use select/insert/update/delete
    throw new Error('Raw SQL queries not supported in Supabase adapter. Use select/insert/update/delete methods.');
  }

  async queryOne(query, params = []) {
    const results = await this.query(query, params);
    return results.length > 0 ? results[0] : null;
  }

  async transaction(callback) {
    // Supabase doesn't support transactions via JS client in the same way
    // For now, execute callback without transaction wrapper
    // In production, use Supabase RPC functions for transactions
    return await callback(this);
  }

  async insert(table, data) {
    return this._executeWithReconnection(async () => {
      const { data: result, error } = await this.supabase
        .from(table)
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new Error(`Insert failed: ${error.message}`);
      }

      return this.toCamelCase(result);
    }, `insert into ${table}`);
  }

  async update(table, data, where) {
    return this._executeWithReconnection(async () => {
      let query = this.supabase.from(table).update(data);

      // Apply where conditions
      for (const [key, value] of Object.entries(where)) {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (typeof value === 'object' && value !== null) {
          if (value.$like) query = query.like(key, value.$like);
          if (value.$gte) query = query.gte(key, value.$gte);
          if (value.$lte) query = query.lte(key, value.$lte);
          if (value.$gt) query = query.gt(key, value.$gt);
          if (value.$lt) query = query.lt(key, value.$lt);
        } else {
          query = query.eq(key, value);
        }
      }

      const { data: result, error } = await query.select();

      if (error) {
        throw new Error(`Update failed: ${error.message}`);
      }

      return result.map(row => this.toCamelCase(row));
    }, `update ${table}`);
  }

  async delete(table, where) {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    let query = this.supabase.from(table).delete();

    // Apply where conditions
    for (const [key, value] of Object.entries(where)) {
      if (Array.isArray(value)) {
        query = query.in(key, value);
      } else {
        query = query.eq(key, value);
      }
    }

    const { error, count } = await query;

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }

    return count || 0;
  }

  async select(table, options = {}) {
    if (!this.connected) {
      throw new Error('Not connected to database');
    }

    const {
      where = {},
      orderBy = [],
      limit = null,
      offset = null,
      select = '*'
    } = options;

    let query = this.supabase.from(table).select(select);

    // Apply where conditions
    for (const [key, value] of Object.entries(where)) {
      if (value === null || value === undefined) {
        query = query.is(key, null);
      } else if (Array.isArray(value)) {
        query = query.in(key, value);
      } else if (typeof value === 'object') {
        if (value.$like) query = query.like(key, value.$like);
        if (value.$ilike) query = query.ilike(key, value.$ilike);
        if (value.$gte) query = query.gte(key, value.$gte);
        if (value.$lte) query = query.lte(key, value.$lte);
        if (value.$gt) query = query.gt(key, value.$gt);
        if (value.$lt) query = query.lt(key, value.$lt);
        if (value.$neq) query = query.neq(key, value.$neq);
        if (value.$is) query = query.is(key, value.$is);
      } else {
        query = query.eq(key, value);
      }
    }

    // Apply ordering
    for (const order of orderBy) {
      const column = typeof order === 'string' ? order : order.column;
      const ascending = typeof order === 'string' ? true : (order.ascending !== false);
      query = query.order(column, { ascending });
    }

    // Apply limit and offset
    if (limit !== null) {
      const start = offset || 0;
      const end = start + limit - 1;
      query = query.range(start, end);
    } else if (offset !== null) {
      query = query.range(offset, offset + 1000); // Default limit if only offset provided
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Select failed: ${error.message}`);
    }

    return (data || []).map(row => this.toCamelCase(row));
  }

  getType() {
    return 'supabase';
  }

  isConnected() {
    return this.connected && this.supabase !== null;
  }

  generateUUID() {
    return randomUUID();
  }

  /**
   * Upsert Figma credentials
   */
  async upsertFigmaCredentials(data) {
    if (!this.connected) throw new Error('Not connected');

    // Check if entry exists
    const { data: existing } = await this.supabase
      .from('figma_credentials')
      .select('id')
      .eq('user_id', data.user_id)
      .single();

    if (existing) {
      return this.update('figma_credentials', data, { id: existing.id });
    } else {
      return this.insert('figma_credentials', data);
    }
  }

  /**
   * Get Figma credentials
   */
  async getFigmaCredentials(userId) {
    if (!this.connected) throw new Error('Not connected');

    const { data, error } = await this.supabase
      .from('figma_credentials')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ? this.toCamelCase(data) : null;
  }

  /**
   * Update Figma tokens
   */
  async updateFigmaTokens(data) {
    if (!this.connected) throw new Error('Not connected');
    return this.update('figma_credentials', data, { user_id: data.user_id });
  }
}

