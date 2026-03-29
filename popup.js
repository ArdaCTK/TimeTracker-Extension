// popup.js — Pro Time Tracker v3.0

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0)   return `${h}h ${m % 60}m`;
  if (m > 0)   return `${m}m ${s % 60}s`;
  if (s > 0)   return `${s}s`;
  return '—';
}

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function parseDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function render() {
  const today = todayKey();
  const keys  = [today, 'categories', 'reportTime', 'trackingState'];
  const data  = await chrome.storage.local.get(keys);

  const dayData      = data[today]        || {};
  const categories   = data.categories    || {};
  const reportTime   = data.reportTime    || '';
  const state        = data.trackingState;

  // — Tracking status pill —
  const pill        = document.getElementById('statusPill');
  const statusLabel = document.getElementById('statusLabel');

  if (state?.url) {
    pill.classList.add('active');
    statusLabel.textContent = 'Tracking';
  } else {
    pill.classList.remove('active');
    statusLabel.textContent = 'Idle';
  }

  // — Aggregate totals by category —
  let totalMs       = 0;
  let productiveMs  = 0;
  let unproductiveMs = 0;

  const sorted = Object.entries(dayData).sort(([, a], [, b]) => b.total - a.total);

  for (const [domain, d] of sorted) {
    totalMs += d.total;
    const cat = categories[domain] || 'neutral';
    if (cat === 'productive')   productiveMs   += d.total;
    if (cat === 'unproductive') unproductiveMs += d.total;
  }

  const neutralMs = totalMs - productiveMs - unproductiveMs;

  // — Hero time —
  document.getElementById('heroTime').textContent = formatTime(totalMs);

  // — Category bar —
  if (totalMs > 0) {
    document.getElementById('barProductive').style.width   = `${(productiveMs   / totalMs) * 100}%`;
    document.getElementById('barNeutral').style.width      = `${(neutralMs      / totalMs) * 100}%`;
    document.getElementById('barUnproductive').style.width = `${(unproductiveMs / totalMs) * 100}%`;
  }

  // — Top sites list —
  const list  = document.getElementById('popupSitesList');
  const top   = sorted.slice(0, 5);
  const maxMs = top[0]?.[1].total ?? 1;

  list.innerHTML = '';

  if (top.length === 0) {
    list.innerHTML = '<div class="popup-empty">No activity recorded today.</div>';
  } else {
    for (const [domain, d] of top) {
      const pct    = Math.min((d.total / maxMs) * 100, 100);
      const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

      const row = document.createElement('div');
      row.className = 'popup-site-row';
      row.innerHTML = `
        <img src="${iconUrl}" class="popup-favicon" onerror="this.style.visibility='hidden'">
        <span class="popup-site-name">${domain}</span>
        <div class="popup-site-bar-wrap">
          <div class="popup-site-bar" style="width:${pct}%"></div>
        </div>
        <span class="popup-site-time">${formatTime(d.total)}</span>
      `;
      list.appendChild(row);
    }
  }

  // — Currently tracking strip —
  const nowEl     = document.getElementById('popupNow');
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

  // — Pre-fill notification time —
  if (reportTime) {
    document.getElementById('reportTime').value = reportTime;
  }
}

// ─── Alarm Setup ──────────────────────────────────────────────────────────────

function scheduleAlarm(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const now    = Date.now();
  const alarm  = new Date();
  alarm.setHours(h, m, 0, 0);
  if (alarm.getTime() <= now) alarm.setDate(alarm.getDate() + 1);
  const delay = (alarm.getTime() - now) / 60000;
  chrome.alarms.create('dailyReport', { delayInMinutes: delay, periodInMinutes: 1440 });
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
