chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("index.html");
  const windows = await chrome.windows.getAll({ populate: true });
  const existing = windows.find((win) =>
    (win.tabs || []).some((tab) => tab.url && tab.url.startsWith(url))
  );
  if (existing && existing.id != null) {
    await chrome.windows.update(existing.id, { focused: true });
    return;
  }
  await chrome.windows.create({
    url,
    type: "popup",
    width: 1280,
    height: 840,
    focused: true,
  });
});
