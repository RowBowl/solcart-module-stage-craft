# Solcart StageCraft (`Solcart_StageCraft`)

**StageCraft by Solcart Commerce** — Collaborative Page and Content-Type (Row) Floating Comments & Managed AI Assistant (Powered by **Solcart AI** — `https://www.solcart.dev`) for Adobe Commerce and Magento Open Source Page Builder.

## Overview

`Solcart_StageCraft` brings real-time editorial collaboration, visual stage review workflows, and managed Cloud AI tools directly into the Magento 2 Page Builder stage:

- **Floating Row & Content-Type Comments**: Attach threaded comments to individual Page Builder `Row` containers and configurable content types (`Text`, `Heading`, `Banner`, `Column`, `HTML`, `Products`, etc.).
- **Stable Row Identity + Structural Fallback**: Persists a stable `data-collab-id` / `rb-collab-id-*` identifier on commented Rows so threads remain attached even when Rows are reordered, while also storing a structural stage path (`row:0`, `row:1/column:0/text:0`).
- **Page-Level Comments & Collaboration Activity Drawer**: Includes a Page Builder header collaboration bar with Page-level comments, a slide-out Collaboration Activity drawer, filter chips (`All`, `Open`, `Page`, `Rows & Blocks`, `@Mentions`, `Resolved`), and one-click **Jump to Element** smooth scrolling with highlight pulse.
- **Threaded Replies & Resolve Workflow**: Full reply threads, open/resolved status toggles with resolver attribution and timestamps, and `@username` admin user mention autocomplete.
- **Powered by Solcart AI (`solcart.dev`)**:
  - **✦ Apply & Resolve Thread**: Passes the entire collaborative comment thread to Solcart AI in `Build` mode, previews the HTML update, and lets editors **Inject & Resolve Thread** in one click.
  - **✦ Run AI Page Audit**: Scans the Page Builder stage rows and posts structured conversion & copy critique threads authored by `@AI-Reviewer` (`Solcart AI Reviewer`).
  - **Row Scaffolder & Container Injection**: Generates multi-column responsive HTML sections and injects directly into blocks or child containers.

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
bin/magento module:enable Solcart_StageCraft
bin/magento setup:upgrade
bin/magento cache:flush
```

## Admin Configuration

Navigate to **Stores > Configuration > General > Solcart StageCraft — PageBuilder Collaboration & AI**:

1. **Enable PageBuilder Collaboration**: Yes / No
2. **Enable Page-Level Comments**: Yes / No
3. **Show Floating Comment Badges on Stage**: Yes / No
4. **Enabled Content Types for Comments**: Multi-select (`Row`, `Column`, `Text`, `Heading`, `Banner`, `Slider`, `Slide`, `HTML Code`, `Image`, `Buttons`, `Dynamic / CMS Block`, `Products`, `Tabs`, `Video`, `Map`, `Divider`)
5. **Solcart AI Assistant (Powered by Solcart AI)**: Enable AI, 1-click **Activate Free 14-Day AI Trial**, Brand Voice, and Subscription Billing Portal.
