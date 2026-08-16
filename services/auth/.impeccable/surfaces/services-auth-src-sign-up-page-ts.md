---
version: 1
slug: "services-auth-src-sign-up-page-ts"
primary_target: "services/auth/src/sign-up-page.ts"
related_targets: ["services/auth/src/sign-up-page.styles.ts","services/auth/src/sign-up-page.responsive-styles.ts","services/auth/src/pages.ts"]
---

## Scope

Public Better Auth `/sign-up` route. Mode: Operate.

## Audience and job

An Otakuma Auth user arriving from an OAuth authorization request needs to create an
email-and-password identity, understand that the request remains protected, and
continue back to the requesting app.

## Task and constraints

Collect full name, email, and an eight-character-minimum password. Preserve the
signed OAuth query when switching to sign-in and when submitting registration.
Keep the dashboard's Identity Workbench palette and control language. Do not
change the sign-in or native consent form behavior.

## Direction

Inset sheet: a full navy identity canvas carries the return route and a single
large paper form sheet. The memorable moment is the geometric route joining the
identity statement to the protected handoff. Approved comp:
`.impeccable/mocks/sign-up-inset-sheet.png`.

On desktop, identity and route geometry occupy the left field while the complete
form remains on the inset sheet at right. On mobile, the sheet stacks over the
navy field without dropping the authored shield-and-check or the explicit
signed-request assurance; only the protocol micro-label yields at the narrowest
viewport.

## Finish

Verdict: **Ship.** The desktop and mobile protection semantics are resolved, and
the finish review has no remaining findings.

## Unresolved

No public terms or privacy routes are currently defined, so the page makes no
legal-link claims.
