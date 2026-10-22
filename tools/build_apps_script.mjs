import { promises as fs } from "node:fs";
const core = await fs.readFile("public/analytics-core.js", "utf8");
const code = await fs.readFile("apps-script/Code.gs", "utf8");
await fs.mkdir("dist/apps-script", {recursive:true});
await fs.writeFile("dist/apps-script/Code.gs", `${core}\n${code}`, "utf8");
console.log("Apps Script bundle: dist/apps-script/Code.gs");
