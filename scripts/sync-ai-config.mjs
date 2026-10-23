import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { publishActiveAiConfig } from "./ai-config-sync.ts";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : fallback;
}

function variableFromFile(path, name) {
  if (!existsSync(path)) return "";
  for (const sourceLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1 || line.slice(0, separator).trim() !== name) continue;
    const value = line.slice(separator + 1).trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }
  return "";
}

const siteRoot = fileURLToPath(new URL("..", import.meta.url));
const databasePath = resolve(
  argument(
    "--database",
    process.env.PHOTO_BOOTH_DB ?? resolve(siteRoot, "../photo-booth/.local/studio.sqlite3"),
  ),
);
const endpoint = argument(
  "--endpoint",
  process.env.PHOTO_SITE_WORKER_URL ?? "http://127.0.0.1:8787",
);
const token = process.env.PHOTO_SITE_ADMIN_TOKEN
  ?? variableFromFile(resolve(siteRoot, ".dev.vars"), "ADMIN_PUBLISH_TOKEN");

try {
  const receipt = await publishActiveAiConfig({ databasePath, endpoint, token });
  console.log(
    `Synced active AI configuration v${receipt.version} `
      + `(${receipt.promptHash.slice(0, 10)}) to ${endpoint.replace(/\/$/, "")}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "AI configuration sync failed.");
  process.exitCode = 1;
}
