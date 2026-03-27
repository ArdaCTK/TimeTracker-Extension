// background.js

function extractDomainAndPath(fullUrl) {
    try {
        const urlObj = new URL(fullUrl);
        if (!urlObj.protocol.startsWith('http')) return null;
        return {
            domain: urlObj.hostname,
            path: urlObj.pathname + urlObj.search
        };
    } catch (e) {
        return null;
    }
}

// Süreyi hesaplayıp veritabanına yazan ana fonksiyon
async function updateTime() {
    try {
        const data = await chrome.storage.local.get(['trackingState']);
        const state = data.trackingState;

        // Eğer kayıtlı bir oturum yoksa işlem yapma
        if (!state || !state.url || !state.startTime) return;

        const timeSpent = Date.now() - state.startTime;
        if (timeSpent < 1000) return; // 1 saniyeden azsa yoksay

        const urlData = extractDomainAndPath(state.url);
        if (!urlData) return;

        const today = new Date().toISOString().split('T')[0];
        const result = await chrome.storage.local.get([today]);
        let todayData = result[today] || {};

        if (!todayData[urlData.domain]) {
            todayData[urlData.domain] = { total: 0, paths: {} };
        }

        // Ana domaine ve alt uzantıya süreyi ekle
        todayData[urlData.domain].total += timeSpent;
        todayData[urlData.domain].paths[urlData.path] = (todayData[urlData.domain].paths[urlData.path] || 0) + timeSpent;

        // Güncel süreyi kaydet
        await chrome.storage.local.set({ [today]: todayData });

        // Sürenin iki kez sayılmaması için başlangıç zamanını ŞU AN olarak güncelle
        state.startTime = Date.now();
        await chrome.storage.local.set({ trackingState: state });

    } catch (error) {
        console.error("Time update error:", error);
    }
}

// Aktif sekmeyi değiştiren ve veritabanına not alan fonksiyon
async function setActiveTab(url, tabId) {
    await updateTime(); // Yeni sekmeye geçmeden önce eskisinin süresini kaydet

    if (url && url.startsWith('http')) {
        await chrome.storage.local.set({
            trackingState: { url: url, tabId: tabId, startTime: Date.now() }
        });
    } else {
        // chrome:// ayarlar gibi siteleri takip etme
        await chrome.storage.local.set({ trackingState: null });
    }
}

// --- LİSTENER'LAR (DİNLEYİCİLER) ---

// Kullanıcı 60 saniye boyunca PC'de hareket etmezse AFK sayılır
chrome.idle.setDetectionInterval(60);

chrome.idle.onStateChanged.addListener(async (newState) => {
    if (newState === 'active') {
        // Kullanıcı geri geldi, aktif sekmeyi bul ve takibe başla
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            await setActiveTab(tabs[0].url, tabs[0].id);
        }
    } else {
        // Kullanıcı AFK ('idle') veya ekranı kilitledi ('locked') -> Takibi durdur
        await updateTime();
        await chrome.storage.local.set({ trackingState: null });
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab) {
        await setActiveTab(tab.url, tab.id);
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        const data = await chrome.storage.local.get(['trackingState']);
        // Sadece takip edilen sekmenin URL'si değiştiyse güncelle
        if (data.trackingState && data.trackingState.tabId === tabId) {
            await setActiveTab(changeInfo.url, tabId);
        }
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Tarayıcı arka plana atıldı veya odak kaybedildi
        await updateTime();
        await chrome.storage.local.set({ trackingState: null });
    } else {
        // Tarayıcıya geri dönüldü
        const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
        if (tabs.length > 0) {
            await setActiveTab(tabs[0].url, tabs[0].id);
        }
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "dailyReport") {
        await updateTime();
        chrome.notifications.create({
            type: "basic",
            iconUrl: "assets/icon-128.png",
            title: "Pro Time Tracker",
            message: "Your daily productivity report is ready. Click to view!",
            priority: 2
        });
    }
});

chrome.notifications.onClicked.addListener(() => {
    chrome.tabs.create({ url: "report.html" });
});

// Tarayıcı ilk açıldığında veya eklenti yeniden yüklendiğinde tetiklenir
chrome.runtime.onStartup.addListener(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
        await setActiveTab(tabs[0].url, tabs[0].id);
    }
});