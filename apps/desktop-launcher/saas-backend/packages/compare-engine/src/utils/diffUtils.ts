import { ComparisonResult, ComparisonStatus } from '../types.js';

export interface DiffContext {
  nodeId: string;
  property: string;
  figma: string | number | null;
  web: string | number | null;
  diff: number;
  tolerance?: number;
}

export const buildResult = ({ nodeId, property, figma, web, diff, tolerance = 0 }: DiffContext): ComparisonResult => {
  const status: ComparisonStatus = Math.abs(diff) <= tolerance ? 'match' : 'mismatch';
  return {
    nodeId,
    property,
    figma,
    web,
    status,
    diff: Number(diff.toFixed(4))
  };
};

export const unionKeys = (...records: Array<Record<string, unknown> | undefined>): string[] => {
  const keys = new Set<string>();
  records.forEach(record => {
    if (!record) return;
    Object.keys(record).forEach(key => keys.add(key));
  });
  return Array.from(keys);
};
