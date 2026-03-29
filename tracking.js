// tracking.js
export class TrackingManager {
    constructor(storage) {
        this.storage = storage;
        this.currentState = null; // { url, tabId, startTime }
        this.updateLock = false;
        this.debounceTimeout = null;
    }

    getCurrentTabId() {
        return this.currentState?.tabId;
    }

    async updateTime() {
        if (this.updateLock) return;
        this.updateLock = true;
        try {
            if (!this.currentState || !this.currentState.url || !this.currentState.startTime) return;

            const now = Date.now();
            const elapsed = now - this.currentState.startTime;
            if (elapsed < 1000) return; // ignore <1s

            const urlData = this._extractDomainAndPath(this.currentState.url);
            if (!urlData) return;

            await this.storage.addTime(urlData.domain, urlData.path, elapsed);

            // Reset start time to now to avoid double counting
            this.currentState.startTime = now;
            await this.storage.set('trackingState', this.currentState);
        } finally {
            this.updateLock = false;
        }
    }

    async setActiveTab(url, tabId) {
        if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
        // Debounce to handle rapid URL changes
        this.debounceTimeout = setTimeout(async () => {
            await this.updateTime();
            if (url && url.startsWith('http')) {
                this.currentState = { url, tabId, startTime: Date.now() };
                await this.storage.set('trackingState', this.currentState);
            } else {
                this.currentState = null;
                await this.storage.set('trackingState', null);
            }
        }, 100);
    }

    async stopTracking() {
        await this.updateTime();
        this.currentState = null;
        await this.storage.set('trackingState', null);
    }

    _extractDomainAndPath(fullUrl) {
        try {
            const urlObj = new URL(fullUrl);
            if (!urlObj.protocol.startsWith('http')) return null;
            return {
                domain: urlObj.hostname,
                path: urlObj.pathname + urlObj.search
            };
        } catch {
            return null;
        }
    }
}