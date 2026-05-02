// background.js — Pro Time Tracker v3.1

// ——— Utilities ———————————————————————————————————————————————————————————————

/** Local-date YYYY-MM-DD — FIX: toISOString() returns UTC, which causes date
 *  mismatch for users in UTC+ timezones (e.g. Turkey = UTC+3 loses 3 hours). */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!url.protocol.startsWith('http')) return null;
    return { domain: url.hostname, path: url.pathname + url.search };
  } catch {
    return null;
  }
}

function isBlockedPage(url) {
  return typeof url === 'string' && url.startsWith(chrome.runtime.getURL('blocked.html'));
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function getTodayDomainTotal(domain) {
  const key = todayKey();
  const stored = await chrome.storage.local.get(key);
  const dayData = stored[key] || {};
  return dayData[domain]?.total || 0;
}

async function isDomainLocked(domain) {
  const [{ limits = {}, autoBlockEnabled = false }, total] = await Promise.all([
    chrome.storage.local.get(['limits', 'autoBlockEnabled']),
    getTodayDomainTotal(domain),
  ]);

  if (!autoBlockEnabled) return null;

  const limitMs = limits[domain];
  if (!limitMs) return null;
  if (total < limitMs) return null;

  return { limitMs, totalMs: total };
}

async function redirectToBlockedPage(tabId, domain, totalMs, limitMs) {
  const params = new URLSearchParams({
    domain,
    used: formatDuration(totalMs),
    limit: formatDuration(limitMs),
    date: todayKey(),
  });

  await chrome.tabs.update(tabId, {
    url: `${chrome.runtime.getURL('blocked.html')}?${params.toString()}`,
  });
}

async function enforceBlockForTab(tabId, url) {
  if (!url || isBlockedPage(url)) return false;

  const parsed = parseUrl(url);
  if (!parsed) return false;

  const lockInfo = await isDomainLocked(parsed.domain);
  if (!lockInfo) return false;

  await redirectToBlockedPage(tabId, parsed.domain, lockInfo.totalMs, lockInfo.limitMs);
  return true;
}

// ——— Flush Mutex — prevents race condition between alarm + tab events —————————

let _flushing = false;

async function flushTime() {
  if (_flushing) return;
  _flushing = true;
  try {
    const { trackingState } = await chrome.storage.local.get('trackingState');
    if (!trackingState?.url || !trackingState?.startTime) return;

    const elapsed = Date.now() - trackingState.startTime;
    if (elapsed < 500) return; // sub-half-second noise

    const parsed = parseUrl(trackingState.url);
    if (!parsed) return;

    const key = todayKey();
    const stored = await chrome.storage.local.get(key);
    const dayData = stored[key] || {};

    if (!dayData[parsed.domain]) {
      dayData[parsed.domain] = { total: 0, paths: {} };
    }

    dayData[parsed.domain].total += elapsed;
    dayData[parsed.domain].paths[parsed.path] =
      (dayData[parsed.domain].paths[parsed.path] || 0) + elapsed;

    // Reset startTime to now — prevents double-counting on next flush
    trackingState.startTime = Date.now();

    await chrome.storage.local.set({ [key]: dayData, trackingState });
    await checkTimeLimit(parsed.domain, dayData[parsed.domain].total, trackingState.tabId);
  } catch (err) {
    console.error('[Tracker] flushTime:', err);
  } finally {
    _flushing = false;
  }
}

// ——— Tracking Control —————————————————————————————————————————————————————————

async function startTracking(url, tabId) {
  await flushTime();

  const blocked = await enforceBlockForTab(tabId, url);
  if (blocked) {
    await chrome.storage.local.set({ trackingState: null });
    return;
  }

  if (url?.startsWith('http')) {
    await chrome.storage.local.set({
      trackingState: { url, tabId, startTime: Date.now() },
    });
  } else {
    await chrome.storage.local.set({ trackingState: null });
  }
}

async function stopTracking() {
  await flushTime();
  await chrome.storage.local.set({ trackingState: null });
}

async function reconcileActiveTabTracking() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const { trackingState } = await chrome.storage.local.get('trackingState');
    if (!trackingState || trackingState.tabId !== tab.id || trackingState.url !== tab.url) {
      await startTracking(tab.url, tab.id);
    }
  } catch (err) {
    console.error('[Tracker] reconcileActiveTabTracking:', err);
  }
}

// ——— Time Limit Enforcement ———————————————————————————————————————————————————

async function checkTimeLimit(domain, totalMs, currentTabId) {
  try {
    const { limits = {}, limitNotified = {}, autoBlockEnabled = false } =
      await chrome.storage.local.get(['limits', 'limitNotified', 'autoBlockEnabled']);

    const limitMs = limits[domain];
    if (!limitMs || totalMs < limitMs) return;

    const today = todayKey();
    const notifiedToday = limitNotified[today] || [];

    if (!notifiedToday.includes(domain)) {
      chrome.notifications.create(`limit:${domain}`, {
        type: 'basic',
        iconUrl: 'assets/icon-128.png',
        title: 'Daily Time Limit Reached',
        message: autoBlockEnabled
          ? `You hit your daily limit for ${domain}. This site is now locked for today.`
          : `You hit your daily limit for ${domain}.`,
        priority: 2,
      });

      notifiedToday.push(domain);
      limitNotified[today] = notifiedToday;
      await chrome.storage.local.set({ limitNotified });
    }

    if (autoBlockEnabled && Number.isInteger(currentTabId)) {
      await redirectToBlockedPage(currentTabId, domain, totalMs, limitMs);
    }
  } catch (err) {
    console.error('[Tracker] checkTimeLimit:', err);
  }
}

// ——— Event Listeners ——————————————————————————————————————————————————————————

chrome.idle.setDetectionInterval(60);

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await startTracking(tab.url, tab.id);
  } else {
    await stopTracking();
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab) await startTracking(tab.url, tab.id);
  } catch (err) {
    console.error('[Tracker] onActivated:', err);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const { trackingState } = await chrome.storage.local.get('trackingState');
  if (trackingState?.tabId === tabId) {
    await startTracking(changeInfo.url, tabId);
    return;
  }

  await enforceBlockForTab(tabId, changeInfo.url);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { trackingState } = await chrome.storage.local.get('trackingState');
  if (trackingState?.tabId === tabId) await stopTracking();
});

// FIX: Tab replacement (Chrome prerendering / bfcache navigation)
chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  const { trackingState } = await chrome.storage.local.get('trackingState');
  if (trackingState?.tabId === removedTabId) {
    try {
      const tab = await chrome.tabs.get(addedTabId);
      await startTracking(tab.url, addedTabId);
    } catch (err) {
      console.error('[Tracker] onReplaced:', err);
    }
  }
});

// FIX: Fullscreen tracking — verify no window is actually focused before pausing
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    const windows = await chrome.windows.getAll({ populate: false });
    const hasFocusedWindow = windows.some((w) => w.focused);
    if (!hasFocusedWindow) await stopTracking();
    // If a window is still focused, this is a spurious event — ignore it.
  } else {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) await startTracking(tab.url, tab.id);
  }
});

// ——— Alarms ————————————————————————————————————————————————————————————————————

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodicSave') {
    await reconcileActiveTabTracking();
    await flushTime();
  } else if (alarm.name === 'dailyReport') {
    await flushTime();
    chrome.notifications.create('report:daily', {
      type: 'basic',
      iconUrl: 'assets/icon-128.png',
      title: 'Pro Time Tracker',
      message: 'Your daily productivity report is ready to view.',
      priority: 2,
    });
  }
});

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'report.html' });
});

// ——— Startup / Install ———————————————————————————————————————————————————————

async function ensureAlarms() {
  // Clear first to prevent alarm duplication across restarts
  await chrome.alarms.clear('periodicSave');
  chrome.alarms.create('periodicSave', { periodInMinutes: 0.5 });
}

chrome.runtime.onInstalled.addListener(ensureAlarms);

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  await reconcileActiveTabTracking();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await startTracking(tab.url, tab.id);
});
