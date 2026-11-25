# GroceryPilot

A local, history-driven Walmart grocery assistant for Unraid and Home Assistant. No cameras, sensors, manual pantry maintenance, subscriptions or required GPU. **Human checkout only.**

## Quick start

1. Install [Walmart Invoice Exporter](https://github.com/hppanpaliya/Walmart-Invoice-Exporter) in your own Chrome browser after reviewing its permissions. Collect full invoices, export 6–12 months as JSON (preferred) or complete item CSV. Do not upload receipts to GitHub.
2. Clone this repo. Copy .env.example to .env, set a strong APP_PASSWORD (16+ chars), create data/inbox and give container UID 1000 write access to data. Run docker compose up --build -d.
3. Open http://localhost:8080 on the host (or use an SSH tunnel/private authenticated HTTPS reverse proxy). Login username grocery, password APP_PASSWORD. Compose intentionally binds loopback; change binding only with appropriate LAN security and TLS. Do not expose to the public internet.
4. Import the export through the web UI, or atomically move a complete JSON/CSV export into data/inbox. Inbox is checked once a minute; successful files are archived in data/processed. Archive contains original personal receipts; protect it and delete it when no longer needed. The DB retains an allowlisted normalized snapshot per order. Back up data privately.
5. Review proposed products, quantities and historical prices. Choose Prepare Walmart cart link, then open the link **once**. The third-party-documented affiliate link is not verified with a live Walmart account; it may fail or increment existing cart quantities. Check actual delivery availability, substitutions, price and checkout in Walmart. No purchase API is called.

## Home Assistant

Optional weekly mobile notification: set HA_URL, HA_TOKEN, HA_NOTIFY_SERVICE (notify/mobile_app_yourphone), PUBLIC_URL (the private dashboard URL accessible from your phone), TZ, REVIEW_DAY (0 Sunday to 6 Saturday), REVIEW_HOUR (0–23). Use a dedicated HA user/token where feasible. The app calls HA's REST service once per configured day after the hour; it does not require incoming HA access or an LLM. Dashboard authentication uses HTTP Basic; deploy behind TLS for remote/LAN use. No credentials are stored in Git.

## Data capture

Imports invoice/CSV records, exact Walmart item IDs (from item ID or product URL), purchase date, order ID, product names, quantities, line and unit prices, original price, discounts, category, seller, comparison price, weight and fulfillment notes, unfulfilled items and reasons, order status, store, order totals, tax, fees, tips, refunds, donations and delay where provided. Missing values stay unknown. Address and payment fields are excluded from the database. Raw inbox archives may contain those fields. Purchase frequency, lifetime quantity, last price, median recent price, price change and repeat purchase confidence are derived. No hallucinated product IDs or prices.

Use full order exports only: a later import replaces each matching order snapshot. Partial or filtered line exports could erase missing lines. Multiple accounts are not yet isolated; use one account per instance. Unknown IDs are counted but not automatically suggested. Fully canceled and known unfulfilled lines are excluded; ambiguous status and weighted products need review. Estimates are not pantry inventory, and purchases from other retailers are invisible. Minimum three distinct purchase dates, median recent intervals, median quantity, 7-day lookahead, snooze and exclusion. No automatic checkout or live price promises.

## API

Authenticated GET /api/summary, GET /api/orders. POST /api/import?filename=orders.json with application/octet-stream. POST /api/cart JSON array of {id,qty}; returns a link, not a cart mutation. POST /api/feedback JSON {id,excluded,until}. Data stays local. No public API access.

## Tests and scope

Node.js 24, built-in SQLite, csv-parse. npm install && npm test. CI also builds Docker. This is an MVP, not a verified live Walmart integration. See docs/RESEARCH.md and docs/NEXT.md. No automated Walmart login, private API calls, bot bypass, or checkout. Reuse supported integrations rather than maintaining scrapers.

## Optional read-only MCP sync companion

Run the companion on the machine running the Walmart Invoice Exporter browser extension, not on the NAS unless Chrome runs there too. Install Node 24, clone this repo, run npm install, enable the extension's AI access setting and keep the separate collection-actions toggle off. Collect invoices in the extension itself. The companion reuses its documented localhost MCP relay, reads full saved invoices, paginates, verifies the selected account, strips payment/address fields before forwarding, and skips summaries. It never invokes collection actions or accesses Walmart directly.

Set WALMART_INVOICE_MCP_TOKEN (the extension's pairing token) as an environment variable; run npm run sync:invoices -- --accounts to find the account key. Then set GROCERY_ACCOUNT_KEY to that key. Set either GROCERY_INBOX to a privately mounted NAS inbox directory or GROCERY_URL to your private HTTPS dashboard (or localhost SSH tunnel) and GROCERY_APP_PASSWORD to the app password. Optionally GROCERY_SINCE=YYYY-MM-DD limits the read. Run npm run sync:invoices. Use your OS task scheduler to run this once daily, while the signed-in browser extension is available. No relay ports should be exposed to your LAN. The helper is implemented against the documented MCP and extension source; live browser pairing and transport still need validation. Browser collection itself remains user-initiated; scheduling the read cannot make new invoices appear if the extension hasn't collected them.

Order snapshot revisions are now retained in SQLite, with observed time and source. GET /api/revisions?order=ORDER_ID returns normalized revisions. Raw file archives are still private and may contain sensitive information when importing direct exports. The companion sends only the allowlisted invoice fields.
