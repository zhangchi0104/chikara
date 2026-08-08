import { app } from "./app.ts";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

export default {
  hostname: "0.0.0.0",
  port,
  fetch: app.fetch,
};
