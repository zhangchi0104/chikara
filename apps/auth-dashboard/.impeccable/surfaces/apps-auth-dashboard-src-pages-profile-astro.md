---
version: 1
slug: "apps-auth-dashboard-src-pages-profile-astro"
primary_target: "apps/auth-dashboard/src/pages/profile.astro"
related_targets: ["apps/auth-dashboard/src/layouts/AccountLayout.astro","apps/auth-dashboard/src/pages/security.astro","apps/auth-dashboard/src/components/ProfileMenu.tsx","apps/auth-dashboard/src/components/TwoFactorPanel.astro","apps/auth-dashboard/src/scripts/two-factor.ts","apps/auth-dashboard/src/styles/security.css"]
---

# Personal identity and account access

- Mode: Operate.
- Audience: every signed-in Otakuma Auth member, including the sole administrator.
- Job: confirm personal identity and access, move to dedicated account security, reach management when authorized, or leave the session.
- Primary actions: inspect account facts; open Security; open the account menu; return to the dashboard when authorized; log out.
- Content: server-derived identity and access facts. TOTP, Passkeys, setup keys, and recovery codes belong to the dedicated Security destination.
- Constraints: first-party Astro SSR; every member manages only their own 2FA through the authenticated Better Auth session; management affordances remain administrator-only; setup keys and recovery codes never enter URLs, logs, storage, or SSR; sign-out remains a form action.
- Direction: a persistent ink-navy account rail anchors a centered account workspace; Profile and Security are distinct personal destinations, management return stays administrator-only, and orange remains reserved for intent.
- Responsive: at 820px the rail collapses into a compact dark product bar; at 620px navigation labels condense to accessible icon controls and account rows stack.
- Accessibility: preserve semantic headings and definition data, visible focus, meaningful compact-control labels, synchronized navigation state, and account-menu focus behavior.
- Memorable moment: the opening identity record makes the person and access level legible before any account action.
- Unresolved: none; Profile owns identity facts and Security owns sign-in protection for every member.
