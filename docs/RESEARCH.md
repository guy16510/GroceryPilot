# Upstream research (2026-11-24)

- [Walmart Invoice Exporter](https://github.com/hppanpaliya/Walmart-Invoice-Exporter): primary ingestion. JSON/CSV, full invoice and incremental collection; inspected upstream tests/order-details-export.test.js for schema. 51 stars, updated Nov 18. Repo metadata did not identify a license; use the existing tool, do not copy its code without permission.
- [Walmart Invoice MCP](https://github.com/hppanpaliya/walmart-invoice-mcp): MIT Node.js relay. Requires extension and pairing token, localhost only, no standalone order collection. Potential optional incremental sync via same-machine client; read-only default. Avoid exposing relay to LAN. Not yet implemented.
- [Printing Press Walmart CLI](https://github.com/mvanhorn/printing-press-library/tree/main/library/commerce/walmart): module documents exact IDs, orders, local availability and affiliate cart link; the parent repo had 2149 stars, not module-specific. Cart link adds/increments; read endpoints are unofficial. Reuse documented URL only, verify manually. Do not implement private API automation unless explicitly authorized by Walmart. No copied upstream code.
- [Walmart Orders CSV](https://github.com/ausboss/wamart-orders-csv): CSV with exact item IDs and line quantities; unofficial endpoint scraping, not a recommended runtime. Import existing files only.
- [StriderLabs MCP](https://github.com/markswendsen-code/mcp-walmart): Node/Playwright, documents stealth bypass and credential handling. Do not use for this project.
- [Walmart Client Go](https://github.com/eshaffer321/walmart-client-go): MIT, unofficial cookie-based order client; not selected.
- [Reduck](https://github.com/reduck-ai/walmart-mcp): browser extension/service dependency, not preferred.
- [MikeBlyth grocery bot](https://github.com/MikeBlyth/walmart-grocery-bot): Ruby/Selenium, manual per-product workflow, unnecessary.
- [Walmart Agent Gateway](https://www.walmart.com/cp/walmart-agent-gateway/1280482): pursue official access and confirm scopes, terms and access before implementation. No live access verified.
- [Walmart developer portal](https://www.walmart.io/): partner API; do not assume consumer access.

Do not install unreviewed dependencies with household credentials. Verify licenses, pin versions and stop on authentication/authorization errors; never bypass anti-bot controls.
