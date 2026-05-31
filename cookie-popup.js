const browserAPI = (typeof browser !== 'undefined' && browser !== null) ? browser : chrome;
const isFirefox = typeof browser !== 'undefined' && browser !== null && typeof browser.runtime.getBrowserInfo === 'function';

// Close the steamrip tab that triggered this popup
async function closeSteamripTab() {
  const tabs = await browserAPI.tabs.query({ url: '*://*.steamrip.com/*' });
  for (const tab of tabs) {
    browserAPI.tabs.remove(tab.id);
  }
}

// Base64 encode for safer URL transport (handles special chars better in Firefox/Opera)
function base64Encode(str) {
  try {
    // Use TextEncoder for proper UTF-8 encoding to base64
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.error('Base64 encode error:', e);
    return null;
  }
}

// Switch to manual entry mode if auto-capture failed
document.addEventListener('DOMContentLoaded', async () => {
  const data = await browserAPI.storage.local.get(['steamripNeedsManual', 'steamripCfClearance']);
  if (data.steamripNeedsManual && !data.steamripCfClearance) {
    document.querySelector('h1').textContent = 'Manual Cookie Entry';
    document.getElementById('subtitleText').textContent =
      'Auto-capture is unavailable in this browser. Paste your cf_clearance value below.';
    document.getElementById('manualSection').style.display = 'block';
  }
});

// Send cookie to Ascendara
document.getElementById('sendBtn').addEventListener('click', async () => {
  const data = await browserAPI.storage.local.get(['steamripCfClearance', 'steamripUserAgent', 'steamripNeedsManual']);
  let cookieValue = data.steamripCfClearance;
  const userAgent = data.steamripUserAgent || navigator.userAgent;

  // Manual mode: read and validate textarea input
  if (data.steamripNeedsManual && !cookieValue) {
    const textarea = document.getElementById('manualCookieInput');
    const raw = textarea.value.trim();
    if (!raw) {
      textarea.classList.add('error');
      textarea.addEventListener('input', () => textarea.classList.remove('error'), { once: true });
      return;
    }
    cookieValue = raw.startsWith('cf_clearance=') ? raw : 'cf_clearance=' + raw;
    await browserAPI.storage.local.set({ steamripCfClearance: cookieValue, steamripNeedsManual: false });
  }

  if (cookieValue) {
    console.log('Original cookie length:', cookieValue.length);
    console.log('Original cookie:', cookieValue);
    console.log('User-Agent:', userAgent);
    
    // For Firefox/Opera, use base64 encoding to avoid URL corruption issues
    // Chrome handles the raw URL fine, but other browsers may truncate/corrupt long protocol URLs
    // We now send both cookie and user-agent as a JSON object
    let protocolUrl;
    if (isFirefox) {
      // Create a JSON payload with both cookie and user-agent
      const payload = JSON.stringify({
        cookie: cookieValue,
        userAgent: userAgent
      });
      const encoded = base64Encode(payload);
      console.log('Base64 encoded payload:', encoded);
      console.log('Base64 encoded length:', encoded ? encoded.length : 0);
      // Use b64: prefix to indicate base64 encoding to Ascendara
      protocolUrl = 'ascendara://steamrip-cookie/b64:' + encoded;
    } else {
      // Chrome: also send user-agent but URL encoded
      const payload = JSON.stringify({
        cookie: cookieValue,
        userAgent: userAgent
      });
      protocolUrl = 'ascendara://steamrip-cookie/' + encodeURIComponent(payload);
    }
    
    console.log('Protocol URL length:', protocolUrl.length);
    console.log('Protocol URL:', protocolUrl);
    
    // Use the same method as download handler - create a new tab with the protocol
    browserAPI.tabs.create({ url: protocolUrl }, async () => {
      // Show success message
      document.getElementById('statusMessage').classList.add('show');
      
      // Close steamrip tab
      await closeSteamripTab();
      
      // Close popup after a delay
      setTimeout(async () => {
        const currentWindow = await browserAPI.windows.getCurrent();
        browserAPI.windows.remove(currentWindow.id);
      }, 1500);
    });
  }
});

// Cancel button - close the popup window and steamrip tab
document.getElementById('cancelBtn').addEventListener('click', async () => {
  await closeSteamripTab();
  const currentWindow = await browserAPI.windows.getCurrent();
  browserAPI.windows.remove(currentWindow.id);
});
