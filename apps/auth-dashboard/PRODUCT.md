# Otakuma Auth Dashboard

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro with server-side rendering on Cloudflare Workers. The dashboard calls the
auth Worker through a Cloudflare service binding so authentication cookies and
management traffic stay first-party on the dashboard origin.

## Users

The sole Otakuma Auth superuser administering identity infrastructure. They create
and maintain end users, protected APIs, and the OAuth applications allowed to
call each API.

## Product Purpose

Provide one operational console for Otakuma Auth. Success means the
superuser can understand the current identity estate, make routine changes
safely, and retrieve a newly issued application credential exactly once.

## Operating Context

The dashboard is used during infrastructure and application administration.
The first visit is a bootstrap flow: a short-lived, single-use token held in
Workers KV creates the only superuser. Later visits use the Better Auth session.

## Capabilities and Constraints

- The domain hierarchy is API to many Applications. “Client” is not a product
  term; OAuth client records appear as Applications.
- Only the single superuser may access management data or actions.
- The current superuser cannot delete themselves or revoke their own active
  access through the dashboard.
- Destructive actions require explicit confirmation.
- Newly generated application credentials are displayed once and never logged
  or persisted by the dashboard.
- Workers KV holds the expiring bootstrap token digest. D1 provides the atomic
  consumption record because KV is eventually consistent.
- The auth Worker owns users, APIs, applications, sessions, and bootstrap state.

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
- Put irreversible consequences next to the action that causes them.
- Keep credentials transient and make secure handling explicit.
- Treat bootstrap as a one-way transition into normal authenticated operation.
- Favor operational density that remains comfortable on desktop and mobile.
