# Bun Monorepo Template

A Bun-first Turborepo template for TypeScript workspaces. It ships shared
TypeScript and Biome configuration packages plus a custom Turborepo generator
for scaffolding apps, libraries, Drizzle database packages, and backend
services.

## What's Included

- Bun workspaces for `apps/*`, `packages/*`, `hooks/*`, `services/*`, and
  `configs/*`.
- Turborepo tasks for `build`, `dev`, `lint`, and `check-types`.
- Shared TypeScript configs in `@repo/typescript-config`.
- Shared Biome config in `@repo/biome-config`.
- A custom `scaffold` generator under `turbo/generators`.
- Bun tests for the generator behavior.

## Repository Layout

```txt
.
├── configs/
│   ├── biome-config/         # Shared Biome config package
│   └── typescript-config/    # Shared TypeScript config package
├── services/
│   └── infrastructure/       # Traefik, PostgreSQL, and MinIO for local development
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
- Node.js `20`, `22`, or `24+` (required by Vitest 4)

Install dependencies:

```sh
bun install
```

## Scripts

Run these from the repository root:

```sh
bun run build
bun run dev
bun run lint
bun run check-types
bun run format
```

The first four scripts delegate to Turborepo. `format` runs Prettier over
TypeScript and Markdown files.

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
