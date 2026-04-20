// settings.js — Pro Time Tracker v3.1

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function collectDomains(days = 60) {
  const keys = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return dateKey(d);
  });
  const result = await chrome.storage.local.get(keys);
  const domains = new Set();
  for (const key of keys) {
    const day = result[key];
    if (day) Object.keys(day).forEach(d => domains.add(d));
  }
  return [...domains].sort();
}

// ─── Category Table ───────────────────────────────────────────────────────────

function renderCategoryTable(domains, userCategories, limits) {
  const tbody = document.getElementById('categoryBody');
  tbody.innerHTML = '';

  if (!domains.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">
      No domains tracked yet. Browse the web for a bit first.
    </td></tr>`;
    return;
  }

  for (const domain of domains) {
    // Effective = user override if set, else default
    const isUserDefined = domain in userCategories;
    const effectiveCat = getEffectiveCategory(domain, userCategories);
    const defaultCat = DEFAULT_CATEGORIES[domain];
    const limitMs = limits[domain] || 0;
    const limitH = Math.floor(limitMs / 3600000);
    const limitM = Math.floor((limitMs % 3600000) / 60000);
    const icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;

    // Source badge shown next to category select
    let sourceBadge = '';
    if (isUserDefined) {
      sourceBadge = `<span class="source-badge user" title="You set this">Custom</span>`;
    } else if (defaultCat) {
      sourceBadge = `<span class="source-badge default" title="Auto-detected default — you can override">Default</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:9px 14px">
        <div style="display:flex;align-items:center;gap:8px">
          <img src="${icon}" class="domain-favicon" onerror="this.style.display='none'">
          <span style="font-size:13px;color:var(--text)">${esc(domain)}</span>
        </div>
      </td>
      <td style="padding:9px 14px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <select class="cat-select ${effectiveCat}" data-domain="${esc(domain)}">
            <option value="neutral"      ${effectiveCat === 'neutral' ? 'selected' : ''}>Neutral</option>
            <option value="productive"   ${effectiveCat === 'productive' ? 'selected' : ''}>Productive</option>
            <option value="unproductive" ${effectiveCat === 'unproductive' ? 'selected' : ''}>Unproductive</option>
          </select>
          ${sourceBadge}
        </div>
      </td>
      <td style="padding:9px 14px">
        <div class="limit-row">
          <input type="number" class="limit-input limit-h" data-domain="${esc(domain)}"
            value="${limitH}" min="0" max="23" placeholder="0"> h
          <input type="number" class="limit-input limit-m" data-domain="${esc(domain)}"
            value="${limitM}" min="0" max="59" placeholder="0"> m
        </div>
      </td>
      <td style="padding:9px 14px">
        <div style="display:flex;gap:5px">
          <button class="btn-row-save" data-domain="${esc(domain)}">Save</button>
          ${isUserDefined
        ? `<button class="btn-row-reset" data-domain="${esc(domain)}" title="Reset to default">↺</button>`
        : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Category select live color update
  tbody.querySelectorAll('.cat-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      e.target.className = `cat-select ${e.target.value}`;
    });
  });

  // Save button
  tbody.querySelectorAll('.btn-row-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      const catEl = tbody.querySelector(`.cat-select[data-domain="${domain}"]`);
      const hEl = tbody.querySelector(`.limit-h[data-domain="${domain}"]`);
      const mEl = tbody.querySelector(`.limit-m[data-domain="${domain}"]`);

      const { categories = {}, limits = {} } =
        await chrome.storage.local.get(['categories', 'limits']);

      categories[domain] = catEl.value;

      const limitMs = (parseInt(hEl.value) || 0) * 3600000
        + (parseInt(mEl.value) || 0) * 60000;
      if (limitMs > 0) limits[domain] = limitMs;
      else delete limits[domain];

      await chrome.storage.local.set({ categories, limits });

      btn.textContent = '✓ Saved';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1800);

      // Refresh table to update badges
      const [freshDomains, freshData] = await Promise.all([
        collectDomains(60),
        chrome.storage.local.get(['categories', 'limits']),
      ]);
      renderCategoryTable(freshDomains, freshData.categories || {}, freshData.limits || {});
    });
  });

  // Reset to default button
  tbody.querySelectorAll('.btn-row-reset').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      const { categories = {}, limits = {} } =
        await chrome.storage.local.get(['categories', 'limits']);

      delete categories[domain];
      await chrome.storage.local.set({ categories });

      const [freshDomains, freshData] = await Promise.all([
        collectDomains(60),
        chrome.storage.local.get(['categories', 'limits']),
      ]);
      renderCategoryTable(freshDomains, freshData.categories || {}, freshData.limits || {});
    });
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function exportAllJSON() {
  const all = await chrome.storage.local.get(null);
  // Strip internal runtime state — not useful in export
  delete all.trackingState;
  delete all.limitNotified;
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `time-tracker-export-${dateKey(new Date())}.json`);
}

async function exportMonthCSV() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const days = new Date(y, m + 1, 0).getDate();

  const keys = Array.from({ length: days }, (_, i) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  );

  const result = await chrome.storage.local.get([...keys, 'categories']);
  const categories = result.categories || {};
  const lines = [['Date', 'Domain', 'Category', 'Time (ms)', 'Time'].join(',')];

  for (const key of keys) {
    const day = result[key];
    if (!day) continue;
    for (const [domain, data] of Object.entries(day).sort(([, a], [, b]) => b.total - a.total)) {
      const cat = getEffectiveCategory(domain, categories);
      lines.push([key, domain, cat, data.total, fmtTime(data.total)].join(','));
    }
  }

  downloadBlob(
    new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    `time-tracker-${y}-${String(m + 1).padStart(2, '0')}.csv`
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const [domains, { categories = {}, limits = {} }] = await Promise.all([
    collectDomains(60),
    chrome.storage.local.get(['categories', 'limits']),
  ]);

  renderCategoryTable(domains, categories, limits);

  document.getElementById('exportJsonBtn').addEventListener('click', exportAllJSON);
  document.getElementById('exportMonthBtn').addEventListener('click', exportMonthCSV);

  document.getElementById('clearDataBtn').addEventListener('click', async () => {
    const confirmed = confirm(
      'This will permanently delete all tracked time data.\n\n' +
      'Your category settings and limits will be preserved.\n\nContinue?'
    );
    if (!confirmed) return;

    const { categories: c, limits: l, reportTime: r } =
      await chrome.storage.local.get(['categories', 'limits', 'reportTime']);
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      categories: c || {}, limits: l || {}, reportTime: r || '',
    });

    alert('All tracking data has been cleared. Settings preserved.');
    location.reload();
  });
});