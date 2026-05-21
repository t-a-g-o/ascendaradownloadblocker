// Use the appropriate browser API
const browserAPI = (typeof browser !== 'undefined' && browser !== null) ? browser : (typeof chrome !== 'undefined' ? chrome : null);
if (!browserAPI) {
    console.error('No browser API found');
    throw new Error('Browser API not supported');
}
// SteamRip API URL for cookie fetching
const STEAMRIP_API_URL = 'https://steamrip.com/wp-json/wp/v2/posts?per_page=1&page=1';

// Function to get cf_clearance cookie from steamrip.com
async function getSteamripCfClearance() {
  try {
    // Try with specific URL first (most reliable for Firefox)
    const cookie = await browserAPI.cookies.get({
      url: 'https://steamrip.com/',
      name: 'cf_clearance'
    });
    
    if (cookie) {
      console.log('cf_clearance cookie found via URL method:', cookie.value);
      return cookie.value;
    }
    
    // Try getting all cookies for the domain
    const allCookies = await browserAPI.cookies.getAll({
      domain: 'steamrip.com'
    });
    console.log('All cookies for steamrip.com:', allCookies);
    
    // Also try with .steamrip.com (subdomain wildcard)
    const dotDomainCookies = await browserAPI.cookies.getAll({
      domain: '.steamrip.com'
    });
    console.log('All cookies for .steamrip.com:', dotDomainCookies);
    
    // Also try without domain filter and filter manually
    const allSiteCookies = await browserAPI.cookies.getAll({
      url: 'https://steamrip.com/'
    });
    console.log('All cookies via URL filter:', allSiteCookies);
    
    // Combine all and find cf_clearance
    const allFound = [...allCookies, ...dotDomainCookies, ...allSiteCookies];
    const cfCookies = allFound.filter(c => c.name === 'cf_clearance');
    console.log('All cf_clearance cookies found:', cfCookies);
    
    if (cfCookies.length > 0) {
      // If multiple, prefer the one with longest value or most recent
      const best = cfCookies.reduce((a, b) => 
        (b.value.length > a.value.length) ? b : a
      );
      console.log('Using cf_clearance cookie:', best.value);
      return best.value;
    }
    
    console.log('cf_clearance cookie not found in any method');
    return null;
  } catch (error) {
    console.error('Error fetching cf_clearance cookie:', error);
    return null;
  }
}

// Function to get all cookies from steamrip.com
async function getAllSteamripCookies() {
  try {
    const cookies = await browserAPI.cookies.getAll({
      domain: 'steamrip.com'
    });
    
    console.log('All steamrip.com cookies:', cookies);
    return cookies;
  } catch (error) {
    console.error('Error fetching steamrip.com cookies:', error);
    return [];
  }
}

// Function to open the cookie popup window
function openCookiePopup() {
  browserAPI.windows.create({
    url: browserAPI.runtime.getURL('cookie-popup.html'),
    type: 'popup',
    width: 360,
    height: 340,
    focused: true
  });
}

// Function to check if user is on the SteamRip API page and fetch cookie
async function checkAndFetchSteamripCookie(tabId, url) {
  if (url && url.startsWith('https://steamrip.com/wp-json/wp/v2/posts')) {
    console.log('User is on SteamRip API page, fetching cf_clearance cookie...');
    const cfClearance = await getSteamripCfClearance();
    
    if (cfClearance) {
      // Store the cookie for later use
      await browserAPI.storage.local.set({ steamripCfClearance: cfClearance });
      console.log('cf_clearance cookie stored successfully');
      
      // Open the popup to prompt user to send to Ascendara
      openCookiePopup();
      
      return cfClearance;
    }
  }
  return null;
}

// Listen for tab updates to detect when user navigates to SteamRip API
console.log('=== Ascendara Extension Loaded ===');

// Track if we've already shown the popup (resets after 30 seconds to allow retrying)
let cookiePopupShown = false;
let pendingCfClearance = null;

// Reset the popup flag after 30 seconds so user can retry if needed
function resetPopupFlag() {
  setTimeout(() => {
    cookiePopupShown = false;
    console.log('Popup flag reset, can show again');
  }, 30000);
}

// Use webRequest to intercept the actual Cookie header from requests
// Firefox doesn't support 'extraHeaders' option, so we conditionally include it
const isFirefox = typeof browser !== 'undefined' && browser !== null;
const sendHeadersOptions = isFirefox ? ['requestHeaders'] : ['requestHeaders', 'extraHeaders'];

browserAPI.webRequest.onSendHeaders.addListener(
  (details) => {
    // Only process if we haven't shown popup yet and it's the API endpoint
    if (cookiePopupShown) return;
    if (!details.url.includes('steamrip.com/wp-json/wp/v2/posts')) return;
    
    console.log('>>> Intercepted request to steamrip.com API');
    const cookieHeader = details.requestHeaders?.find(h => h.name.toLowerCase() === 'cookie');
    if (cookieHeader) {
      console.log('Cookie header found:', cookieHeader.value);
      
      // Extract cf_clearance=value from the cookie string
      const match = cookieHeader.value.match(/cf_clearance=[^;]+/);
      if (match) {
        // Store cf_clearance=value format
        pendingCfClearance = match[0];
        console.log('cf_clearance pending verification:', pendingCfClearance);
      }
    } else {
      console.log('No cookie header in request');
    }
  },
  { urls: ['*://*.steamrip.com/*'] },
  sendHeadersOptions
);

// Listen for completed responses to verify the request succeeded (not a Cloudflare challenge)
browserAPI.webRequest.onCompleted.addListener(
  async (details) => {
    if (cookiePopupShown) return;
    if (!details.url.includes('steamrip.com/wp-json/wp/v2/posts')) return;
    if (!pendingCfClearance) return;
    
    console.log('>>> Response completed for steamrip.com API, status:', details.statusCode);
    
    // Only proceed if we got a successful response (200 = JSON loaded, not Cloudflare challenge)
    if (details.statusCode === 200) {
      console.log('Valid JSON response received, cookie is valid!');
      
      // Mark as shown to prevent duplicates
      cookiePopupShown = true;
      
      // On Firefox, re-fetch the cookie directly from the cookies API to ensure we have the correct value
      // The webRequest header might have a stale or different cookie
      let finalCookie = pendingCfClearance;
      if (isFirefox) {
        try {
          console.log('Firefox: Intercepted cookie from request header:', pendingCfClearance);
          const freshCookie = await getSteamripCfClearance();
          console.log('Firefox: Fresh cookie from cookies API:', freshCookie);
          if (freshCookie) {
            finalCookie = 'cf_clearance=' + freshCookie;
            console.log('Firefox: Using fresh cookie:', finalCookie);
            // Compare to see if they differ
            if (pendingCfClearance !== finalCookie) {
              console.log('Firefox: Cookie values DIFFER - intercepted vs API');
              console.log('  Intercepted:', pendingCfClearance.substring(0, 80));
              console.log('  API cookie:', finalCookie.substring(0, 80));
            }
          } else {
            console.log('Firefox: Could not get fresh cookie, using intercepted value');
          }
        } catch (e) {
          console.error('Firefox: Error fetching fresh cookie:', e);
        }
      }
      
      console.log('Final cookie to store (first 100 chars):', finalCookie.substring(0, 100));
      
      // Capture the User-Agent for Cloudflare validation
      // The cookie is tied to the User-Agent that was used when it was issued
      const userAgent = navigator.userAgent;
      console.log('Captured User-Agent:', userAgent);
      
      // Store both cookie and user-agent
      browserAPI.storage.local.set({ 
        steamripCfClearance: finalCookie,
        steamripUserAgent: userAgent
      }).then(() => {
        console.log('Cookie stored:', finalCookie);
        console.log('User-Agent stored:', userAgent);
        console.log('Opening popup...');
        openCookiePopup();
        // Reset flag after 30 seconds so user can retry
        resetPopupFlag();
      });
    } else {
      console.log('Response was not 200, likely Cloudflare challenge. Status:', details.statusCode);
      pendingCfClearance = null;
    }
  },
  { urls: ['*://*.steamrip.com/*'] }
);

browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log('Tab updated:', tabId, 'status:', changeInfo.status, 'url:', tab.url);
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('Checking URL:', tab.url);
    if (tab.url.startsWith('https://steamrip.com')) {
      console.log('>>> SteamRip domain detected!');
    }
  }
});

// Default blocked domains (fallback)
const defaultBlockedDomains = [
  'flashbang.sh',
  'dlproxy.uk',
  'gofile.io',
  'megadb.xyz',
  'pixeldrain.com',
  'spyderrock.com',
  'bzzhr.to',
  'fafda.to'
];

// Fetch blocked domains from API
async function fetchBlockedDomains() {
  try {
    const response = await fetch('https://api.ascendara.app/app/json/providers');
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    if (data && data.forwardingLinks) {
      // Extract hostnames from the forwardingLinks values
      const apiDomains = Object.values(data.forwardingLinks).map(url => {
        try {
          return new URL(url.replace(/\\\//g, '/')).hostname;
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
      // Always merge with hardcoded defaults so they are never dropped by API
      return [...new Set([...defaultBlockedDomains, ...apiDomains])];
    }
  } catch (e) {
    console.error('Failed to fetch blocked domains:', e);
  }
  return defaultBlockedDomains;
}

// Initialize the extension
browserAPI.runtime.onInstalled.addListener(async () => {
  const blockedDomains = await fetchBlockedDomains();
  browserAPI.storage.sync.set({
    isEnabled: true,
    blockedDomains
  });
});

// Function to extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    console.error('Invalid URL:', url);
    return '';
  }
}

// Function to check if a domain matches any blocked domain
function isDomainBlocked(domain, blockedDomains) {
  return blockedDomains.some(blockedDomain => 
    domain === blockedDomain || domain.endsWith('.' + blockedDomain)
  );
}

// Function to handle sending download to Ascendara
async function handleDownload(downloadItem, suggest) {
  let url = downloadItem.finalUrl || downloadItem.url;
  if (!url) {
    console.error("Failed to get download URL");
    if (suggest) suggest();
    return;
  }

  // Use the original URL for domain matching so CDN redirects don't bypass the check
  const domain = extractDomain(downloadItem.url || url);
  
  try {
    const data = await browserAPI.storage.sync.get(['isEnabled', 'blockedDomains']);
    const isEnabled = data.isEnabled ?? true;
    // Always merge stored domains with hardcoded defaults so new defaults are
    // never silently dropped when storage was populated before the update
    const storedDomains = data.blockedDomains || [];
    const blockedDomains = [...new Set([...defaultBlockedDomains, ...storedDomains])];
    
    if (isEnabled && isDomainBlocked(domain, blockedDomains)) {
      try {
        if (suggest) {
          suggest({ 
            filename: 'cancelled.tmp', 
            conflictAction: 'uniquify' 
          });
        } else {
          // Firefox path
          await browserAPI.downloads.cancel(downloadItem.id);
        }
        
        // Clean up any existing download
        if (downloadItem.id) {
          await browserAPI.downloads.erase({ id: downloadItem.id });
        }
        
        // Handle the Ascendara protocol
        browserAPI.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs[0]) {
            browserAPI.tabs.update(tabs[0].id, {
              url: 'ascendara://' + encodeURIComponent(url)
            });
          }
        });
      } catch (error) {
        console.error('Error handling download:', error);
        if (suggest) suggest();
      }
    } else if (suggest) {
      suggest();
    }
  } catch (error) {
    console.error('Error getting storage:', error);
    if (suggest) suggest();
  }
}

// Set up download listeners based on browser
if (typeof browser !== 'undefined') {
  // Firefox
  browserAPI.downloads.onCreated.addListener(async (downloadItem) => {
    await handleDownload(downloadItem);
  });
} else {
  // Chrome
  browserAPI.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    handleDownload(downloadItem, suggest);
    return true; // Keep the suggest callback valid
  });
}