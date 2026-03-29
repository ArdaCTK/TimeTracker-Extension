// report.js
import { StorageManager } from './storage.js';

const storage = new StorageManager();
let usageChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    const dateSelector = document.getElementById('dateSelector');
    const today = new Date().toISOString().split('T')[0];
    dateSelector.value = today;
    dateSelector.max = today;

    await loadData(today);
    dateSelector.addEventListener('change', async (e) => {
        await loadData(e.target.value);
    });
});

async function loadData(dateStr) {
    // Show skeleton
    document.getElementById('tableBody').innerHTML = '<tr><td colspan="2" class="empty-state">Loading…</td></tr>';
    document.getElementById('totalTime').textContent = '—';
    if (usageChart) usageChart.destroy();

    const data = await storage.get(dateStr) || {};
    renderDashboard(data);
}

function renderDashboard(data) {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';

    const domains = Object.keys(data);
    let totalMs = 0;
    const chartLabels = [];
    const chartData = [];

    const sorted = domains.sort((a, b) => data[b].total - data[a].total);

    if (sorted.length === 0) {
        document.getElementById('totalTime').textContent = '0s';
        tableBody.innerHTML = '<tr><td colspan="2" class="empty-state">No data recorded for this date.</td></tr>';
        return;
    }

    sorted.forEach(domain => {
        const domainData = data[domain];
        totalMs += domainData.total;

        // Top 5 for chart
        if (chartLabels.length < 5) {
            chartLabels.push(domain);
            chartData.push(Math.floor(domainData.total / 60000));
        }

        const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        const pathsHtml = Object.entries(domainData.paths)
            .sort((a, b) => b[1] - a[1])
            .filter(([_, time]) => time > 1000)
            .map(([path, time]) => `
        <div class="sub-path-row">
          <span class="path-text">${escapeHtml(path)}</span>
          <span class="path-time">${formatTime(time)}</span>
        </div>
      `).join('');

        const row = document.createElement('tr');
        row.innerHTML = `
      <td>
        <details>
          <summary>
            <div class="domain-wrapper">
              <div class="domain-left">
                <img src="${iconUrl}" class="favicon" onerror="this.src='assets/icon-16.png'">
                <strong>${escapeHtml(domain)}</strong>
              </div>
              <div class="details-icon"></div>
            </div>
          </summary>
          <div class="sub-paths-container">
            ${pathsHtml || '<div class="sub-path-row">No significant paths</div>'}
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
    if (usageChart) usageChart.destroy();
    if (typeof Chart !== 'undefined') {
        usageChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316'], borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: '#f8fafc' } } }
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

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}