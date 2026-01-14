import { getStorageProvider } from '../config/storage-config.js';

function normalizeDomain(value) {
  return (value || '').trim().toLowerCase();
}

function matchesDomain(hostname, domain) {
  if (!hostname || !domain) return false;
  const normalized = normalizeDomain(domain);
  const host = normalizeDomain(hostname);

  if (normalized.startsWith('*.')) {
    const suffix = normalized.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  return host === normalized || host.endsWith(`.${normalized}`);
}

function scoreDomainMatch(hostname, domain) {
  if (!matchesDomain(hostname, domain)) return 0;
  const normalized = normalizeDomain(domain);
  return normalized.replace('*.', '').length;
}

export async function resolveSiteProfileForUrl(url) {
  if (!url) return null;
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  const storage = getStorageProvider();
  if (!storage || typeof storage.listSiteProfiles !== 'function') {
    return null;
  }

  const profiles = await storage.listSiteProfiles({ enabled: true });
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return null;
  }

  let bestMatch = null;
  let bestScore = 0;
  for (const profile of profiles) {
    if (profile?.enabled === false) continue;
    const score = scoreDomainMatch(hostname, profile.domain);
    if (score > bestScore) {
      bestMatch = profile;
      bestScore = score;
    }
  }

  return bestMatch;
}

export function applySiteProfileOptions(baseOptions, profile) {
  if (!profile || baseOptions?.disableSiteProfile) {
    return { options: baseOptions, profile: null };
  }

  const merged = { ...baseOptions };
  const timeouts = profile.timeouts || {};

  if (Number.isFinite(Number(timeouts.extraction))) {
    merged.timeout = Number(timeouts.extraction);
  }
  if (Number.isFinite(Number(timeouts.stability))) {
    merged.stabilityTimeout = Number(timeouts.stability);
  }
  if (Number.isFinite(Number(timeouts.navigation))) {
    merged.navigationTimeout = Number(timeouts.navigation);
  }

  if (profile.resourceBlocking) {
    merged.resourceBlocking = profile.resourceBlocking;
  }
  if (profile.waitForSelector) {
    merged.waitForSelector = profile.waitForSelector;
  }

  return { options: merged, profile };
}

export default {
  resolveSiteProfileForUrl,
  applySiteProfileOptions
};
