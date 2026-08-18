import type { APIRoute } from "astro";
import { forwardToAuth } from "../../lib/auth.js";
import { handleOperationAction } from "../../lib/dashboard-operations.js";

export const POST: APIRoute = ({ params, request }) =>
  handleOperationAction({
    forward: forwardToAuth,
    path: params.operation ?? "",
    request,
  });

export const prerender = false;
