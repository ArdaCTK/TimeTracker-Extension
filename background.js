// background.js
import { StorageManager } from './storage.js';
import { TrackingManager } from './tracking.js';
import { NotificationManager } from './notifications.js';
import { IdleManager } from './idle.js';

// Initialize managers
const storage = new StorageManager();
const tracking = new TrackingManager(storage);
const notifier = new NotificationManager();
const idle = new IdleManager(tracking);

// Listen for tab/window events
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) await tracking.setActiveTab(tab.url, tab.id);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url && tracking.getCurrentTabId() === tabId) {
        await tracking.setActiveTab(changeInfo.url, tabId);
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        await tracking.stopTracking();
    } else {
        const [tab] = await chrome.tabs.query({ active: true, windowId });
        if (tab && tab.url) await tracking.setActiveTab(tab.url, tab.id);
    }
});

// Idle detection
idle.start();

// Daily report alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'dailyReport') {
        await tracking.updateTime(); // ensure latest data
        notifier.showDailyReportReady();
    }
});

// Initialise on startup
chrome.runtime.onStartup.addListener(async () => {
    await storage.cleanOldData(); // keep only last 30 days
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) await tracking.setActiveTab(tab.url, tab.id);
});