import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data", "questionnaires");

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await copyDir(publicDir, dist);
await copyDir(dataDir, path.join(dist, "data", "questionnaires"));
await writeQuestionnaireIndex();
await patchIndex();

console.log(`Built GitHub Pages artifact at ${dist}`);

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(source, target);
    else await fs.copyFile(source, target);
  }
}

async function writeQuestionnaireIndex() {
  const files = (await fs.readdir(dataDir)).filter((file) => file.endsWith(".json"));
  const questionnaires = [];
  for (const file of files) {
    const survey = JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
    questionnaires.push({ id: survey.id, title: survey.title });
  }
  await fs.writeFile(
    path.join(dist, "data", "questionnaires", "index.json"),
    `${JSON.stringify({ questionnaires }, null, 2)}\n`,
    "utf8"
  );
}

async function patchIndex() {
  const indexPath = path.join(dist, "index.html");
  let html = await fs.readFile(indexPath, "utf8");
  html = html
    .replace('href="/styles.css"', 'href="./styles.css"')
    .replace('src="/integrations.js"', 'src="./integrations.js"')
    .replace('src="/app.js"', 'src="./app.js"')
    .replace('<script type="module" src="./app.js"></script>', '<script src="./static-api.js"></script>\n    <script type="module" src="./app.js"></script>');
  await fs.writeFile(indexPath, html, "utf8");
}
