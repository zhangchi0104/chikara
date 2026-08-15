# @chikara/auth

An Effect v4 Hono Cloudflare Worker serving Better Auth as an OAuth 2.1 and
OpenID Connect provider backed by D1.

<!-- effect-solutions:start -->
## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing.

Never guess at Effect patterns - check the guide first.
<!-- effect-solutions:end -->

## Development flow

Copy `.dev.vars.example` to `.dev.vars`, replace `BETTER_AUTH_SECRET`, then run
`bun run db:migrate:local` followed by `bun run dev`. The auth Worker listens on
port `8788` with inspector port `9230` so it can run beside the gateway. Use
`bun run build` to bundle without deploying and `bun run cf-typegen` after
changing bindings in `wrangler.jsonc`.

The Astro dashboard starts this Worker through a local auxiliary service
binding. Keep `http://localhost:4321` in `AUTH_TRUSTED_ORIGINS`; add the deployed
dashboard origin in production. Generate a local single-use superuser bootstrap
token with `bun run dashboard:token`, or write one to the remote KV namespace
with `bun run dashboard:token:remote`. The command prints the raw token once;
KV stores only its digest and the dashboard consumes it atomically through D1.

Before the first deployment, run `bun run db:create:remote` to create
`chikara-auth` and replace the placeholder `database_id`. The command is safe
to rerun: it reuses a matching database returned by Wrangler and exits without
creating another database when a real UUID is already configured. Optional
creation flags can be appended, for example
`bun run db:create:remote -- --location oc`. Then store `BETTER_AUTH_SECRET`
with `wrangler secret put` and apply `bun run db:migrate:remote`. The issuer is
`$BETTER_AUTH_URL/api/auth`.

## Service boundaries

- Keep the default export in `src/index.ts` compatible with the Workers module
  format.
- Express request work as Effect programs and run them at the Hono handler
  boundary.
- Keep unauthenticated OAuth client registration disabled unless a concrete
  integration requires it.
- Regenerate `auth-schema.sql` after changing Better Auth plugins, then create
  and review a new D1 migration rather than editing an applied migration.
- OAuth authorization-code clients use PKCE with `S256`; do not relax that
  default for new clients.
