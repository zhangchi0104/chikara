import { Hono } from "hono";
import { createDb } from "./db.js";
import { items } from "./schema.js";

const DEFAULT_DATABASE_URL = "postgres://chikara:chikra@localhost:5432/chikara";

export function createApp(
  databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
): Hono {
  const app = new Hono();
  const db = createDb(databaseUrl);

  app.get("/", (context) => context.json({ service: "auth", status: "ok" }));
  app.get("/health", (context) => context.json({ status: "ok" }));
  app.get("/items", async (context) =>
    context.json({ items: await db.select().from(items) }),
  );

  return app;
}

export const app = createApp();
