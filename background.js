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

// --- Auto-check tracking variables ---
let autoCheckTimer = null;

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
    // Handle complete page loads (new page is fully loaded)
    if (changeInfo.status === 'complete' && tab.active) {
      logDebug(`Tab updated (complete): ${tab.url}`);
      // Only check cache on tab updates for performance
      checkCurrentUrl(tab.url, true);
      // Set up auto-check timer for the new URL
      resetAutoCheckTimer(tab.id, tab.url);
    }
    // Also handle URL changes that might happen without a full page reload
    // (like single page apps or history.pushState)
    else if (changeInfo.url && tab.active) {
      logDebug(`Tab URL changed: ${changeInfo.url}`);
      // URL changed but page might not be fully loaded yet
      checkCurrentUrl(changeInfo.url, true);
      // Reset the auto-check timer for the new URL
      resetAutoCheckTimer(tab.id, changeInfo.url);
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    logDebug(`Tab activated: ${tab.url}`);
    // Only check cache on tab activation for performance
    checkCurrentUrl(tab.url, true);
    // Set up auto-check timer for the activated tab
    resetAutoCheckTimer(tab.tabId, tab.url);
  });

  // Initial check for the active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    // Only check cache on initialization for performance
    checkCurrentUrl(tabs[0].url, true);
    // Set up auto-check timer for the initial tab
    resetAutoCheckTimer(tabs[0].id, tabs[0].url);
  }
  
  // Set up sync alarm
  setupSyncAlarm();
}

// Reset the auto-check timer when the tab/URL changes
async function resetAutoCheckTimer(tabId, url) {
  logInfo(`Reset Auto-Check Timer Called: tabId=${tabId}, url=${url}`);
  
  // Clear any existing timer
  if (autoCheckTimer !== null) {
    clearTimeout(autoCheckTimer);
    autoCheckTimer = null;
    logDebug('Cleared existing auto-check timer');
  }
  
  // Get user configuration
  const config = await getUserConfig();
  
  // Check if auto-check is enabled
  if (!config.autoCheckEnabled || !config.autoCheckDelay) {
    logDebug('Auto-check disabled or no delay set.');
    return; // Auto-check disabled or no delay set
  }
  
  // Log to verify tab ID is defined at this point
  logInfo(`Auto-check timer starting: Will check in ${config.autoCheckDelay} seconds for tab=${tabId} url=${url}`);
  
  // Use an arrow function which properly captures the enclosing scope
  autoCheckTimer = setTimeout(() => {
    // Immediately create a separate function to handle the actual check
    // This prevents issues with async/await in the timer callback
    const performAutoCheck = async () => {
      try {
        // Log includes the original URL this timer was set for
        logInfo(`Auto-check timer fired (Original URL: ${url})`);
        
        // Get the CURRENT active tab when timer fires
        const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (currentTabs.length === 0) {
          logInfo(`Auto-check canceled: No active tabs found when timer fired.`);
          return;
        }
        const currentActiveTab = currentTabs[0];
        
        // Compare the current active tab's URL with the URL stored when timer was set
        if (currentActiveTab.url !== url) {
          logInfo(`Auto-check canceled: URL has changed (Current: ${currentActiveTab.url}, Original: ${url})`);
          return;
        }
        
        // If URL matches, proceed with checks
        logInfo(`Auto-check: Active tab URL matches original. Proceeding with checks for ${url}`);
        
        // Get the current status and check if we should run
        const { currentTabStatus } = await chrome.storage.local.get('currentTabStatus');
        const state = currentTabStatus?.state || 'GRAY';
        
        // Check if we should proceed based on settings
        let shouldCheck = false;
        
        // Skip if domain is excluded
        if (currentTabStatus?.domainExcluded) {
          logInfo(`Auto-check skipped: Domain is excluded by rules`);
          return;
        }
        
        // Check states against settings
        if (state === 'RED' && config.autoCheckStates?.red) {
          logInfo(`Auto-check proceeding: RED state is enabled for checking`);
          shouldCheck = true;
        } 
        else if (state === 'ORANGE' && config.autoCheckStates?.orange) {
          logInfo(`Auto-check proceeding: ORANGE state is enabled for checking`);
          shouldCheck = true;
        }
        else if (state === 'GREEN' && config.autoCheckStates?.green) {
          logInfo(`Auto-check proceeding: GREEN state is enabled for checking`);
          shouldCheck = true;
        }
        else if (state === 'GRAY') {
          logInfo(`Auto-check proceeding: GRAY state always checks`);
          shouldCheck = true;
        }
        else {
          logInfo(`Auto-check skipped: ${state} state is not enabled for checking`);
          return;
        }
        
        // Perform the API check
        if (shouldCheck) {
          logInfo(`Auto-check: Performing FULL API CHECK for URL: ${url}`);
          // We'll directly check the URL with cacheOnly=false to force API call
          await checkCurrentUrl(url, false);
          logInfo(`Auto-check: API check completed for ${url}`);
        }
      } 
      catch (error) {
        logError(`Error in auto-check:`, error);
      }
    };
    
    // Execute the auto-check function
    performAutoCheck();
    
  }, config.autoCheckDelay * 1000);
}

// Original helper function is kept for reference but not used directly anymore
function shouldPerformAutoCheck(currentTabStatus, config) {
  if (!currentTabStatus) {
    logDebug('Auto-check evaluation: No current status, should check');
    return true; // No status yet, perform check
  }
  
  const currentState = currentTabStatus.state;
  
  // Skip if domain excluded
  if (currentTabStatus.domainExcluded) {
    logDebug('Auto-check skipped - domain excluded');
    return false;
  }
  
  // Skip if error state
  if (currentTabStatus.error) {
    logDebug('Auto-check skipped - in error state');
    return false;
  }
  
  // Check if current state is in the list of states to auto-check
  if (currentState === 'RED' && config.autoCheckStates?.red) {
    logDebug('Auto-check allowed - RED status and red checks enabled');
    return true;
  }
  
  if (currentState === 'ORANGE' && config.autoCheckStates?.orange) {
    logDebug('Auto-check allowed - ORANGE status and orange checks enabled');
    return true;
  }
  
  if (currentState === 'GREEN' && config.autoCheckStates?.green) {
    logDebug('Auto-check allowed - GREEN status and green checks enabled');
    return true;
  }
  
  // Also check for GRAY state - this means we don't know yet, so check
  if (currentState === 'GRAY') {
    logDebug('Auto-check allowed - GRAY status (unknown)');
    return true;
  }
  
  logDebug(`Auto-check skipped - state ${currentState} not enabled for checking`);
  return false; // Default: don't perform check
}

// Refactored function to check URL status with two phases
async function checkCurrentUrl(url, cacheOnly = false) {
  if (!url) {
    logWarn('[URL Check] Received null/empty URL, setting GRAY');
    await setIconState('GRAY', { text: 'No URL available' });
    return;
  }

  // --- Lock Check ---
  if (currentlyCheckingUrls.has(url)) {
    logDebug(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Already checking URL: ${url}. Skipping.`);
    return;
  }
  currentlyCheckingUrls.add(url);
  logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] --- Starting check for URL: ${url} (cacheOnly=${cacheOnly}) ---`);

  // --- Set initial GRAY state while checking ---
  // Set icon to gray immediately ONLY if not cacheOnly, otherwise wait for results
  if (!cacheOnly) {
    await setIconState('GRAY'); 
  }

  try {
    // --- 1. Get Config and Check Domain Rules ---
    logDebug(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Step 1: Getting config and checking domain rules...`);
    const config = await getUserConfig();
    if (!config.integrationToken || !config.databaseId || !config.propertyName) {
      logError('[URL Check] Extension not configured.');
      await setIconState('GRAY', { error: 'Extension not configured.' });
      return; // Exit early if not configured
    }

    const domainRuleInfo = await shouldDoPartialMatching(url);
    if (domainRuleInfo === false) {
      logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] URL excluded by domain rules: ${url}`);
      await setIconState('GRAY', { text: 'URL excluded by domain rules.', domainExcluded: true });
      return; // Exit early if domain is excluded
    }
    const matchOnlySelf = (typeof domainRuleInfo === 'object' && domainRuleInfo.matchOnlySelf) || false;
    logDebug(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Domain rule check complete. matchOnlySelf=${matchOnlySelf}, Rule info:`, domainRuleInfo);

    // --- 2. Generate URLs to Check (Variations + Ancestors/Partials) ---
    logDebug(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Step 2: Generating URL variations and ancestors...`);
    const exactVariations = generateExactMatchVariations(url);
    let ancestorPartials = [];
    if (!matchOnlySelf) {
        if (domainRuleInfo === true) { 
            ancestorPartials = generateAncestorUrls(url); 
        } else if (typeof domainRuleInfo === 'object') { 
            ancestorPartials = generateAncestorsBasedOnRule(new URL(url), domainRuleInfo);
        }
    } else {
        logDebug(`[URL Check] Skipping ancestor/partial generation for ${url} due to matchOnlySelf rule.`);
    }
    const allUrlsToCheck = Array.from(new Set([...exactVariations, ...ancestorPartials]));
    logDebug(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] URLs generated for checking:`, allUrlsToCheck);

    // --- 3. Check Cache --- 
    logDebug(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Step 3: Checking cache for ${allUrlsToCheck.length} URLs...`);
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
            logDebug(`[Cache Result] URL: ${checkUrl} -> Status: ${cacheEntry.status}, Details:`, cacheEntry);
            if (cacheEntry.status === 'GREEN') {
                foundGreen = cacheEntry;
                allRed = false;
                break; // Found exact match, stop cache check
            } else if (cacheEntry.status === 'ORANGE') {
                 if (!foundOrange) foundOrange = cacheEntry; 
                 cacheEntry.matchingUrls?.forEach(u => foundMatchingUrls.add(u));
                 allRed = false;
            } else if (cacheEntry.status === 'RED') {
                 // Stays allRed = true if this is the only type found
            }
        } else {
             logDebug(`[Cache Result] URL: ${checkUrl} -> MISS/EXPIRED`);
             needsApiCheck = true;
             allRed = false; // If there's a miss, it's not ALL red
        }
    }
    logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Cache check summary: foundGreen=${!!foundGreen}, foundOrange=${!!foundOrange}, allRed=${allRed}, needsApiCheck=${needsApiCheck}`);

    // --- 4. Determine Action Based on Cache Results --- 
    logDebug(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] Step 4: Determining action based on cache...`);
    
    // For cacheOnly=true, use the cache results and return
    if (cacheOnly) {
      if (foundGreen) {
        logInfo(`[CacheOnly] Cache sufficient: Found GREEN. Setting icon.`);
        await setIconState('GREEN', { notionPageUrl: foundGreen.notionPageUrl }); 
        const cacheDetailsForVariations = { 
            canonicalUrl: foundGreen.canonicalUrl, 
            notionPageUrl: foundGreen.notionPageUrl 
        };
        const updatePromises = exactVariations.map(v => updateCache(v, 'GREEN', cacheDetailsForVariations));
        await Promise.all(updatePromises);
        logDebug(`[CacheOnly] Updated cache for exact variations.`);
        return; // --- EXIT POINT (GREEN from cache) --- 
      }
      
      // Check for Orange ONLY if Green wasn't found
      if (foundOrange) {
        const finalMatchingUrls = Array.from(foundMatchingUrls);
        logInfo(`[CacheOnly] Cache sufficient: Found ORANGE. Setting icon. Matches:`, finalMatchingUrls);
        await setIconState('ORANGE', { matchingUrls: finalMatchingUrls });
        return; // --- EXIT POINT (ORANGE from cache) --- 
      }
      
      // Check for All Red ONLY if Green and Orange weren't found
      if (allRed && !foundOrange) {
        logInfo(`[CacheOnly] Cache sufficient: All variations/ancestors cached as RED. Setting icon.`);
        await setIconState('RED');
        return; // --- EXIT POINT (RED from cache) --- 
      }

      // Cache was inconclusive, try aggressive check or set GRAY
      logDebug(`[CacheOnly] Cache inconclusive, and cacheOnly is true.`);
      if (config.aggressiveCachingEnabled) {
        logInfo("[CacheOnly][Aggressive] Performing aggressive check against full cache...");
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
                return; // --- EXIT POINT (Aggressive RED) ---
           }

           let aggressiveMatchFound = false;
           const aggressiveMatchingUrls = new Set();

           const urlsToCheckAggressively = [...exactVariations];
           if (domainRuleInfo.allowsPartials) {
               try {
                   const parsedUrl = new URL(url);
                   const currentUrlAncestors = generateAncestorsBasedOnRule(parsedUrl, domainRuleInfo);
                   urlsToCheckAggressively.push(...currentUrlAncestors);
               } catch(e) {
                    logError("[CacheOnly][Aggressive] Error parsing URL or generating ancestors:", e);
               }
           }
           const uniqueUrlsToCheckAggressively = Array.from(new Set(urlsToCheckAggressively));
           logDebug("[CacheOnly][Aggressive] URLs to check aggressively:", uniqueUrlsToCheckAggressively);

           for (const cachedGreenUrl of validGreenUrls) {
               try {
                   const parsedCachedGreen = new URL(cachedGreenUrl);
                   for (const checkUrl of uniqueUrlsToCheckAggressively) {
                       try {
                           const parsedCheckUrl = new URL(checkUrl);
                           if (domainRuleInfo.allowsPartials && 
                               parsedCheckUrl.hostname === parsedCachedGreen.hostname &&
                               parsedCachedGreen.pathname.startsWith(parsedCheckUrl.pathname)) {
                               if (parsedCheckUrl.href !== parsedCachedGreen.href) {
                                   logDebug(`[CacheOnly][Aggressive] Partial match found: ${url} (via ${checkUrl}) matches prefix of cached GREEN ${cachedGreenUrl}`);
                                   aggressiveMatchFound = true;
                                   aggressiveMatchingUrls.add(cachedGreenUrl);
                               }
                           }
                       } catch (parseError) {
                           logWarn(`[CacheOnly][Aggressive] Error parsing checkUrl "${checkUrl}":`, parseError);
                           continue;
                       }
                   }
               } catch (e) {
                   logWarn("[CacheOnly][Aggressive] Error parsing URL during aggressive check:", e);
               } 
           }

           if (aggressiveMatchFound) {
               const finalMatches = Array.from(aggressiveMatchingUrls);
               logInfo("[CacheOnly][Aggressive] Final state: ORANGE. Setting icon. Matches:", finalMatches);
               await updateCache(url, 'ORANGE', { matchingUrls: finalMatches });
               await setIconState('ORANGE', { matchingUrls: finalMatches });
           } else {
               logInfo("[CacheOnly][Aggressive] Final state: RED (no matches found). Setting icon.");
               await updateCache(url, 'RED');
               await setIconState('RED');
           }

        } catch (error) {
           logError("[CacheOnly][Aggressive] Error during aggressive cache check:", error);
           await setIconState('GRAY', { text: 'Aggressive cache check failed. Click icon.' });
        }
      } else {
        // ... existing inconclusive logic
        if (foundOrange) {
          const finalMatchingUrls = Array.from(foundMatchingUrls);
          logInfo(`[CacheOnly] Cache inconclusive, aggressive OFF. Found ORANGE in cache. Setting icon. Matches:`, finalMatchingUrls);
          await setIconState('ORANGE', { matchingUrls: finalMatchingUrls });
        } else {
          logInfo(`[CacheOnly] Cache inconclusive, aggressive OFF. Setting GRAY.`);
          await setIconState('GRAY', { text: 'Cached status unclear. Click icon to check Notion.' });
        }
      }
      return; // --- EXIT POINT (CacheOnly inconclusive handled) --- 
    }
    
    // For cacheOnly=false, ALWAYS proceed to check the API regardless of cache
    // but temporarily set the state based on cache results while API check is in progress
    if (!cacheOnly) {
      logInfo(`[API Check] Manual refresh requested (cacheOnly=false). Will check API regardless of cache.`);
      
      // Set temporary icon state based on cache results while API is being queried
      if (foundGreen) {
        logDebug(`[API Check] Temporarily using GREEN from cache while checking API...`);
        await setIconState('GREEN', { 
          notionPageUrl: foundGreen.notionPageUrl,
          text: 'Checking with Notion...' 
        });
      } else if (foundOrange) {
        logDebug(`[API Check] Temporarily using ORANGE from cache while checking API...`);
        await setIconState('ORANGE', { 
          matchingUrls: Array.from(foundMatchingUrls),
          text: 'Checking with Notion...' 
        });
      } else if (allRed) {
        logDebug(`[API Check] Temporarily using RED from cache while checking API...`);
        await setIconState('RED', { text: 'Checking with Notion...' });
      } else {
        // Cache was inconclusive
        logDebug(`[API Check] Setting GRAY while checking API...`);
        await setIconState('GRAY', { text: 'Checking with Notion...' });
      }
    }

    // --- 5. Perform API Check (only if cacheOnly is false and cache was inconclusive) --- 
    // Now it's for all cacheOnly=false cases, not just inconclusive ones
    logInfo(`[API Check] Step 5: Proceeding with API calls for manual refresh.`);
    await setIconState('GRAY'); // Ensure icon is Gray during API check

    try {
        // 5a. Check Exact Variations via API
        logDebug("[API Check] Querying API for exact variations:", exactVariations);
        const exactApiResultPages = await queryNotionForMultipleUrls(exactVariations, config);
        logInfo(`[API Check] Exact API query returned ${exactApiResultPages.length} result(s).`);

        if (exactApiResultPages.length > 0) {
            // --- Exact Match Found via API --- 
            const firstMatch = exactApiResultPages[0];
            const canonicalUrlFromApi = firstMatch.properties[config.propertyName]?.url || exactVariations[0]; // Fallback needed?
            const notionPageUrl = firstMatch.url;
            logInfo(`[API Check] Final state: GREEN (found via API: ${canonicalUrlFromApi}). Notion URL: ${notionPageUrl}. Setting icon.`);
            
            await setIconState('GREEN', { notionPageUrl: notionPageUrl }); 
            const cacheDetails = { 
              canonicalUrl: canonicalUrlFromApi, 
              notionPageUrl: notionPageUrl 
            };
            const updatePromises = exactVariations.map(v => updateCache(v, 'GREEN', cacheDetails));
            await Promise.all(updatePromises);
            logDebug(`[API Check] Updated cache for exact variations as GREEN.`);
            return; // --- EXIT POINT (GREEN from API) --- 
        } else {
            logInfo("[API Check] No exact matches found via API. Caching exact variations as RED.");
            // Cache *exact variations* as RED since API confirmed they aren't present
            try {
                const { urlCache = {} } = await chrome.storage.local.get('urlCache');
                let changed = false;
                for (const variation of exactVariations) {
                    if (!urlCache[variation] || urlCache[variation].status !== 'RED') {
                        urlCache[variation] = { status: 'RED', timestamp: Date.now() };
                        changed = true;
                    }
                }
                if (changed) {
                    await chrome.storage.local.set({ urlCache });
                    logDebug("[API Check] Bulk updated exact variations cache to RED.");
                } else {
                    logDebug("[API Check] Exact variations already cached as RED.");
                }
            } catch(cacheError) {
                 logError("[API Check] Error bulk updating exact variations cache to RED:", cacheError);
            }
        }

        // 5b. Check Ancestors/Partials via API (only if no exact match found AND !matchOnlySelf)
        let partialCheckPerformed = false;
        if (!matchOnlySelf && ancestorPartials.length > 0) {
             partialCheckPerformed = true;
             logDebug("[API Check] Querying API for ancestors/partials:", ancestorPartials);
             const partialApiResultPages = await queryNotionForMultipleUrls(ancestorPartials, config);
             logInfo(`[API Check] Partial API query returned ${partialApiResultPages.length} result(s).`);

             if (partialApiResultPages.length > 0) {
                 // --- Partial/Ancestor Match Found via API --- 
                 const partialMatchingUrls = partialApiResultPages.map(p => p.properties[config.propertyName]?.url).filter(Boolean);
                 logInfo(`[API Check] Final state: ORANGE (found ${partialMatchingUrls.length} ancestors/partials via API). Setting icon. Matches:`, partialMatchingUrls);
                 
                 await setIconState('ORANGE', { matchingUrls: partialMatchingUrls });
                 await updateCache(url, 'ORANGE', { matchingUrls: partialMatchingUrls });
                 // Update cache for the *found* ancestor URLs as GREEN
                 const updatePromises = partialMatchingUrls.map(foundUrl => { 
                   const page = partialApiResultPages.find(p => p.properties[config.propertyName]?.url === foundUrl);
                   return updateCache(foundUrl, 'GREEN', { canonicalUrl: foundUrl, notionPageUrl: page?.url });
                 });
                 await Promise.all(updatePromises);
                 logDebug(`[API Check] Updated cache for original URL as ORANGE and found ancestors as GREEN.`);
                 return; // --- EXIT POINT (ORANGE from API) --- 
             } else {
                 logInfo("[API Check] No ancestors/partials found via API. Caching checked ancestors/partials as RED.");
                 // Cache checked *ancestors/partials* as RED
                 try {
                    const { urlCache = {} } = await chrome.storage.local.get('urlCache');
                    let changed = false;
                    for (const ancestor of ancestorPartials) {
                         if (!urlCache[ancestor] || urlCache[ancestor].status !== 'RED') {
                             urlCache[ancestor] = { status: 'RED', timestamp: Date.now() };
                             changed = true;
                         }
                    }
                    if (changed) {
                         await chrome.storage.local.set({ urlCache });
                         logDebug("[API Check] Bulk updated ancestors/partials cache to RED.");
                    } else {
                         logDebug("[API Check] Ancestors/partials already cached as RED.");
                    }
                 } catch(cacheError) {
                     logError("[API Check] Error bulk updating ancestor/partial cache to RED:", cacheError);
                 }
             }
        } else if (matchOnlySelf) {
             logInfo("[API Check] Skipping ancestor/partial API check due to matchOnlySelf=true.");
        } else {
             logInfo("[API Check] Skipping ancestor/partial API check as no ancestorPartials were generated.");
        }

        // 5c. No Matches Found via API (Exact or Partial)
        // This state is reached if exact check failed AND (partial check failed OR partial check was skipped)
        logInfo(`[API Check] Final state: RED (no matches found in API). Setting icon.`);
        await setIconState('RED');
        // Caching as RED happened above for variations/ancestors if they were checked
        // Ensure the *original URL* is also cached as RED if it wasn't already
        await updateCache(url, 'RED'); 
        return; // --- EXIT POINT (RED from API) --- 

    } catch (error) {
        logError('[API Check] Error during Notion API query:', error);
        let errorText = `API Error: ${error.message || 'Unknown'}`;
        let needsReauth = false;
        if (error.status === 401) {
            errorText = 'Notion Authentication Failed.';
            needsReauth = true;
            await chrome.storage.local.remove(['integrationToken', 'accessToken']); // Clear potentially bad token
            await chrome.storage.local.set({ needsAuthentication: true }); // Signal popup
        }
        await setIconState('GRAY', { error: errorText, needsAuthentication: needsReauth });
        return; // Stop processing on API error
    }

  } catch (error) {
    logError(`[URL Check] Unhandled error during checkCurrentUrl for ${url}:`, error);
    await setIconState('GRAY', { error: `Error: ${error.message || 'Unknown error'}` });
  } finally {
    currentlyCheckingUrls.delete(url);
    logInfo(`[${cacheOnly ? 'CacheOnly' : 'API Check'}] --- Finished check for URL: ${url} ---`);
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
    'logLevel',
    'autoCheckEnabled',
    'autoCheckDelay',
    'autoCheckStates'
  ]);
  
  return {
    integrationToken: result.integrationToken,
    databaseId: result.databaseId,
    propertyName: result.propertyName,
    cacheDuration: typeof result.cacheDuration === 'number' ? result.cacheDuration : 60,
    lastEditedPropertyName: result.lastEditedPropertyName,
    aggressiveCachingEnabled: result.aggressiveCachingEnabled || false,
    logLevel: result.logLevel || 'INFO',
    autoCheckEnabled: result.autoCheckEnabled || false,
    autoCheckDelay: result.autoCheckDelay || 10, // Default: 10 seconds
    autoCheckStates: result.autoCheckStates || { red: true, orange: true } // Default: check red and orange
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
            await updateCache(url, 'GREEN', { 
              canonicalUrl: url,
              notionPageUrl: page.url  // Store the Notion page URL for linking
            });
            updatedCount++;
          
            // Also update cache for URL variations
            const variations = generateExactMatchVariations(url);
            for (const variation of variations) {
                // Update variations, ensuring canonicalUrl points to the found URL
                await updateCache(variation, 'GREEN', { 
                  canonicalUrl: url,
                  notionPageUrl: page.url  // Store the Notion page URL for variations too
                });
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
          await updateCache(url, 'GREEN', { 
            canonicalUrl: url,
            notionPageUrl: page.url  // Store the Notion page URL for linking
          });
          updatedCount++;
          
          // Also update cache for URL variations
          const variations = generateExactMatchVariations(url);
          for (const variation of variations) {
              await updateCache(variation, 'GREEN', { 
                canonicalUrl: url,
                notionPageUrl: page.url  // Store the Notion page URL for variations too
              });
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

// Listen for settings changes to apply them immediately
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    const relevantChanges = [
      'autoCheckEnabled', 
      'autoCheckDelay', 
      'autoCheckStates'
    ];
    
    // Check if any auto-check settings changed
    const hasAutoCheckChanges = relevantChanges.some(key => changes[key]);
    
    if (hasAutoCheckChanges) {
      logInfo('Auto-check settings changed, applying immediately');
      
      // Re-check the current tab with the new settings
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          resetAutoCheckTimer(tabs[0].id, tabs[0].url);
        }
      });
    }
  }
});

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
        // After the check completes, consider resetting the auto-check timer
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs.length > 0 && tabs[0].url === message.url) {
            const config = await getUserConfig();
            // Only reset the auto-check timer if auto-check is enabled
            if (config.autoCheckEnabled) {
              // Start a fresh timer with full delay
              logInfo('Manual refresh completed. Resetting auto-check timer with full delay.');
              resetAutoCheckTimer(tabs[0].id, tabs[0].url);
            } else {
              logDebug('Auto-check disabled, not resetting timer after manual check');
            }
          }
        });
        
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
    let parsedUrlObject = null; // Store the parsed URL object
    
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
          // Determine if partials are allowed based on the match level
          const allowsPartials = matchingProtocolRule.matchLevel.endsWith('_partials') || matchingProtocolRule.matchLevel === 'domain_partials';
          return { 
              matchLevel: matchingProtocolRule.matchLevel, 
              rule: matchingProtocolRule,
              allowsPartials: allowsPartials
          }; 
        }
        
        // If we get here, no specific rule for the protocol, try normal URL parsing
        if (!domainForCheck && (protocol === 'http' || protocol === 'https')) {
          try {
            const parsedUrl = new URL(url);
            domainForCheck = parsedUrl.hostname;
            parsedUrlObject = parsedUrl; // Store parsed object
          } catch (error) { 
            logError(`Error parsing URL: ${url}`, error);
            domainForCheck = hostname || ''; // Use extracted hostname if parsing fails
          }
        } else if (!domainForCheck) {
            // Fallback if still no domain (e.g., data: or other non-standard URLs)
            domainForCheck = protocol || hostname;
        }
      }
    } else {
      // Fallback to standard URL parsing
      try {
        const parsedUrl = new URL(url);
        domainForCheck = parsedUrl.hostname;
        parsedUrlObject = parsedUrl; // Store parsed object
      } catch (error) {
        logError(`Cannot parse URL: ${url}`, error);
        return true; // Default to true on error
      }
    }
    
    const domainRules = await getDomainExclusionRules();
    
    // Find the first matching rule for this hostname/protocol
    const matchingRule = domainRules.find(rule => {
      // Normalize rule domain for comparison
      const ruleDomainLower = rule.domain?.toLowerCase();
      if (!ruleDomainLower) return false;
      
      // Check exact match or if domain includes the rule domain (e.g., subdomains)
      return domainForCheck === ruleDomainLower || 
             (domainForCheck && domainForCheck.endsWith('.' + ruleDomainLower)); // More robust subdomain check
    });
    
    if (!matchingRule) {
      logDebug(`No domain rule found for ${domainForCheck}, using default (domain_partials)`);
      return { 
          matchLevel: 'domain_partials', 
          rule: null, 
          allowsPartials: true 
      }; // Default: Domain matching with partials
    }
    
    // If match level is 'disabled', no matching at all
    if (matchingRule.matchLevel === 'disabled') {
      logDebug(`Matching disabled for ${domainForCheck} by rule:`, matchingRule);
      return false;
    }
    
    // Determine if partials are allowed based on the match level name
    const allowsPartials = matchingRule.matchLevel.endsWith('_partials') || matchingRule.matchLevel === 'domain_partials';

    logDebug(`Using custom matching rule for ${domainForCheck} (allowsPartials=${allowsPartials}):`, matchingRule);
    return {
      matchLevel: matchingRule.matchLevel,
      rule: matchingRule,
      allowsPartials: allowsPartials
    };
    
  } catch (error) {
    logError(`Error checking domain rules for ${url}:`, error);
    // Default to domain_partials with partials allowed on error?
    return { 
        matchLevel: 'domain_partials', 
        rule: null, 
        allowsPartials: true 
    };
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

// New function to generate ancestor URLs based on the specific rule
function generateAncestorsBasedOnRule(parsedUrl, matchingInfo) {
  const { matchLevel, rule } = matchingInfo;
  const ancestors = [];
  const hostname = parsedUrl.hostname;
  const protocol = parsedUrl.protocol;

  // If partials are not allowed by the rule level, return empty
  if (!matchingInfo.allowsPartials) {
    return [];
  }

  try {
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

    switch (matchLevel) {
      case 'exact_url': // Should not happen if allowsPartials is false, but handle defensively
      case 'custom_exact': // Should not happen if allowsPartials is false
        return []; // No ancestors for exact matches

      case 'domain_partials':
        // Only include the domain itself as the "ancestor"
        ancestors.push(`${protocol}//${hostname}`);
        break;

      case 'path1_partials':
      case 'path2_partials':
      case 'path3_partials':
        const level = parseInt(matchLevel.charAt(4)); // Extract 1, 2, or 3
        // Add ancestors from the specified level up to the domain
        for (let i = level; i >= 0; i--) {
          if (pathSegments.length >= i) {
            const ancestorPath = (i > 0) ? ('/' + pathSegments.slice(0, i).join('/')) : ''; // Empty path for domain level
            ancestors.push(`${protocol}//${hostname}${ancestorPath}`);
          }
        }
        break;

      case 'custom_partials':
        if (rule?.pattern) {
          // Use the pattern-based generator for custom partials
          return generateUrlFromCustomPattern(parsedUrl, rule.pattern);
        } else {
          // Fallback to domain if pattern is missing (shouldn't happen)
          logWarn(`Custom_partials rule for ${hostname} is missing a pattern.`);
          ancestors.push(`${protocol}//${hostname}`);
        }
        break;

      default:
        // Fallback for unknown partial levels: domain only
        logWarn(`Unknown partial matchLevel '${matchLevel}', falling back to domain ancestor.`);
        ancestors.push(`${protocol}//${hostname}`);
        break;
    }
  } catch (error) {
    logError(`Error generating ancestors for ${parsedUrl.href} with rule ${matchLevel}:`, error);
    // Fallback to domain only on error
    ancestors.push(`${protocol}//${hostname}`);
  }

  // Return unique ancestors
  return Array.from(new Set(ancestors));
}

// Old function, kept for reference or potential fallback, but should be replaced
async function generateCustomAncestorUrls(url, matchingInfo) {
  // THIS FUNCTION IS LARGELY REPLACED BY generateAncestorsBasedOnRule
  // Kept temporarily for careful review / migration if needed
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
    if (matchLevel === 'custom' && rule.pattern) { // NOTE: Old 'custom' level
      return generateUrlFromCustomPattern(parsed, rule.pattern);
    }
    
    // Determine how many path segments to keep based on match level
    let pathSegmentsToKeep = 0;
    
    switch (matchLevel) { // NOTE: References old levels
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
        // return generateAncestorUrls(url); // Recursive call risk
        return [`${parsed.protocol}//${parsed.hostname}`]; // Safer default
    }
    
    // Generate ancestor with specified path segments
    if (pathSegmentsToKeep > 0 && pathSegments.length >= pathSegmentsToKeep) {
      const ancestorPath = '/' + pathSegments.slice(0, pathSegmentsToKeep).join('/');
      ancestors.push(`${parsed.protocol}//${hostname}${ancestorPath}`);
    } else {
      // Fallback to domain-only if we couldn't determine path segments
      ancestors.push(`${parsed.protocol}//${parsed.hostname}`);
    }
    
    return ancestors;
    
  } catch (error) {
    logError(`Error generating custom ancestors for ${url}:`, error);
    // return generateAncestorUrls(url); // Recursive call risk
    return [`${new URL(url).protocol}//${new URL(url).hostname}`]; // Safer fallback
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