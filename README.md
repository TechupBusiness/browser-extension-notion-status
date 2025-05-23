# Notion Status Browser Extension

This browser extension shows whether the current webpage URL is stored in your selected Notion database. The extension icon turns green if the URL is found, red if it isn't and orange if the beginning domain/folder of the URL are found (but not the full current URL).

![Extension Status Examples](images/screenshot-status-green.png)   

*Example: Green status indicating the current URL is found in your Notion database*

## Features

- Easy setup with Notion Integration Token
- Shows green/red/orange/gray status in the toolbar icon
- Configurable caching to reduce Notion API calls
- Optional "Aggressive Caching" mode (Beta) to proactively determine status on tab switch
- Configurable console log level for debugging
- Automatic background syncing based on Last Edited Time
- Cache-only checks during normal browsing for better performance
- Full API checks when you click the extension icon
- Works with Chrome and Firefox (and other browsers too)

## Installation

### Chrome

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the extension directory
5. Click on the extension icon and then "Options" to set up your Notion connection

### Firefox

1. Clone or download this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..." and select the manifest.json file in the extension directory
4. Click on the extension icon and then "Options" to set up your Notion connection

## Setup

Before using the extension, you need to set it up with your Notion Integration Token:

![Options Page](images/screenshot-options.png)   

*The extension options page where you configure your Notion connection*

1. Create an Internal Integration at https://www.notion.so/my-integrations
   - Give it a name (e.g., "Notion Status Extension")
   - Select your workspace
   - Set capabilities to at least "Read content"
   - Set the type to "Internal integration"

2. After creating the integration, copy the "Internal Integration Token"

3. Open the extension options page

4. Enter your Integration Token

5. Click "Connect to Notion" to authenticate

6. **IMPORTANT**: You must manually share your database with the integration:
   - In Notion, open the database you want to use
   - Click the "Share" button in the top-right corner
   - Hover on "Connections"
   - Search for your connection by name and click on it
   - If you don't see your database in the extension after this step, click "Refresh Databases"

7. Select your database containing the URLs

8. Select the URL property (must be a URL type property)

9. Select a Last Edited Time property (for efficient delta syncing)

10. Set your preferred cache duration

11. Configure advanced options (see below)

12. Save settings

### Cache and Sync Settings

- **Cache Duration**: How long the extension should remember the status of a URL before checking again (applies mainly to GREEN status; RED/ORANGE statuses persist longer).
- **Clear Cache**: Manually clears the extension's local cache of URL statuses.
- **Force Full Sync**: Manually triggers a complete download of all URLs from your selected Notion database into the local cache. Useful for initial setup or if sync seems broken.

### Advanced Options (Cache Settings Section)

- **Aggressive Caching (Beta)**:
  - **Disabled (Default)**: When switching tabs, if the cache doesn't definitively know the status (e.g., first time seeing a URL, or a known GREEN entry expired), the icon will show GRAY. Clicking the icon triggers an API check for the final status.
  - **Enabled**: When switching tabs and the cache is inconclusive, the extension will attempt to determine the RED/ORANGE status by comparing the current URL against *all* known GREEN URLs currently in the cache. This reduces GRAY icons but **may impact browser performance** if your Notion database and cache are very large.
- **Console Log Level**: Controls how much information the extension logs to the browser's background console (useful for debugging).
  - `Error`: Logs only critical errors.
  - `Warn`: Logs errors and warnings.
  - `Info` (Default): Logs errors, warnings, and major actions (like sync start/end, state changes).
  - `Debug`: Logs detailed step-by-step information (most verbose).

## How It Works

1. When you visit a webpage, the extension checks its local cache for the URL status (considering variations and domain rules).
2. The icon shows:
   - Green if the URL is confirmed present.
   - Orange if a similar URL (ancestor/pattern match) is confirmed present.
   - Red if the URL is confirmed absent.
   - Gray if the cache status is inconclusive (requires API check), the URL type is excluded by domain rules, or the extension isn't configured.

   | Status | Meaning | Example |
   |--------|---------|---------|
   | ![Green Status](images/screenshot-status-green.png) | URL found in Notion | The exact URL is in your database |
   | ![Orange Status](images/screenshot-status-orange.png) | Similar URL found | A parent URL or domain match is found |
   | ![Red Status](images/screenshot-status-red.png) | URL not found | No matching URL in your database |
   | ![Gray Status](images/screenshot-status-gray.png) | Status unknown | Extension not configured or browser URL |

3. Clicking on the extension icon triggers a fresh check with the Notion API
4. The extension uses a cache to minimize API calls, with your configurable duration
5. Background syncing periodically updates the cache based on changes in your Notion database

## Sync Options

The extension provides two ways to sync with your Notion database:

1. **Delta Sync** (Automatic): The extension periodically checks for pages that have been modified since the last sync using the Last Edited Time property. This is efficient and minimizes API calls.

2. **Full Sync** (Manual): You can trigger a complete sync from the options page using the "Force Full Sync" button. This is useful for initial setup or if you suspect the cache is out of sync.

## Domain Exclusion Rules & Custom Patterns

The extension allows you to customize how "similar" URLs are detected through domain rules:

![Orange Status Example](images/screenshot-status-orange.png)   

*Example: Orange status showing a similar URL found (based on domain/path pattern matching)*

### Pattern Syntax

When using custom patterns, you can use the following special characters:

- `*` - Matches any single path segment
- `**` - Matches multiple path segments (all remaining segments)
- Query parameters can use wildcards too with `param=*`

### Examples:

- **GitHub repositories**: `/*/repo*` matches any user's repo (github.com/username/reponame)
- **YouTube videos**: `/watch?v=*` matches any video ID
- **Reddit threads**: `/r/*/comments/*/*` matches threads in any subreddit
- **Stack Overflow**: `/questions/*` matches any question ID

### How It Works

The pattern system breaks down a URL into path segments and query parameters:

1. Path segments are compared one-by-one with the pattern
2. Wildcards are replaced with the actual content from the URL
3. For query parameters, you can specify exact matches or use wildcards
4. The system generates an "ancestor URL" based on your pattern

For example, with a GitHub URL like `github.com/user1/repo1/issues/123`:
- Pattern `/*/repo*` would match and create `github.com/user1/repo1` as the ancestor URL
- Pattern `/user1/**` would match and create `github.com/user1` as the ancestor URL

This gives you precise control over which URLs should be considered "similar" for the orange icon state.

### Default Patterns

The extension comes with pre-configured patterns for common websites:

| Website | Pattern | Match Level |
|---------|---------|------------|
| GitHub | `/*/repo*` | Repository level |
| GitLab | `/*/project*` | Repository level |
| Reddit | `/r/*/comments/*/*` | Thread level |
| Twitter/X | `/*` | Profile level |
| YouTube | `/watch?v=*` | Video level |
| Stack Overflow | `/questions/*` | Question level |
| LinkedIn | `/in/*` | Profile level |
| Amazon | `/dp/*` | Product level |
| Medium | `/@*/*` | Article level |

The extension also includes rules to automatically ignore browser-specific URLs (like chrome:// or about: pages):

![Gray Status Example](images/screenshot-status-gray.png)   

*Example: Gray status for a browser-specific URL that is excluded from checking*

## Note About Notion API

This extension uses Notion's official API with an Integration Token. The Integration Token does not expire unless you manually revoke it from your Notion settings.

You must share your database with the integration for it to work:

1. In Notion, open the database you want to use
2. Click the "Share" button in the top-right corner
3. Click "Add people, emails, groups, or integrations"
4. Search for your integration by name and select it
5. Click "Invite"

If you don't see your database in the extension after sharing, click "Refresh Databases" in the extension options.

## Development

To modify or extend this extension:

1. Edit the files as needed
2. For Chrome, just reload the extension on the extensions page
3. For Firefox, you'll need to reload the temporary add-on

### Icon Generation

The PNG icons used by the extension (`icons/png/*.png`) are generated from the SVG source files (`icons/*.svg`). This ensures the icons scale correctly, especially at smaller sizes. If you modify the SVGs or need to regenerate the PNGs, you can use ImageMagick (ensure it's installed).

Run the following commands from the project root directory:

```bash
# Generate gray icons
convert -background none -resize 16x16 icons/gray_n.svg icons/png/gray_n_16.png
convert -background none -resize 32x32 icons/gray_n.svg icons/png/gray_n_32.png
convert -background none -resize 48x48 icons/gray_n.svg icons/png/gray_n_48.png
convert -background none -resize 128x128 icons/gray_n.svg icons/png/gray_n_128.png

# Generate green icons
convert -background none -resize 16x16 icons/green_n.svg icons/png/green_n_16.png
convert -background none -resize 32x32 icons/green_n.svg icons/png/green_n_32.png
convert -background none -resize 48x48 icons/green_n.svg icons/png/green_n_48.png
convert -background none -resize 128x128 icons/green_n.svg icons/png/green_n_128.png

# Generate red icons
convert -background none -resize 16x16 icons/red_n.svg icons/png/red_n_16.png
convert -background none -resize 32x32 icons/red_n.svg icons/png/red_n_32.png
convert -background none -resize 48x48 icons/red_n.svg icons/png/red_n_48.png
convert -background none -resize 128x128 icons/red_n.svg icons/png/red_n_128.png

# Generate orange icons
convert -background none -resize 16x16 icons/orange_n.svg icons/png/orange_n_16.png
convert -background none -resize 32x32 icons/orange_n.svg icons/png/orange_n_32.png
convert -background none -resize 48x48 icons/orange_n.svg icons/png/orange_n_48.png
convert -background none -resize 128x128 icons/orange_n.svg icons/png/orange_n_128.png
```

*(Note: Newer versions of ImageMagick recommend using `magick` instead of `convert`)*

## License

MIT 