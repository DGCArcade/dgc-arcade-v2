---
name: DGC Arcade withdrawal lifecycle & geo gate
description: Two durable design invariants — withdrawal status must stay "pending", and the location gate is client-attested (forgeable).
---

# Withdrawal lifecycle invariant: status is "pending", never "flagged"

A withdrawal that passes the auto-decline check must be written with
`status: "pending"`. The manual-review signal goes in
`metadata.flaggedForReview` (a boolean), NOT in the status column.
The deduct-balance + insert-transaction pair must run inside ONE
`db.transaction(...)` so a failed insert rolls back the deduction (no funds
lost without a refundable row).

**Why:** every consumer of the withdrawal lifecycle only understands
`pending` / `declined` / `approved` / `rejected` — the admin queue filters
(`/admin/transactions?status=pending`, `/bank/pending-withdrawals`), the
fraud-alert list, the PATCH approve/reject handler, the pending-withdrawal
stat cards, and the admin UI buttons (which only render for `status==="pending"`).
A withdrawal written as `status:"flagged"` deducts the balance but then
becomes invisible/unactionable in every queue → the payout is orphaned.

**How to apply:** never introduce a new withdrawal/payout status without adding
it to ALL of those surfaces. Default to `pending` + a `metadata` flag for any
"needs attention" signal. Re-scoring/fraud display reads metadata, not status.

# The location gate (`/api/users/geo` → `locationVerified`) is client-attested = forgeable

`POST /api/users/geo` trusts the client-supplied `{ ip, countryCode, region }`.
`locationVerified` is granted after a server-side jurisdiction re-check
(`BLOCKED_COUNTRIES` + `ALLOWED_US_STATES`), but that re-check runs against the
CLIENT's values — so a user in a blocked region can POST
`{ ip:"8.8.8.8", countryCode:"US", region:"Indiana" }` and still verify.

Current mitigations in place: the handler only persists fields the client
actually sent (empty/missing → undefined → Drizzle skips them, so a partial
post can't wipe stored geo/device data); and when a real IP IS present it sets
`locationVerified` to the computed boolean (an honest re-check from a now-blocked
region downgrades to false). When no IP is present the value is left untouched.

**Why:** real-money gambling withdrawal gate — this is a compliance/access-control
control, repeatedly flagged by the architect as the residual serious gap.

**How to apply:** before relying on `locationVerified` for actual compliance,
derive geography SERVER-SIDE from the request IP (proxy-aware client IP via a
trusted geo provider) and ignore client-sent country/region/ip. That needs
trust-proxy config (Render sits behind a proxy; `X-Forwarded-For`, currently the
app logs a trust-proxy warning) plus a geo provider — both deployment decisions
the user must sign off on, which is why it was surfaced rather than bolted on.
