# Notifications & bootstrapping the first admin

## Notifications

`src/components/admin/NotificationBadge.tsx` (+ `src/lib/adminNotifications.ts`).

The dashboard's Verifications and Reports cards show live count badges. On mount
and on every window focus (no polling/websockets) they fetch
`GET /api/admin/notifications/counts` (`{ pendingVerifications, openReports }`
from provider-service) and `GET /api/admin/review-reports/count`
(`{ openReports }` from review-service). The reports badge sums the two report
counts; the verifications badge shows pending verifications.

"New since last viewed" is approximated per-admin, per-browser: each queue page
records a localStorage baseline when opened (`MarkQueueViewed`), and the badge
turns red when the current count exceeds that baseline. Counts above 99 render
as `99+`; a zero count renders nothing.

---

## Bootstrapping the first admin

There are no seeded admin credentials. Create (or promote) the first admin by
running the non-interactive script on **identity-service**:

```bash
# from services/identity-service/
ADMIN_EMAIL=you@baas.lk ADMIN_PASSWORD='...' npm run create-admin
# or: npm run create-admin -- --email you@baas.lk --password '...' [--name "Ops"]
```

Script: `services/identity-service/prisma/create-admin.js`. Password must be
6–100 chars (bcrypt cost 10). Pass `--support` to create/promote a **SUPPORT**
account instead of ADMIN (`npm run create-admin -- --email ops@baas.lk
--password '…' --support`). If the email already exists it **promotes the
account to the chosen tier, resets the password, and bumps `sessionVersion`**
(killing old sessions); otherwise it creates a new account with a verified
email. The Users page role-change control also assigns all four roles
(`CUSTOMER | PROVIDER | ADMIN | SUPPORT`) directly.

See [DEPLOYMENT.md](../DEPLOYMENT.md) for running this in production.
