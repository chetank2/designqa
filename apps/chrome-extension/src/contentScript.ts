import { StyleSystemSnapshot, createEmptySnapshot } from './lib/styleTypes';

const MAX_ELEMENTS = 800;
const MAX_VALUES = 120;

const sanitizeKey = (value: string, fallback: string, index: number) => {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return clean ? `${fallback}-${clean}` : `${fallback}-${index}`;
};

const recordFromSet = (values: Set<string>, prefix: string): Record<string, string> => {
  const record: Record<string, string> = {};
  Array.from(values)
    .slice(0, MAX_VALUES)
    .forEach((value, index) => {
      record[sanitizeKey(value, prefix, index)] = value;
    });
  return record;
};

const recordFromNumberSet = (values: Set<number>, prefix: string): Record<string, number> => {
  const record: Record<string, number> = {};
  Array.from(values)
    .slice(0, MAX_VALUES)
    .forEach((value, index) => {
      const integer = Number.isFinite(value) ? Number(value.toFixed(2)) : value;
      record[`${prefix}-${index}`] = integer;
    });
  return record;
};

const collectPageStyles = (): StyleSystemSnapshot => {
  const snapshot = createEmptySnapshot();
  const colors = new Set<string>();
  const fontFamilies = new Set<string>();
  const fontSizes = new Set<number>();
  const fontWeights = new Set<number>();
  const lineHeights = new Set<number>();
  const spacingValues = new Set<number>();
  const radiusValues = new Set<number>();
  const shadowValues = new Set<string>();

  const elements = Array.from(document.querySelectorAll<HTMLElement>('*')).slice(0, MAX_ELEMENTS);

  elements.forEach(element => {
    const styles = window.getComputedStyle(element);
    const addColor = (value?: string | null) => {
      if (!value) return;
      const normalized = value.trim();
      if (!normalized || normalized === 'rgba(0, 0, 0, 0)') return;
      colors.add(normalized);
    };

    addColor(styles.color);
    addColor(styles.backgroundColor);
    addColor(styles.borderTopColor);
    addColor(styles.borderRightColor);
    addColor(styles.borderBottomColor);
    addColor(styles.borderLeftColor);

    if (styles.fontFamily) {
      fontFamilies.add(styles.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
    }
    const size = parseFloat(styles.fontSize);
    if (!Number.isNaN(size)) {
      fontSizes.add(size);
    }
    const weight = parseFloat(styles.fontWeight);
    if (!Number.isNaN(weight)) {
      fontWeights.add(weight);
    }
    const line = parseFloat(styles.lineHeight);
    if (!Number.isNaN(line)) {
      lineHeights.add(line);
    }

    const trackSpacing = (value?: string | null) => {
      const parsed = value ? parseFloat(value) : NaN;
      if (!Number.isNaN(parsed) && parsed > 0) {
        spacingValues.add(parsed);
      }
    };

    trackSpacing(styles.paddingTop);
    trackSpacing(styles.paddingRight);
    trackSpacing(styles.paddingBottom);
    trackSpacing(styles.paddingLeft);
    trackSpacing(styles.marginTop);
    trackSpacing(styles.marginRight);
    trackSpacing(styles.marginBottom);
    trackSpacing(styles.marginLeft);
    trackSpacing(styles.gap);
    trackSpacing(styles.rowGap);
    trackSpacing(styles.columnGap);

    const trackRadius = (value?: string | null) => {
      const parsed = value ? parseFloat(value) : NaN;
      if (!Number.isNaN(parsed) && parsed > 0) {
        radiusValues.add(parsed);
      }
    };

    trackRadius(styles.borderRadius);
    trackRadius(styles.borderTopLeftRadius);
    trackRadius(styles.borderTopRightRadius);
    trackRadius(styles.borderBottomLeftRadius);
    trackRadius(styles.borderBottomRightRadius);

    const trackShadow = (value?: string | null) => {
      if (!value) return;
      const trimmed = value.trim();
      if (!trimmed || trimmed === 'none') return;
      trimmed.split(',').forEach(shadow => {
        const normalized = shadow.trim();
        if (normalized) {
          shadowValues.add(normalized);
        }
      });
    };

    trackShadow(styles.boxShadow);
    trackShadow(styles.textShadow);
  });

  snapshot.colors = recordFromSet(colors, 'color');
  snapshot.fontFamilies = recordFromSet(fontFamilies, 'font');
  snapshot.fontSizes = recordFromNumberSet(fontSizes, 'font-size');
  snapshot.fontWeights = recordFromNumberSet(fontWeights, 'font-weight');
  snapshot.lineHeights = recordFromNumberSet(lineHeights, 'line-height');
  snapshot.spacing = recordFromNumberSet(spacingValues, 'spacing');
  snapshot.radius = recordFromNumberSet(radiusValues, 'radius');
  snapshot.shadows = recordFromSet(shadowValues, 'shadow');

  return snapshot;
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'collect-global-styles') {
    try {
      const styles = collectPageStyles();
      sendResponse({ styles });
    } catch (error) {
      const err = error as Error;
      sendResponse({ error: err.message });
    }
    return true;
  }
  return undefined;
});
