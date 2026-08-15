# @chikara/auth-dashboard

Astro SSR administration dashboard deployed as a Cloudflare Worker.

## Boundaries

- Proxy browser auth and management requests through the `AUTH` service binding.
- Keep Better Auth cookies first-party by exposing `/api/auth/*` on this Worker.
- Never persist, log, or re-render an application credential after its one-time dialog closes.
- Keep superuser authorization in the auth Worker; the dashboard is not a trust boundary.
- Use server-rendered Astro pages with small, progressively enhanced browser scripts.
