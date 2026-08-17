---
version: 1
slug: "apps-auth-dashboard-src-pages-profile-astro"
primary_target: "apps/auth-dashboard/src/pages/profile.astro"
related_targets: ["apps/auth-dashboard/src/layouts/ProfileLayout.astro","apps/auth-dashboard/src/components/ProfileMenu.astro","apps/auth-dashboard/src/components/TwoFactorPanel.astro","apps/auth-dashboard/src/scripts/profile-menu.ts","apps/auth-dashboard/src/scripts/two-factor.ts","apps/auth-dashboard/src/styles/profile.css","apps/auth-dashboard/src/styles/profile-menu.css","apps/auth-dashboard/src/styles/security.css"]
---

# Personal identity and account access

- Mode: Operate.
- Audience: every signed-in Otakuma Auth member, including the sole administrator.
- Job: confirm personal identity and access, protect the current account with TOTP, reach management when authorized, or leave the session.
- Primary actions: inspect account facts; enroll or manage two-factor authentication; open the account menu; return to the dashboard when authorized; log out.
- Content: server-derived identity and access facts plus the current TOTP state; setup keys and recovery codes appear only inside the active enrollment flow.
- Constraints: first-party Astro SSR; every member manages only their own 2FA through the authenticated Better Auth session; management affordances remain administrator-only; setup keys and recovery codes never enter URLs, logs, storage, or SSR; sign-out remains a form action.
- Direction: a persistent ink-navy account rail anchors a centered identity ledger; Profile is the only personal destination, management return stays administrator-only, and orange remains reserved for intent.
- Responsive: at 820px the rail collapses into a compact dark product bar; at 620px labels condense, account rows stack, the 2FA panel and dialogs stay within a 16px viewport gutter, and recovery codes collapse to one column.
- Accessibility: preserve semantic headings and definition data, visible focus, meaningful compact-control labels, synchronized menu state, password focus on dialog open, live request/error status, Escape focus restoration, and an intentionally locked recovery-code acknowledgement step.
- Memorable moment: the opening identity record makes the person and access level legible before any account action.
- Unresolved: none; Profile enrollment and the shared administrator panel use the same TOTP interaction contract.
