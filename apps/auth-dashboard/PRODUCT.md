# Otakuma Auth Dashboard

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro with server-side rendering on Cloudflare Workers. The dashboard calls the
auth Worker through a Cloudflare service binding so authentication cookies and
management traffic stay first-party on the dashboard origin.

## Users

- Otakuma Auth members who need a clear view of their own identity, account
  access, and sign-in security after signing in.
- The sole superuser administering identity infrastructure. They create and
  maintain end users, protected APIs, and the OAuth Applications allowed to call
  each API.

## Product Purpose

Provide one first-party account surface for Otakuma Auth. Success means a member
lands on a trustworthy profile, can protect their own sign-in, and never needs
management access for account security. The superuser can also enter the
operational console, understand the identity estate, make routine changes
safely, and retrieve a newly issued Application credential exactly once.

## Operating Context

Members use the profile after authentication. The superuser also uses the
dashboard during infrastructure and application administration. The first visit
is a bootstrap flow: a short-lived, single-use token held in Workers KV creates
the only superuser. Later visits use the Better Auth session.

## Capabilities and Constraints

- The domain hierarchy is API to many Applications. “Client” is not a product
  term; OAuth client records appear as Applications.
- Profile is the default authenticated page for a member; the management
  dashboard remains the default for the superuser.
- Every signed-in member can manage Passkeys, an authenticator app, and recovery
  codes from Account Security. Either a Passkey or verified authenticator app
  makes the account's MFA protection enabled.
- A registered Passkey protects later password sign-ins as a second factor;
  Passkey-first sign-in satisfies MFA through required device user verification.
- A password challenge accepts only a Passkey owned by the account that passed
  the password check. Verified TOTP and recovery codes remain alternatives.
- Only the single superuser may access management data or actions.
- The superuser can inspect another user's read-only profile and bounded account
  activity without receiving that user's personal Security controls.
- Management access is computed by the auth Worker and never inferred from a
  browser-supplied role.
- The current superuser cannot delete themselves or revoke their own active
  access through the dashboard.
- Destructive actions require explicit confirmation.
- Newly generated application credentials are displayed once and never logged
  or persisted by the dashboard.
- TOTP setup keys and recovery codes remain transient browser state. Recovery
  codes are shown only after verification or explicit regeneration and require
  acknowledgement before dismissal.
- Workers KV holds the expiring bootstrap token digest. D1 provides the atomic
  consumption record because KV is eventually consistent.
- The auth Worker owns users, account activity, APIs, applications, sessions,
  and bootstrap state.

## Brand Commitments

Use the familiar operational language and interaction quality of Auth0, paired
with Cloudflare dashboard conventions. Prefer clarity and predictable controls
over novelty.

## Evidence on Hand

The repository contains a Better Auth OAuth 2.1 provider backed by D1 and a
gateway that reaches auth through a Cloudflare service binding. No production
customer data, usage metrics, or visual brand assets are available and none
should be fabricated.

## Product Principles

- Make the relationship between APIs and Applications immediately legible.
- Keep personal identity legible without exposing management navigation to a
  member.
- Put irreversible consequences next to the action that causes them.
- Keep credentials transient and make secure handling explicit.
- Keep self-service account security separate from administrator authority.
- Present administrator account inspection as a management view, never as an
  impersonated personal account page.
- Treat bootstrap as a one-way transition into normal authenticated operation.
- Favor operational density that remains comfortable on desktop and mobile.
