# Otakuma Auth Dashboard

An Astro server-rendered account and operations console deployed to Cloudflare
Workers. Signed-in members land on their profile and can manage Passkeys and an
authenticator app from Account Security. Either method enables MFA protection;
Passkeys also protect later password sign-ins with an account-bound challenge.
The sole
superuser can also manage users, protected APIs, and OAuth Applications through
the `AUTH` service binding, including read-only user profiles and successful
account activity.

## Local development

From the repository root:

```sh
bun install
bun run migrate
bun run --cwd services/auth dashboard:token
bun run --cwd apps/auth-dashboard dev
```

Open `http://localhost:4321/bootstrap` and use the printed token to create the
sole superuser. The dashboard's `dev` command also applies pending local auth
migrations before the Astro adapter starts the auth Worker as a
development-only auxiliary Worker. D1 and KV state persist in
`services/auth/.wrangler/state`.

The auth service's `.dev.vars` must include `http://localhost:4321` in
`AUTH_TRUSTED_ORIGINS`. Production uses the Custom Domain
`https://dashboard.auth.otakuma.dev`, which shares the WebAuthn RP ID
`auth.otakuma.dev` with `https://chikara.auth.otakuma.dev`.

## Styling

Tailwind CSS 4 runs through its Vite plugin. `src/styles/global.css` imports
Tailwind's theme and utilities without Preflight so the remaining legacy
dashboard styles keep their existing browser defaults during migration. New or
migrated UI should use complete, statically detectable utility class names;
shared legacy styles remain in the lower-priority `base` and `components`
layers until their whole surface can be removed.

## Deployment

The deployment command applies pending remote D1 migrations, then deploys the
private auth Worker, public gateway, and dashboard in dependency order. The
gateway and dashboard Custom Domains are activated as part of their Wrangler
deployments:

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
