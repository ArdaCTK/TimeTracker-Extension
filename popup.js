// popup.js — Pro Time Tracker v3.1

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  if (s > 0) return `${s}s`;
  return '—';
}

// FIX: local date, not UTC
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function parseUrl(url) {
  try {
    const u = new URL(url);
    return { domain: u.hostname, path: u.pathname + u.search };
  } catch {
    return null;
  }
}

// XSS guard — escape before inserting into innerHTML
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function render() {
  const today = todayKey();
  const data = await chrome.storage.local.get([today, 'categories', 'reportTime', 'trackingState']);

  const dayData = data[today] || {};
  const categories = data.categories || {};
  const state = data.trackingState;
  const liveDayData = JSON.parse(JSON.stringify(dayData));

  // Tracking status pill
  const pill = document.getElementById('statusPill');
  const statusLabel = document.getElementById('statusLabel');
  if (state?.url) {
    pill.classList.add('active');
    statusLabel.textContent = 'Tracking';
  } else {
    pill.classList.remove('active');
    statusLabel.textContent = 'Idle';
  }

  // Aggregate by category
  let totalMs = 0, productiveMs = 0, unproductiveMs = 0;
  const sorted = Object.entries(liveDayData).sort(([, a], [, b]) => b.total - a.total);

  for (const [domain, d] of sorted) {
    totalMs += d.total;
    const cat = getEffectiveCategory(domain, categories);
    if (cat === 'productive') productiveMs += d.total;
    if (cat === 'unproductive') unproductiveMs += d.total;
  }
  const neutralMs = totalMs - productiveMs - unproductiveMs;

  // Hero
  document.getElementById('heroTime').textContent = formatTime(totalMs);

  // Category bar
  if (totalMs > 0) {
    document.getElementById('barProductive').style.width = `${(productiveMs / totalMs) * 100}%`;
    document.getElementById('barNeutral').style.width = `${(neutralMs / totalMs) * 100}%`;
    document.getElementById('barUnproductive').style.width = `${(unproductiveMs / totalMs) * 100}%`;
  }

  // Top sites
  const list = document.getElementById('popupSitesList');
  const top = sorted.slice(0, 5);
  const maxMs = top[0]?.[1].total ?? 1;

  list.innerHTML = '';
  if (!top.length) {
    list.innerHTML = '<div class="popup-empty">No activity recorded today.</div>';
  } else {
    for (const [domain, d] of top) {
      const pct = Math.min((d.total / maxMs) * 100, 100);
      const iconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
      const row = document.createElement('div');
      row.className = 'popup-site-row';
      // Use esc() to prevent XSS from crafted domain/path names
      row.innerHTML = `
        <img src="${iconUrl}" class="popup-favicon" onerror="this.style.visibility='hidden'">
        <span class="popup-site-name">${esc(domain)}</span>
        <div class="popup-site-bar-wrap">
          <div class="popup-site-bar" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <span class="popup-site-time">${formatTime(d.total)}</span>
      `;
      list.appendChild(row);
    }
  }

  // Currently tracking strip
  const nowEl = document.getElementById('popupNow');
  const nowDomain = document.getElementById('nowDomain');
  if (state?.url) {
    const domain = parseDomain(state.url);
    if (domain) {
      nowEl.classList.add('visible');
      nowDomain.textContent = domain;
    }
  } else {
    nowEl.classList.remove('visible');
  }

  // Pre-fill notification time
  if (data.reportTime) {
    document.getElementById('reportTime').value = data.reportTime;
  }
}

// ─── Alarm Setup ──────────────────────────────────────────────────────────────

function scheduleAlarm(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const alarm = new Date();
  alarm.setHours(h, m, 0, 0);
  if (alarm.getTime() <= Date.now()) alarm.setDate(alarm.getDate() + 1);
  const delay = (alarm.getTime() - Date.now()) / 60000;
  // Clear then create to avoid duplicate
  chrome.alarms.clear('dailyReport', () => {
    chrome.alarms.create('dailyReport', { delayInMinutes: delay, periodInMinutes: 1440 });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await render();

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const time = document.getElementById('reportTime').value;
    if (!time) return;
    await chrome.storage.local.set({ reportTime: time });
    scheduleAlarm(time);
    const fb = document.getElementById('saveFeedback');
    fb.textContent = 'Saved';
    setTimeout(() => (fb.textContent = ''), 2000);
  });

  document.getElementById('viewReportBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'report.html' });
    window.close();
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'settings.html' });
    window.close();
  });
});
  // Include active, unflushed session so UI does not appear stuck.
  if (state?.url && state?.startTime) {
    const parsed = parseUrl(state.url);
    if (parsed) {
      const elapsed = Math.max(0, Date.now() - state.startTime);
      if (!liveDayData[parsed.domain]) liveDayData[parsed.domain] = { total: 0, paths: {} };
      liveDayData[parsed.domain].total += elapsed;
      liveDayData[parsed.domain].paths[parsed.path] =
        (liveDayData[parsed.domain].paths[parsed.path] || 0) + elapsed;
    }
  }
