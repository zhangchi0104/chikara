# @chikara/gateway

An Effect v4 Hono Cloudflare Worker that routes public requests to internal
Chikara services through Cloudflare service bindings.

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

Run `bun run dev` at the repository root or in this package to start one
Wrangler session containing both the primary gateway and the auxiliary auth
Worker. Each configuration path needs its own `-c` flag. The gateway is exposed
on port `8787`; auth is available through the `AUTH` service binding. A filtered
gateway build first validates `@chikara/auth#build`, then bundles the gateway
without deploying. Use `bun run deploy` to publish and `bun run cf-typegen`
after changing bindings in `wrangler.jsonc`.

## Service boundaries

- Keep the default export in `src/index.ts` compatible with the Workers module
  format.
- Express request work as Effect programs and run them at the Hono handler
  boundary.
- Remove the gateway's service prefix before forwarding a request. Preserve its
  method, remaining URL, headers, and body, and return downstream status,
  headers, and body unchanged.
- Define Worker-to-Worker dependencies as service bindings rather than public
  service URLs.
