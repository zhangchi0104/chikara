import { defineMiddleware } from "astro:middleware";
import { getDashboardSession } from "./lib/auth.js";

const protectedPages = new Set(["/apis", "/applications", "/users"]);

export const onRequest = defineMiddleware(async (context, next) => {
  if (!protectedPages.has(context.url.pathname)) return next();
  const session = await getDashboardSession(context.request);
  if (!session.data) {
    const error = session.status === 403 ? "?error=access" : "";
    return context.redirect(`/sign-in${error}`);
  }
  context.locals.superuser = session.data;
  return next();
});
