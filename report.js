// report.js — Pro Time Tracker v3.0

// ─── State ────────────────────────────────────────────────────────────────────

let view        = 'day';          // 'day' | 'week'
let currentDate = new Date();     // The pivot date for the current view
let mainChart   = null;

let snapshotDomains    = {};      // { domain: { total, paths } } for current period
let snapshotTotalMs    = 0;
let snapshotCategories = {};

// ─── Chart color palette ─────────────────────────────────────────────────────

const PALETTE = [
  '#3d7dff', '#7c5cfc', '#e040fb', '#f06292',
  '#ff7043', '#ffca28', '#26c6da', '#66bb6a',
];

function categoryColor(cat) {
  if (cat === 'productive')   return '#22d3a0';
  if (cat === 'unproductive') return '#ff5f57';
  return '#6b7280';
}

function categoryLabel(cat) {
  const map = { productive: 'Productive', unproductive: 'Unproductive', neutral: 'Neutral' };
  return map[cat] ?? 'Neutral';
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function dateKey(d) {
  return d.toISOString().split('T')[0];
}

function getWeekStart(d) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay()); // Sunday
  return copy;
}

function formatDateDisplay(d) {
  if (view === 'week') {
    const start = getWeekStart(d);
    const end   = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en', fmt)} – ${end.toLocaleDateString('en', fmt)}`;
  }
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(d) === dateKey(today))     return 'Today';
  if (dateKey(d) === dateKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

async function load() {
  const { categories = {} } = await chrome.storage.local.get('categories');
  snapshotCategories = categories;

  if (view === 'day') {
    const key    = dateKey(currentDate);
    const result = await chrome.storage.local.get(key);
    renderDay(result[key] || {});
  } else {
    await loadWeek();
  }

  syncDateDisplay();
}

async function loadWeek() {
  const start = getWeekStart(currentDate);
  const keys  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return dateKey(d);
  });

  const result = await chrome.storage.local.get(keys);

  // Build per-day bar data + merged domain totals
  const dayLabels  = [];
  const dayTotals  = [];
  const merged     = {};

  for (let i = 0; i < 7; i++) {
    const d   = new Date(start);
    d.setDate(d.getDate() + i);
    dayLabels.push(d.toLocaleDateString('en', { weekday: 'short' }));

    const dayData = result[keys[i]] || {};
    let dayMs = 0;

    for (const [domain, data] of Object.entries(dayData)) {
      dayMs += data.total;
      if (!merged[domain]) merged[domain] = { total: 0, paths: {} };
      merged[domain].total += data.total;
      for (const [path, ms] of Object.entries(data.paths || {})) {
        merged[domain].paths[path] = (merged[domain].paths[path] || 0) + ms;
      }
    }

    dayTotals.push(Math.round(dayMs / 60000)); // minutes
  }

  renderWeek(dayLabels, dayTotals, merged);
}

// ─── Rendering — Day View ─────────────────────────────────────────────────────

function renderDay(dayData) {
  const sorted = Object.entries(dayData).sort(([, a], [, b]) => b.total - a.total);
  snapshotDomains = dayData;
  snapshotTotalMs = sorted.reduce((s, [, d]) => s + d.total, 0);

  updateStats(sorted);

  // Doughnut chart
  const top8   = sorted.slice(0, 8);
  const labels = top8.map(([d]) => d);
  const values = top8.map(([, d]) => Math.round(d.total / 60000));
  const colors = top8.map(([d], i) => {
    const cat = snapshotCategories[d] || 'neutral';
    if (cat !== 'neutral') return categoryColor(cat);
    return PALETTE[i % PALETTE.length];
  });

  buildDoughnutChart(labels, values, colors);
  renderLegend(sorted);
  renderTable(sorted);
}

// ─── Rendering — Week View ────────────────────────────────────────────────────

function renderWeek(dayLabels, dayTotals, merged) {
  snapshotDomains = merged;
  const sorted = Object.entries(merged).sort(([, a], [, b]) => b.total - a.total);
  snapshotTotalMs = sorted.reduce((s, [, d]) => s + d.total, 0);

  updateStats(sorted);
  buildBarChart(dayLabels, dayTotals);
  renderLegend(sorted);
  renderTable(sorted);
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function updateStats(sorted) {
  document.getElementById('statTotal').textContent =
    snapshotTotalMs > 0 ? fmtTime(snapshotTotalMs) : '—';

  document.getElementById('statTop').textContent = sorted[0]?.[0] ?? '—';
  document.getElementById('statSites').textContent = sorted.length || '—';

  const prodMs = sorted
    .filter(([d]) => snapshotCategories[d] === 'productive')
    .reduce((s, [, v]) => s + v.total, 0);

  const pct = snapshotTotalMs > 0
    ? `${Math.round((prodMs / snapshotTotalMs) * 100)}%`
    : '—';
  document.getElementById('statProductive').textContent = pct;
}

// ─── Charts ───────────────────────────────────────────────────────────────────

function buildDoughnutChart(labels, values, colors) {
  const ctx = document.getElementById('mainChart').getContext('2d');
  if (mainChart) mainChart.destroy();
  if (!labels.length) { mainChart = null; return; }

  mainChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `  ${ctx.label}: ${ctx.raw}m`,
          },
          backgroundColor: '#0b0e1a',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#d8dff0',
          bodyColor: '#8892a4',
          padding: 10,
        },
      },
    },
  });
}

function buildBarChart(labels, values) {
  const ctx = document.getElementById('mainChart').getContext('2d');
  if (mainChart) mainChart.destroy();

  mainChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: 'rgba(61,125,255,0.7)',
        hoverBackgroundColor: '#3d7dff',
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `  ${ctx.raw}m`,
          },
          backgroundColor: '#0b0e1a',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#d8dff0',
          bodyColor: '#8892a4',
          padding: 10,
        },
      },
      scales: {
        x: {
          grid:   { display: false },
          ticks:  { color: '#4a5368', font: { size: 11 } },
          border: { color: 'transparent' },
        },
        y: {
          grid:   { color: 'rgba(255,255,255,0.04)' },
          ticks:  { color: '#4a5368', font: { size: 11 }, callback: (v) => `${v}m` },
          border: { color: 'transparent' },
        },
      },
    },
  });
}

// ─── Legend Panel ─────────────────────────────────────────────────────────────

function renderLegend(sorted) {
  const container = document.getElementById('legendItems');
  container.innerHTML = '';

  if (!sorted.length) {
    container.innerHTML = '<div class="legend-empty">No data for this period.</div>';
    return;
  }

  for (const [domain, data] of sorted.slice(0, 10)) {
    const cat  = snapshotCategories[domain] || 'neutral';
    const pct  = snapshotTotalMs > 0 ? Math.round((data.total / snapshotTotalMs) * 100) : 0;
    const color = categoryColor(cat);
    const icon  = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML = `
      <div class="legend-swatch" style="background:${color}"></div>
      <img src="${icon}" class="legend-favicon" onerror="this.style.display='none'">
      <span class="legend-domain">${domain}</span>
      <span class="legend-pct">${pct}%</span>
    `;
    container.appendChild(row);
  }
}

// ─── Domain Table ─────────────────────────────────────────────────────────────

function renderTable(sorted) {
  const tbody = document.getElementById('tableBody');
  const query = (document.getElementById('searchInput')?.value ?? '').toLowerCase().trim();
  const rows  = query ? sorted.filter(([d]) => d.includes(query)) : sorted;

  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No data recorded for this period.</td></tr>';
    return;
  }

  for (const [domain, data] of rows) {
    const cat    = snapshotCategories[domain] || 'neutral';
    const pct    = snapshotTotalMs > 0 ? (data.total / snapshotTotalMs) * 100 : 0;
    const color  = categoryColor(cat);
    const icon   = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    const sortedPaths = Object.entries(data.paths || {})
      .filter(([, ms]) => ms > 1000)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);

    const hasSubPaths = sortedPaths.length > 0;

    let pathHtml = '';
    if (hasSubPaths) {
      pathHtml = `<div class="sub-paths">` +
        sortedPaths.map(([path, ms]) => `
          <div class="sub-path-row">
            <span class="sub-path-name">${path}</span>
            <span class="sub-path-time">${fmtTime(ms)}</span>
          </div>
        `).join('') +
        `</div>`;
    }

    const tr = document.createElement('tr');

    // Domain cell (details accordion)
    const tdDomain = document.createElement('td');
    tdDomain.className = 'td-domain';
    if (hasSubPaths) {
      tdDomain.innerHTML = `
        <details>
          <summary>
            <img src="${icon}" class="domain-favicon" onerror="this.style.visibility='hidden'">
            <span class="domain-name">${domain}</span>
            <span class="expand-chevron">›</span>
          </summary>
          ${pathHtml}
        </details>
      `;
    } else {
      tdDomain.innerHTML = `
        <div style="display:flex;align-items:center;gap:9px;padding:10px 14px">
          <img src="${icon}" class="domain-favicon" onerror="this.style.visibility='hidden'">
          <span class="domain-name">${domain}</span>
        </div>
      `;
    }

    // Category cell
    const tdCat = document.createElement('td');
    tdCat.className = 'td-cat';
    tdCat.innerHTML = `<span class="badge badge-${cat}">${categoryLabel(cat)}</span>`;

    // Time cell
    const tdTime = document.createElement('td');
    tdTime.className = 'td-time';
    tdTime.textContent = fmtTime(data.total);

    // Share cell
    const tdShare = document.createElement('td');
    tdShare.className = 'td-share';
    tdShare.innerHTML = `
      <div class="share-cell">
        <div class="share-track">
          <div class="share-fill" style="width:${Math.min(pct, 100)}%;background:${color}"></div>
        </div>
        <span class="share-pct">${Math.round(pct)}%</span>
      </div>
    `;

    tr.appendChild(tdDomain);
    tr.appendChild(tdCat);
    tr.appendChild(tdTime);
    tr.appendChild(tdShare);
    tbody.appendChild(tr);
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportCSV() {
  const sorted = Object.entries(snapshotDomains).sort(([, a], [, b]) => b.total - a.total);
  const lines  = [['Domain', 'Category', 'Time (ms)', 'Time'].join(',')];

  for (const [domain, data] of sorted) {
    const cat = snapshotCategories[domain] || 'neutral';
    lines.push([domain, cat, data.total, fmtTime(data.total)].join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `time-tracker-${dateKey(currentDate)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Date Navigation ──────────────────────────────────────────────────────────

function syncDateDisplay() {
  document.getElementById('dateDisplay').textContent = formatDateDisplay(currentDate);

  const today = new Date();
  const atToday =
    view === 'day'
      ? dateKey(currentDate) === dateKey(today)
      : dateKey(getWeekStart(currentDate)) === dateKey(getWeekStart(today));

  document.getElementById('nextBtn').disabled = atToday;
}

function navigate(direction) {
  const delta = view === 'day' ? 1 : 7;
  currentDate = new Date(currentDate);
  currentDate.setDate(currentDate.getDate() + direction * delta);
  load();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // View tabs
  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      view = btn.dataset.view;
      load();
    });
  });

  // Date navigation
  document.getElementById('prevBtn').addEventListener('click', () => navigate(-1));
  document.getElementById('nextBtn').addEventListener('click', () => navigate(1));

  // Calendar picker
  const picker = document.getElementById('datePickerHidden');
  picker.max   = dateKey(new Date());

  document.getElementById('calBtn').addEventListener('click', () => {
    picker.value = dateKey(currentDate);
    picker.showPicker?.();
    picker.click();
  });

  picker.addEventListener('change', (e) => {
    if (!e.target.value) return;
    currentDate = new Date(e.target.value + 'T12:00:00');
    load();
  });

  // Export
  document.getElementById('exportBtn').addEventListener('click', exportCSV);

  // Search
  document.getElementById('searchInput').addEventListener('input', () => {
    const sorted = Object.entries(snapshotDomains).sort(([, a], [, b]) => b.total - a.total);
    renderTable(sorted);
  });

  load();
});
