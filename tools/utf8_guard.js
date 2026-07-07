import { promises as fs } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");
const blockedDirs = new Set([".git", "node_modules"]);
const textExts = new Set([".js", ".json", ".html", ".css", ".md", ".txt", ".csv"]);
const mojibakePattern = new RegExp(
  [
    "\\u5681",
    "\\u00c3",
    "\\u00c2",
    "\\u00e4\\u00bd",
    "\\u00e5",
    "\\u00e6",
    "\\u00e7"
  ].join("|")
);
const findings = [];

await scan(root);

if (findings.length) {
  for (const finding of findings) {
    console.error(`${finding.file}: ${finding.reason}`);
  }
  process.exitCode = 1;
} else {
  console.log("UTF-8 guard passed.");
}

async function scan(target) {
  const stat = await fs.stat(target);
  if (stat.isDirectory()) {
    const name = path.basename(target);
    if (blockedDirs.has(name)) return;
    const entries = await fs.readdir(target);
    await Promise.all(entries.map((entry) => scan(path.join(target, entry))));
    return;
  }
  if (!textExts.has(path.extname(target))) return;
  const text = await fs.readFile(target, "utf8");
  const relative = path.relative(root, target) || target;
  if (text.includes("\uFFFD")) findings.push({ file: relative, reason: "replacement_char" });
  if (/[?]{4,}/.test(text)) findings.push({ file: relative, reason: "question_mark_run" });
  if (mojibakePattern.test(text)) findings.push({ file: relative, reason: "possible_mojibake" });
}
