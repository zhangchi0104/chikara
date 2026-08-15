import type { APIRoute } from "astro";
import { forwardToAuth } from "../../../lib/auth.js";

export const ALL: APIRoute = ({ params, request }) =>
  forwardToAuth(request, `/api/dashboard/${params.path ?? ""}`);

export const prerender = false;
