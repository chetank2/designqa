chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'collect-styles') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        sendResponse({ nodes: [] });
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { type: 'collect-styles' }, response => {
        if (chrome.runtime.lastError) {
          console.warn('Style collection failed', chrome.runtime.lastError.message);
          sendResponse({ nodes: [] });
          return;
        }
        sendResponse({ nodes: response?.nodes || [] });
      });
    });
    return true;
  }
  return undefined;
});
