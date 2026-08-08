import { defineConfig } from "drizzle-kit";

if (!process.env.AUTH_DATABASE_URL) {
  throw new Error("AUTH_DATABASE_URL is not set");
}
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.AUTH_DATABASE_URL!
  },
});
