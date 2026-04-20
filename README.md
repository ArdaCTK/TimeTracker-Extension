# Time Tracker ⏱️

A modern, privacy-first Chrome Extension to track your active browser time, analyze domain usage, and boost your productivity with detailed local insights.

## Features
- **Accurate Tracking**: Only tracks time when a tab or window is actively focused.
- **Smart Grouping**: Groups URLs under their main domains (e.g., all Google services under google.com) while keeping sub-paths accessible via expandable rows.
- **Historical Data**: Persistent local storage. Travel back in time to view your productivity on any given day.
- **Visual Analytics**: Interactive pie charts to visualize where your time goes.
- **Daily Notifications**: Set a specific time to receive a push notification for your daily report.
- **Privacy First**: All data is stored locally in your browser via `chrome.storage.local`. No external servers.

## Installation
1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the extension directory.
*Note: Ensure you download `chart.umd.js` from Chart.js and place it in the `assets/` folder for the graphs to work.*

## Architecture
Built with Vanilla JavaScript, HTML5, and CSS3. Utilizes Manifest V3 APIs (`chrome.tabs`, `chrome.windows`, `chrome.storage`, `chrome.alarms`, `chrome.notifications`).

## License
This project is **Source-Available** for personal use only. 

You are welcome to download the code, inspect how it works, and modify it for your own personal productivity. However, you **may not** use it for commercial purposes, sell it, or claim it as your own work. 

See the `LICENSE` file for the exact, binding terms.
