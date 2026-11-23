# StageCraft Page Builder Collaboration & AI (`Solcart_StageCraft`)

**StageCraft Page Builder Collaboration & AI by Solcart Commerce** — Free Collaborative Page Builder Comments, Review Threads & Optional Managed Cloud AI (**Solcart AI** — `https://www.solcart.dev`) for Adobe Commerce and Magento Open Source Page Builder.

## Overview

`Solcart_StageCraft` brings visual editorial collaboration, threaded review workflows, and optional managed Cloud AI directly into the Magento 2 Page Builder stage:

### Free Collaboration Features (`StageCraft`)
- **Row, Column-Group & Column Stage Comments**: Attach threaded comments directly to Page Builder `Row`, `Column Group`, and `Column` containers via native `.pagebuilder-options-links` hover menus and compact top-right comment counter badges.
- **Stable Element Identity + Structural Fallback**: Persists a stable `data-collab-id` / `rb-collab-id-*` identifier on commented containers so threads remain anchored when rows are reordered, alongside structural stage path tracking (`row:0`, `row:1/column-group:0/column:0`).
- **Page-Level Comments & StageCraft Activity Drawer**: Includes a streamlined icon-only Page Builder header toolbar with Page-level comments, a slide-out StageCraft Collaboration Activity drawer, filter chips (`All`, `Open`, `Page`, `Rows & Blocks`, `@Mentions`, `Resolved`), and one-click **Jump to Element** smooth scrolling with highlight pulse.
- **Threaded Replies, Resolve Attribution & `@username` Mentions**: Full reply threads, open/resolved status toggles with resolver attribution and timestamps, and `@username` admin user mention autocomplete.

### Optional Managed Cloud AI (`Solcart AI` — 30 Free Starter Credits + Credit Packs & Pro Auto-Refill)
- **Inline Solcart AI Page Scaffolder (Above `Content`)**:
  - Draft or iteratively refine multi-row Page Builder layouts (`Columns`, `Tabs`, `Sliders`, `Banners`, `Headings`, `Text`, `Buttons`, `HTML`, `Video`, `Dividers`, and external/CDN `<img>` embeds) directly above the `Content` section.
  - **Smart Append (Diff)**: Compares the AI blueprint against existing stage rows — preserving unchanged rows, updating modified rows in place, and appending only newly added rows.
  - **One-Click Page & SEO Population**: Automatically populates `Page Title`, `Content Heading`, `URL Key`, `Meta Title`, `Meta Keywords`, `Meta Description`, and `Design > Layout`.
- **Stage-Level Row & Column AI Assistant**:
  - Open Solcart AI on any `Row`, `Column Group`, or `Column` to scaffold or refine inner blocks, button links (`button_link` / `open_in_new_tab`), backgrounds, alignments, borders, and padding.
  - **✦ Apply & Resolve Thread**: Passes the collaborative comment thread to Solcart AI, applies the requested layout/copy changes, and resolves the thread in one click.
  - **✦ Run AI Page Audit**: Scans Page Builder stage rows and posts structured conversion & copy review threads authored by `@AI-Reviewer` (`Solcart AI Reviewer`).

## Adobe Commerce Marketplace Compliance

- **Declarative Schema**: Uses `etc/db_schema.xml` and `etc/db_schema_whitelist.json` (`solcart_stagecraft_comment` table with foreign keys to `admin_user` and self-referencing cascade for replies).
- **Service Contracts (`@api`)**:
  - `Solcart\StageCraft\Api\Data\CommentInterface`
  - `Solcart\StageCraft\Api\Data\CommentSearchResultsInterface`
  - `Solcart\StageCraft\Api\CommentRepositoryInterface`
  - `Solcart\StageCraft\Api\CollaborationManagementInterface`
  - `Solcart\StageCraft\Api\AiGatewayServiceInterface`

## Installation & Setup

```bash
composer require solcart/module-stage-craft
bin/magento module:enable Solcart_StageCraft
bin/magento setup:upgrade
bin/magento cache:flush
```

## Admin Configuration

Navigate to **Stores > Configuration > General > Solcart StageCraft — PageBuilder Collaboration & AI**:

1. **Enable PageBuilder Collaboration**: Yes / No
2. **Enable Page-Level Comments**: Yes / No
3. **Show Floating Comment Badges on Rows & Columns**: Yes / No
4. **Comment Auto-Refresh Interval (Seconds)**: Background polling interval in seconds (`0` to disable).
5. **Solcart AI Assistant (Powered by Solcart AI)**:
   - **Enable Solcart AI**: Master switch for AI features.
   - **Enable AI Page Scaffolder (Above Content)**: Toggle the inline full-page scaffolder independently.
   - **Enable Stage-Level AI (Rows, Columns & Page Audit)**: Toggle stage hover AI icons and Page Audit independently.
   - **Starter Credits & Credit Packs**: 1-click **Claim 30 Free Starter Credits** (never expire), on-demand one-time Credit Packs (`500` or `1,500` credits), and optional monthly Pro Auto-Refill.

## Public Sandbox / Demo Mode

For public `/admin` demo sites showcasing StageCraft's free collaborative features while keeping Cloud AI locked with **"AI Features Disabled For Demo"** banners across the Admin header, Page Scaffolder, Stage toolbar, and Configuration screen, add the following to `app/etc/env.php`:

```php
'solcart_stagecraft' => [
    'demo_mode' => true,
],
```
