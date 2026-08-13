import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildResultSummary,
  createSession,
  gradeAnswers,
  isExpired,
  isSurveyPublished,
  mergeAnswers,
  publicSurvey,
  remainingSeconds,
  transitionSurveyLifecycle,
  validateSurvey
} from "./src/surveyEngine.js";
import {
  ensureDataDirs,
  getQuestionnaire,
  getSession,
  listQuestionnaires,
  listSessions,
  saveQuestionnaire,
  saveQuestionnaireLifecycle,
  saveSession
} from "./src/storage.js";
import { generateQuestionnaireDraft, gradeAiQuestions, previewGrade } from "./src/aiService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);

await ensureDataDirs();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Internal server error",
      details: error.details || undefined
    });
  }
});

server.listen(port, () => {
  console.log(`Questionnaire system running at http://localhost:${port}`);
});

async function handleApi(req, res, url) {
  const method = req.method || "GET";
  const segments = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, at: new Date().toISOString() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/questionnaires") {
    const surveys = await listQuestionnaires();
    const visibleSurveys = url.searchParams.get("scope") === "admin" ? surveys : surveys.filter(isSurveyPublished);
    sendJson(res, 200, {
      questionnaires: visibleSurveys.map((survey) => ({
        id: survey.id,
        title: survey.title,
        description: survey.description || "",
        durationSeconds: survey.durationSeconds,
        questionCount: countQuestions(survey.questions),
        rosterCount: Array.isArray(survey.accessRoster) ? survey.accessRoster.length : 0,
        lifecycle: survey.lifecycle || { status: "published", version: 1 }
      }))
    });
    return;
  }

  if (method === "GET" && segments[1] === "questionnaires" && segments[2]) {
    const survey = await requireSurvey(segments[2]);
    sendJson(res, 200, { questionnaire: survey });
    return;
  }

  if (method === "POST" && url.pathname === "/api/questionnaires") {
    const body = await readBody(req);
    const survey = body.questionnaire || body;
    const saved = await saveQuestionnaire(survey);
    sendJson(res, 200, { questionnaire: saved });
    return;
  }

  if (method === "PATCH" && segments[1] === "questionnaires" && segments[2] && segments[3] === "lifecycle") {
    const body = await readBody(req);
    const survey = await requireSurvey(segments[2]);
    const transitioned = transitionSurveyLifecycle(survey, body.status, {
      actor: body.actor || "questionnaire-admin",
      note: body.note || ""
    });
    await saveQuestionnaireLifecycle(transitioned);
    sendJson(res, 200, { questionnaire: transitioned });
    return;
  }

  if (method === "POST" && url.pathname === "/api/sessions/start") {
    const body = await readBody(req);
    const survey = await requireSurvey(body.questionnaireId);
    if (!isSurveyPublished(survey)) throw httpError(409, "此問卷目前未開放作答。");
    const participant = resolveParticipant(survey, body);
    const existing = await findReusableSession(survey.id, participant.personId);
    if (existing) {
      sendJson(res, 200, buildSessionResponse(existing, survey, "resumed"));
      return;
    }
    const session = createSession({ survey, participant });
    await saveSession(session);
    sendJson(res, 201, buildSessionResponse(session, survey, "started"));
    return;
  }

  if (segments[1] === "sessions" && segments[2]) {
    const session = await requireSession(segments[2]);
    const survey = await requireSurvey(session.questionnaireId);

    if (method === "GET" && segments.length === 3) {
      await expireIfNeeded(session);
      sendJson(res, 200, buildSessionResponse(session, survey, "loaded"));
      return;
    }

    if (method === "PUT" && segments[3] === "answers") {
      await rejectWhenClosed(session);
      const body = await readBody(req);
      mergeAnswers(session, body.answers, {
        phase: body.phase || "autosave",
        clientRevision: body.clientRevision,
        clientSavedAt: body.clientSavedAt
      });
      await saveSession(session);
      sendJson(res, 200, buildSessionResponse(session, survey, "synced"));
      return;
    }

    if (method === "POST" && segments[3] === "submit") {
      await rejectWhenClosed(session);
      const body = await readBody(req);
      mergeAnswers(session, body.answers, {
        phase: "submit",
        clientRevision: body.clientRevision,
        clientSavedAt: body.clientSavedAt
      });
      const { assessments, logs } = await gradeAiQuestions({ survey, answers: session.answers });
      session.result = gradeAnswers(survey, session.answers, assessments);
      session.status = "submitted";
      session.submittedAt = new Date().toISOString();
      session.aiLogs.push(...logs);
      await saveSession(session);
      sendJson(res, 200, buildSessionResponse(session, survey, "submitted"));
      return;
    }
  }

  if (method === "GET" && url.pathname === "/api/results") {
    const result = await searchResults(url);
    sendJson(res, 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/results/export.csv") {
    const result = await searchResults(url);
    sendText(res, 200, toCsv(result.results), "text/csv; charset=utf-8");
    return;
  }

  if (method === "GET" && segments[1] === "results" && segments[2]) {
    const session = await requireSession(segments[2]);
    const survey = await requireSurvey(session.questionnaireId);
    sendJson(res, 200, {
      summary: buildResultSummary(session, survey),
      session,
      questionnaire: survey
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/ai/questionnaires") {
    const body = await readBody(req);
    const draft = await generateQuestionnaireDraft(body);
    sendJson(res, 200, {
      ...draft,
      validationErrors: validateSurvey(draft.questionnaire)
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/ai/grade") {
    const body = await readBody(req);
    const survey = body.questionnaire || (body.questionnaireId ? await requireSurvey(body.questionnaireId) : null);
    if (!survey) throw httpError(400, "questionnaire or questionnaireId is required");
    const grade = await previewGrade({ survey, answers: body.answers || {} });
    sendJson(res, 200, grade);
    return;
  }

  throw httpError(404, "Route not found");
}

async function serveStatic(req, res, url) {
  const requestPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const normalized = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(publicDir, normalized);
  if (!file.startsWith(publicDir)) throw httpError(403, "Forbidden");
  try {
    const data = await fs.readFile(file);
    sendBuffer(res, 200, data, contentType(file));
  } catch (error) {
    if (error.code === "ENOENT") {
      const fallback = await fs.readFile(path.join(publicDir, "index.html"));
      sendBuffer(res, 200, fallback, "text/html; charset=utf-8");
      return;
    }
    throw error;
  }
}

async function requireSurvey(id) {
  if (!id) throw httpError(400, "questionnaireId is required");
  const survey = await getQuestionnaire(id);
  if (!survey) throw httpError(404, "Questionnaire not found");
  return survey;
}

async function requireSession(id) {
  const session = await getSession(id);
  if (!session) throw httpError(404, "Session not found");
  return session;
}

function resolveParticipant(survey, body) {
  const displayName = String(body.displayName || "").trim();
  const group = String(body.group || "").trim();
  if (!displayName) throw httpError(400, "請輸入姓名。");
  return {
    personId: createParticipantId(displayName, group),
    displayName,
    group
  };
}

function createParticipantId(displayName, group) {
  const source = `${displayName.trim().toLocaleLowerCase()}|${group.trim().toLocaleLowerCase()}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `learner-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function findReusableSession(questionnaireId, personId) {
  const sessions = await listSessions();
  for (const session of sessions) {
    if (
      session.questionnaireId === questionnaireId &&
      session.participant?.personId === personId &&
      session.status === "in_progress"
    ) {
      if (isExpired(session)) {
        session.status = "expired";
        await saveSession(session);
        continue;
      }
      return session;
    }
  }
  return null;
}

async function rejectWhenClosed(session) {
  if (session.status === "submitted") throw httpError(409, "此作答已送出。");
  if (session.status === "expired" || isExpired(session)) {
    session.status = "expired";
    await saveSession(session);
    throw httpError(409, "作答時間已結束。");
  }
}

async function expireIfNeeded(session) {
  if (session.status === "in_progress" && isExpired(session)) {
    session.status = "expired";
    await saveSession(session);
  }
}

function buildSessionResponse(session, survey, event) {
  return {
    event,
    session: {
      id: session.id,
      questionnaireId: session.questionnaireId,
      participant: session.participant,
      status: session.status,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      remainingSeconds: remainingSeconds(session),
      answers: session.answers,
      memory: session.memory,
      result: session.result,
      submittedAt: session.submittedAt || null,
      aiLogs: session.aiLogs || []
    },
    questionnaire: publicSurvey(survey)
  };
}

async function searchResults(url) {
  const [sessions, surveys] = await Promise.all([listSessions(), listQuestionnaires()]);
  const surveysById = new Map(surveys.map((survey) => [survey.id, survey]));
  const questionnaireId = url.searchParams.get("questionnaireId");
  const status = url.searchParams.get("status");
  const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();
  const results = [];

  for (const session of sessions) {
    const survey = surveysById.get(session.questionnaireId) || {
      id: session.questionnaireId,
      title: session.questionnaireId
    };
    const summary = buildResultSummary(session, survey);
    if (questionnaireId && summary.questionnaireId !== questionnaireId) continue;
    if (status && summary.status !== status) continue;
    const haystack = [
      summary.id,
      summary.questionnaireTitle,
      summary.participant?.personId,
      summary.participant?.displayName,
      summary.participant?.group,
      summary.status
    ]
      .join(" ")
      .toLowerCase();
    if (keyword && !haystack.includes(keyword)) continue;
    results.push(summary);
  }

  return { results, total: results.length };
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw httpError(400, "Request body must be valid JSON");
  }
}

function toCsv(rows) {
  const headers = [
    "sessionId",
    "questionnaireId",
    "questionnaireTitle",
    "personId",
    "displayName",
    "group",
    "status",
    "score",
    "maxScore",
    "percentage",
    "startedAt",
    "submittedAt",
    "lastSyncAt"
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((header) =>
          csvCell(
            header === "personId"
              ? row.participant?.personId
              : header === "displayName"
                ? row.participant?.displayName
                : header === "group"
                  ? row.participant?.group
                  : row[header]
          )
        )
        .join(",")
    );
  }
  return `\ufeff${lines.join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function countQuestions(questions = []) {
  return questions.reduce(
    (count, question) => count + (question.type === "composite" ? countQuestions(question.questions) : 1),
    0
  );
}

function contentType(file) {
  const ext = path.extname(file);
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml"
    }[ext] || "application/octet-stream"
  );
}

function sendJson(res, status, payload) {
  sendText(res, status, JSON.stringify(payload, null, 2), "application/json; charset=utf-8");
}

function sendText(res, status, text, type) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store"
  });
  res.end(text);
}

function sendBuffer(res, status, data, type) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store"
  });
  res.end(data);
}

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
