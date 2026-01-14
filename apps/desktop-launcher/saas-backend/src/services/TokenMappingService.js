/**
 * TokenMappingService
 * Maps design tokens to CSS values using the DesignSystemRegistry.
 */
import { getDesignSystemRegistry } from '../design-system/DesignSystemRegistry.js';

export class TokenMappingService {
  constructor(designSystemId = null) {
    this.designSystemId = designSystemId;
    this.registry = getDesignSystemRegistry();
  }

  async initialize(designSystemId) {
    this.designSystemId = designSystemId;
    return this;
  }

  mapToToken(category, property, value) {
    if (!this.designSystemId) return null;
    if (value === null || value === undefined) return null;

    const match = this.registry.findClosestToken(this.designSystemId, category, property, value);
    if (!match || !match.token) return null;

    const distance = Number.isFinite(match.distance) ? match.distance : null;
    const isExact = distance === 0;

    return {
      tokenName: match.token,
      tokenValue: match.value,
      distance,
      isExact
    };
  }
}
