import { Hono } from "hono";
import { db } from "./db.js";
import { items } from "./schema.js";


const app = new Hono();

app.get("/", (context) => context.json({ service: "auth", status: "ok" }));
app.get("/health", (context) => context.json({ status: "ok" }));
app.get("/items", async (context) =>
  context.json({ items: await db.select().from(items) }),
);

export { app }
