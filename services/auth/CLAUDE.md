# @chikara/auth

auth service

## Development flow

`bun run dev` builds the development container, joins the shared
`chikara-gateway` network, and registers `http://auth.localhost:8081`
with Traefik. Start `@chikara/infrastructure` first when running this package
outside the root Turborepo task. Use `bun run dev:local` only when Docker routing
is unnecessary.

## Service boundaries

- Keep `/health` independent of PostgreSQL so container liveness remains useful
  during database outages.
- Define tables in `src/schema.ts`; generate and review a migration before
  applying it.
- Read runtime configuration from `PORT` and `DATABASE_URL`. Docker Compose also
  accepts `TRAEFIK_NETWORK` when the shared network uses a non-default name.
