# Notion Status Browser Extension

This browser extension shows whether the current webpage URL is stored in your selected Notion database. The extension icon turns green if the URL is found, red if it isn't and orange if the beginning domain/folder of the URL are found (but not the full current URL).

## Features

- Easy setup with Notion Integration Token
- Shows green/red/orange status in the toolbar icon
- Configurable caching to reduce Notion API calls
- Automatic background syncing based on Last Edited Time
- Cache-only checks during normal browsing for better performance
- Full API checks when you click the extension icon
- Works with Chrome and Firefox
- SVG icons for crisp rendering at all scales

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

1. Create an Internal Integration at https://www.notion.so/my-integrations
   - Give it a name (e.g., "Notion Status Extension")
   - Select your workspace
   - Set capabilities to at least "Read content"
   - Set the type to "Internal integration"

2. After creating the integration, copy the "Internal Integration Token"

3. Open the extension options page

4. Enter your Integration Token

5. Click "Connect to Notion" to authenticate

6. Select your database containing the URLs

7. Select the URL property (must be a URL type property)

8. Select a Last Edited Time property (for efficient delta syncing)

9. Set your preferred cache duration

10. Save settings

## How It Works

1. When you visit a webpage, the extension checks if the URL is in your Notion database using its local cache
2. The icon shows:
   - Green if the URL is found in your database
   - Orange if a parent URL (like the domain or folder) is found
   - Red if the URL is not found
   - Gray if the status is unknown or the extension is not configured

3. Clicking on the extension icon triggers a fresh check with the Notion API
4. The extension uses a cache to minimize API calls, with your configurable duration
5. Background syncing periodically updates the cache based on changes in your Notion database

## Sync Options

The extension provides two ways to sync with your Notion database:

1. **Delta Sync** (Automatic): The extension periodically checks for pages that have been modified since the last sync using the Last Edited Time property. This is efficient and minimizes API calls.

2. **Full Sync** (Manual): You can trigger a complete sync from the options page using the "Force Full Sync" button. This is useful for initial setup or if you suspect the cache is out of sync.

## Note About Notion API

This extension uses Notion's official API with an Integration Token. The Integration Token does not expire unless you manually revoke it from your Notion settings.

You must share your database with the integration for it to work. In your Notion database, click "Share" and select your integration from the list.

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