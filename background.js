// Constants
const NOTION_API_URL = 'https://api.notion.com/v1';
const ICON_STATES = {
  GRAY: {
    16: 'icons/png/gray_n_16.png',
    32: 'icons/png/gray_n_32.png',
    48: 'icons/png/gray_n_48.png',
    128: 'icons/png/gray_n_128.png'
  },
  GREEN: {
    16: 'icons/png/green_n_16.png',
    32: 'icons/png/green_n_32.png',
    48: 'icons/png/green_n_48.png',
    128: 'icons/png/green_n_128.png'
  },
  ORANGE: {
    16: 'icons/png/orange_n_16.png',
    32: 'icons/png/orange_n_32.png',
    48: 'icons/png/orange_n_48.png',
    128: 'icons/png/orange_n_128.png'
  },
  RED: {
    16: 'icons/png/red_n_16.png',
    32: 'icons/png/red_n_32.png',
    48: 'icons/png/red_n_48.png',
    128: 'icons/png/red_n_128.png'
  }
};

// --- Log Levels --- 
const LOG_LEVELS = {
  NONE: -1,
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};
let currentLogLevel = LOG_LEVELS.INFO; // Default log level

// --- Logger Functions --- 
async function getLogLevel() {
  try {
    const { logLevel = 'INFO' } = await chrome.storage.local.get('logLevel');
    return LOG_LEVELS[logLevel.toUpperCase()] ?? LOG_LEVELS.INFO;
  } catch {
    return LOG_LEVELS.INFO; // Default on error
  }
}

// Update log level periodically or on demand (optional, simple check on each log for now)
// async function updateLogLevel() {
//    currentLogLevel = await getLogLevel();
// }
// updateLogLevel(); // Initial fetch

async function logMessage(level, ...args) {
  const configuredLevel = await getLogLevel();
  if (level <= configuredLevel) {
    const levelStr = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    const prefix = `[${levelStr || 'LOG'}]`;
    switch(level) {
      case LOG_LEVELS.ERROR: console.error(prefix, ...args); break;
      case LOG_LEVELS.WARN: console.warn(prefix, ...args); break;
      case LOG_LEVELS.INFO: console.info(prefix, ...args); break;
      case LOG_LEVELS.DEBUG: console.debug(prefix, ...args); break;
      default: console.log(prefix, ...args); break;
    }
  }
}

const logError = (...args) => logMessage(LOG_LEVELS.ERROR, ...args);
const logWarn = (...args) => logMessage(LOG_LEVELS.WARN, ...args);
const logInfo = (...args) => logMessage(LOG_LEVELS.INFO, ...args);
const logDebug = (...args) => logMessage(LOG_LEVELS.DEBUG, ...args);

// --- Simple Locking Mechanism ---
const currentlyCheckingUrls = new Set();
const SYNC_ALARM_NAME = 'notion-status-sync';

// Initialize the extension
async function init() {
  // updateLogLevel(); // Update log level on init
  // Set up listeners for tab changes
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      // Only check cache on tab updates for performance
      checkCurrentUrl(tab.url, true);
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    // Only check cache on tab activation for performance
    checkCurrentUrl(tab.url, true);
  });

  // Initial check for the active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    // Only check cache on initialization for performance
    checkCurrentUrl(tabs[0].url, true);
  }
  
  // Set up sync alarm
  setupSyncAlarm();
}

// Refactored function to check URL status with two phases
async function checkCurrentUrl(url, cacheOnly = false) {
  if (!url) {
    await setIconState('GRAY', { text: 'No URL available' });
    return;
  }

  // --- Lock Check ---
  if (currentlyCheckingUrls.has(url)) {
    logDebug(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Already checking URL: ${url}. Skipping.`);
    return;
  }
  currentlyCheckingUrls.add(url);
  logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Starting check for URL: ${url}. Lock acquired.`);

  // --- Set initial GRAY state while checking ---
  await setIconState('GRAY'); 

  try {
    // --- 1. Get Config and Check Domain Rules ---
    const config = await getUserConfig();
    if (!config.integrationToken || !config.databaseId || !config.propertyName) {
      await setIconState('GRAY', { error: 'Extension not configured.' });
      logError('Extension not configured.');
      return; // Exit early if not configured
    }

    const domainRuleInfo = await shouldDoPartialMatching(url);
    if (domainRuleInfo === false) {
      logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] URL excluded by domain rules: ${url}`);
      await setIconState('GRAY', { text: 'URL excluded by domain rules.', domainExcluded: true });
      return; // Exit early if domain is excluded
    }

    // --- 2. Generate URLs to Check (Variations + Ancestors/Partials) ---
    const exactVariations = generateExactMatchVariations(url);
    let ancestorPartials = [];
    if (domainRuleInfo === true) { 
        ancestorPartials = generateAncestorUrls(url); 
    } else if (typeof domainRuleInfo === 'object') { 
        ancestorPartials = await generateCustomAncestorUrls(url, domainRuleInfo);
    }
    const allUrlsToCheck = Array.from(new Set([...exactVariations, ...ancestorPartials]));
    logDebug(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] URLs to check in cache:`, allUrlsToCheck);

    // --- 3. Check Cache --- 
    const cachePromises = allUrlsToCheck.map(u => checkCache(u, config.cacheDuration));
    const cacheResults = await Promise.all(cachePromises);
    
    let foundGreen = null;       
    let foundOrange = null;      
    let allRed = true;           
    let needsApiCheck = false;   
    const foundMatchingUrls = new Set(); 

    for (let i = 0; i < allUrlsToCheck.length; i++) {
        const checkUrl = allUrlsToCheck[i];
        const cacheEntry = cacheResults[i];

        if (cacheEntry) {
            if (cacheEntry.status === 'GREEN') {
                logDebug(`[Cache Check] Found valid GREEN for: ${checkUrl} (points to ${cacheEntry.canonicalUrl})`);
                foundGreen = cacheEntry;
                allRed = false;
                break; 
            } else if (cacheEntry.status === 'ORANGE') {
                 logDebug(`[Cache Check] Found ORANGE for: ${checkUrl}`);
                 if (!foundOrange) foundOrange = cacheEntry; 
                 cacheEntry.matchingUrls?.forEach(u => foundMatchingUrls.add(u));
                 allRed = false;
            } else if (cacheEntry.status === 'RED') {
                 logDebug(`[Cache Check] Found RED for: ${checkUrl}`);
            }
        } else {
             logDebug(`[Cache Check] Cache miss/expired for: ${checkUrl}`);
             needsApiCheck = true;
             allRed = false; 
        }
    }

    // --- 4. Determine Action Based on Cache Results ---
    if (foundGreen) {
        logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Final state: GREEN (from cache)`);
        await setIconState('GREEN');
        // Optimization: Update cache for all *exact variations* to point to this canonical URL
        const updatePromises = exactVariations.map(v => updateCache(v, 'GREEN', { canonicalUrl: foundGreen.canonicalUrl }));
        await Promise.all(updatePromises);
        return; 
    }
    if (foundOrange) {
        const finalMatchingUrls = Array.from(foundMatchingUrls);
        logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Final state: ORANGE (from cache), matches:`, finalMatchingUrls);
        await setIconState('ORANGE', { matchingUrls: finalMatchingUrls });
        return; 
    }
    if (allRed) {
        logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Final state: RED (all variations/ancestors cached as RED)`);
        await setIconState('RED');
        return; 
    }

    // 4d. Cache was inconclusive (mix of RED and misses/expired, or only misses/expired)?
    // If cacheOnly is true, check the aggressive caching setting
    if (cacheOnly) {
        logDebug(`[CacheOnly Debug] Cache check results for ${url}: `,
                    `foundGreen: ${!!foundGreen}, `,
                    `foundOrange: ${!!foundOrange}, `,
                    `allRed: ${allRed}, `,
                    `needsApiCheck: ${needsApiCheck}`);
        if (config.aggressiveCachingEnabled) {
            logInfo("[CacheOnly][Aggressive] Cache inconclusive, performing aggressive check against full cache...");
            try {
                const { urlCache = {} } = await chrome.storage.local.get('urlCache');
                const validGreenUrls = Object.entries(urlCache)
                    .filter(([_, entry]) => entry?.status === 'GREEN' && (Date.now() - entry.timestamp < config.cacheDuration * 60 * 1000))
                    .map(([_, entry]) => entry.canonicalUrl)
                    .filter(Boolean); // Ensure canonicalUrl exists
                
                logDebug(`[CacheOnly][Aggressive] Found ${validGreenUrls.length} valid GREEN URLs in cache to check against.`);

                if (validGreenUrls.length === 0) {
                     logInfo("[CacheOnly][Aggressive] No valid GREEN URLs in cache. Setting RED.");
                     await updateCache(url, 'RED'); // Cache original URL as RED
                     await setIconState('RED');
                     return;
                }

                // Reuse the ancestor/partial matching logic, comparing `url` against `validGreenUrls`
                let aggressiveMatchFound = false;
                const aggressiveMatchingUrls = new Set();
                const currentUrlAncestors = typeof domainRuleInfo === 'object' 
                    ? await generateCustomAncestorUrls(url, domainRuleInfo) 
                    : generateAncestorUrls(url);
                // Add the exact URL variations to the list we check against cached greens
                const urlsToCheckAggressively = Array.from(new Set([...generateExactMatchVariations(url), ...currentUrlAncestors]));

                for (const cachedGreenUrl of validGreenUrls) {
                    try {
                        const parsedCachedGreen = new URL(cachedGreenUrl);
                        // Simple check: Does any ancestor/variation of the current URL match the domain/path of a known GREEN URL?
                        for (const checkUrl of urlsToCheckAggressively) {
                            const parsedCheckUrl = new URL(checkUrl);
                             // Compare hostname and path prefix
                            if (parsedCheckUrl.hostname === parsedCachedGreen.hostname && 
                                parsedCachedGreen.pathname.startsWith(parsedCheckUrl.pathname)) {
                                
                                logDebug(`[CacheOnly][Aggressive] Partial match found: ${url} (via ${checkUrl}) matches prefix of cached GREEN ${cachedGreenUrl}`);
                                aggressiveMatchFound = true;
                                aggressiveMatchingUrls.add(cachedGreenUrl); 
                                // Don't break here, collect all potential partial matches from cache
                            }
                        }
                    } catch (e) {
                        logWarn("[CacheOnly][Aggressive] Error parsing URL during aggressive check:", e);
                    } 
                }

                if (aggressiveMatchFound) {
                    const finalMatches = Array.from(aggressiveMatchingUrls);
                    logInfo("[CacheOnly][Aggressive] Final state: ORANGE (determined from cache), matches:", finalMatches);
                    await updateCache(url, 'ORANGE', { matchingUrls: finalMatches });
                    await setIconState('ORANGE', { matchingUrls: finalMatches });
                } else {
                    logInfo("[CacheOnly][Aggressive] Final state: RED (no matches found in cached GREEN URLs).");
                    await updateCache(url, 'RED');
                    await setIconState('RED');
                }

            } catch (error) {
                logError("[CacheOnly][Aggressive] Error during aggressive cache check:", error);
                // Fallback to GRAY if aggressive check fails
                await setIconState('GRAY', { text: 'Aggressive cache check failed. Click icon.' });
            }

        } else {
            logInfo(`[CacheOnly] Final state: GRAY (cache inconclusive, aggressive caching disabled)`);
            await setIconState('GRAY', { text: 'Cached status unclear. Click icon to check Notion.' });
        }
        return; 
    }

    // --- 5. Perform API Check (only if cacheOnly is false and cache was inconclusive) ---
    logInfo(`[API Check] Cache inconclusive, proceeding with API calls.`);

    try {
        // 5a. Check Exact Variations via API
        logInfo("[API Check] Querying API for exact variations:", exactVariations);
        const exactApiResultPages = await queryNotionForMultipleUrls(exactVariations, config);

        if (exactApiResultPages.length > 0) {
            // --- Exact Match Found via API --- 
            const firstMatch = exactApiResultPages[0];
            const canonicalUrlFromApi = firstMatch.properties[config.propertyName]?.url || exactVariations[0]; // Fallback needed?
            logInfo(`[API Check] Final state: GREEN (found via API: ${canonicalUrlFromApi})`);
            
            await setIconState('GREEN');
            // Update cache for all *exact variations* as GREEN
            const updatePromises = exactVariations.map(v => updateCache(v, 'GREEN', { canonicalUrl: canonicalUrlFromApi }));
            await Promise.all(updatePromises);
            return; 
        } else {
            logInfo("[API Check] No exact matches found via API.");
            // Cache *exact variations* as RED since API confirmed they aren't present
            // --- Start Bulk Update --- 
            try {
                const { urlCache = {} } = await chrome.storage.local.get('urlCache');
                let changed = false;
                for (const variation of exactVariations) {
                    if (!urlCache[variation] || urlCache[variation].status !== 'RED') {
                        urlCache[variation] = { status: 'RED', timestamp: Date.now() };
                        changed = true;
                        logDebug(`[API Check] Marking exact variation ${variation} as RED in cache.`);
                    }
                }
                if (changed) {
                    await chrome.storage.local.set({ urlCache });
                    logInfo("[API Check] Bulk updated exact variations cache to RED.");
                }
            } catch(cacheError) {
                 logError("[API Check] Error bulk updating exact variations cache to RED:", cacheError);
            }
            // --- End Bulk Update --- 
        }

        // 5b. Check Ancestors/Partials via API (only if no exact match found)
        // Use ancestorPartials generated earlier
        if (ancestorPartials.length > 0) {
             logInfo("[API Check] Querying API for ancestors/partials:", ancestorPartials);
             const partialApiResultPages = await queryNotionForMultipleUrls(ancestorPartials, config);

             if (partialApiResultPages.length > 0) {
                 // --- Partial/Ancestor Match Found via API ---
                 const partialMatchingUrls = partialApiResultPages.map(p => p.properties[config.propertyName]?.url).filter(Boolean);
                 logInfo(`[API Check] Final state: ORANGE (found ${partialMatchingUrls.length} ancestors/partials via API):`, partialMatchingUrls);
                 
                 await setIconState('ORANGE', { matchingUrls: partialMatchingUrls });
                 // Update cache for the *original URL* as ORANGE
                 await updateCache(url, 'ORANGE', { matchingUrls: partialMatchingUrls });
                 // Update cache for the *found* ancestor URLs as GREEN
                 const updatePromises = partialMatchingUrls.map(foundUrl => updateCache(foundUrl, 'GREEN', { canonicalUrl: foundUrl }));
                 await Promise.all(updatePromises);
                 return; 
             } else {
                 logInfo("[API Check] No ancestors/partials found via API.");
                 // Cache checked *ancestors/partials* as RED
                 // --- Start Bulk Update --- 
                 try {
                    const { urlCache = {} } = await chrome.storage.local.get('urlCache');
                    let changed = false;
                    for (const ancestor of ancestorPartials) {
                         if (!urlCache[ancestor] || urlCache[ancestor].status !== 'RED') {
                             urlCache[ancestor] = { status: 'RED', timestamp: Date.now() };
                             changed = true;
                             logDebug(`[API Check] Marking ancestor/partial ${ancestor} as RED in cache.`);
                         }
                    }
                    if (changed) {
                         await chrome.storage.local.set({ urlCache });
                         logInfo("[API Check] Bulk updated ancestors/partials cache to RED.");
                    }
                 } catch(cacheError) {
                     logError("[API Check] Error bulk updating ancestor/partial cache to RED:", cacheError);
                 }
                 // --- End Bulk Update ---
             }
        }

        // 5c. No Matches Found via API (Exact or Partial)
        logInfo(`[API Check] Final state: RED (no matches found in API)`);
        await setIconState('RED');
        // Cache entries for exact variations and ancestors/partials were already set to RED above.
        return; 

    } catch (error) {
        logError('[API Check] Error during Notion API query:', error);
        let errorText = `API Error: ${error.message || 'Unknown'}`;
        if (error.status === 401) {
            errorText = 'Notion Authentication Failed.';
            await chrome.storage.local.remove(['integrationToken', 'accessToken']); // Clear potentially bad token
            await chrome.storage.local.set({ needsAuthentication: true }); // Signal popup
        }
        await setIconState('GRAY', { error: errorText });
        return; // Stop processing on API error
    }

  } catch (error) {
    logError(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Unhandled error during checkCurrentUrl for ${url}:`, error);
    await setIconState('GRAY', { error: `Error: ${error.message || 'Unknown error'}` });
  } finally {
    currentlyCheckingUrls.delete(url);
    logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Finished check for URL: ${url}. Lock released.`);
  }
}

// Get user configuration from storage
async function getUserConfig() {
  const result = await chrome.storage.local.get([
    'integrationToken',
    'databaseId',
    'propertyName',
    'cacheDuration',
    'lastEditedPropertyName',
    'aggressiveCachingEnabled',
    'logLevel' // Ensure logLevel is loaded here
  ]);
  
  return {
    integrationToken: result.integrationToken,
    databaseId: result.databaseId,
    propertyName: result.propertyName,
    cacheDuration: typeof result.cacheDuration === 'number' ? result.cacheDuration : 60,
    lastEditedPropertyName: result.lastEditedPropertyName,
    aggressiveCachingEnabled: result.aggressiveCachingEnabled || false,
    logLevel: result.logLevel || 'INFO' // Add logLevel return
  };
}

// Check if URL is in cache and respects new expiration rules
async function checkCache(url, cacheDuration) {
  const { urlCache = {} } = await chrome.storage.local.get('urlCache');
  const cacheEntry = urlCache[url];

  if (cacheEntry) {
    // Check expiration ONLY for GREEN status
    if (cacheEntry.status === 'GREEN') {
      const now = Date.now();
      const isExpired = now - cacheEntry.timestamp >= cacheDuration * 60 * 1000;
      
      if (isExpired) {
        logDebug(`Cache check for ${url}: Found GREEN entry, but it's expired.`);
        return null; // Treat expired GREEN as cache miss
      } else {
        logDebug(`Cache check for ${url}: Found valid GREEN entry.`);
        return cacheEntry; // Valid GREEN entry
      }
    } else if (cacheEntry.status === 'RED' || cacheEntry.status === 'ORANGE') {
      logDebug(`Cache check for ${url}: Found non-expiring ${cacheEntry.status} entry.`);
      return cacheEntry;
    } else {
      logWarn(`Cache check for ${url}: Found entry with unexpected status (${cacheEntry.status}). Treating as miss.`);
      return null;
    }
  }
  
  logDebug(`Cache check for ${url}: No entry found.`);
  return null; // Cache miss
}

// Update cache with new URL status and structure
async function updateCache(url, status, details = {}) {
  // details can contain canonicalUrl (for GREEN) or matchingUrls (for ORANGE)
  try {
    const { urlCache = {} } = await chrome.storage.local.get('urlCache');
    
    const cacheEntry = {
      status: status, // 'GREEN', 'RED', 'ORANGE'
      timestamp: Date.now(),
      ...details // Add canonicalUrl or matchingUrls if provided
    };

    urlCache[url] = cacheEntry;
    
    await chrome.storage.local.set({ urlCache });
    logDebug(`Cache updated for ${url}: status: ${status}, details: ${JSON.stringify(details)}`);
    
  } catch (error) {
      logError(`Error updating cache for ${url}:`, error);
  }
}

// Query Notion API to check if URL exists in the database (DEPRECATED by queryNotionForMultipleUrls for exact checks)
async function queryNotionForUrl(url, config, returnPages = false) {
  // Determine which token to use based on the auth method
  const token = config.integrationToken;
  
  const response = await fetch(`${NOTION_API_URL}/databases/${config.databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: {
        property: config.propertyName,
        url: {
          equals: url
        }
      },
      page_size: 1 // Only need one result to confirm existence
    })
  });

  if (!response.ok) {
    const error = new Error(`Notion API error: ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return returnPages ? data.results : data.results.length > 0;
}

// Query Notion API using a compound OR filter for multiple URLs
async function queryNotionForMultipleUrls(urls, config) {
  if (!urls || urls.length === 0) {
    return [];
  }
  
  const token = config.integrationToken;
  
  // Construct the 'or' filter array
  const orFilters = urls.map(url => ({
    property: config.propertyName,
    url: {
      equals: url
    }
  }));

  const response = await fetch(`${NOTION_API_URL}/databases/${config.databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: {
        or: orFilters
      },
      // Request more pages if checking many ancestors/partials, 
      // but for exact match check, 1 is enough to confirm existence.
      // Let's keep it higher for ancestor checks where we want all results.
      page_size: 100 
    })
  });

  if (!response.ok) {
    const error = new Error(`Notion API error: ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return data.results; // Return the actual page objects found
}

// Query Notion API for URLs starting with a specific prefix (domain/path)
async function queryNotionForPartialUrl(urlPrefix, config) {
  const token = config.integrationToken;
  
  const response = await fetch(`${NOTION_API_URL}/databases/${config.databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: {
        property: config.propertyName,
        url: {
          starts_with: urlPrefix
        }
      },
      // Retrieve all matches for the prefix to show in the popup
      // Be mindful of Notion API limits (default 100, max 100 per page)
      // For simplicity, we'll just get the first page (up to 100)
      page_size: 100
    })
  });

  if (!response.ok) {
    // Don't throw an error here, as it might just be a temporary issue
    // or permissions problem. Log it and return empty results.
    logError(`Notion API error during partial query: ${response.status} ${response.statusText}`);
    // Consider returning a specific error object if needed downstream
    return [];
  }

  const data = await response.json();
  return data.results; // Return the actual page objects
}

// Set the icon and store the current status using the new structure
async function setIconState(state, details = {}) {
  // details might contain matchingUrls, error message, canonicalUrl (if needed), domainExcluded flag etc.
  try {
    await chrome.action.setIcon({ path: ICON_STATES[state] });
    
    const statusToStore = { 
        state: state, 
        timestamp: Date.now(), // Store when this status was set
        ...details // Include matchingUrls, error, text, domainExcluded etc.
    };

    // Define default text based on state if not provided
    if (!statusToStore.text) {
        switch(state) {
            case 'GREEN': statusToStore.text = 'URL found in Notion.'; break;
            case 'RED': statusToStore.text = statusToStore.domainExcluded ? 'URL excluded by domain rules.' : 'URL not found in Notion.'; break;
            case 'ORANGE': statusToStore.text = `Found ${details.matchingUrls?.length || 0} similar URLs.`; break;
            case 'GRAY': statusToStore.text = statusToStore.error ? `Error: ${statusToStore.error}` : (statusToStore.domainExcluded ? 'URL excluded by domain rules.' : 'Checking status...'); break;
        }
    }
    
    // Store status for the popup to read
    await chrome.storage.local.set({ currentTabStatus: statusToStore });
    logInfo(`Icon state set to ${state}. Stored status:`, statusToStore);

  } catch (error) {
    logError(`Error setting icon state to ${state}:`, error);
    // Store error state
    await chrome.storage.local.set({ currentTabStatus: { state: 'GRAY', error: `Icon Error: ${error.message}`, timestamp: Date.now() } });
  }
}

// Functions for sync operations
async function setupSyncAlarm() {
  const config = await getUserConfig();
  
  if (!config.integrationToken || !config.databaseId || !config.propertyName || !config.lastEditedPropertyName) {
    logWarn('Sync alarm not set up - extension not fully configured');
    return;
  }
  
  // Clear any existing alarm
  await chrome.alarms.clear(SYNC_ALARM_NAME);
  
  // Create new alarm - periodic sync every hour by default or whatever user has set
  // Convert minutes to milliseconds for the alarm API
  const minutes = config.cacheDuration || 60; // Default to hourly if not set
  logInfo(`Setting up sync alarm to run every ${minutes} minutes`);
  
  chrome.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: minutes
  });
  
  logInfo('Sync alarm scheduled successfully');
  
  // Consider running an initial sync right away if needed
  const { lastSyncTimestamp } = await chrome.storage.local.get('lastSyncTimestamp');
  if (!lastSyncTimestamp) {
    logInfo('No previous sync timestamp, performing initial full sync');
    performFullSync();
  }
}

async function performFullSync() {
  logInfo('Starting full sync operation');
  try {
    const config = await getUserConfig();
    if (!config.databaseId || !config.propertyName) {
      logError('Cannot perform sync - database or property not configured');
      return { success: false, error: 'Extension not fully configured' };
    }
    
    // Clear existing cache? Maybe not, let's overwrite entries found.
    // await chrome.storage.local.remove(['urlCache', 'lastSyncTimestamp']); 
    // Get current cache to update it
    const { urlCache = {} } = await chrome.storage.local.get('urlCache');
    
    // Fetch all pages from the database
    const token = config.integrationToken;
    let hasMore = true;
    let startCursor = undefined;
    let totalPages = 0;
    let updatedCount = 0;
    
    while (hasMore) {
      const response = await fetch(`${NOTION_API_URL}/databases/${config.databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start_cursor: startCursor,
          page_size: 100, // Maximum allowed by Notion API
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Notion API error during full sync: ${response.status} ${response.statusText} - ${errorText}`);
        error.status = response.status;
        throw error;
      }
      
      const data = await response.json();
      const pages = data.results;
      totalPages += pages.length;
      
      // Process pages and update cache
      for (const page of pages) {
        const url = page.properties[config.propertyName]?.url;
        if (url) {
            // Use updateCache to set status to GREEN, overwriting previous status
            await updateCache(url, 'GREEN', { canonicalUrl: url });
            updatedCount++;
          
            // Also update cache for URL variations
            const variations = generateExactMatchVariations(url);
            for (const variation of variations) {
                // Update variations, ensuring canonicalUrl points to the found URL
                await updateCache(variation, 'GREEN', { canonicalUrl: url });
            }
        }
      }
      
      // Prepare for next page if needed
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    
    // Store the updated cache and timestamp (updateCache already saved, but set timestamp here)
    await chrome.storage.local.set({ lastSyncTimestamp: Date.now() });
    
    logInfo(`Full sync completed. Processed ${totalPages} pages. Updated/Added ${updatedCount} URLs (and variations) to cache as GREEN.`);
    return { success: true, pagesProcessed: totalPages, urlsUpdated: updatedCount };
    
  } catch (error) {
    logError('Error during full sync:', error);
     if (error.status === 401) {
         await chrome.storage.local.remove(['integrationToken', 'accessToken']);
         await chrome.storage.local.set({ needsAuthentication: true });
         await setIconState('GRAY', { error: 'Authentication failed during sync.' });
     }
    return { success: false, error: error.message };
  }
}

async function performDeltaSync() {
  logInfo('Starting delta sync operation');
  try {
    const config = await getUserConfig();
    if (!config.databaseId || !config.propertyName || !config.lastEditedPropertyName) {
      logError('Cannot perform delta sync - database, property or lastEditedProperty not configured');
      return { success: false, error: 'Extension not fully configured for delta sync' };
    }
    
    // Get the timestamp of the last sync
    const { lastSyncTimestamp } = await chrome.storage.local.get('lastSyncTimestamp');
    if (!lastSyncTimestamp) {
      logInfo('No previous sync timestamp found, performing full sync instead');
      return performFullSync();
    }
    
    // Delta sync doesn't need the current cache, updateCache handles overwrites.
    
    // Format the timestamp for the Notion API (ISO string)
    const lastSync = new Date(lastSyncTimestamp).toISOString();
    const token = config.integrationToken;
    
    // Query pages modified since the last sync timestamp
    let hasMore = true;
    let startCursor = undefined;
    let pagesProcessed = 0;
    let updatedCount = 0;
    
    while (hasMore) {
      const response = await fetch(`${NOTION_API_URL}/databases/${config.databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start_cursor: startCursor,
          page_size: 100,
          filter: {
            property: config.lastEditedPropertyName,
            date: {
              on_or_after: lastSync
            }
          }
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Notion API error during delta sync: ${response.status} ${response.statusText} - ${errorText}`);
        error.status = response.status;
        throw error;
      }
      
      const data = await response.json();
      const pages = data.results;
      pagesProcessed += pages.length;
      
      // Process modified pages
      for (const page of pages) {
        const url = page.properties[config.propertyName]?.url;
        if (url) {
          // Update cache for this URL - overwrites if RED/ORANGE, updates if GREEN
          await updateCache(url, 'GREEN', { canonicalUrl: url });
          updatedCount++;
          
          // Also update cache for URL variations
          const variations = generateExactMatchVariations(url);
          for (const variation of variations) {
              await updateCache(variation, 'GREEN', { canonicalUrl: url });
          }
        }
        // Note: Delta sync doesn't handle deletions. If a page is deleted in Notion,
        // its GREEN status might expire, but it won't be explicitly marked RED by sync.
        // A manual check (popup click) would eventually mark it RED via API.
      }
      
      // Prepare for next page if needed
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    
    // Update the last sync timestamp
    await chrome.storage.local.set({ lastSyncTimestamp: Date.now() });
    
    logInfo(`Delta sync completed. Processed ${pagesProcessed} modified pages. Updated/Added ${updatedCount} URLs (and variations) to cache as GREEN.`);
    return { success: true, pagesProcessed, urlsUpdated: updatedCount };
    
  } catch (error) {
    logError('Error during delta sync:', error);
     if (error.status === 401) {
         await chrome.storage.local.remove(['integrationToken', 'accessToken']);
         await chrome.storage.local.set({ needsAuthentication: true });
         await setIconState('GRAY', { error: 'Authentication failed during sync.' });
     }
    return { success: false, error: error.message };
  }
}

// Start the extension
init();

// Listen for messages from the popup and options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logDebug("Message received:", message);
  
  if (message.action === 'popupOpened') {
    logInfo('Popup was opened.');
    // Optionally clear badge text here if that was the intention
    sendResponse({ success: true }); // Acknowledge receipt
    return false; // Not sending async response

  } else if (message.action === 'clearCacheForUrl') {
    if (message.url) {
      clearCacheForUrl(message.url).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        logError('Error clearing cache for URL:', message.url, error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Indicate async response
    } else {
      logWarn('Clear cache request missing URL');
      sendResponse({ success: false, error: 'URL not provided for cache clear' });
      return false;
    }

  } else if (message.action === 'checkUrl') {
    if (message.url) {
      if (message.checkRulesOnly) {
        // Only check if URL is excluded by domain rules
        shouldDoPartialMatching(message.url).then(result => {
          if (result === false) {
            // URL is excluded by domain rules, update status
            setIconState('GRAY', [], 'URL excluded by domain rules').then(() => {
              chrome.storage.local.set({ 
                currentTabStatus: { 
                  state: 'GRAY', 
                  text: 'URL excluded by domain rules',
                  domainExcluded: true 
                } 
              }).then(() => {
                sendResponse({ success: true, excluded: true });
              });
            });
          } else {
            // URL is not excluded
            sendResponse({ success: true, excluded: false });
          }
        }).catch(error => {
          logError('Error checking rules for URL:', message.url, error);
          sendResponse({ success: false, error: error.message });
        });
        return true; // Indicate async response
      }

      // Use full check (API if needed) when explicitly requested
      checkCurrentUrl(message.url, false).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        logError('Error triggering check for URL:', message.url, error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Indicate async response
    } else {
      logWarn('Check URL request missing URL');
      sendResponse({ success: false, error: 'URL not provided for check' });
      return false;
    }
  } else if (message.action === 'forceFullSync') {
    logInfo('Full sync requested from options page');
    performFullSync().then(result => {
      sendResponse(result);
    }).catch(error => {
      logError('Error during full sync request:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Indicate async response
  } else if (message.action === 'rescheduleSyncAlarm') {
    logInfo('Sync alarm reschedule requested');
    setupSyncAlarm().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      logError('Error setting up sync alarm:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Indicate async response
  } else if (message.action === 'getStatus') {
    // For direct status requests from popup
    chrome.storage.local.get('currentTabStatus', (data) => {
      sendResponse({ success: true, status: data.currentTabStatus || { state: 'GRAY', text: 'Status not available' } });
    });
    return true; // Indicate async response
  }
  
  logWarn('Unknown message action received:', message.action);
  sendResponse({ success: false, error: 'Unknown action' });
  return false; // Not sending async response
});

// Add alarm listener for periodic sync
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    logInfo('Sync alarm triggered, performing delta sync');
    performDeltaSync().then(result => {
      logDebug('Delta sync result:', result);
    }).catch(error => {
      logError('Error in scheduled delta sync:', error);
    });
  }
});

// Function to clear cache for a specific URL
async function clearCacheForUrl(url) {
  const { urlCache = {} } = await chrome.storage.local.get('urlCache');
  if (urlCache[url]) {
    delete urlCache[url];
    await chrome.storage.local.set({ urlCache });
    logInfo('Cache cleared for:', url);
  } else {
    logDebug('URL not found in cache, no need to clear:', url);
  }
}

// Get domain exclusion rules from settings
async function getDomainExclusionRules() {
  const { domainRules = [] } = await chrome.storage.local.get('domainRules');
  return domainRules;
}

// Check if partial matching should be done for a URL based on domain rules
async function shouldDoPartialMatching(url) {
  try {
    // Extract protocol and domain for special protocol handling
    let protocol = '';
    let hostname = '';
    let domainForCheck = '';
    
    // Handle special protocol URLs like chrome:// or about:
    const protocolMatch = url.match(/^([a-z-]+):(\/\/)?([^\/]*)/i);
    if (protocolMatch) {
      protocol = protocolMatch[1].toLowerCase();
      hostname = protocolMatch[3] || '';
      
      // For protocol-based URLs, check if the protocol is in domain rules
      if (protocol) {
        // First try to match the protocol itself as a "domain" in the rules
        domainForCheck = protocol;
        
        // Get domain rules to check if this protocol is defined there
        const domainRules = await getDomainExclusionRules();
        const matchingProtocolRule = domainRules.find(rule => 
          rule.domain.toLowerCase() === protocol.toLowerCase()
        );
        
        if (matchingProtocolRule) {
          // Found a rule for this protocol, use its match level directly
          logDebug(`Protocol ${protocol} matched in domain rules`);
          if (matchingProtocolRule.matchLevel === 'disabled') {
            return false; // Disable matching for this protocol
          }
          // For other match levels, continue with the protocol as the domain
          return { matchLevel: matchingProtocolRule.matchLevel, rule: matchingProtocolRule };
        }
        
        // If we get here, no specific rule for the protocol, try normal URL parsing
        if (protocol === 'http' || protocol === 'https') {
          try {
            const parsedUrl = new URL(url);
            domainForCheck = parsedUrl.hostname;
          } catch (error) {
            logError(`Error parsing URL: ${url}`, error);
            domainForCheck = hostname || protocol;
          }
        }
      }
    } else {
      // Fallback to standard URL parsing
      try {
        const parsedUrl = new URL(url);
        domainForCheck = parsedUrl.hostname;
      } catch (error) {
        logError(`Cannot parse URL: ${url}`, error);
        return true; // Default to true on error
      }
    }
    
    const domainRules = await getDomainExclusionRules();
    
    // Find the first matching rule for this hostname/protocol
    const matchingRule = domainRules.find(rule => {
      // Match exact or check if hostname contains the rule's domain
      return domainForCheck === rule.domain || 
             (domainForCheck && domainForCheck.includes(rule.domain));
    });
    
    if (!matchingRule) {
      // No matching rule, do default partial matching
      logDebug(`No domain rule found for ${domainForCheck}, using default partial matching`);
      return true;
    }
    
    // If match level is 'disabled', no partial matching
    if (matchingRule.matchLevel === 'disabled') {
      logDebug(`Partial matching disabled for ${domainForCheck}`);
      return false;
    }
    
    // If it got here, we need to do partial matching but with custom rules
    logDebug(`Using custom partial matching for ${domainForCheck} with level: ${matchingRule.matchLevel}${matchingRule.pattern ? `, pattern: ${matchingRule.pattern}` : ''}`);
    return { matchLevel: matchingRule.matchLevel, rule: matchingRule };
    
  } catch (error) {
    logError(`Error checking domain rules for ${url}:`, error);
    return true; // Default to true on error
  }
}

// Generate ancestor URLs for a given URL based on domain rules
function generateAncestorUrls(url) {
    const ancestors = [];
    try {
        const parsed = new URL(url);
        const pathSegments = parsed.pathname.split('/').filter(Boolean); // Split path and remove empty segments
        
        // Iterate from the full path down to the root
        for (let i = pathSegments.length - 1; i >= 0; i--) {
            const ancestorPath = '/' + pathSegments.slice(0, i).join('/');
            // Combine protocol, hostname, and ancestor path
            // We only care about path ancestors, not just the hostname itself usually
            if (ancestorPath !== '/' || pathSegments.length > 1) { // Avoid adding domain root if path was only one level deep
                 ancestors.push(`${parsed.protocol}//${parsed.hostname}${ancestorPath}`);
            }
        }
        // Optionally add the root domain if path existed
        if (pathSegments.length > 0) {
             ancestors.push(`${parsed.protocol}//${parsed.hostname}`);
        }

    } catch (e) {
        logError("Error generating ancestor URLs for:", url, e);
    }
    return ancestors;
}

// New function to generate ancestor URLs based on domain rule match level
async function generateCustomAncestorUrls(url, matchingInfo) {
  const { matchLevel, rule } = matchingInfo;
  if (!matchLevel || matchLevel === 'disabled') {
    return []; // No ancestors if matching is disabled
  }
  
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const ancestors = [];
    
    // Handle custom pattern matching
    if (matchLevel === 'custom' && rule.pattern) {
      return generateUrlFromCustomPattern(parsed, rule.pattern);
    }
    
    // Determine how many path segments to keep based on match level
    let pathSegmentsToKeep = 0;
    
    switch (matchLevel) {
      case 'domain':
        // Only match the domain, no path segments
        ancestors.push(`${parsed.protocol}//${hostname}`);
        return ancestors;
        
      case 'path1':
        // Match first path segment
        pathSegmentsToKeep = 1;
        break;
        
      case 'path2':
        // Match two path segments
        pathSegmentsToKeep = 2;
        break;
        
      case 'path3':
        // Match three path segments
        pathSegmentsToKeep = 3;
        break;
        
      default:
        // Default case - just consider full path
        logDebug(`Unknown match level ${matchLevel}, using default ancestor generation`);
        return generateAncestorUrls(url);
    }
    
    // Generate ancestor with specified path segments
    if (pathSegmentsToKeep > 0 && pathSegments.length >= pathSegmentsToKeep) {
      const ancestorPath = '/' + pathSegments.slice(0, pathSegmentsToKeep).join('/');
      ancestors.push(`${parsed.protocol}//${hostname}${ancestorPath}`);
    } else {
      // Fallback to domain-only if we couldn't determine path segments
      ancestors.push(`${parsed.protocol}//${hostname}`);
    }
    
    return ancestors;
    
  } catch (error) {
    logError(`Error generating custom ancestors for ${url}:`, error);
    return generateAncestorUrls(url); // Fall back to default method on error
  }
}

// Function to generate URL from custom pattern
function generateUrlFromCustomPattern(parsedUrl, pattern) {
  try {
    const hostname = parsedUrl.hostname;
    const protocol = parsedUrl.protocol;
    const urlAncestors = [];
    
    // If pattern is empty, use domain only
    if (!pattern) {
      urlAncestors.push(`${protocol}//${hostname}`);
      return urlAncestors;
    }
    
    // Check if pattern contains query parameters
    let pathPattern = pattern;
    let queryPattern = '';
    
    if (pattern.includes('?')) {
      [pathPattern, queryPattern] = pattern.split('?');
    }
    
    // Split path segments
    const patternSegments = pathPattern.split('/').filter(Boolean);
    const urlPathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    
    // Create path based on pattern
    let resultPath = '';
    let allSegmentsMatched = true;
    
    if (patternSegments.length > 0) {
      // Build the path based on the pattern
      const resultSegments = [];
      
      for (let i = 0; i < patternSegments.length; i++) {
        const patternSegment = patternSegments[i];
        
        if (patternSegment === '*') {
          // Wildcard - use the actual URL segment if available
          if (i < urlPathSegments.length) {
            resultSegments.push(urlPathSegments[i]);
          } else {
            allSegmentsMatched = false;
            break; // Not enough segments in actual URL
          }
        } else if (patternSegment === '**') {
          // Multi-segment wildcard - grab all remaining segments
          resultSegments.push(...urlPathSegments.slice(i));
          break;
        } else {
          // Literal segment - keep as is
          resultSegments.push(patternSegment);
        }
      }
      
      resultPath = '/' + resultSegments.join('/');
    }
    
    // Handle query parameters
    let resultQuery = '';
    if (queryPattern) {
      // Check if the query pattern contains wildcards
      if (queryPattern.includes('*')) {
        // Query has wildcards - need to replace with actual values
        const queryParams = new URLSearchParams(parsedUrl.search);
        const patternParams = queryPattern.split('&');
        
        const resultParams = [];
        
        for (const paramPattern of patternParams) {
          if (paramPattern.includes('=')) {
            let [paramName, paramValue] = paramPattern.split('=');
            
            if (paramValue === '*' && queryParams.has(paramName)) {
              // Use the actual value from the URL
              resultParams.push(`${paramName}=${queryParams.get(paramName)}`);
            } else {
              // Use the literal value from the pattern
              resultParams.push(paramPattern);
            }
          } else {
            // Just a parameter name without value
            resultParams.push(paramPattern);
          }
        }
        
        resultQuery = resultParams.join('&');
      } else {
        // No wildcards - use the query string as is
        resultQuery = queryPattern;
      }
    }
    
    // Combine everything
    const ancestorUrl = `${protocol}//${hostname}${resultPath}${resultQuery ? '?' + resultQuery : ''}`;
    urlAncestors.push(ancestorUrl);
    
    // Also add the domain-only as a fallback
    if (resultPath !== '/' || resultQuery) {
      urlAncestors.push(`${protocol}//${hostname}`);
    }
    
    return urlAncestors;
  } catch (error) {
    logError(`Error generating URL from pattern for ${parsedUrl.href}:`, error);
    return [`${parsedUrl.protocol}//${parsedUrl.hostname}`]; // Fallback to domain only on error
  }
}

// Generate potential exact match variations for a given URL
function generateExactMatchVariations(url) {
  const variations = new Set();
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      variations.add(url); // Return original if not a standard web URL
      return Array.from(variations);
  }

  try {
    const parsed = new URL(url);
    
    // Base path: pathname without trailing slash (unless it's just "/")
    let path = parsed.pathname;
    if (path !== '/' && path.endsWith('/')) {
        path = path.slice(0, -1);
    }

    // Hostname variations (with/without www)
    const hosts = new Set([parsed.hostname]);
    if (parsed.hostname.startsWith('www.')) {
        hosts.add(parsed.hostname.substring(4));
    } else {
        // Avoid adding www.www if original was www.
        hosts.add(`www.${parsed.hostname}`); 
    }

    // Protocol variations (prefer https)
    const protocols = ['https:', 'http:'];
    
    // Combine variations
    hosts.forEach(host => {
        protocols.forEach(protocol => {
            variations.add(`${protocol}//${host}${path}`);
        });
    });

    // Ensure the original input URL (without fragment) is included if it used a different combo
    variations.add(url.split('#')[0].replace(/\/$/, '') || '/'); // Add original sans fragment/slash
    variations.add(url.split('#')[0]); // Add original sans fragment


  } catch (e) {
    logError("Error generating URL variations for:", url, e);
    variations.add(url); // Fallback to original URL
  }
  
  // Filter out potentially invalid URLs created (e.g., adding www. to an IP or non-standard TLD)
  const validVariations = Array.from(variations).filter(v => v.includes('.'));
  
  return validVariations.length > 0 ? validVariations : [url]; // Return valid ones or fallback
} 