# Revoltz Restaurant OS — Pilot UI

This is the first runnable UI prototype for the restaurant product. It is deliberately separate from the existing AgencyOS frontend and production routes.

## Run the prototype

Open `index.html` in a modern desktop or mobile browser. No build step or API key is required.

## Included in this prototype

- Responsive restaurant POS layout.
- Sample Indian menu, category filters and editable menu/prices.
- Dine-in, takeaway and delivery order types.
- Cart quantity controls and demo subtotal/tax/total calculation.
- Local order creation and order history.
- Kitchen ticket queue with New → Preparing → Ready and cancellation.
- Mark orders served.
- Daily sales, tax and payment-method summaries.
- CSV export for order history and daily report.
- Local browser persistence using a product-specific localStorage namespace.

## Important limitations

This is a UI/workflow prototype, **not production-ready restaurant software**:
- Data is stored only in the current browser profile and can be lost when browser storage is cleared.
- No server, sign-in, tenant isolation, cloud sync, backups, audit-grade event log or multi-device concurrency.
- The 5% tax is illustrative only. It is not a GST recommendation and must not be used for live billing.
- Payments are only recorded as a tender label. No payment is charged or verified.
- No real thermal-printer integration, hardware validation, inventory deductions or external delivery integration.
- No production deployment has been made.

## Manual smoke test

1. Open `index.html`.
2. Add two menu items and change one quantity.
3. Confirm totals update and the place-order button is disabled for an empty cart.
4. Place a demo order; confirm it appears in Kitchen tickets and Order history.
5. Move the ticket to Preparing, then Ready; mark it Served in Order history.
6. Open Menu & prices, edit a price, save, and confirm it persists after a page refresh.
7. Export order history and daily sales CSV.
8. Open the page in another browser profile and confirm data is not shared (expected for this local-only prototype).

## Next implementation step

Replace the local-only demo data layer with tested domain services and persistence, while retaining the offline-first requirement. Before live use, implement proper money arithmetic, configurable/validated tax rules, immutable order/payment events, authentication, server-enforced tenant boundaries, backups and recovery, and automated tests.
