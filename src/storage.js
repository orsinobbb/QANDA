import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSurvey } from "./surveyEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(__dirname, "..", "data");
const questionnaireDir = path.join(dataRoot, "questionnaires");
const sessionDir = path.join(dataRoot, "sessions");

export async function ensureDataDirs() {
  await fs.mkdir(questionnaireDir, { recursive: true });
  await fs.mkdir(sessionDir, { recursive: true });
}

export async function listQuestionnaires() {
  await ensureDataDirs();
  const entries = await fs.readdir(questionnaireDir, { withFileTypes: true });
  const surveys = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const survey = await readJson(path.join(questionnaireDir, entry.name));
    if (survey) surveys.push(survey);
  }
  return surveys.sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
}

export async function getQuestionnaire(id) {
  const file = path.join(questionnaireDir, `${id}.json`);
  return readJson(file);
}

export async function saveQuestionnaire(survey) {
  const errors = validateSurvey(survey);
  if (errors.length) {
    const error = new Error("Invalid questionnaire");
    error.statusCode = 422;
    error.details = errors;
    throw error;
  }
  await ensureDataDirs();
  await writeJson(path.join(questionnaireDir, `${survey.id}.json`), survey);
  return survey;
}

export async function listSessions() {
  await ensureDataDirs();
  const entries = await fs.readdir(sessionDir, { withFileTypes: true });
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const session = await readJson(path.join(sessionDir, entry.name));
    if (session) sessions.push(session);
  }
  return sessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

export async function getSession(id) {
  return readJson(path.join(sessionDir, `${id}.json`));
}

export async function saveSession(session) {
  await ensureDataDirs();
  await writeJson(path.join(sessionDir, `${session.id}.json`), session);
  return session;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

