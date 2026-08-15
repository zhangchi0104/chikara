import type { APIRoute } from "astro";
import { handleAction } from "../../../lib/action.js";
import { forwardToAuth } from "../../../lib/auth.js";

export const POST: APIRoute = ({ params, request }) =>
  handleAction({
    forward: forwardToAuth,
    path: params.path ?? "",
    request,
    scope: params.scope ?? "",
  });

export const prerender = false;
