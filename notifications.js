// notifications.js
export class NotificationManager {
    async showDailyReportReady() {
        const granted = await this._checkPermission();
        if (granted) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icon-128.png',
                title: 'Pro Time Tracker',
                message: 'Your daily productivity report is ready. Click to view!',
                priority: 2
            });
        } else {
            console.log('Daily report ready (notification not allowed)');
        }
    }

    async _checkPermission() {
        const status = await chrome.permissions.contains({ permissions: ['notifications'] });
        if (!status) {
            await chrome.permissions.request({ permissions: ['notifications'] });
        }
        return (await chrome.permissions.contains({ permissions: ['notifications'] }));
    }
}