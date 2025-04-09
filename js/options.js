// Constants
const NOTION_API_URL = 'https://api.notion.com/v1';

// Default domain exclusion rules
const DEFAULT_DOMAIN_RULES = [
  // Browser-specific protocol schemes
  {
    domain: 'chrome',
    matchLevel: 'disabled',
    description: 'Chrome browser internal URLs (chrome://)'
  },
  {
    domain: 'brave',
    matchLevel: 'disabled',
    description: 'Brave browser internal URLs (brave://)'
  },
  {
    domain: 'about',
    matchLevel: 'disabled',
    description: 'Browser about pages (about:)'
  },
  {
    domain: 'edge',
    matchLevel: 'disabled',
    description: 'Edge browser internal URLs (edge://)'
  },
  {
    domain: 'moz-extension',
    matchLevel: 'disabled',
    description: 'Firefox extension URLs (moz-extension://)'
  },
  {
    domain: 'firefox',
    matchLevel: 'disabled',
    description: 'Firefox internal URLs (firefox:)'
  },
  {
    domain: 'safari',
    matchLevel: 'disabled',
    description: 'Safari internal URLs (safari:)'
  },
  {
    domain: 'file',
    matchLevel: 'disabled',
    description: 'Local file URLs (file:)'
  },
  {
    domain: 'chrome-extension',
    matchLevel: 'disabled',
    description: 'Chrome extension URLs (chrome-extension://)'
  },
  {
    domain: 'view-source',
    matchLevel: 'disabled',
    description: 'View source URLs (view-source:)'
  },
  // Additional browser-specific protocols
  {
    domain: 'opera',
    matchLevel: 'disabled',
    description: 'Opera browser internal URLs (opera://)'
  },
  {
    domain: 'vivaldi',
    matchLevel: 'disabled',
    description: 'Vivaldi browser internal URLs (vivaldi://)'
  },
  {
    domain: 'edge-extension',
    matchLevel: 'disabled',
    description: 'Edge extension URLs (edge-extension://)'
  },
  {
    domain: 'devtools',
    matchLevel: 'disabled',
    description: 'Developer tools URLs (devtools://)'
  },
  {
    domain: 'web-extension',
    matchLevel: 'disabled',
    description: 'Web extension URLs (web-extension://)'
  },
  // Special protocols
  {
    domain: 'data',
    matchLevel: 'disabled',
    description: 'Data URLs (data:)'
  },
  {
    domain: 'javascript',
    matchLevel: 'disabled',
    description: 'JavaScript URLs (javascript:)'
  },
  {
    domain: 'mailto',
    matchLevel: 'disabled',
    description: 'Email URLs (mailto:)'
  },
  {
    domain: 'tel',
    matchLevel: 'disabled',
    description: 'Telephone URLs (tel:)'
  },
  {
    domain: 'sms',
    matchLevel: 'disabled',
    description: 'SMS URLs (sms:)'
  },
  {
    domain: 'blob',
    matchLevel: 'disabled',
    description: 'Blob URLs (blob:)'
  },
  {
    domain: 'ws',
    matchLevel: 'disabled',
    description: 'WebSocket URLs (ws://)'
  },
  {
    domain: 'wss',
    matchLevel: 'disabled',
    description: 'Secure WebSocket URLs (wss://)'
  },
  {
    domain: 'ftp',
    matchLevel: 'disabled',
    description: 'FTP URLs (ftp://)'
  },
  // Local development domains - these are matched as hostnames, not protocols
  {
    domain: 'localhost',
    matchLevel: 'disabled',
    description: 'Local development server'
  },
  {
    domain: '127.0.0.1',
    matchLevel: 'disabled',
    description: 'Local development IP address'
  },
  {
    domain: '192.168',
    matchLevel: 'disabled',
    description: 'Local network IP addresses (192.168.x.x)'
  },
  {
    domain: '10.',
    matchLevel: 'disabled',
    description: 'Local network IP addresses (10.x.x.x)'
  },
  {
    domain: '172.',
    matchLevel: 'disabled',
    description: 'Local network IP addresses (172.16-31.x.x)'
  },
  // Regular domain rules
  {
    domain: 'github.com',
    matchLevel: 'custom',
    pattern: '/*/repo*',
    description: 'Match at repository level (github.com/user/repo)'
  },
  {
    domain: 'gitlab.com',
    matchLevel: 'custom',
    pattern: '/*/project*',
    description: 'Match at repository level (gitlab.com/user/repo)'
  },
  {
    domain: 'reddit.com',
    matchLevel: 'custom',
    pattern: '/r/*/comments/*/*',
    description: 'Match at thread level (exclude comments and pagination)'
  },
  {
    domain: 'twitter.com',
    matchLevel: 'custom',
    pattern: '/*',
    description: 'Match at profile level (twitter.com/username)'
  },
  {
    domain: 'x.com',
    matchLevel: 'custom',
    pattern: '/*',
    description: 'Match at profile level (x.com/username)'
  },
  {
    domain: 'youtube.com',
    matchLevel: 'custom',
    pattern: '/watch?v=*',
    description: 'Match at video level (youtube.com/watch?v=ID)'
  },
  {
    domain: 'stackoverflow.com',
    matchLevel: 'custom',
    pattern: '/questions/*',
    description: 'Match at question level (exclude answers and pagination)'
  },
  {
    domain: 'linkedin.com',
    matchLevel: 'custom',
    pattern: '/in/*',
    description: 'Match at profile level (linkedin.com/in/username)'
  },
  {
    domain: 'amazon.com',
    matchLevel: 'custom',
    pattern: '/dp/*',
    description: 'Match at product level (exclude reviews and pagination)'
  },
  {
    domain: 'medium.com',
    matchLevel: 'custom',
    pattern: '/@*/*',
    description: 'Match at article level (exclude comments)'
  }
];

// Match level options for domains
const MATCH_LEVEL_OPTIONS = [
  { value: 'disabled', label: 'Disable completely', description: 'No partial matching for this domain' },
  { value: 'domain', label: 'Domain only', description: 'Match only at domain level (example.com)' },
  { value: 'path1', label: 'First path level', description: 'Match first path level (example.com/first)' },
  { value: 'path2', label: 'Second path level', description: 'Match second path level (example.com/first/second)' },
  { value: 'path3', label: 'Third path level', description: 'Match third path level (example.com/first/second/third)' },
  { value: 'custom', label: 'Custom pattern', description: 'Define a custom pattern to match URLs' }
];

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
  
  // Domain Exclusion
  domainExclusionList: document.getElementById('domain-exclusion-list'),
  addDomainRuleButton: document.getElementById('add-domain-rule-button'),
  resetDefaultDomainsButton: document.getElementById('reset-default-domains-button'),
  
  // Cache
  cacheDuration: document.getElementById('cache-duration'),
  cacheDurationUnit: document.getElementById('cache-duration-unit'),
  clearCacheButton: document.getElementById('clear-cache-button'),
  forceFullSyncButton: document.getElementById('force-full-sync-button'),
  aggressiveCachingToggle: document.getElementById('aggressive-caching-toggle'),
  
  // General
  saveButton: document.getElementById('save-button'),
  // Remove global status message element
  // statusMessage: document.getElementById('status-message')
  
  // Add local status elements (optional, can select inside functions)
  // authActionStatus: document.getElementById('auth-action-status'),
  // cacheActionStatus: document.getElementById('cache-action-status'),
  // saveStatus: document.getElementById('save-status')
};

// Helper function to display status messages locally
let statusTimers = {}; // Keep track of timers for different status areas
function displayStatus(targetElementId, message, type, duration = 5000) {
    const statusElement = document.getElementById(targetElementId);
    if (!statusElement) {
        console.error(`Status element with ID ${targetElementId} not found.`);
        return;
    }

    // Clear existing timer for this specific target if it exists
    if (statusTimers[targetElementId]) {
        clearTimeout(statusTimers[targetElementId]);
    }

    statusElement.textContent = message;
    statusElement.className = 'status local-status ' + type; // Ensure base classes are present
    statusElement.style.display = 'block'; // Make sure it's visible

    // Set a new timer to hide/clear the message
    statusTimers[targetElementId] = setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'status local-status'; // Reset classes
        statusElement.style.display = 'none'; // Hide it
        delete statusTimers[targetElementId]; // Remove timer reference
    }, duration);
}

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
    'botId',
    'domainRules',
    'aggressiveCachingEnabled'
  ]);
  
  return {
    integrationToken: result.integrationToken || '',
    databaseId: result.databaseId,
    propertyName: result.propertyName,
    lastEditedPropertyName: result.lastEditedPropertyName,
    cacheDuration: result.cacheDuration || 60, // Default: 60 minutes
    workspaceId: result.workspaceId,
    workspaceName: result.workspaceName,
    botId: result.botId,
    domainRules: result.domainRules || DEFAULT_DOMAIN_RULES,
    aggressiveCachingEnabled: result.aggressiveCachingEnabled || false
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
  
  // Domain Exclusion
  elements.addDomainRuleButton.addEventListener('click', handleAddDomainRule);
  elements.resetDefaultDomainsButton.addEventListener('click', handleResetDefaultDomains);
  
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
  
  // Aggressive Caching Toggle
  elements.aggressiveCachingToggle.checked = settings.aggressiveCachingEnabled;
  
  // Load domain rules
  loadDomainRules(settings.domainRules || DEFAULT_DOMAIN_RULES);
  
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
    // Login success/failure is handled within handleTokenLogin
  } catch (error) {
    console.error('Authentication error:', error);
    displayStatus('auth-action-status', 'Authentication failed: ' + error.message, 'error');
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
    
    displayStatus('auth-action-status', 'Successfully connected to Notion', 'success');

  } catch (error) {
    console.error('Token validation error:', error);
    displayStatus('auth-action-status', 'Authentication failed: ' + error.message, 'error');
    // Re-throw or handle as needed if caller needs to know
    throw error;
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
  
  displayStatus('auth-action-status', 'Disconnected from Notion', 'info');
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
    // Display error near the database section? Need a placeholder there.
    // For now, let's use the auth status area as a fallback.
    displayStatus('auth-action-status', 'Error loading databases: ' + error.message, 'error');
    // Update selects to show failure
    elements.databaseSelect.innerHTML = '<option value="">Failed to load databases</option>';
    elements.propertySelect.innerHTML = '<option value="">Select a database first</option>';
    elements.lastEditedPropertySelect.innerHTML = '<option value="">Select a database first</option>';
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
    // Display error near the property section? Need a placeholder there.
    // Using auth status area as fallback.
    displayStatus('auth-action-status', 'Error loading properties: ' + error.message, 'error');
    elements.propertySelect.innerHTML = '<option value="">Failed to load properties</option>';
    elements.lastEditedPropertySelect.innerHTML = '<option value="">Failed to load properties</option>';
  }
}

// Domain exclusion functions
function loadDomainRules(domainRules) {
  // Clear the existing list
  elements.domainExclusionList.innerHTML = '';
  
  // Add each domain rule to the UI
  domainRules.forEach((rule, index) => {
    addDomainRuleToUI(rule, index);
  });
}

function addDomainRuleToUI(rule, index) {
  const domainRule = document.createElement('div');
  domainRule.className = 'domain-rule';
  domainRule.dataset.index = index;
  
  // Create header with domain name and actions
  const header = document.createElement('div');
  header.className = 'domain-rule-header';
  
  const title = document.createElement('div');
  title.className = 'domain-rule-title';
  title.textContent = rule.domain || 'New Domain Rule';
  
  const actions = document.createElement('div');
  actions.className = 'domain-rule-action';
  
  const removeButton = document.createElement('button');
  removeButton.className = 'remove-domain-button';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => handleRemoveDomainRule(index));
  
  const moveUpButton = document.createElement('button');
  moveUpButton.className = 'move-domain-button';
  moveUpButton.textContent = '↑';
  moveUpButton.title = 'Move Up';
  moveUpButton.addEventListener('click', () => handleMoveDomainRule(index, 'up'));
  moveUpButton.style.display = index === 0 ? 'none' : 'block';
  
  const moveDownButton = document.createElement('button');
  moveDownButton.className = 'move-domain-button';
  moveDownButton.textContent = '↓';
  moveDownButton.title = 'Move Down';
  moveDownButton.addEventListener('click', () => handleMoveDomainRule(index, 'down'));
  
  actions.appendChild(moveUpButton);
  actions.appendChild(moveDownButton);
  actions.appendChild(removeButton);
  
  header.appendChild(title);
  header.appendChild(actions);
  
  // Create content with domain and match level inputs
  const content = document.createElement('div');
  content.className = 'domain-rule-content';
  
  // Domain input
  const domainLabel = document.createElement('label');
  domainLabel.textContent = 'Domain:';
  domainLabel.htmlFor = `domain-input-${index}`;
  
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.id = `domain-input-${index}`;
  domainInput.value = rule.domain || '';
  domainInput.placeholder = 'example.com';
  domainInput.addEventListener('input', (e) => {
    title.textContent = e.target.value || 'New Domain Rule';
  });
  
  // Match level select
  const matchLevelLabel = document.createElement('label');
  matchLevelLabel.textContent = 'Match Level:';
  matchLevelLabel.htmlFor = `match-level-select-${index}`;
  
  const matchLevelSelect = document.createElement('select');
  matchLevelSelect.id = `match-level-select-${index}`;
  
  // Add options to match level select
  MATCH_LEVEL_OPTIONS.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    if (rule.matchLevel === option.value) {
      optionElement.selected = true;
    }
    matchLevelSelect.appendChild(optionElement);
  });
  
  // Custom pattern input (shown only when custom pattern is selected)
  const patternLabel = document.createElement('label');
  patternLabel.textContent = 'Pattern:';
  patternLabel.htmlFor = `pattern-input-${index}`;
  patternLabel.style.display = rule.matchLevel === 'custom' ? 'block' : 'none';
  
  const patternInput = document.createElement('input');
  patternInput.type = 'text';
  patternInput.id = `pattern-input-${index}`;
  patternInput.value = rule.pattern || '';
  patternInput.placeholder = '/path/*/wildcard or /path?with=querystring';
  patternInput.style.display = rule.matchLevel === 'custom' ? 'block' : 'none';
  
  // Pattern helper text
  const patternHelp = document.createElement('div');
  patternHelp.className = 'domain-rule-description';
  patternHelp.textContent = 'Use * as wildcard for path segments. Example: /users/*/repos matches any username. Add query parameters with ?param=value.';
  patternHelp.style.display = rule.matchLevel === 'custom' ? 'block' : 'none';
  
  // Show/hide pattern input when match level changes
  matchLevelSelect.addEventListener('change', (e) => {
    const selectedLevel = e.target.value;
    const isCustom = selectedLevel === 'custom';
    patternLabel.style.display = isCustom ? 'block' : 'none';
    patternInput.style.display = isCustom ? 'block' : 'none';
    patternHelp.style.display = isCustom ? 'block' : 'none';
    descriptionDiv.textContent = isCustom ? 'Custom pattern matching for this domain' : getDescriptionForMatchLevel(selectedLevel);
  });
  
  // Description text
  const descriptionDiv = document.createElement('div');
  descriptionDiv.className = 'domain-rule-description';
  descriptionDiv.textContent = rule.description || getDescriptionForMatchLevel(rule.matchLevel);
  
  // Add everything to the content div
  content.appendChild(domainLabel);
  content.appendChild(domainInput);
  content.appendChild(matchLevelLabel);
  content.appendChild(matchLevelSelect);
  content.appendChild(patternLabel);
  content.appendChild(patternInput);
  content.appendChild(patternHelp);
  content.appendChild(descriptionDiv);
  
  // Add header and content to the rule div
  domainRule.appendChild(header);
  domainRule.appendChild(content);
  
  // Add the rule to the list
  elements.domainExclusionList.appendChild(domainRule);
}

function getDescriptionForMatchLevel(matchLevel) {
  const option = MATCH_LEVEL_OPTIONS.find(opt => opt.value === matchLevel);
  return option ? option.description : '';
}

function handleAddDomainRule() {
  // Create new empty rule
  const newRule = {
    domain: '',
    matchLevel: 'disabled',
    description: 'No partial matching for this domain'
  };
  
  // Get current domain rules
  const domainRules = getCurrentDomainRules();
  domainRules.push(newRule);
  
  // Add to UI
  addDomainRuleToUI(newRule, domainRules.length - 1);
}

function handleResetDefaultDomains() {
  if (confirm('Are you sure you want to reset to default domain rules? This will remove any custom rules you\'ve added.')) {
    loadDomainRules(DEFAULT_DOMAIN_RULES);
  }
}

function handleRemoveDomainRule(index) {
  // Get the current rules
  const domainRules = getCurrentDomainRules();
  
  // Remove the rule at the specified index
  domainRules.splice(index, 1);
  
  // Reload the rules in UI
  loadDomainRules(domainRules);
}

function handleMoveDomainRule(index, direction) {
  // Get the current rules
  const domainRules = getCurrentDomainRules();
  
  if (direction === 'up' && index > 0) {
    // Swap with previous rule
    [domainRules[index], domainRules[index - 1]] = [domainRules[index - 1], domainRules[index]];
  } else if (direction === 'down' && index < domainRules.length - 1) {
    // Swap with next rule
    [domainRules[index], domainRules[index + 1]] = [domainRules[index + 1], domainRules[index]];
  }
  
  // Reload the rules in UI
  loadDomainRules(domainRules);
}

function getCurrentDomainRules() {
  const domainRules = [];
  const domainRuleElements = elements.domainExclusionList.querySelectorAll('.domain-rule');
  
  domainRuleElements.forEach(ruleElement => {
    const domainInput = ruleElement.querySelector('input[type="text"][id^="domain-input-"]');
    const matchLevelSelect = ruleElement.querySelector('select');
    const patternInput = ruleElement.querySelector('input[type="text"][id^="pattern-input-"]');
    const descriptionDiv = ruleElement.querySelector('.domain-rule-description:last-child');
    
    domainRules.push({
      domain: domainInput.value.trim(),
      matchLevel: matchLevelSelect.value,
      pattern: patternInput ? patternInput.value.trim() : '',
      description: descriptionDiv.textContent
    });
  });
  
  return domainRules;
}

// Handle clear cache button
async function handleClearCache() {
  const button = elements.clearCacheButton;
  button.disabled = true;
  button.classList.add('loading');
  try {
    await chrome.storage.local.remove(['urlCache', 'lastSyncTimestamp']);
    displayStatus('cache-action-status', 'Cache and sync timestamp cleared successfully', 'success');
  } catch (error) {
    console.error("Error clearing cache:", error);
    displayStatus('cache-action-status', `Error clearing cache: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.classList.remove('loading');
  }
}

// Handle force full sync button
async function handleForceFullSync() {
    const button = elements.forceFullSyncButton;
    // Disable button and show loading state
    button.disabled = true;
    button.classList.add('loading');
    displayStatus('cache-action-status', 'Triggering full sync... This may take some time.', 'info', 15000); // Longer duration for sync message

    try {
        // Send message and wait for response
        const result = await chrome.runtime.sendMessage({ action: 'forceFullSync' });
        
        // Handle response
        if (result && result.success) {
            displayStatus('cache-action-status', `Full sync complete. Processed ${result.pagesProcessed || 0} pages. Updated ${result.urlsUpdated || 0} URLs.`, 'success');
        } else if (result) {
            displayStatus('cache-action-status', `Sync failed: ${result.error || 'Unknown error'}`, 'error');
        } else {
             displayStatus('cache-action-status', 'Sync failed: No response from background script.', 'error');
        }

    } catch (error) {
        console.error('Error sending forceFullSync message:', error);
        displayStatus('cache-action-status', `Error triggering sync: ${error.message}`, 'error');
    } finally {
        // Re-enable button and remove loading state regardless of outcome
        button.disabled = false;
        button.classList.remove('loading');
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
    const domainRules = getCurrentDomainRules();
    const aggressiveCachingEnabled = elements.aggressiveCachingToggle.checked;
    
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
    
    // Validate domain rules
    for (const rule of domainRules) {
      if (!rule.domain) {
        throw new Error('All domain rules must have a domain specified');
      }
    }
    
    // Prepare data to save
    const oldSettings = await loadSettings();
    const dataToSave = {
      authMethod: 'token',
      integrationToken,
      cacheDuration,
      domainRules,
      aggressiveCachingEnabled
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
    
    displayStatus('save-status', 'Settings saved successfully', 'success');

     // Trigger background actions if needed
     if (triggerFullSync) {
        displayStatus('cache-action-status', 'Database settings changed, triggering full sync...', 'info', 10000);
        // Don't await this, let it run in background
        chrome.runtime.sendMessage({ action: 'forceFullSync' }).catch(err => console.error("Error triggering sync after save:", err));
     } else if (oldSettings.cacheDuration !== cacheDuration || oldSettings.lastEditedPropertyName !== lastEditedPropertyName) {
         // Reschedule alarm if cache duration or lastEditedProperty changed
         displayStatus('cache-action-status', 'Rescheduling background sync...', 'info');
         chrome.runtime.sendMessage({ action: 'rescheduleSyncAlarm' }).catch(err => console.error("Error rescheduling sync alarm:", err));
     }

  } catch (error) {
    console.error('Error saving settings:', error);
    displayStatus('save-status', 'Error saving settings: ' + error.message, 'error');
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

// Initialize the options page
document.addEventListener('DOMContentLoaded', init); 