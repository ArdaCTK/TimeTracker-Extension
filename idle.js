// idle.js
export class IdleManager {
    constructor(tracking) {
        this.tracking = tracking;
        this.isActive = true;
    }

    start() {
        chrome.idle.setDetectionInterval(60);
        chrome.idle.onStateChanged.addListener(async (newState) => {
            if (newState === 'active' && !this.isActive) {
                this.isActive = true;
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab && tab.url) await this.tracking.setActiveTab(tab.url, tab.id);
            } else if (newState !== 'active' && this.isActive) {
                this.isActive = false;
                await this.tracking.stopTracking();
            }
        });
    }
}