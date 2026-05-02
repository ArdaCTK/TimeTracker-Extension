const params = new URLSearchParams(location.search);

document.getElementById('domain').textContent = params.get('domain') || '-';
document.getElementById('limit').textContent = params.get('limit') || '-';
document.getElementById('used').textContent = params.get('used') || '-';
document.getElementById('date').textContent = params.get('date') || '-';

document.getElementById('closeTabBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.remove(tab.id);
  }
});
