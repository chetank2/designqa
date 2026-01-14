const sanitizeKey = (value, fallback, index) => {
  if (!value) {
    return `${fallback}-${index}`;
  }
  const cleaned = value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned ? cleaned : `${fallback}-${index}`;
};

const toRecord = (values, fallback) => {
  const record = {};
  Array.from(values).forEach((value, index) => {
    record[`${fallback}-${index}`] = value;
  });
  return record;
};

const rgbaFromColor = (color = {}, opacity = 1) => {
  if (!color || typeof color !== 'object') {
    return null;
  }
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = color.a !== undefined ? color.a : opacity;
  return `rgba(${r}, ${g}, ${b}, ${Number(a).toFixed(3)})`;
};

const addNumericValue = (set, value) => {
  if (typeof value !== 'number') return;
  if (!Number.isFinite(value)) return;
  if (Math.abs(value) < 0.001) return;
  set.add(Number(value.toFixed(2)));
};

const addArrayValues = (set, values = []) => {
  values.forEach(value => addNumericValue(set, value));
};

const collectComponentData = (component, spacingSet, radiusSet, shadowSet) => {
  if (!component) return;
  const props = component.properties || {};
  addNumericValue(spacingSet, props.paddingLeft);
  addNumericValue(spacingSet, props.paddingRight);
  addNumericValue(spacingSet, props.paddingTop);
  addNumericValue(spacingSet, props.paddingBottom);
  addNumericValue(spacingSet, props.itemSpacing);
  addArrayValues(spacingSet, props.padding);

  addNumericValue(radiusSet, props.cornerRadius);
  if (Array.isArray(props.rectangleCornerRadii)) {
    addArrayValues(radiusSet, props.rectangleCornerRadii);
  }

  const effects = component.metadata?.effects || props.effects || [];
  effects
    .filter(effect => effect && effect.visible !== false)
    .forEach(effect => {
      const offset = effect.offset || { x: 0, y: 0 };
      const blur = effect.radius ?? 0;
      const spread = effect.spread ?? 0;
      const color = rgbaFromColor(effect.color);
      if (color) {
        shadowSet.add(`${offset.x || 0}px ${offset.y || 0}px ${blur}px ${spread}px ${color}`);
      }
    });

  if (component.children && Array.isArray(component.children)) {
    component.children.forEach(child => collectComponentData(child, spacingSet, radiusSet, shadowSet));
  }
};

const extractSpacingRadiusShadows = components => {
  const spacing = new Set();
  const radius = new Set();
  const shadows = new Set();

  (components || []).forEach(component => {
    collectComponentData(component, spacing, radius, shadows);
  });

  return { spacing, radius, shadows };
};

export const createEmptySnapshot = () => ({
  colors: {},
  fontFamilies: {},
  fontSizes: {},
  fontWeights: {},
  lineHeights: {},
  spacing: {},
  radius: {},
  shadows: {}
});

export const buildSnapshotFromFigmaData = standardizedData => {
  const snapshot = createEmptySnapshot();

  const colors = standardizedData?.colors || [];
  colors.forEach((color, index) => {
    const key = sanitizeKey(color?.name, 'color', index);
    snapshot.colors[key] = color?.value || color?.hex || '#000000';
  });

  const fontFamilies = new Map();
  const fontSizes = new Set();
  const fontWeights = new Set();
  const lineHeights = new Set();

  (standardizedData?.typography || []).forEach(typo => {
    if (typo.fontFamily) fontFamilies.set(typo.fontFamily, typo.fontFamily);
    addNumericValue(fontSizes, typo.fontSize);
    addNumericValue(fontWeights, typo.fontWeight);
    if (typo.properties?.lineHeight) {
      addNumericValue(lineHeights, typo.properties.lineHeight);
    }
  });

  const familyRecord = {};
  Array.from(fontFamilies.entries()).forEach(([key, value], index) => {
    familyRecord[sanitizeKey(key, 'font', index)] = value;
  });
  snapshot.fontFamilies = familyRecord;
  snapshot.fontSizes = toRecord(fontSizes, 'font-size');
  snapshot.fontWeights = toRecord(fontWeights, 'font-weight');
  snapshot.lineHeights = toRecord(lineHeights, 'line-height');

  const { spacing, radius, shadows } = extractSpacingRadiusShadows(standardizedData?.components || []);
  snapshot.spacing = toRecord(spacing, 'spacing');
  snapshot.radius = toRecord(radius, 'radius');

  const shadowRecord = {};
  Array.from(shadows).forEach((value, index) => {
    shadowRecord[`shadow-${index}`] = value;
  });
  snapshot.shadows = shadowRecord;

  return snapshot;
};
