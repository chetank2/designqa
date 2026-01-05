/**
 * LocalAdapter - Lightweight JSON-backed adapter for local mode
 */
import { DatabaseAdapter } from './DatabaseAdapter.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { getOutputBaseDir } from '../../utils/outputPaths.js';

export class LocalAdapter extends DatabaseAdapter {
  constructor(userId = null) {
    super();
    this.userId = userId;
    this.type = 'local';
    this.connected = false;
    this.dbPath = join(getOutputBaseDir(), 'local-db.json');
    this.data = null;
  }

  getType() {
    return 'local';
  }

  isConnected() {
    return this.connected;
  }

  generateUUID() {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
  }

  async connect() {
    if (this.connected) return this;

    try {
      const raw = await fs.readFile(this.dbPath, 'utf-8');
      this.data = JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      this.data = {
        comparisons: [],
        reports: [],
        credentials: [],
        design_systems: [],
        screenshots: [],
        figma_credentials: []
      };
      await this.persist();
    }

    this.connected = true;
    return this;
  }

  async disconnect() {
    if (this.connected) {
      await this.persist();
    }
    this.connected = false;
  }

  async persist() {
    if (!this.data) return;
    await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  async query(_query, _params = []) {
    throw new Error('LocalAdapter does not support raw SQL queries');
  }

  async transaction(callback) {
    return callback(this);
  }

  async insert(table, data) {
    this.ensureTable(table);
    const row = { ...data };
    this.data[table].push(row);
    await this.persist();
    return row;
  }

  async update(table, data, where) {
    this.ensureTable(table);
    const rows = this.data[table];
    const matches = rows.filter(row => this.matchesWhere(row, where));
    for (const row of matches) {
      Object.assign(row, data);
    }
    await this.persist();
    return matches;
  }

  async delete(table, where) {
    this.ensureTable(table);
    const rows = this.data[table];
    const remaining = rows.filter(row => !this.matchesWhere(row, where));
    const removed = rows.length - remaining.length;
    this.data[table] = remaining;
    await this.persist();
    return removed;
  }

  async select(table, options = {}) {
    this.ensureTable(table);
    const {
      where = {},
      orderBy = [],
      limit = null,
      offset = 0
    } = options;

    let results = this.data[table].filter(row => this.matchesWhere(row, where));

    if (orderBy && orderBy.length > 0) {
      results = [...results].sort((a, b) => {
        for (const order of orderBy) {
          const column = order.column;
          const asc = order.ascending !== false;
          const left = a?.[column];
          const right = b?.[column];
          if (left === right) continue;
          if (left === undefined || left === null) return asc ? 1 : -1;
          if (right === undefined || right === null) return asc ? -1 : 1;
          if (left > right) return asc ? 1 : -1;
          if (left < right) return asc ? -1 : 1;
        }
        return 0;
      });
    }

    if (offset) {
      results = results.slice(offset);
    }
    if (typeof limit === 'number') {
      results = results.slice(0, limit);
    }

    return results.map(row => ({ ...row }));
  }

  ensureTable(table) {
    if (!this.data) {
      this.data = {};
    }
    if (!this.data[table]) {
      this.data[table] = [];
    }
  }

  matchesWhere(row, where = {}) {
    if (!where || Object.keys(where).length === 0) return true;
    return Object.entries(where).every(([key, value]) => row?.[key] === value);
  }
}
