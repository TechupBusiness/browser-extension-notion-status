# Privacy Policy for Notion Status Browser Extension

This privacy policy explains how the Notion Status Browser Extension collects, uses, and protects your information.

## Information Collection and Use

The Notion Status extension collects and processes the following information:

1. **URLs of websites you visit**: The extension checks the URL of each page you visit to determine if it exists in your selected Notion database.

2. **Notion Integration Token**: When you set up the extension, your Notion Integration Token is stored locally on your device to make API requests to Notion.

3. **Notion database and property selections**: Your selections of which database, URL property, and Last Edited Time property to check are stored locally.

4. **Cache data**: Information about which URLs have been checked and their status is cached locally according to your settings.

5. **Sync timestamp**: The last time the extension synced with your Notion database is stored locally to enable efficient delta syncing.

## Data Storage

All data is stored locally on your device using browser storage mechanisms:

- No data is sent to our servers
- Your browsing history and Notion Integration Token never leave your device, except when communicating directly with Notion's API
- Cache data remains on your device and can be cleared at any time through the extension options

## Communication with Notion

The extension communicates directly with the Notion API to:

1. Authenticate using your Integration Token
2. Fetch your list of databases
3. Fetch properties from your selected database
4. Check if URLs exist in your database
5. Periodically sync changes from your database based on Last Edited Time

All communication with Notion is secured using HTTPS.

## Third-Party Services

The only third-party service used by this extension is the Notion API. Please refer to Notion's privacy policy for information on how they handle your data.

## Your Choices

You have control over your data:

- You can disconnect from Notion at any time
- You can clear the URL cache through the extension options
- You can force a full sync or adjust sync intervals through the extension options
- You can uninstall the extension to remove all stored data

## Changes to This Privacy Policy

We may update this privacy policy from time to time. Any changes will be reflected in this document.

## Contact

If you have any questions about this privacy policy, please create an issue in the GitHub repository. 