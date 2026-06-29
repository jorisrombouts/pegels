import { describe, expect, it } from "vitest";
import {
  findReferences,
  isExternalLink,
  isIgnoredDoc,
  looksLikePath,
  resolveCodePath,
  checkMarkdownFile,
} from "./check-doc-refs.mjs";

describe("isIgnoredDoc", () => {
  it("ignores the frozen docs/superpowers snapshots", () => {
    expect(isIgnoredDoc("docs/superpowers/plans/x.md")).toBe(true);
    expect(isIgnoredDoc("docs/superpowers/specs/y.md")).toBe(true);
  });
  it("checks living docs (root + other docs)", () => {
    expect(isIgnoredDoc("README.md")).toBe(false);
    expect(isIgnoredDoc("PRD.md")).toBe(false);
    expect(isIgnoredDoc("docs/architecture.md")).toBe(false);
  });
});

describe("findReferences", () => {
  it("extracts markdown link targets with line numbers", () => {
    const md = "intro\nSee [PRD](./PRD.md) and [x](../a/b.md#sec).";
    const { links } = findReferences(md);
    expect(links).toEqual([
      { target: "./PRD.md", line: 2 },
      { target: "../a/b.md#sec", line: 2 },
    ]);
  });

  it("extracts inline-code source-path mentions, ignoring non-paths", () => {
    const md = "Edit `src/store/ui.ts` then run `npm run dev`; see `useState` and `4.1.7`.";
    const { paths } = findReferences(md);
    expect(paths).toEqual([{ value: "src/store/ui.ts", line: 1 }]);
  });

  it("skips fenced code blocks entirely (examples are not references)", () => {
    const md = ["before `lib/auth.ts`", "```ts", "import x from `src/not-a-ref.ts`", "[nope](./missing.md)", "```", "after"].join("\n");
    const { links, paths } = findReferences(md);
    expect(paths).toEqual([{ value: "lib/auth.ts", line: 1 }]);
    expect(links).toEqual([]);
  });
});

describe("isExternalLink", () => {
  it("treats urls, mailto, and pure anchors as external/skip", () => {
    expect(isExternalLink("https://example.com")).toBe(true);
    expect(isExternalLink("mailto:a@b.c")).toBe(true);
    expect(isExternalLink("#section")).toBe(true);
    expect(isExternalLink("//cdn.x")).toBe(true);
  });
  it("treats repo-relative paths as internal", () => {
    expect(isExternalLink("./PRD.md")).toBe(false);
    expect(isExternalLink("../a.md")).toBe(false);
    expect(isExternalLink("docs/x.md")).toBe(false);
  });
});

describe("looksLikePath", () => {
  it("matches tokens ending in a source extension", () => {
    expect(looksLikePath("src/store/ui.ts")).toBe(true);
    expect(looksLikePath("lib/auth.ts")).toBe(true);
    expect(looksLikePath("schema.ts")).toBe(true);
    expect(looksLikePath("package.json")).toBe(true);
    expect(looksLikePath("scripts/generate-icons.mjs")).toBe(true);
    expect(looksLikePath("src/app/(app)/page.tsx")).toBe(true);
  });
  it("rejects non-path code spans", () => {
    expect(looksLikePath("npm run dev")).toBe(false);
    expect(looksLikePath("useState")).toBe(false);
    expect(looksLikePath("4.1.7")).toBe(false);
    expect(looksLikePath("response.json()")).toBe(false);
  });
});

describe("resolveCodePath", () => {
  const repoRoot = "/repo";
  const present = new Set(["/repo/src/store/ui.ts", "/repo/src/lib/auth.ts", "/repo/package.json"]);
  const env = {
    repoRoot,
    fileExists: (p) => present.has(p),
    basenameExists: (n) => n === "schema.ts",
  };

  it("resolves repo-root-relative paths", () => {
    expect(resolveCodePath("src/store/ui.ts", env)).toBe(true);
  });
  it("resolves src-relative paths (PRD style)", () => {
    expect(resolveCodePath("lib/auth.ts", env)).toBe(true);
  });
  it("resolves the @/ alias to src/", () => {
    expect(resolveCodePath("@/store/ui.ts", env)).toBe(true);
  });
  it("resolves a bare filename via basename lookup", () => {
    expect(resolveCodePath("schema.ts", env)).toBe(true);
  });
  it("reports a path that exists nowhere as unresolved", () => {
    expect(resolveCodePath("src/gone.ts", env)).toBe(false);
  });
});

describe("checkMarkdownFile", () => {
  const repoRoot = "/repo";
  const present = new Set(["/repo/PRD.md", "/repo/src/store/ui.ts"]);
  const base = {
    fileDir: "/repo",
    repoRoot,
    fileExists: (p) => present.has(p),
    basenameExists: () => false,
  };

  it("flags a broken link and a missing source path, and only those", () => {
    const content = [
      "See [PRD](./PRD.md) and [gone](./GONE.md).", // PRD ok, GONE missing
      "Edit `src/store/ui.ts` and `src/gone.ts`.", // first ok, second missing
      "External [site](https://x.com) is ignored.",
    ].join("\n");
    const problems = checkMarkdownFile({ ...base, content });
    expect(problems).toEqual([
      { line: 1, kind: "link", ref: "./GONE.md" },
      { line: 2, kind: "path", ref: "src/gone.ts" },
    ]);
  });

  it("returns no problems when every reference resolves", () => {
    const content = "Good [PRD](./PRD.md) and `src/store/ui.ts`.";
    expect(checkMarkdownFile({ ...base, content })).toEqual([]);
  });
});
