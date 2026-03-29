// storage.js
export class StorageManager {
    constructor() {
        this.DAYS_TO_KEEP = 30;
    }

    async get(key) {
        const result = await chrome.storage.local.get(key);
        return result[key];
    }

    async set(key, value) {
        await chrome.storage.local.set({ [key]: value });
    }

    async getTodayData() {
        const today = new Date().toISOString().split('T')[0];
        return (await this.get(today)) || {};
    }

    async saveTodayData(data) {
        const today = new Date().toISOString().split('T')[0];
        await this.set(today, data);
    }

    async addTime(domain, path, milliseconds) {
        const todayData = await this.getTodayData();
        if (!todayData[domain]) {
            todayData[domain] = { total: 0, paths: {} };
        }
        todayData[domain].total += milliseconds;
        todayData[domain].paths[path] = (todayData[domain].paths[path] || 0) + milliseconds;
        await this.saveTodayData(todayData);
    }

    async cleanOldData() {
        const all = await chrome.storage.local.get(null);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.DAYS_TO_KEEP);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        for (const key in all) {
            if (key.match(/^\d{4}-\d{2}-\d{2}$/) && key < cutoffStr) {
                await chrome.storage.local.remove(key);
            }
        }
    }
}