# Chikara Auth Dashboard

An Astro server-rendered operations console deployed to Cloudflare Workers. It
manages the auth Worker's users, protected APIs, and OAuth Applications through
the `AUTH` service binding.

## Local development

From the repository root:

```sh
bun install
bun run migrate
bun run --cwd services/auth dashboard:token
bun run --cwd apps/auth-dashboard dev
```

Open `http://localhost:4321/bootstrap` and use the printed token to create the
sole superuser. The Astro adapter starts the auth Worker as a development-only
auxiliary Worker and persists its D1 and KV state in
`services/auth/.wrangler/state`.

The auth service's `.dev.vars` must include `http://localhost:4321` in
`AUTH_TRUSTED_ORIGINS`. In production, use the deployed dashboard origin.

## Deployment

The auth Worker must be deployed before the dashboard because the dashboard's
`AUTH` binding targets the `auth` Worker:

```sh
bun run deploy:auth-dashboard
```

Generate a remote bootstrap token only after the auth Worker's KV binding is
provisioned:

```sh
bun run --cwd services/auth dashboard:token:remote
```

## Verification

```sh
bun run check
bun run build
```

Astro uses TypeScript 6 locally because `astro check` requires TypeScript's
programmatic API; the rest of the monorepo can continue using the cataloged
TypeScript 7 compiler.
