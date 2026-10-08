import { defineConfig } from "drizzle-kit";

// drizzle-kit only ever uses the direct (unpooled) connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.POSTGRES_URL_NON_POOLING ?? "",
  },
});
