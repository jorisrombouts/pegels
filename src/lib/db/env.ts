/**
 * CLI-only .env.local loader. Next.js loads .env.local automatically for the app, but
 * drizzle-kit and the tsx seed script do not — import this FIRST in those entrypoints
 * (drizzle.config.ts, seed.ts) so DATABASE_URL is available. Dependency-free.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

if (!process.env.DATABASE_URL) {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(m[1] in process.env)) process.env[m[1]] = value;
    }
  } catch {
    // .env.local absent — DATABASE_URL must come from the real environment instead.
  }
}
