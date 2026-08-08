import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A `"use server"` module may only export async functions and type *declarations*.
 *
 * Next rewrites every export in such a file into an action reference. A declaration
 * (`export interface Foo`, `export type Foo = …`) is erased by the compiler before that happens,
 * so it is safe. **Re-exporting an imported type is not** — `export type { Foo }` survives into the
 * generated action loader and throws `ReferenceError: Foo is not defined` on every page that loads
 * the actions bundle. Same for any value export.
 *
 * TypeScript accepts it, `npm run build` accepts it, and unit tests that mock the module never
 * touch it — this scan is the only thing that catches it before the browser does.
 */
const ACTIONS_DIR = join(process.cwd(), "src/app/actions");

/** Erased by the compiler before Next sees the module, so these never become action references. */
const SAFE = [/^export async function /, /^export interface /, /^export type \w+\s*[=<]/];

const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("server action modules", () => {
  it("finds the actions directory", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
    if (!/^\s*["']use server["']/m.test(source)) continue;

    it(`${file} exports nothing that survives into the action loader`, () => {
      // Strip comments so prose about exports doesn't trip the scan.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const offenders = code
        .split("\n")
        .map((l, i) => ({ line: l.trim(), n: i + 1 }))
        .filter(({ line }) => line.startsWith("export"))
        .filter(({ line }) => !SAFE.some((re) => re.test(line)))
        .map(({ line, n }) => `${file}:${n}  ${line.slice(0, 80)}`);

      expect(
        offenders,
        `a "use server" module may export only async functions and type declarations — ` +
          `re-exporting an imported type (export type { Foo }) throws at runtime`,
      ).toEqual([]);
    });
  }
});
