# Revoltz Restaurant OS backend foundation

This package is isolated from the existing AgencyOS server and deployment.

## Included

- Node.js API process with liveness (/healthz) and database readiness (/readyz) endpoints.
- PostgreSQL migration runner with an advisory lock, migration history and one transaction per migration.
- Initial tenant-scoped schema for restaurants, outlets, memberships, menu, orders, kitchen tickets, payments, inventory, stock movements and audit events.
- PostgreSQL row-level security policies as defense-in-depth; these do not replace authenticated server authorization.

## Run locally

Requires Node.js 22.12+ and a dedicated development PostgreSQL database. Do not point it at the existing AgencyOS or Revoltz-1 databases.

~~~sh
cd restaurant-saas/backend
npm install
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME' npm run migrate
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME' npm start
~~~

Set PGSSLMODE=disable only for a local PostgreSQL server without TLS. PORT defaults to 4100.

## Security boundary / current status

This is a foundation, not a production-ready service. All /api/* data routes intentionally return HTTP 501 until authentication, membership verification, transaction-local tenant context, authorization checks and integration tests are implemented. Do not expose this service publicly with customer data yet.

Before production: add secure password hashing and session lifecycle, email verification/recovery, role-specific permissions, request validation, rate limiting, sensitive-change audit logging, backup/restore verification and tenant-isolation integration tests. Payment rows here record restaurant order tender, not SaaS subscription payments.
