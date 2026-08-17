import { defineMiddleware } from "astro:middleware";
import { getAccountSession } from "./lib/auth.js";
import {
  authenticatedLanding,
  canAccessPage,
  isProtectedPage,
} from "./lib/navigation.js";

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;
  if (!isProtectedPage(pathname)) return next();
  const session = await getAccountSession(context.request);
  if (!session.data) {
    return context.redirect("/sign-in");
  }
  if (!canAccessPage(pathname, session.data)) {
    return context.redirect(authenticatedLanding(session.data));
  }
  context.locals.account = session.data;
  return next();
});
