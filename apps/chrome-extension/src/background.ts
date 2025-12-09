import { GlobalComparisonPayload, StyleSystemSnapshot } from './lib/styleTypes';
import { BACKEND_URL } from './config';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'global-style-comparison') {
    handleGlobalComparison(message.payload as GlobalComparisonPayload)
      .then(data => sendResponse({ data }))
      .catch(error => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  return undefined;
});

const handleGlobalComparison = async (payload: GlobalComparisonPayload) => {
  if (!payload?.figmaUrl?.trim()) {
    throw new Error('Figma URL is required.');
  }

  const figmaStyles = await fetchFigmaStylesFromBackend(payload);
  const webStyles = await collectWebStyles();
  return { figmaStyles, webStyles };
};

const fetchFigmaStylesFromBackend = async (payload: GlobalComparisonPayload): Promise<StyleSystemSnapshot> => {
  const body: Record<string, unknown> = {
    figmaUrl: payload.figmaUrl.trim(),
    preferredMethod: payload.preferredMethod ?? 'auto'
  };

  if (payload.figmaToken?.trim()) {
    body.figmaPersonalAccessToken = payload.figmaToken.trim();
  }

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/extension/global-styles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(`Failed to reach backend at ${BACKEND_URL}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`Backend returned invalid JSON (status ${response.status})`);
    }
  }

  if (!response.ok) {
    const backendError = parsed?.error || response.statusText;
    throw new Error(`Backend error ${response.status}: ${backendError}`);
  }

  if (!parsed?.success) {
    throw new Error(parsed?.error || 'Backend failed to extract styles.');
  }

  if (!parsed?.data?.figmaStyles) {
    throw new Error('Backend responded without style data.');
  }

  return parsed.data.figmaStyles as StyleSystemSnapshot;
};

const collectWebStyles = async (): Promise<StyleSystemSnapshot> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab available for style collection.');
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'collect-global-styles' });
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    if (response?.error) {
      throw new Error(response.error);
    }
    return response.styles as StyleSystemSnapshot;
  } catch (error) {
    throw new Error(`Failed to collect web styles: ${error instanceof Error ? error.message : String(error)}`);
  }
};
