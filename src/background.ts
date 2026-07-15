chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    message &&
    typeof message === "object" &&
    (message as { type?: string }).type === "PCDX_OPEN_LIST"
  ) {
    chrome.tabs.create({ url: chrome.runtime.getURL("list.html") });
  }
});
