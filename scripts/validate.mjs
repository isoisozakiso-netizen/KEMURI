#!/usr/bin/env node
// Lightweight validation used by `npm run lint` / `npm run build`.
// Checks JavaScript syntax of the Worker and the inline scripts in the
// front end, and validates JSON assets. Uses only Node.js built-ins.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failed = false;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  failed = true;
  console.error(`  ✗ ${m}`);
};

// 1) Worker source syntax
try {
  execFileSync(process.execPath, ["--check", "src/index.js"], { stdio: "pipe" });
  ok("src/index.js — syntax OK");
} catch (e) {
  bad(`src/index.js — ${String(e.stderr || e).trim()}`);
}

// 2) Inline <script> blocks in public/index.html
try {
  const html = readFileSync("public/index.html", "utf8");
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1]
  );
  const tmp = join(tmpdir(), `pukari-inline-${Date.now()}.js`);
  writeFileSync(tmp, blocks.join("\n;\n"), "utf8");
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    ok(`public/index.html — ${blocks.length} inline script block(s) OK`);
  } finally {
    rmSync(tmp, { force: true });
  }
} catch (e) {
  bad(`public/index.html — ${String(e.stderr || e).trim()}`);
}

// 3) JSON assets
for (const f of ["public/manifest.json"]) {
  if (!existsSync(f)) continue;
  try {
    JSON.parse(readFileSync(f, "utf8"));
    ok(`${f} — valid JSON`);
  } catch (e) {
    bad(`${f} — ${e.message}`);
  }
}

if (failed) {
  console.error("\nValidation FAILED");
  process.exit(1);
}
console.log("\nValidation passed ✓");
