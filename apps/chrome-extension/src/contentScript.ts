const STYLE_PROPS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'width',
  'height',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'boxShadow'
] as const;

type StyleProp = (typeof STYLE_PROPS)[number];

interface WebNodePayload {
  nodeId: string;
  name?: string;
  selector: string;
  computedStyles: Record<string, string>;
}

const buildSelector = (element: Element) => {
  if (element.id) return `#${element.id}`;
  const classes = Array.from(element.classList || []);
  if (classes.length) {
    return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
  }
  return element.tagName.toLowerCase();
};

const collectNode = (element: Element): WebNodePayload => {
  const computed = window.getComputedStyle(element);
  const styles: Record<string, string> = {};
  STYLE_PROPS.forEach(prop => {
    const cssProp = prop.replace(/([A-Z])/g, match => `-${match.toLowerCase()}`);
    const direct = computed.getPropertyValue(cssProp);
    const fallback = (computed as unknown as Record<string, string>)[prop] || '';
    styles[prop] = direct || fallback;
  });

  return {
    nodeId: element.getAttribute('data-figma-node-id') || element.id || element.tagName.toLowerCase(),
    name: element.getAttribute('data-figma-name') || element.getAttribute('aria-label') || element.tagName.toLowerCase(),
    selector: buildSelector(element),
    computedStyles: styles
  };
};

const collectNodes = (): WebNodePayload[] => {
  const candidates = Array.from(document.querySelectorAll('[data-figma-node-id]'));
  if (candidates.length > 0) {
    return candidates.map(collectNode);
  }
  return [collectNode(document.body)];
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'collect-styles') {
    const nodes = collectNodes();
    sendResponse({ nodes });
    return true;
  }
  return undefined;
});
