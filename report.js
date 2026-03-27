let usageChart = null;

document.addEventListener('DOMContentLoaded', () => {
    const dateSelector = document.getElementById('dateSelector');
    const today = new Date().toISOString().split('T')[0];

    dateSelector.value = today;
    dateSelector.max = today;

    loadData(today);

    dateSelector.addEventListener('change', (e) => {
        loadData(e.target.value);
    });
});

function loadData(dateStr) {
    chrome.storage.local.get([dateStr], (result) => {
        const data = result[dateStr] || {};
        renderDashboard(data);
    });
}

function renderDashboard(data) {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';

    const domains = Object.keys(data);
    let totalMs = 0;
    let chartLabels = [];
    let chartData = [];

    const sortedDomains = domains.sort((a, b) => data[b].total - data[a].total);

    if (sortedDomains.length === 0) {
        document.getElementById('totalTime').textContent = "0s";
        tableBody.innerHTML = '<tr><td colspan="2" class="empty-state">No data recorded for this date.</td></tr>';
        if (usageChart) usageChart.destroy();
        return;
    }

    sortedDomains.forEach(domain => {
        const domainData = data[domain];
        totalMs += domainData.total;

        // Top 5 for chart
        if (chartLabels.length < 5) {
            chartLabels.push(domain);
            chartData.push(Math.floor(domainData.total / 60000)); // in minutes
        }

        const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

        // Build sub-paths HTML
        let pathsHtml = '';
        const sortedPaths = Object.keys(domainData.paths).sort((a, b) => domainData.paths[b] - domainData.paths[a]);
        sortedPaths.forEach(path => {
            if (domainData.paths[path] > 1000) { // Only show paths > 1s
                pathsHtml += `
                    <div class="sub-path-row">
                        <span class="path-text">${path}</span>
                        <span class="path-time">${formatTime(domainData.paths[path])}</span>
                    </div>
                `;
            }
        });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <details>
                    <summary>
                        <div class="url-text">
                            <img src="${iconUrl}" class="favicon" onerror="this.src='assets/icon-16.png'">
                            <strong>${domain}</strong>
                        </div>
                    </summary>
                    <div class="sub-paths-container">
                        ${pathsHtml}
                    </div>
                </details>
            </td>
            <td class="time-text">${formatTime(domainData.total)}</td>
        `;
        tableBody.appendChild(row);
    });

    document.getElementById('totalTime').textContent = formatTime(totalMs);
    renderChart(chartLabels, chartData);
}

function renderChart(labels, data) {
    const ctx = document.getElementById('usageChart').getContext('2d');

    if (usageChart) {
        usageChart.destroy();
    }

    // Requires Chart.js to be loaded in HTML
    if (typeof Chart !== 'undefined') {
        usageChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#f8fafc' } }
                }
            }
        });
    }
}

function formatTime(ms) {
    let s = Math.floor(ms / 1000);
    let m = Math.floor(s / 60);
    let h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}