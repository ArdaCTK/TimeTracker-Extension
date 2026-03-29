// popup.js
import { StorageManager } from './storage.js';

const storage = new StorageManager();

document.addEventListener('DOMContentLoaded', async () => {
    const timeInput = document.getElementById('reportTime');
    const saveBtn = document.getElementById('saveBtn');
    const viewReportBtn = document.getElementById('viewReportBtn');
    const statusDiv = document.getElementById('status');
    const todayTotalSpan = document.getElementById('todayTotal');
    const currentTabSpan = document.getElementById('currentTab');

    // Load saved report time
    const savedTime = await storage.get('reportTime');
    if (savedTime) timeInput.value = savedTime;

    // Show today's total time
    const todayData = await storage.getTodayData();
    let totalMs = 0;
    for (const domain in todayData) {
        totalMs += todayData[domain].total;
    }
    todayTotalSpan.textContent = formatTime(totalMs);

    // Show current tracking status
    const state = await storage.get('trackingState');
    if (state && state.url) {
        const domain = extractDomain(state.url);
        currentTabSpan.textContent = domain || '—';
        document.getElementById('trackingStatus').classList.add('active');
    } else {
        currentTabSpan.textContent = 'Idle';
        document.getElementById('trackingStatus').classList.remove('active');
    }

    saveBtn.addEventListener('click', async () => {
        const selectedTime = timeInput.value;
        if (!selectedTime) return;
        await storage.set('reportTime', selectedTime);
        setupAlarm(selectedTime);
        statusDiv.textContent = '✓ Settings saved';
        setTimeout(() => { statusDiv.textContent = ''; }, 2500);
    });

    viewReportBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'report.html' });
    });
});

function setupAlarm(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    let now = new Date();
    let alarmTime = new Date();
    alarmTime.setHours(hours, minutes, 0, 0);
    if (alarmTime <= now) alarmTime.setDate(alarmTime.getDate() + 1);
    const delayInMinutes = (alarmTime - now) / 60000;
    chrome.alarms.create('dailyReport', { delayInMinutes, periodInMinutes: 1440 });
}

function formatTime(ms) {
    let s = Math.floor(ms / 1000);
    let m = Math.floor(s / 60);
    let h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

function extractDomain(url) {
    try {
        const u = new URL(url);
        return u.hostname;
    } catch {
        return null;
    }
}