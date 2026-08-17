---
version: 1
slug: "s-auth-dashboard-src-layouts-dashboardlayout-astro"
primary_target: "apps/auth-dashboard/src/layouts/DashboardLayout.astro"
related_targets: ["apps/auth-dashboard/src/pages/apis.astro","apps/auth-dashboard/src/pages/applications.astro","apps/auth-dashboard/src/pages/users.astro","apps/auth-dashboard/src/pages/users/[id].astro","apps/auth-dashboard/src/pages/bootstrap.astro","apps/auth-dashboard/src/pages/sign-in.astro"]
---

# Auth operations workbench

- Mode: Operate.
- Audience: the sole Otakuma Auth superuser maintaining identity infrastructure.
- Job: inspect and safely manage users, protected APIs, and the Applications assigned to each API, including a user's successful account activity.
- Primary actions: create and update objects; inspect read-only user profiles and activity; revoke sessions; rotate credentials; explicitly confirm destructive changes.
- Content: real Better Auth and D1 records only, with API-to-Applications as the organizing relationship and privacy-safe user activity kept in management context.
- Constraints: first-party Astro SSR through the auth service binding; desktop and mobile; no role grants; no superuser self-delete or self-revoke; credentials appear once.
- Direction: Auth0 management canon with Cloudflare operational density, ink-navy navigation, white work surfaces, and signal-orange actions.
- Memorable moment: the master-detail view keeps an API or Application selected while its configuration and consequences remain visible.
- Unresolved: visual screenshot QA requires an available browser instance.
