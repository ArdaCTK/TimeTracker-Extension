document.addEventListener('DOMContentLoaded', () => {
    const timeInput = document.getElementById('reportTime');
    const saveBtn = document.getElementById('saveBtn');
    const viewReportBtn = document.getElementById('viewReportBtn');
    const statusDiv = document.getElementById('status');

    chrome.storage.local.get(['reportTime'], (result) => {
        if (result.reportTime) timeInput.value = result.reportTime;
    });

    saveBtn.addEventListener('click', () => {
        const selectedTime = timeInput.value;
        if (!selectedTime) return;

        chrome.storage.local.set({ reportTime: selectedTime }, () => {
            statusDiv.textContent = "✓ Settings saved";
            setupAlarm(selectedTime);
            setTimeout(() => { statusDiv.textContent = ""; }, 2500);
        });
    });

    viewReportBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: "report.html" });
    });
});

function setupAlarm(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    let now = new Date();
    let alarmTime = new Date();

    alarmTime.setHours(hours, minutes, 0, 0);
    if (alarmTime <= now) alarmTime.setDate(alarmTime.getDate() + 1);

    const delayInMinutes = (alarmTime.getTime() - now.getTime()) / 60000;
    chrome.alarms.create("dailyReport", { delayInMinutes, periodInMinutes: 1440 });
}