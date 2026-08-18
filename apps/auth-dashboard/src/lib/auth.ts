import { env } from "cloudflare:workers";
import { createDashboardQueries } from "./dashboard-queries.js";

export async function forwardToAuth(
  request: Request,
  pathname: string,
): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = new URL(request.url).search;
  return env.AUTH.fetch(new Request(url, request));
}

export const dashboardQueries = createDashboardQueries(forwardToAuth);
