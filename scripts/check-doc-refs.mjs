// Check that references in markdown docs still resolve — relative .md links and
// inline-code source-path mentions (e.g. `src/store/ui.ts`) rot when files move.
// Run with: npm run check:docs   (no network; safe in the pre-commit hook)
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Directory names never walked into. */
const IGNORE_DIRS = new Set(["node_modules", ".next", ".git", ".agents", "out", "build", ".husky", ".claude"]);

/** Repo-relative path prefixes whose markdown is NOT checked (frozen point-in-time artifacts). */
const IGNORE_DOC_PREFIXES = ["docs/superpowers/"];

/** True when a markdown file is a frozen snapshot we don't hold to current references. */
export function isIgnoredDoc(relPath) {
  const posix = relPath.split(path.sep).join("/");
  return IGNORE_DOC_PREFIXES.some((prefix) => posix.startsWith(prefix));
}

/** A code span is treated as a path only if it ends in one of these. */
const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs|json|sql|css)$/i;

/** True for links we don't resolve on disk: urls, mailto/tel, protocol-relative, pure anchors. */
export function isExternalLink(target) {
  return /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target.trim());
}

/** True when an inline-code span looks like a repo file path rather than prose/code. */
export function looksLikePath(token) {
  return SOURCE_EXT.test(token) && /^[@A-Za-z0-9._/()-]+$/.test(token);
}

/**
 * Pull link targets and inline-code path mentions out of markdown, with 1-based line
 * numbers. Fenced code blocks are skipped — their contents are examples, not references.
 */
export function findReferences(content) {
  const links = [];
  const paths = [];
  let inFence = false;
  content.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const lineNo = i + 1;
    for (const m of line.matchAll(/\]\(([^)]+)\)/g)) {
      links.push({ target: m[1].trim(), line: lineNo });
    }
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const token = m[1].trim();
      if (looksLikePath(token)) paths.push({ value: token, line: lineNo });
    }
  });
  return { links, paths };
}

/**
 * Does a code-path mention resolve to a real file? Tries, in order: the `@/` alias
 * (-> src/), repo-root-relative, src-relative (PRD style), then a bare basename lookup.
 */
export function resolveCodePath(value, { repoRoot, fileExists, basenameExists }) {
  if (value.startsWith("@/")) {
    return fileExists(path.join(repoRoot, "src", value.slice(2)));
  }
  if (value.includes("/")) {
    return fileExists(path.join(repoRoot, value)) || fileExists(path.join(repoRoot, "src", value));
  }
  return basenameExists(value);
}

/** Resolve a relative markdown link (sans #fragment / ?query) against the file's directory. */
function resolveLink(target, { fileDir, fileExists }) {
  const clean = target.split("#")[0].split("?")[0].trim();
  if (clean === "") return true; // pure anchor / empty — nothing to resolve on disk
  return fileExists(path.resolve(fileDir, clean));
}

/** Return every unresolved reference in one markdown file's content. */
export function checkMarkdownFile({ content, fileDir, repoRoot, fileExists, basenameExists }) {
  const { links, paths } = findReferences(content);
  const problems = [];
  for (const { target, line } of links) {
    if (isExternalLink(target)) continue;
    if (target.split("#")[0].split("?")[0].trim() === "") continue;
    if (!resolveLink(target, { fileDir, fileExists })) {
      problems.push({ line, kind: "link", ref: target });
    }
  }
  for (const { value, line } of paths) {
    if (!resolveCodePath(value, { repoRoot, fileExists, basenameExists })) {
      problems.push({ line, kind: "path", ref: value });
    }
  }
  return problems;
}

/** Recursively collect file paths under `root`, skipping IGNORE_DIRS. */
function walk(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(root, entry.name)));
    } else {
      out.push(path.join(root, entry.name));
    }
  }
  return out;
}

function run() {
  const repoRoot = process.cwd();
  const allFiles = walk(repoRoot);
  const markdown = allFiles
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !isIgnoredDoc(path.relative(repoRoot, f)));
  const basenames = new Set(allFiles.map((f) => path.basename(f)));

  const env = {
    repoRoot,
    fileExists: (p) => fs.existsSync(p),
    basenameExists: (n) => basenames.has(n),
  };

  let total = 0;
  for (const abs of markdown) {
    const content = fs.readFileSync(abs, "utf8");
    const problems = checkMarkdownFile({ ...env, content, fileDir: path.dirname(abs) });
    if (!problems.length) continue;
    const rel = path.relative(repoRoot, abs);
    for (const p of problems) {
      console.error(`${rel}:${p.line}  [${p.kind}] ${p.ref}`);
      total += 1;
    }
  }

  if (total > 0) {
    console.error(`\n✖ ${total} stale reference${total === 1 ? "" : "s"} found in markdown.`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${markdown.length} markdown files checked — all references resolve.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
