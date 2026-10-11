import { readFile } from "node:fs/promises";
import { URL as NodeURL } from "node:url";

// Server-only file access: keep it out of the package's client-safe index.
export async function journalingArticle() {
  return {
    title: "Journaling: evidence and limits",
    body: await readFile(new NodeURL("../knowledge/journaling.md", import.meta.url), "utf8"),
    href: "/coach/knowledge/journaling",
  };
}
