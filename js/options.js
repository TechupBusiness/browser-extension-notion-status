// Constants
const NOTION_API_URL = 'https://api.notion.com/v1';

// DOM Elements
const elements = {
  // Integration Token
  integrationToken: document.getElementById('integration-token'),
  
  // Authentication
  loginButton: document.getElementById('login-button'),
  logoutButton: document.getElementById('logout-button'),
  databaseSelect: document.getElementById('database-select'),
  databaseSection: document.getElementById('database-section'),
  refreshDatabasesButton: document.getElementById('refresh-databases-button'),
  propertySelect: document.getElementById('property-select'),
  propertySection: document.getElementById('property-section'),
  lastEditedPropertySelect: document.getElementById('last-edited-property-select'),
  lastEditedPropertySection: document.getElementById('last-edited-property-section'),
  authStatus: document.getElementById('auth-status'),
  
  // Cache
  cacheDuration: document.getElementById('cache-duration'),
  cacheDurationUnit: document.getElementById('cache-duration-unit'),
  clearCacheButton: document.getElementById('clear-cache-button'),
  forceFullSyncButton: document.getElementById('force-full-sync-button'),
  
  // General
  saveButton: document.getElementById('save-button'),
  statusMessage: document.getElementById('status-message')
};

// Initialize the options page
async function init() {
  // Load saved settings
  const settings = await loadSettings();
  
  // Set up event listeners
  setupEventListeners();
  
  // Update UI based on current settings
  updateUI(settings);
}

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get([
    'integrationToken',
    'databaseId',
    'propertyName',
    'lastEditedPropertyName',
    'cacheDuration',
    'workspaceId',
    'workspaceName',
    'botId'
  ]);
  
  return {
    integrationToken: result.integrationToken || '',
    databaseId: result.databaseId,
    propertyName: result.propertyName,
    lastEditedPropertyName: result.lastEditedPropertyName,
    cacheDuration: result.cacheDuration || 60, // Default: 60 minutes
    workspaceId: result.workspaceId,
    workspaceName: result.workspaceName,
    botId: result.botId
  };
}

// Set up event listeners
function setupEventListeners() {
  // Authentication
  elements.loginButton.addEventListener('click', handleLogin);
  elements.logoutButton.addEventListener('click', handleLogout);
  
  // Database selection
  elements.databaseSelect.addEventListener('change', handleDatabaseChange);
  elements.refreshDatabasesButton.addEventListener('click', loadDatabases);
  
  // Cache
  elements.clearCacheButton.addEventListener('click', handleClearCache);
  elements.forceFullSyncButton.addEventListener('click', handleForceFullSync);
  
  // Save settings
  elements.saveButton.addEventListener('click', handleSaveSettings);
}

// Update UI based on current settings
async function updateUI(settings) {
  // Integration Token
  elements.integrationToken.value = settings.integrationToken || '';
  
  // Auth status
  if (settings.integrationToken) {
    elements.authStatus.textContent = settings.workspaceName 
      ? `Connected to workspace: ${settings.workspaceName}`
      : 'Connected to Notion';
    elements.authStatus.classList.add('success');
    elements.authStatus.classList.remove('error');
    elements.loginButton.disabled = true;
    elements.loginButton.classList.add('disabled');
    elements.logoutButton.disabled = false;
    elements.refreshDatabasesButton.disabled = false;
    elements.forceFullSyncButton.disabled = false;
    
    // Load databases
    await loadDatabases();
    
    // Show database section
    elements.databaseSection.style.display = 'block';
    
    // If database is selected, load properties
    if (settings.databaseId) {
      elements.databaseSelect.value = settings.databaseId;
      await loadProperties(settings.databaseId);
      
      // Show property sections
      elements.propertySection.style.display = 'block';
      if (elements.lastEditedPropertySection) {
          elements.lastEditedPropertySection.style.display = 'block';
      }

      // If properties are selected, set them
      if (settings.propertyName) {
        elements.propertySelect.value = settings.propertyName;
      }
      if (settings.lastEditedPropertyName) {
        elements.lastEditedPropertySelect.value = settings.lastEditedPropertyName;
      }
    } else {
      elements.propertySection.style.display = 'none';
       if (elements.lastEditedPropertySection) {
          elements.lastEditedPropertySection.style.display = 'none';
       }
      elements.refreshDatabasesButton.disabled = true;
      elements.forceFullSyncButton.disabled = true;
    }
  } else {
    elements.authStatus.textContent = 'Not connected to Notion';
    elements.authStatus.classList.remove('success');
    elements.authStatus.classList.remove('error');
    elements.loginButton.disabled = false;
    elements.loginButton.classList.remove('disabled');
    elements.logoutButton.disabled = true;
    elements.databaseSection.style.display = 'none';
    elements.propertySection.style.display = 'none';
    if (elements.lastEditedPropertySection) {
        elements.lastEditedPropertySection.style.display = 'none';
    }
    elements.refreshDatabasesButton.disabled = true;
    elements.forceFullSyncButton.disabled = true;
  }
  
  // Cache duration
  if (settings.cacheDuration) {
    // Determine the unit and value
    if (settings.cacheDuration % 1440 === 0) {
      elements.cacheDuration.value = settings.cacheDuration / 1440;
      elements.cacheDurationUnit.value = '1440';
    } else if (settings.cacheDuration % 60 === 0) {
      elements.cacheDuration.value = settings.cacheDuration / 60;
      elements.cacheDurationUnit.value = '60';
    } else {
      elements.cacheDuration.value = settings.cacheDuration;
      elements.cacheDurationUnit.value = '1';
    }
  }
}

// Handle Notion login
async function handleLogin() {
  try {
    await handleTokenLogin();
  } catch (error) {
    console.error('Authentication error:', error);
    showStatus('Authentication failed: ' + error.message, 'error');
  }
}

// Handle Integration Token login
async function handleTokenLogin() {
  // Get Integration Token from the form
  const integrationToken = elements.integrationToken.value.trim();
  if (!integrationToken) {
    throw new Error('Please enter your Notion Integration Token.');
  }
  
  // Test the token with a simple API call
  try {
    const response = await fetch(`${NOTION_API_URL}/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${integrationToken}`,
        'Notion-Version': '2022-06-28'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid Integration Token. Please check and try again.');
      } else {
        throw new Error(`API error: ${response.statusText}`);
      }
    }
    
    const userData = await response.json();
    
    // Save the integration token and use it as the access token
    await chrome.storage.local.set({
      integrationToken,
      authMethod: 'token',
      accessToken: integrationToken,
      botId: userData.bot.id
    });
    
    // Update UI
    const settings = await loadSettings();
    updateUI(settings);
    
    showStatus('Successfully connected to Notion', 'success');
  } catch (error) {
    console.error('Token validation error:', error);
    showStatus('Authentication failed: ' + error.message, 'error');
  }
}

// Handle logout
async function handleLogout() {
  // Clear relevant storage items
  await chrome.storage.local.remove([
    'integrationToken', 
    'accessToken', 
    'databaseId', 
    'propertyName', 
    'lastEditedPropertyName',
    'workspaceId',
    'workspaceName',
    'botId',
    'urlCache',
    'lastSyncTimestamp'
  ]);
  
  // Reset UI
  const settings = await loadSettings();
  updateUI(settings); 
  elements.databaseSelect.innerHTML = '<option value="">Connect to Notion first</option>';
  elements.propertySelect.innerHTML = '<option value="">Select a database first</option>';
  elements.lastEditedPropertySelect.innerHTML = '<option value="">Select a database first</option>';
  elements.databaseSelect.disabled = true;
  elements.propertySelect.disabled = true;
  elements.lastEditedPropertySelect.disabled = true;
  
  showStatus('Disconnected from Notion', 'info');
}

// Load databases from Notion
async function loadDatabases() {
  try {
    elements.databaseSelect.disabled = true;
    elements.databaseSelect.innerHTML = '<option value="">Loading databases...</option>';
    elements.propertySelect.innerHTML = '<option value="">Select a database first</option>';
    elements.propertySelect.disabled = true;
    elements.lastEditedPropertySelect.innerHTML = '<option value="">Select a database first</option>';
    elements.lastEditedPropertySelect.disabled = true;
    elements.propertySection.style.display = 'none';
    if (elements.lastEditedPropertySection) elements.lastEditedPropertySection.style.display = 'none';

    const settings = await loadSettings();
    const token = settings.integrationToken;
    
    // Make the API request to Notion
    const response = await fetch(`${NOTION_API_URL}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: {
          value: 'database',
          property: 'object'
        }
      })
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, log out
        await handleLogout();
        throw new Error('Notion session expired. Please log in again.');
      }
      throw new Error(`Notion API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const databases = data.results;
    
    // Clear the select options
    elements.databaseSelect.innerHTML = '<option value="">Select a database</option>';
    
    // Add each database as an option
    databases.forEach(db => {
      const option = document.createElement('option');
      option.value = db.id;
      option.textContent = db.title?.[0]?.plain_text || 'Untitled Database';
      elements.databaseSelect.appendChild(option);
    });
    
    elements.databaseSelect.disabled = false;
  } catch (error) {
    console.error('Error loading databases:', error);
    elements.databaseSelect.innerHTML = '<option value="">Failed to load databases</option>';
    elements.propertySelect.innerHTML = '<option value="">Select a database first</option>';
    elements.lastEditedPropertySelect.innerHTML = '<option value="">Select a database first</option>';
    showStatus('Error loading databases: ' + error.message, 'error');
  }
}

// Handle database selection change
async function handleDatabaseChange() {
  const databaseId = elements.databaseSelect.value;
  
  // Clear property selections first
  elements.propertySelect.value = '';
  elements.lastEditedPropertySelect.value = '';

  if (databaseId) {
    await loadProperties(databaseId);
    elements.propertySection.style.display = 'block';
    if (elements.lastEditedPropertySection) elements.lastEditedPropertySection.style.display = 'block';
  } else {
    elements.propertySection.style.display = 'none';
     if (elements.lastEditedPropertySection) elements.lastEditedPropertySection.style.display = 'none';
    elements.propertySelect.innerHTML = '<option value="">Select a database first</option>';
    elements.propertySelect.disabled = true;
    elements.lastEditedPropertySelect.innerHTML = '<option value="">Select a database first</option>';
    elements.lastEditedPropertySelect.disabled = true;
  }
}

// Load properties for the selected database
async function loadProperties(databaseId) {
  try {
    elements.propertySelect.disabled = true;
    elements.propertySelect.innerHTML = '<option value="">Loading properties...</option>';
    elements.lastEditedPropertySelect.disabled = true;
    elements.lastEditedPropertySelect.innerHTML = '<option value="">Loading properties...</option>';
    
    const settings = await loadSettings();
    const token = settings.integrationToken;
    
    // Make the API request to Notion
    const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, log out
        await handleLogout();
        throw new Error('Notion session expired. Please log in again.');
      }
      throw new Error(`Notion API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const properties = data.properties;
    
    // Clear the select options
    elements.propertySelect.innerHTML = '<option value="">Select a URL property</option>';
    elements.lastEditedPropertySelect.innerHTML = '<option value="">Select Last Edited Time property</option>';
    
    // Add properties to the respective selects based on type
    Object.entries(properties).forEach(([name, property]) => {
      // Populate URL property select
      if (property.type === 'url') {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        elements.propertySelect.appendChild(option);
      }
      // Populate Last Edited Time property select
      else if (property.type === 'last_edited_time') {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          elements.lastEditedPropertySelect.appendChild(option);
      }
    });

    // Re-enable selects
    elements.propertySelect.disabled = false;
    elements.lastEditedPropertySelect.disabled = false;

    // Restore previously selected values if they exist in the loaded properties
    const savedSettings = await loadSettings();
    if (savedSettings.propertyName && elements.propertySelect.querySelector(`option[value="${CSS.escape(savedSettings.propertyName)}"]`)) {
        elements.propertySelect.value = savedSettings.propertyName;
    }
     if (savedSettings.lastEditedPropertyName && elements.lastEditedPropertySelect.querySelector(`option[value="${CSS.escape(savedSettings.lastEditedPropertyName)}"]`)) {
        elements.lastEditedPropertySelect.value = savedSettings.lastEditedPropertyName;
    }

  } catch (error) {
    console.error('Error loading properties:', error);
    elements.propertySelect.innerHTML = '<option value="">Failed to load properties</option>';
    elements.lastEditedPropertySelect.innerHTML = '<option value="">Failed to load properties</option>';
    showStatus('Error loading properties: ' + error.message, 'error');
  }
}

// Handle clear cache button
async function handleClearCache() {
  await chrome.storage.local.remove(['urlCache', 'lastSyncTimestamp']);
  showStatus('Cache and sync timestamp cleared successfully', 'success');
}

// Handle force full sync button
async function handleForceFullSync() {
    try {
        showStatus('Triggering full sync...', 'info');
        await chrome.runtime.sendMessage({ action: 'forceFullSync' });
        setTimeout(() => showStatus('Full sync triggered in background.', 'success'), 1000); 
    } catch (error) {
        console.error('Error sending forceFullSync message:', error);
        showStatus(`Error triggering sync: ${error.message}`, 'error');
    }
}

// Handle save settings
async function handleSaveSettings() {
  try {
    // Get values from form
    const integrationToken = elements.integrationToken.value.trim();
    const databaseId = elements.databaseSelect.value;
    const propertyName = elements.propertySelect.value;
    const lastEditedPropertyName = elements.lastEditedPropertySelect.value;
    const cacheDuration = calculateCacheDuration();
    
    // Validate token
    if (!integrationToken) {
      throw new Error('Please enter your Notion Integration Token');
    }
    
    // Validate database and properties if connected
    const settings = await loadSettings();
    const isConnected = settings.integrationToken;

    if (isConnected) {
      if (!databaseId) {
        throw new Error('Please select a database');
      }
      if (!propertyName) {
        throw new Error('Please select a URL property');
      }
      if (!lastEditedPropertyName) {
          throw new Error('Please select a Last Edited Time property for delta sync');
      }
    }
    
    // Prepare data to save
    const oldSettings = await loadSettings();
    const dataToSave = {
      authMethod: 'token',
      integrationToken,
      cacheDuration
    };
    
    // Only include database settings if they're selected and we are connected
    let triggerFullSync = false;
    if (isConnected && databaseId) {
      dataToSave.databaseId = databaseId;
      // Check if critical DB settings changed
      if (oldSettings.databaseId !== databaseId || oldSettings.propertyName !== propertyName || oldSettings.lastEditedPropertyName !== lastEditedPropertyName) {
           triggerFullSync = true;
      }
    }
    if (isConnected && propertyName) {
      dataToSave.propertyName = propertyName;
    }
    if (isConnected && lastEditedPropertyName) {
        dataToSave.lastEditedPropertyName = lastEditedPropertyName;
    }
    
    // Save settings
    await chrome.storage.local.set(dataToSave);
    
    showStatus('Settings saved successfully', 'success');

     // Trigger a full sync if critical settings changed
     if (triggerFullSync) {
        showStatus('Database settings changed, triggering full sync...', 'info');
        await chrome.runtime.sendMessage({ action: 'forceFullSync' });
     } else if (oldSettings.cacheDuration !== cacheDuration) {
         // If only cache duration changed, maybe reschedule the alarm?
         await chrome.runtime.sendMessage({ action: 'rescheduleSyncAlarm' });
     }

  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}

// Calculate cache duration in minutes
function calculateCacheDuration() {
  const cacheDurationValue = parseInt(elements.cacheDuration.value, 10);
  const cacheDurationUnit = parseInt(elements.cacheDurationUnit.value, 10);
  
  if (isNaN(cacheDurationValue) || cacheDurationValue <= 0) {
    throw new Error('Please enter a valid cache duration');
  }
  
  return cacheDurationValue * cacheDurationUnit;
}

// Show status message
function showStatus(message, type) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = 'status ' + type;
  
  // Hide after 5 seconds
  setTimeout(() => {
    elements.statusMessage.className = 'status';
  }, 5000);
}

// Initialize the options page
document.addEventListener('DOMContentLoaded', init); 