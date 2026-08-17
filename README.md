# Chikara

A Bun-first Turborepo containing the Chikara mobile app, gateway, the Better
Auth-powered Otakuma Auth service, and a server-rendered Astro operations
dashboard for managing users, APIs, and applications.

## What's Included

- Bun workspaces for `apps/*`, `packages/*`, `hooks/*`, `services/*`, and
  `configs/*`.
- Turborepo tasks for `build`, `check`, and `test`, plus explicit local Worker
  development profiles.
- Shared TypeScript configs in `@repo/typescript-config`.
- Shared Biome config in `@repo/biome-config`.
- A custom `scaffold` generator under `turbo/generators`.
- Bun tests for the generator behavior.

## Repository Layout

```txt
.
├── apps/
│   ├── Chikara/              # Expo application
│   └── auth-dashboard/       # Astro SSR operations dashboard
├── configs/
│   ├── biome-config/         # Shared Biome config package
│   └── typescript-config/    # Shared TypeScript config package
├── services/
│   ├── auth/                 # Better Auth OAuth 2.1 Worker backed by D1
│   └── gateway/              # Public routing Worker
├── turbo/
│   └── generators/           # Turborepo generator source, tests, and templates
├── docs/superpowers/         # Design notes and implementation plans
├── package.json
├── turbo.json
└── bun.lock
```

Generated projects are created in:

- `apps/<name>` for applications
- `packages/<name>` for libraries and database packages
- `services/<name>` for Hono Cloudflare Worker services using Effect v4

## Requirements

- Bun `1.3.14` or newer compatible with the lockfile
- Node.js `22.12` or newer (required by Astro 7)
- A Cloudflare account for remote D1 and Worker deployment

Install dependencies:

```sh
bun install
```

For local development, copy `services/auth/.dev.vars.example` to
`services/auth/.dev.vars`, replace the secret, then initialize the local D1
database and start the repository dev graph:

```sh
bun run migrate
bun run dev
```

The root dev graph starts the Expo app, the dashboard at
`http://localhost:4321`, and the gateway at `http://localhost:8787`. Auth is
excluded as a standalone Turbo task because the dashboard and gateway load it
as an auxiliary Worker through their `AUTH` service bindings. Both consumers
persist D1 and KV data under `services/auth/.wrangler/state`.

On a fresh database, create a 15-minute, single-use superuser bootstrap token:

```sh
bun run --cwd services/auth dashboard:token
```

Open `/bootstrap` in the dashboard and submit that token with the initial
superuser's name, email, and password. Only that user can access dashboard
management endpoints. Generate a new token if the previous one expires; once a
superuser exists, bootstrap is permanently closed until the database state is
deliberately reset.

Before remote deployment, create or find the D1 database and update
`services/auth/wrangler.jsonc` automatically:

```sh
bun run db:create
cd services/auth
bunx wrangler secret put BETTER_AUTH_SECRET
bun run db:migrate:remote
```

Pass an optional location hint with
`bun run db:create -- --location oc`. The script does not create another
database when `AUTH_DB` already has a real UUID.

Production auth uses `https://chikara.auth.otakuma.dev`, which is attached to
the public gateway Worker as a Cloudflare Custom Domain. The account dashboard
uses `https://dashboard.auth.otakuma.dev`; the auth Worker remains private and
is reached only through service bindings. Wrangler creates both DNS records and
their certificates during deployment, so do not pre-create CNAME records for
these hostnames. The OAuth/OIDC issuer is
`https://chikara.auth.otakuma.dev/api/auth`; PKCE authorization-code clients
use `S256`.

The auth Worker also supports WebAuthn passkeys and TOTP-based two-factor
authentication with encrypted recovery data. Authenticated clients can use the
Better Auth endpoints under `/api/auth/passkey/*` to register, list, rename,
and remove passkeys, and `/api/auth/two-factor/*` to enroll TOTP, verify codes,
manage backup codes, and complete sign-in challenges. The WebAuthn relying-party
ID defaults to the hostname in `BETTER_AUTH_URL`. Production narrows the shared
RP ID to `auth.otakuma.dev`, covering only the public auth and account-dashboard
hosts. WebAuthn verification also accepts the HTTP(S) origins listed in
`AUTH_TRUSTED_ORIGINS`; production includes
`https://dashboard.auth.otakuma.dev`, while local values remain in
`services/auth/.dev.vars`. Startup rejects an RP ID that cannot be used from one
of the configured web origins.
New Passkey registrations and Passkey-first sign-in require device user
verification, so a Passkey-first sign-in completes MFA directly. A password
sign-in for an account with a Passkey is held at a one-time challenge that
accepts only a Passkey owned by that account; the password supplies the
knowledge factor and WebAuthn user presence supplies the possession factor.
Verified TOTP and recovery codes remain alternatives when enrolled.
Account Security reports MFA as enabled when either a Passkey or verified
authenticator app is available, while keeping each method's setup state clear.
Passkeys created by older configurations can continue to protect password
sign-ins through user presence, but direct Passkey-first sign-in succeeds only
when the device produces a user-verified assertion. Migration
`0008_unique_passkey_credential.sql` refuses duplicate WebAuthn credential IDs
instead of deleting an ambiguous row automatically.
Account-level two-factor mutations are serialized per user by the auth Worker's
`TwoFactorCoordinator` Durable Object so concurrent browser tabs cannot replace
an already verified authenticator secret. If an older or interrupted write
leaves an account marked as protected without any verified factor, the same
coordinator repairs that broken state only after a successful password check,
then completes a fresh sign-in.

Apply migrations and deploy the private auth Worker, public gateway, and
dashboard in dependency order with:

```sh
bun run deploy:auth-dashboard
```

## Scripts

Run these from the repository root:

```sh
bun run build
bun run dev
bun run dev:gateway
bun run lint
bun run check
bun run check-types
bun run test
bun run migrate
```

`dev`, `build`, `check`, and `test` execute the real package task graph through
Turborepo. `dev:auth`, `dev:dashboard`, and `dev:gateway` remain available for
focused development. `check-types` is a compatibility alias for the complete
package checks rather than a no-op task.

## Scaffolding Projects

Use the custom Turborepo generator:

```sh
bunx turbo gen scaffold
```

Or create a service directly:

```sh
bun run new:service
```

The generator prompts for:

- project type: library, app, or service
- library kind: blank or Drizzle database
- database engine: PostgreSQL or SQLite
- app framework: Bun, TUI, Hono, Elysia, Nitro, or Astro
- whether apps and libraries include Effect; services always use Effect v4
- package metadata

Services use a fixed edge stack: Hono, Cloudflare Workers, Wrangler, and Effect
v4. Wrangler provides local development, a dry-run production bundle, binding
type generation, and deployment. The generated Worker exports the Hono app in
module format and includes Effect-aware Vitest coverage.

Blank libraries and Bun apps are generated entirely from local templates.
Hono, Elysia, Nitro, and Astro apps shell out to their official create commands,
then normalize the generated project for this workspace. When Effect is enabled,
the generator patches the app entrypoint, package metadata, and TypeScript
configuration as needed.

Every generated project also gets an `AGENTS.md` symlink pointing at
`CLAUDE.md`.

## Generator Templates

Templates live in `turbo/generators/scaffold/templates` and are organized by
project shape:

```txt
app/bun/{effect,plain}
service/hono
library/blank/{effect,plain}
library/database/{postgresql,sqlite}/{effect,plain}
```

Database library templates include Drizzle configuration, schema/client files,
and a Drizzle re-export module. SQLite templates also include a starter
`src/queries.ts`. Service templates include Hono routes, an Effect v4 handler,
Vitest coverage, and a `wrangler.jsonc` compatibility date pinned to
`2026-08-10`.

## Testing

Run the generator tests with Bun:

```sh
bun test turbo/generators/scaffold
```

The tests cover prompt behavior, template selection, app create commands,
Effect integration, and Worker/Wrangler configuration.

## Shared Packages

### `@repo/typescript-config`

Provides reusable TypeScript configuration files:

- `tsconfig.base.json`
- `tsconfig.bundled.json`
- `tsconfig.tsc.json`

### `@repo/biome-config`

Provides the shared Biome configuration exported as `biome.json`.
