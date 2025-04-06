// DOM Elements
const elements = {
  loading: document.getElementById('loading'),
  configuredView: document.getElementById('configured-view'),
  notConfiguredView: document.getElementById('not-configured-view'),
  statusCard: document.getElementById('status-card'),
  statusIcon: document.getElementById('status-icon'),
  statusText: document.getElementById('status-text'),
  url: document.getElementById('url'),
  databaseName: document.getElementById('database-name'),
  propertyName: document.getElementById('property-name'),
  lastChecked: document.getElementById('last-checked'),
  refreshButton: document.getElementById('refresh-button'),
  optionsButton: document.getElementById('options-button'),
  setupButton: document.getElementById('setup-button'),
  // New elements for partial matches
  partialMatchesContainer: document.getElementById('partial-matches-container'),
  partialMatchesList: document.getElementById('partial-matches-list')
};

// Initialize the popup
async function init() {
  // Show loading state immediately
  elements.statusText.textContent = 'Refreshing status...';
  elements.lastChecked.textContent = 'Now';
  
  // Notify background script that popup is opened
  chrome.runtime.sendMessage({ action: 'popupOpened' });
  
  // Set up event listeners
  setupEventListeners();
  
  // Load settings and update UI
  const settings = await loadSettings();
  
  // Determine if authentication is configured
  const hasAuth = settings.integrationToken;

  // Check if database and property are configured
  const hasDbConfig = settings.databaseId && settings.propertyName;

  // If authentication or database is not configured, show the setup view
  if (!hasAuth || !hasDbConfig) {
    showNotConfiguredView();
    return;
  }
  
  // Check if token needs authentication
  if (settings.needsAuthentication) {
    showTokenExpiredView();
    return;
  }
  
  // Show configured view
  showConfiguredView();
  
  // Get current URL
  const url = await getCurrentUrl();
  elements.url.textContent = url;
  
  // Update info sections
  await updateDatabaseInfo(settings);
  
  // Trigger a fresh check when popup is opened
  try {
    // Trigger a fresh check (with API calls if needed)
    await chrome.runtime.sendMessage({ action: 'checkUrl', url: url });
    
    // Wait a short moment for the background script to update status
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    // Load and display the updated status
    await loadAndDisplayStatus(url);
  } catch (error) {
    console.error('Error refreshing status on popup open:', error);
    updateStatusUI('gray', 'Error refreshing status');
    elements.lastChecked.textContent = 'Error';
  }
}

// Set up event listeners
function setupEventListeners() {
  elements.refreshButton.addEventListener('click', handleRefresh);
  elements.optionsButton.addEventListener('click', handleOptions);
  elements.setupButton.addEventListener('click', handleOptions);
  
  // Add listener for the re-auth button if we add it
  const reauthButton = document.getElementById('reauth-button');
  if (reauthButton) {
    reauthButton.addEventListener('click', handleOptions);
  }
  
  // Remove old status card click listener if any
  elements.statusIcon.removeEventListener('click', togglePartialMatches);
}

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get([
    'integrationToken',
    'databaseId',
    'propertyName',
    'cacheDuration',
    'needsAuthentication'
  ]);
  
  return {
    integrationToken: result.integrationToken,
    databaseId: result.databaseId,
    propertyName: result.propertyName,
    cacheDuration: result.cacheDuration || 60, // Default: 60 minutes
    needsAuthentication: result.needsAuthentication
  };
}

// Show the not configured view
function showNotConfiguredView() {
  elements.loading.style.display = 'none';
  elements.configuredView.style.display = 'none';
  elements.notConfiguredView.style.display = 'block';
  
  // Hide token expired view if it exists
  const tokenExpiredView = document.getElementById('token-expired-view');
  if (tokenExpiredView) {
    tokenExpiredView.style.display = 'none';
  }
}

// Show the token expired view
function showTokenExpiredView() {
  elements.loading.style.display = 'none';
  elements.configuredView.style.display = 'none';
  elements.notConfiguredView.style.display = 'none';
  
  // Create the token expired view if it doesn't exist yet
  let tokenExpiredView = document.getElementById('token-expired-view');
  
  if (!tokenExpiredView) {
    tokenExpiredView = document.createElement('div');
    tokenExpiredView.id = 'token-expired-view';
    tokenExpiredView.className = 'not-configured';
    
    const content = `
      <p>Your Notion connection has expired.</p>
      <p>This happens periodically with Notion API tokens for security reasons.</p>
      <p>Click the button below to reconnect to Notion.</p>
      <button id="reauth-button">Reconnect to Notion</button>
    `;
    
    tokenExpiredView.innerHTML = content;
    document.getElementById('status-container').appendChild(tokenExpiredView);
    
    // Add listener for the new button
    document.getElementById('reauth-button').addEventListener('click', handleOptions);
  }
  
  tokenExpiredView.style.display = 'block';
}

// Show the configured view
function showConfiguredView() {
  elements.loading.style.display = 'none';
  elements.configuredView.style.display = 'block';
  elements.notConfiguredView.style.display = 'none';
  
  // Hide token expired view if it exists
  const tokenExpiredView = document.getElementById('token-expired-view');
  if (tokenExpiredView) {
    tokenExpiredView.style.display = 'none';
  }
}

// Get the current tab URL
async function getCurrentUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tabs.length === 0) {
    return 'Unknown URL';
  }
  
  return tabs[0].url;
}

// Update database and property info
async function updateDatabaseInfo(settings) {
  try {
    // Get database name
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${settings.databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.integrationToken}`,
        'Notion-Version': '2022-06-28'
      }
    });
    
    if (!dbResponse.ok) {
      elements.databaseName.textContent = 'Error loading database';
      
      // Check if token expired
      if (dbResponse.status === 401) {
        await chrome.storage.local.set({ needsAuthentication: true });
        showTokenExpiredView();
        return;
      }
      
      return;
    }
    
    const dbData = await dbResponse.json();
    const dbTitle = dbData.title?.[0]?.plain_text || 'Untitled Database';
    elements.databaseName.textContent = dbTitle;
    
    // Set property name
    elements.propertyName.textContent = settings.propertyName;
  } catch (error) {
    console.error('Error updating database info:', error);
    elements.databaseName.textContent = 'Error loading database';
  }
}

// Load the status set by the background script and update UI
async function loadAndDisplayStatus(currentUrl) {
  elements.url.textContent = currentUrl;
  try {
    const { currentTabStatus } = await chrome.storage.local.get('currentTabStatus');
    
    if (!currentTabStatus) {
      // Should not happen if background script is working, but handle gracefully
      console.warn('Could not retrieve currentTabStatus from storage.');
      updateStatusUI('gray', 'Status unavailable'); // Use lowercase state
      elements.lastChecked.textContent = 'Unknown';
      return;
    }

    // Update UI based on the state
    let statusText = '';
    switch (currentTabStatus.state) {
      case 'GREEN':
        statusText = 'This URL is in your Notion database.';
        elements.partialMatchesContainer.style.display = 'none'; // Hide list
        break;
      case 'RED':
        if (currentTabStatus.domainExcluded) {
          statusText = 'This URL is not in your database. Partial matching disabled by domain rule.';
        } else {
          statusText = 'This URL is not in your Notion database.';
        }
        elements.partialMatchesContainer.style.display = 'none'; // Hide list
        break;
      case 'ORANGE':
        const count = currentTabStatus.matchingUrls?.length || 0;
        statusText = `Found ${count} similar URLs in Notion:`;
        updatePartialMatchesList(currentTabStatus.matchingUrls || []);
        elements.partialMatchesContainer.style.display = 'block'; // Show list
        break;
      case 'GRAY':
      default:
        statusText = 'Cannot check this URL or extension is misconfigured.';
        if (currentTabStatus.error) {
          statusText = `Error: ${currentTabStatus.error}`;
        }
        elements.partialMatchesContainer.style.display = 'none'; // Hide list
        break;
    }
    
    updateStatusUI(currentTabStatus.state.toLowerCase(), statusText);
    
    // We might not have a precise last checked time here easily,
    // as it's managed by the background script's caching/checking.
    // We could store it alongside currentTabStatus if needed.
    // For now, let's just indicate it's up-to-date.
    elements.lastChecked.textContent = 'Up to date'; 

  } catch (error) {
    console.error('Error loading or displaying status:', error);
    updateStatusUI('gray', 'Error loading status');
    elements.lastChecked.textContent = 'Error';
  }
}

// Update the status UI elements
function updateStatusUI(state, text) {
  // Reset classes and hide partial matches
  elements.statusCard.className = 'status-card'; // Reset classes
  elements.statusIcon.className = 'status-icon'; // Reset classes
  elements.statusIcon.removeEventListener('click', togglePartialMatches);

  // Apply new state
  elements.statusCard.classList.add(state); // e.g., 'green', 'red', 'orange', 'gray'
  elements.statusIcon.classList.add(state);
  elements.statusIcon.textContent = state === 'gray' ? '!' : 'N'; // Icon text
  elements.statusText.textContent = text;
}

// Populate the list of partially matching URLs
function updatePartialMatchesList(urls) {
  elements.partialMatchesList.innerHTML = ''; // Clear previous list
  if (!urls || urls.length === 0) {
    elements.partialMatchesContainer.style.display = 'none';
    return;
  }
  
  urls.forEach(url => {
    const listItem = document.createElement('li');
    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    link.target = '_blank'; // Open in new tab
    link.style.color = '#007bff';
    link.style.textDecoration = 'none';
    link.addEventListener('mouseover', () => link.style.textDecoration = 'underline');
    link.addEventListener('mouseout', () => link.style.textDecoration = 'none');
    listItem.appendChild(link);
    elements.partialMatchesList.appendChild(listItem);
  });
}

// Toggle visibility of the partial matches list
function togglePartialMatches() {
  const container = elements.partialMatchesContainer;
  if (container.style.display === 'none') {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
}

// Handle refresh button click
async function handleRefresh() {
  elements.statusText.textContent = 'Refreshing...';
  elements.lastChecked.textContent = 'Now';
  elements.partialMatchesContainer.style.display = 'none'; // Hide list on refresh
  elements.statusIcon.removeEventListener('click', togglePartialMatches); // Remove listener

  const url = await getCurrentUrl();
  
  try {
    // Clear cache for this URL in background script
    await chrome.runtime.sendMessage({ action: 'clearCacheForUrl', url: url });
    
    // Trigger re-check in background script with full API check
    await chrome.runtime.sendMessage({ action: 'checkUrl', url: url });

    // Wait a short moment for the background script to update status
    await new Promise(resolve => setTimeout(resolve, 500)); 

    // Reload and display the updated status
    await loadAndDisplayStatus(url);
    
  } catch (error) {
    console.error('Error during refresh:', error);
    updateStatusUI('gray', 'Error refreshing status');
    elements.lastChecked.textContent = 'Error';
    // Handle potential communication errors with background script
    if (error.message?.includes('Could not establish connection')) {
       elements.statusText.textContent = 'Error: Background script inactive. Try reloading the extension.';
    }
  }
}

// Handle options/setup button click
function handleOptions() {
  chrome.runtime.openOptionsPage();
}

// Initialize the popup
document.addEventListener('DOMContentLoaded', init); 