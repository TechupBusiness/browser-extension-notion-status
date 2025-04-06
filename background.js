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

// --- Simple Locking Mechanism ---
const currentlyCheckingUrls = new Set();
const SYNC_ALARM_NAME = 'notion-status-sync';

// Initialize the extension
async function init() {
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

// Check if the URL is in Notion database (handles variations and partial matches)
async function checkCurrentUrl(url, cacheOnly = false) {
  if (!url || url.startsWith('chrome://') || url.startsWith('about:')) {
    // Consider setting a default GRAY state for inactive tabs
    // await setIconState('GRAY', [], 'Inactive URL');
    return;
  }

  // --- Lock Check ---
  if (currentlyCheckingUrls.has(url)) {
    console.log(`Already checking URL: ${url}. Skipping duplicate check.`);
    return;
  }

  currentlyCheckingUrls.add(url);
  console.log(`Starting check for URL: ${url}. Lock acquired. Cache only: ${cacheOnly}`);

  try {
    // Get user configuration
    const config = await getUserConfig();
    if (!config.integrationToken || !config.databaseId || !config.propertyName) {
      setIconState('GRAY');
      await chrome.storage.local.set({ currentTabStatus: { state: 'GRAY', error: 'Extension not configured.' } });
      return;
    }

    // --- Set icon to GRAY immediately while checking ---
    await setIconState('GRAY', [], 'Checking status...'); 

    const variations = generateExactMatchVariations(url);
    let canonicalUrlForGreen = null;
    let allVariationsCachedRed = true;
    const variationsToCheckApi = [];

    // --- 1. Check Cache for all variations ---
    const cachePromises = variations.map(v => checkCache(v, config.cacheDuration));
    const cacheResults = await Promise.all(cachePromises);
    
    for (let i = 0; i < variations.length; i++) {
      const variation = variations[i];
      const cacheEntry = cacheResults[i];

      if (cacheEntry?.isPresent) {
          console.log(`Exact match found in cache for variation: ${variation}`);
          canonicalUrlForGreen = cacheEntry.canonicalUrl || variation; // Use stored canonical, fallback to variation
          setIconState('GREEN');

          // Only update cache entries that need it (missing or wrong canonical)
          const variationsToUpdate = [];
          for (let j = 0; j < variations.length; j++) {
            const otherVariation = variations[j];
            const otherCacheEntry = cacheResults[j];
            // Update if: entry is missing, expired, or has wrong canonical URL
            if (!otherCacheEntry || 
                otherCacheEntry.isPresent !== true || 
                otherCacheEntry.canonicalUrl !== canonicalUrlForGreen) {
              variationsToUpdate.push(otherVariation);
            }
          }
          
          if (variationsToUpdate.length > 0) {
            console.log(`Updating ${variationsToUpdate.length} variation cache entries with canonical URL: ${canonicalUrlForGreen}`);
            const updatePromises = variationsToUpdate.map(v => updateCache(v, true, canonicalUrlForGreen));
            await Promise.all(updatePromises);
          } else {
            console.log(`All cache entries are up-to-date, no updates needed`);
          }
          
          return; // Found GREEN in cache, exit
      } else if (cacheEntry === null) {
          allVariationsCachedRed = false; // At least one variation needs API check
          variationsToCheckApi.push(variation);
      }
      // If cacheEntry.isPresent is false, it contributes to allVariationsCachedRed = true
    }

    // If cache-only mode is enabled, and we need API calls, set to gray and exit
    if (cacheOnly && variationsToCheckApi.length > 0) {
      console.log(`Cache-only mode active and API check needed for exact matches. Checking for ancestor matches in cache...`);
      
      // Before giving up, check if any ancestors are in the cache
      const ancestors = generateAncestorUrls(url);
      if (ancestors.length > 0) {
        console.log("Checking ancestors in cache:", ancestors);
        const ancestorCachePromises = ancestors.map(a => checkCache(a, config.cacheDuration));
        const ancestorCacheResults = await Promise.all(ancestorCachePromises);
        
        const matchingUrls = [];
        for (let i = 0; i < ancestors.length; i++) {
          const ancestor = ancestors[i];
          const cacheEntry = ancestorCacheResults[i];
          
          if (cacheEntry?.isPresent) {
            const canonicalAncestorUrl = cacheEntry.canonicalUrl || ancestor;
            console.log(`Ancestor match found in cache: ${ancestor} -> ${canonicalAncestorUrl}`);
            matchingUrls.push(canonicalAncestorUrl);
          }
        }
        
        if (matchingUrls.length > 0) {
          console.log(`Found ${matchingUrls.length} ancestor matches in cache. Setting ORANGE state.`);
          await setIconState('ORANGE', matchingUrls);
          return;
        }
      }
      
      // No exact matches or ancestor matches in cache, set to gray
      await setIconState('GRAY', [], 'Cached status unavailable. Click icon to check.');
      return;
    }

    // --- 2. Check API if necessary (if not found in cache and not all cached RED) ---
    if (!allVariationsCachedRed && variationsToCheckApi.length > 0) {
        console.log("Cache inconclusive, querying API for variations:", variationsToCheckApi);
        try {
            // --- Use a single compound 'or' filter query ---
            const apiResultPages = await queryNotionForMultipleUrls(variationsToCheckApi, config);

            if (apiResultPages.length > 0) {
                // --- Exact Match Found via API ---
                console.log(`Exact match found via API for at least one variation.`);
                // Extract canonical URL from the first result (Notion doesn't guarantee order, but it's an existing URL)
                canonicalUrlForGreen = apiResultPages[0]?.properties?.[config.propertyName]?.url || variationsToCheckApi[0]; 
                
                setIconState('GREEN');
                // Cache all variations *originally checked via API* as GREEN
                const updatePromises = variationsToCheckApi.map(v => updateCache(v, true, canonicalUrlForGreen));
                await Promise.all(updatePromises);
                return; // Found GREEN via API, exit
            } else {
                // --- No Exact Match Found via API ---
                console.log(`No exact matches found via API for variations:`, variationsToCheckApi);
                // Cache all variations *checked via API* as RED
                const updatePromises = variationsToCheckApi.map(v => updateCache(v, false));
                await Promise.all(updatePromises);
                // Now proceed to partial matches check
            }
        } catch (error) {
            // Handle API errors during the check loop
            console.error('Error checking variations in Notion API:', error);
            if (error.status === 401) {
                await chrome.storage.local.remove(['accessToken']); // Or integrationToken based on auth method? Needs refinement.
                await chrome.storage.local.set({ needsAuthentication: true }); // Signal popup
                setIconState('GRAY', [], `API Auth Error: ${error.message}`); 
            } else {
                setIconState('GRAY', [], `API Error: ${error.message}`);
            }
            return; // Stop processing on API error
        }
    } else if (allVariationsCachedRed) {
        console.log("All variations were found cached as RED.");
        // Proceed to check partials/ancestors
    } else {
        // This case should theoretically not be reached if logic is sound
         console.warn("Reached unexpected state after cache check, proceeding to partials.");
    }

    // If cache-only mode is enabled, skip partial/ancestor checks too
    if (cacheOnly) {
      console.log(`Cache-only mode active, skipping API-based partial/ancestor checks for: ${url}`);
      // Set RED state since all exact matches were ruled out and ancestor checks already performed above
      setIconState('RED');
      return;
    }

    // --- 3. No Exact Match Found (API checks completed or all cached RED) ---
    // Proceed to check partials and ancestors ONLY if no exact match was found
    console.log("No exact match found. Checking partials/ancestors.");
    await checkPartialAndAncestorMatches(url, config);

  } catch (error) {
    // General error handler for the entire check process
    console.error(`Unhandled error during checkCurrentUrl for ${url}:`, error);
    await setIconState('GRAY', [], `Error: ${error.message || 'Unknown error'}`);
  } finally {
    // --- Release Lock ---
    currentlyCheckingUrls.delete(url);
    console.log(`Finished check for URL: ${url}. Lock released.`);
  }
}

async function checkPartialAndAncestorMatches(originalUrl, config) {
    const partialMatchingInfo = await shouldDoPartialMatching(originalUrl);
    if (partialMatchingInfo === false) {
        // Partial matching is disabled for this domain
        console.log("Partial matching disabled for this domain. Setting RED state.");
        setIconState('RED', [], null, true); // Set domainExcluded flag to true
        return;
    }
    
    const checkedApiForAncestors = new Set(); // Track ancestors checked in *this* phase
    let foundPartialMatch = false;
    let partialMatchingUrls = new Set();

    // --- 4a. Check Ancestor Paths ---
    let ancestors = [];
    
    if (typeof partialMatchingInfo === 'object') {
        // Use custom ancestor generation based on match level
        ancestors = await generateCustomAncestorUrls(originalUrl, partialMatchingInfo);
        console.log("Using custom ancestor generation:", ancestors);
    } else {
        // Use default ancestor generation
        ancestors = generateAncestorUrls(originalUrl);
        console.log("Using default ancestor generation:", ancestors);
    }
    
    if (ancestors.length === 0) {
        console.log("No ancestors to check, setting RED state");
        setIconState('RED');
        return;
    }
    
    const ancestorsToCheckApi = [];
    const ancestorCachePromises = ancestors.map(a => checkCache(a, config.cacheDuration));
    const ancestorCacheResults = await Promise.all(ancestorCachePromises);

    for (let i = 0; i < ancestors.length; i++) {
        const ancestor = ancestors[i];
        const cacheEntry = ancestorCacheResults[i];
        
        if (cacheEntry?.isPresent) {
            const canonicalAncestorUrl = cacheEntry.canonicalUrl || ancestor;
            console.log(`Ancestor match found in cache: ${ancestor} -> ${canonicalAncestorUrl}`);
            foundPartialMatch = true;
            partialMatchingUrls.add(canonicalAncestorUrl);
        } else if (cacheEntry === null) {
            ancestorsToCheckApi.push(ancestor);
        }
    }

    // Batch query ancestors needing API check
    if (ancestorsToCheckApi.length > 0) {
        console.log("Querying API for ancestors:", ancestorsToCheckApi);
        try {
            const ancestorApiResults = await queryNotionForMultipleUrls(ancestorsToCheckApi, config);
            ancestorApiResults.forEach(page => {
                const actualUrl = page?.properties?.[config.propertyName]?.url;
                if (actualUrl) {
                    console.log(`Ancestor match found via API: -> ${actualUrl}`);
                    foundPartialMatch = true;
                    partialMatchingUrls.add(actualUrl);
                    // Cache the *specific variation(s)* that matched this result (tricky without knowing which one triggered it)
                    // For simplicity, cache all checked ancestors that *could* match this page? Or just the actualUrl? Caching actualUrl is safer.
                    updateCache(actualUrl, true, actualUrl); // Cache the canonical URL found
                }
            });

            // Cache ancestors that were checked and returned no results as RED
            const foundAncestorUrlsInApi = new Set(ancestorApiResults.map(p => p?.properties?.[config.propertyName]?.url).filter(Boolean));
            const updatePromises = ancestorsToCheckApi
                .filter(ancestor => !foundAncestorUrlsInApi.has(ancestor)) // Filter out those confirmed present
                .map(ancestor => updateCache(ancestor, false));
            await Promise.all(updatePromises);

        } catch (error) {
             console.error(`Error checking ancestors in Notion API:`, error);
             if (error.status === 401) {
                 await chrome.storage.local.remove(['accessToken']);
                 await chrome.storage.local.set({ needsAuthentication: true });
                 setIconState('GRAY', [], `API Auth Error: ${error.message}`);
                 return; // Stop if auth error during ancestor check
            } // Don't stop for other non-critical errors during partial check
        }
    }

    // --- 4b. Check for Neighboring Pages (Original Partial Check) ---
    // Only do neighbor matching if it's enabled for this domain
    let neighborMatches = [];
    
    // Skip neighbor matching for custom match levels unless it's set to domain
    const shouldDoNeighborMatching = typeof partialMatchingInfo !== 'object' || 
                                   partialMatchingInfo.matchLevel === 'domain' || 
                                   partialMatchingInfo.matchLevel === 'subdomain';
    
    if (shouldDoNeighborMatching) {
        try {
            const parsedUrl = new URL(originalUrl);
            // Use a less specific prefix for broader neighbor search? Or keep as is? Let's keep parent path.
            const parentPathPrefix = parsedUrl.pathname.length > 1 ? 
                                `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.pathname.substring(0, parsedUrl.pathname.lastIndexOf('/') + 1)}` :
                                `${parsedUrl.protocol}//${parsedUrl.hostname}/`;

            console.log(`Checking for neighboring pages with prefix: ${parentPathPrefix}`);
            // This still uses a separate API call, could potentially be combined if API supported complex filters like (OR exact_matches) OR (starts_with neighbor_prefix)
            // But let's keep it separate for now.
            neighborMatches = await queryNotionForPartialUrl(parentPathPrefix, config); 

        } catch (urlError) {
            console.error("Error parsing URL for neighbor match:", urlError);
        }

        if (neighborMatches.length > 0) {
            // Extract canonical URLs from neighbor results
            const neighborUrls = neighborMatches.map(page => page.properties[config.propertyName]?.url).filter(Boolean);
            if (neighborUrls.length > 0) {
                console.log(`Found ${neighborUrls.length} neighboring pages.`);
                foundPartialMatch = true;
                neighborUrls.forEach(u => partialMatchingUrls.add(u));
                // Optionally cache these neighbors? Could lead to large cache.
            }
        }
    } else {
        console.log("Skipping neighbor matching due to domain rule settings");
    }

    // --- 5. Set Final State (ORANGE or RED) ---
    if (foundPartialMatch) {
        const allMatchingUrls = Array.from(partialMatchingUrls);
        console.log(`Setting ORANGE state with URLs:`, allMatchingUrls);
        setIconState('ORANGE', allMatchingUrls);
    } else {
        console.log("No ancestor or neighbor matches found. Setting RED state.");
        // We already cached the exact variations as RED earlier if needed.
        setIconState('RED');
    }
}

// Get user configuration from storage
async function getUserConfig() {
  const result = await chrome.storage.local.get([
    'integrationToken',
    'databaseId',
    'propertyName',
    'cacheDuration',
    'lastEditedPropertyName'
  ]);
  
  return {
    integrationToken: result.integrationToken,
    databaseId: result.databaseId,
    propertyName: result.propertyName,
    cacheDuration: result.cacheDuration || 60, // Default: 60 minutes
    lastEditedPropertyName: result.lastEditedPropertyName
  };
}

// Check if URL is in cache and not expired
async function checkCache(url, cacheDuration) {
  const { urlCache = {} } = await chrome.storage.local.get('urlCache');
  
  if (urlCache[url]) {
    const now = Date.now();
    const cacheEntry = urlCache[url];
    const isExpired = now - cacheEntry.timestamp >= cacheDuration * 60 * 1000;
    
    console.log(`Cache check for ${url}: Found entry, isPresent: ${cacheEntry.isPresent}, expired: ${isExpired}, canonical: ${cacheEntry.canonicalUrl || 'N/A'}`);
    
    // Check if cache entry is still valid
    if (!isExpired) {
      return cacheEntry;
    }
  }
  
  console.log(`Cache check for ${url}: No valid entry found.`);
  return null;
}

// Update cache with new URL status
async function updateCache(url, isPresent, canonicalUrl = null) {
  try {
    const { urlCache = {} } = await chrome.storage.local.get('urlCache');
    
    const cacheEntry = {
      isPresent,
      timestamp: Date.now()
    };

    if (isPresent && canonicalUrl) {
      cacheEntry.canonicalUrl = canonicalUrl;
    }

    urlCache[url] = cacheEntry;
    
    await chrome.storage.local.set({ urlCache });
    console.log(`Cache updated for ${url}: isPresent: ${isPresent}, canonical: ${canonicalUrl || 'N/A'}`);
    
  } catch (error) {
      console.error(`Error updating cache for ${url}:`, error);
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
    console.error(`Notion API error during partial query: ${response.status} ${response.statusText}`);
    // Consider returning a specific error object if needed downstream
    return [];
  }

  const data = await response.json();
  return data.results; // Return the actual page objects
}

// Set the icon and store the current status
async function setIconState(state, matchingUrls = [], statusText = null, domainExcluded = false) {
  try {
    await chrome.action.setIcon({ path: ICON_STATES[state] });
    const statusToStore = { state };
    if (state === 'ORANGE' && matchingUrls.length > 0) {
      statusToStore.matchingUrls = matchingUrls;
      statusToStore.text = statusText || `Found ${matchingUrls.length} similar URLs.`;
    } else if (state === 'GREEN') {
      statusToStore.text = statusText || 'URL found in Notion.';
    } else if (state === 'RED') {
       statusToStore.text = statusText || 'URL not found in Notion.';
       if (domainExcluded) {
         statusToStore.domainExcluded = true;
       }
    } else if (state === 'GRAY') {
       statusToStore.text = statusText || 'Checking status or extension inactive/misconfigured.';
       if (statusText && statusText.includes('Error')) { // Store error message if provided
           statusToStore.error = statusText;
       }
    }
    
    // Store status for the popup to read
    await chrome.storage.local.set({ currentTabStatus: statusToStore });
  } catch (error) {
    console.error(`Error setting icon state to ${state} using paths:`, ICON_STATES[state], error);
    // Store error state
    await chrome.storage.local.set({ currentTabStatus: { state: 'GRAY', error: `Icon Error: ${error.message}` } });
  }
}

// Functions for sync operations
async function setupSyncAlarm() {
  // Get user configuration
  const config = await getUserConfig();
  
  if (!config.integrationToken || !config.databaseId || !config.propertyName || !config.lastEditedPropertyName) {
    console.log('Sync alarm not set up - extension not fully configured');
    return;
  }
  
  // Clear any existing alarm
  await chrome.alarms.clear(SYNC_ALARM_NAME);
  
  // Create new alarm - periodic sync every hour by default or whatever user has set
  // Convert minutes to milliseconds for the alarm API
  const minutes = config.cacheDuration || 60; // Default to hourly if not set
  console.log(`Setting up sync alarm to run every ${minutes} minutes`);
  
  chrome.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: minutes
  });
  
  console.log('Sync alarm scheduled successfully');
  
  // Consider running an initial sync right away if needed
  const { lastSyncTimestamp } = await chrome.storage.local.get('lastSyncTimestamp');
  if (!lastSyncTimestamp) {
    console.log('No previous sync timestamp, performing initial full sync');
    performFullSync();
  }
}

async function performFullSync() {
  console.log('Starting full sync operation');
  try {
    // Get user configuration
    const config = await getUserConfig();
    if (!config.databaseId || !config.propertyName) {
      console.error('Cannot perform sync - database or property not configured');
      return { success: false, error: 'Extension not fully configured' };
    }
    
    // Clear existing cache
    await chrome.storage.local.remove(['urlCache', 'lastSyncTimestamp']);
    const newUrlCache = {};
    
    // Fetch all pages from the database
    const token = config.integrationToken;
    let hasMore = true;
    let startCursor = undefined;
    let totalPages = 0;
    
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
      
      // Process pages and add to cache
      for (const page of pages) {
        const url = page.properties[config.propertyName]?.url;
        if (url) {
          newUrlCache[url] = {
            isPresent: true,
            canonicalUrl: url,
            timestamp: Date.now()
          };
          
          // Also cache URL variations to improve hit rate
          const variations = generateExactMatchVariations(url);
          for (const variation of variations) {
            if (variation !== url) { // Skip the original URL that was already cached
              newUrlCache[variation] = {
                isPresent: true,
                canonicalUrl: url, // Store the canonical (original) URL
                timestamp: Date.now()
              };
            }
          }
        }
      }
      
      // Prepare for next page if needed
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    
    // Store the new cache
    await chrome.storage.local.set({ 
      urlCache: newUrlCache,
      lastSyncTimestamp: Date.now()
    });
    
    console.log(`Full sync completed successfully. Cached ${totalPages} pages with URLs.`);
    return { success: true, pagesProcessed: totalPages };
    
  } catch (error) {
    console.error('Error during full sync:', error);
    return { success: false, error: error.message };
  }
}

async function performDeltaSync() {
  console.log('Starting delta sync operation');
  try {
    // Get user configuration
    const config = await getUserConfig();
    if (!config.databaseId || !config.propertyName || !config.lastEditedPropertyName) {
      console.error('Cannot perform delta sync - database, property or lastEditedProperty not configured');
      return { success: false, error: 'Extension not fully configured for delta sync' };
    }
    
    // Get the timestamp of the last sync
    const { lastSyncTimestamp } = await chrome.storage.local.get('lastSyncTimestamp');
    if (!lastSyncTimestamp) {
      console.log('No previous sync timestamp found, performing full sync instead');
      return performFullSync();
    }
    
    // Get current cache
    const { urlCache = {} } = await chrome.storage.local.get('urlCache');
    let modified = false;
    
    // Format the timestamp for the Notion API (ISO string)
    const lastSync = new Date(lastSyncTimestamp).toISOString();
    const token = config.integrationToken;
    
    // Query pages modified since the last sync timestamp
    let hasMore = true;
    let startCursor = undefined;
    let pagesProcessed = 0;
    
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
          // Update cache for this URL
          urlCache[url] = {
            isPresent: true,
            canonicalUrl: url,
            timestamp: Date.now()
          };
          
          // Also update cache for URL variations
          const variations = generateExactMatchVariations(url);
          for (const variation of variations) {
            if (variation !== url) {
              urlCache[variation] = {
                isPresent: true,
                canonicalUrl: url,
                timestamp: Date.now()
              };
            }
          }
          
          modified = true;
        }
      }
      
      // Prepare for next page if needed
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    
    // Update the last sync timestamp and cache if modified
    if (modified) {
      await chrome.storage.local.set({ 
        urlCache,
        lastSyncTimestamp: Date.now()
      });
    } else {
      // Just update the timestamp
      await chrome.storage.local.set({ lastSyncTimestamp: Date.now() });
    }
    
    console.log(`Delta sync completed successfully. Processed ${pagesProcessed} modified pages.`);
    return { success: true, pagesProcessed };
    
  } catch (error) {
    console.error('Error during delta sync:', error);
    return { success: false, error: error.message };
  }
}

// Start the extension
init();

// Listen for messages from the popup and options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received:", message);
  
  if (message.action === 'popupOpened') {
    // Handle popup opened event if needed in the future
    console.log('Popup was opened.');
    // Optionally clear badge text here if that was the intention
    sendResponse({ success: true }); // Acknowledge receipt
    return false; // Not sending async response

  } else if (message.action === 'clearCacheForUrl') {
    if (message.url) {
      clearCacheForUrl(message.url).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Error clearing cache for URL:', message.url, error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Indicate async response
    } else {
      sendResponse({ success: false, error: 'URL not provided for cache clear' });
      return false;
    }

  } else if (message.action === 'checkUrl') {
    if (message.url) {
      // Use full check (API if needed) when explicitly requested
      checkCurrentUrl(message.url, false).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Error triggering check for URL:', message.url, error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Indicate async response
    } else {
      sendResponse({ success: false, error: 'URL not provided for check' });
      return false;
    }
  } else if (message.action === 'forceFullSync') {
    console.log('Full sync requested from options page');
    performFullSync().then(result => {
      sendResponse(result);
    }).catch(error => {
      console.error('Error during full sync:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Indicate async response
  } else if (message.action === 'rescheduleSyncAlarm') {
    console.log('Sync alarm reschedule requested');
    setupSyncAlarm().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error setting up sync alarm:', error);
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
  
  // Default response if action not handled
  sendResponse({ success: false, error: 'Unknown action' });
  return false; // Not sending async response
});

// Add alarm listener for periodic sync
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('Sync alarm triggered, performing delta sync');
    performDeltaSync().then(result => {
      console.log('Delta sync result:', result);
    }).catch(error => {
      console.error('Error in scheduled delta sync:', error);
    });
  }
});

// Function to clear cache for a specific URL
async function clearCacheForUrl(url) {
  const { urlCache = {} } = await chrome.storage.local.get('urlCache');
  if (urlCache[url]) {
    delete urlCache[url];
    await chrome.storage.local.set({ urlCache });
    console.log('Cache cleared for:', url);
  } else {
    console.log('URL not found in cache, no need to clear:', url);
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
    // Parse the URL
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const domainRules = await getDomainExclusionRules();
    
    // Find the first matching rule for this hostname
    const matchingRule = domainRules.find(rule => {
      // Simple case insensitive check if hostname contains the rule's domain
      // This handles both exact matches and subdomains
      return hostname.toLowerCase().includes(rule.domain.toLowerCase());
    });
    
    if (!matchingRule) {
      // No matching rule, do default partial matching
      console.log(`No domain rule found for ${hostname}, using default partial matching`);
      return true;
    }
    
    // If match level is 'disabled', no partial matching
    if (matchingRule.matchLevel === 'disabled') {
      console.log(`Partial matching disabled for ${hostname}`);
      return false;
    }
    
    // If it got here, we need to do partial matching but with custom rules
    console.log(`Using custom partial matching for ${hostname} with level: ${matchingRule.matchLevel}${matchingRule.pattern ? `, pattern: ${matchingRule.pattern}` : ''}`);
    return { matchLevel: matchingRule.matchLevel, rule: matchingRule };
    
  } catch (error) {
    console.error(`Error checking domain rules for ${url}:`, error);
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
        console.error("Error generating ancestor URLs for:", url, e);
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
        console.log(`Unknown match level ${matchLevel}, using default ancestor generation`);
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
    console.error(`Error generating custom ancestors for ${url}:`, error);
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
    console.error(`Error generating URL from pattern for ${parsedUrl.href}:`, error);
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
    console.error("Error generating URL variations for:", url, e);
    variations.add(url); // Fallback to original URL
  }
  
  // Filter out potentially invalid URLs created (e.g., adding www. to an IP or non-standard TLD)
  // Basic filter: check for at least one dot
  const validVariations = Array.from(variations).filter(v => v.includes('.') || v.startsWith('http://localhost')); 
  
  return validVariations.length > 0 ? validVariations : [url]; // Return valid ones or fallback
} 