// background.js — Pro Time Tracker v3.0
// Service worker responsible for all time tracking logic.

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Parse a URL into { domain, path }. Returns null for non-http URLs.
 */
function parseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!url.protocol.startsWith('http')) return null;
    return {
      domain: url.hostname,
      path: url.pathname + url.search,
    };
  } catch {
    return null;
  }
}

/** Returns today's date string in YYYY-MM-DD format. */
function todayKey() {
  return new Date().toISOString().split('T')[0];
}

// ─── Core Tracking Logic ──────────────────────────────────────────────────────

/**
 * Flush elapsed time from the current tracking session to storage.
 * Resets startTime to now to prevent double-counting on subsequent flushes.
 * Safe to call at any time — exits early if no session is active.
 */
async function flushTime() {
  try {
    const { trackingState } = await chrome.storage.local.get('trackingState');
    if (!trackingState?.url || !trackingState?.startTime) return;

    const elapsed = Date.now() - trackingState.startTime;
    if (elapsed < 1000) return; // Ignore sub-second intervals

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

    // Reset startTime to prevent double-counting on the next flush
    trackingState.startTime = Date.now();

    await chrome.storage.local.set({ [key]: dayData, trackingState });
    await checkTimeLimit(parsed.domain, dayData[parsed.domain].total);
  } catch (err) {
    console.error('[Tracker] flushTime:', err);
  }
}

/**
 * Start tracking a new URL. Flushes pending time from the previous session first.
 */
async function startTracking(url, tabId) {
  await flushTime();

  if (url?.startsWith('http')) {
    await chrome.storage.local.set({
      trackingState: { url, tabId, startTime: Date.now() },
    });
  } else {
    // chrome://, about:, file:// — not tracked
    await chrome.storage.local.set({ trackingState: null });
  }
}

/**
 * Stop all tracking. Flushes pending time before clearing state.
 */
async function stopTracking() {
  await flushTime();
  await chrome.storage.local.set({ trackingState: null });
}

// ─── Time Limit Enforcement ───────────────────────────────────────────────────

/**
 * Fire a notification if the user has exceeded their daily limit for a domain.
 * Only notifies once per domain per day.
 */
async function checkTimeLimit(domain, totalMs) {
  try {
    const { limits = {}, limitNotified = {} } = await chrome.storage.local.get([
      'limits',
      'limitNotified',
    ]);

    const limitMs = limits[domain];
    if (!limitMs || totalMs < limitMs) return;

    const today = todayKey();
    const notifiedToday = limitNotified[today] || [];
    if (notifiedToday.includes(domain)) return;

    chrome.notifications.create(`limit:${domain}`, {
      type: 'basic',
      iconUrl: 'assets/icon-128.png',
      title: 'Daily Time Limit Reached',
      message: `You've hit your daily limit for ${domain}.`,
      priority: 2,
    });

    notifiedToday.push(domain);
    limitNotified[today] = notifiedToday;
    await chrome.storage.local.set({ limitNotified });
  } catch (err) {
    console.error('[Tracker] checkTimeLimit:', err);
  }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

// Mark user as idle after 60 seconds of no input.
chrome.idle.setDetectionInterval(60);

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await startTracking(tab.url, tab.id);
  } else {
    // 'idle' or 'locked' — pause tracking
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
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { trackingState } = await chrome.storage.local.get('trackingState');
  if (trackingState?.tabId === tabId) {
    await stopTracking();
  }
});

/**
 * FIX: Fullscreen tracking bug.
 *
 * On some platforms and fullscreen modes (e.g. YouTube video fullscreen),
 * Chrome fires onFocusChanged with WINDOW_ID_NONE spuriously — the browser
 * window is still visible and active. We verify by checking if any window
 * actually reports as focused before we stop tracking.
 */
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Verify that no window is actually focused before pausing.
    const windows = await chrome.windows.getAll({ populate: false });
    const hasFocusedWindow = windows.some((w) => w.focused);
    if (!hasFocusedWindow) {
      await stopTracking();
    }
    // If a window is still focused, the spurious event is ignored.
  } else {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) await startTracking(tab.url, tab.id);
  }
});

// ─── Alarms ───────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodicSave') {
    // Heartbeat flush — prevents time loss during fullscreen, long sessions,
    // or any edge case where tab/window events don't fire correctly.
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

// ─── Startup / Install ────────────────────────────────────────────────────────

function ensureAlarms() {
  // Flush time every 30 seconds as a safety net for edge cases.
  chrome.alarms.create('periodicSave', { periodInMinutes: 0.5 });
}

chrome.runtime.onInstalled.addListener(ensureAlarms);

chrome.runtime.onStartup.addListener(async () => {
  ensureAlarms();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await startTracking(tab.url, tab.id);
});
