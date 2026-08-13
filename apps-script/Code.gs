const QANDA_CONFIG = Object.freeze({
  spreadsheetProperty: "QANDA_SPREADSHEET_ID",
  maxBodyChars: 400000,
  requireParticipantList: false,
  allowedSurveyIds: [
    "ai-backend-foundation",
    "ai-backend-implementation",
    "ai-backend-production"
  ]
});

const SHEETS = Object.freeze({
  Results: [
    "sessionId", "questionnaireId", "questionnaireTitle", "personId", "displayName",
    "group", "status", "startedAt", "expiresAt", "submittedAt", "durationSeconds",
    "score", "maxScore", "percentage", "proficiencyLabel", "recommendation",
    "answerCount", "competenciesJson", "source", "receivedAt", "payloadSha256"
  ],
  Competencies: [
    "sessionId", "questionnaireId", "personId", "competencyId", "competencyLabel",
    "score", "maxScore", "percentage", "receivedAt"
  ],
  Answers: [
    "sessionId", "questionnaireId", "personId", "questionId", "questionTitle",
    "questionType", "competencyId", "answerJson", "score", "maxScore", "status",
    "comment", "aiJson", "receivedAt"
  ],
  AuditLog: ["receivedAt", "event", "sessionId", "questionnaireId", "personId", "outcome", "detail"],
  Participants: ["personId", "displayName", "group", "enabled"]
});

function setup() {
  let spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) spreadsheet = SpreadsheetApp.create("QANDA Results");
  PropertiesService.getScriptProperties().setProperty(QANDA_CONFIG.spreadsheetProperty, spreadsheet.getId());
  ensureSheets_(spreadsheet);
  return { spreadsheetId: spreadsheet.getId(), spreadsheetUrl: spreadsheet.getUrl() };
}

function setSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId) throw new Error("spreadsheetId is required");
  const spreadsheet = SpreadsheetApp.openById(String(spreadsheetId).trim());
  PropertiesService.getScriptProperties().setProperty(QANDA_CONFIG.spreadsheetProperty, spreadsheet.getId());
  ensureSheets_(spreadsheet);
  return { spreadsheetId: spreadsheet.getId(), spreadsheetUrl: spreadsheet.getUrl() };
}

function doGet() {
  return json_({ ok: true, service: "QANDA Google Sheets receiver", at: new Date().toISOString() });
}

function doPost(e) {
  const receivedAt = new Date().toISOString();
  let payload = null;
  try {
    const raw = e && e.postData ? String(e.postData.contents || "") : "";
    if (!raw || raw.length > QANDA_CONFIG.maxBodyChars) throw new Error("Invalid payload size");
    payload = JSON.parse(raw);
    validatePayload_(payload);

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error("Receiver is busy; retry later");
    try {
      const spreadsheet = getSpreadsheet_();
      ensureSheets_(spreadsheet);
      validateParticipant_(spreadsheet, payload.session.participant);

      const resultsSheet = spreadsheet.getSheetByName("Results");
      if (hasSession_(resultsSheet, payload.session.id)) {
        appendAudit_(spreadsheet, receivedAt, payload, "duplicate", "Session already stored");
        return json_({ ok: true, duplicate: true, sessionId: payload.session.id });
      }

      const digest = sha256_(raw);
      appendResult_(spreadsheet, payload, receivedAt, digest);
      appendCompetencies_(spreadsheet, payload, receivedAt);
      appendAnswers_(spreadsheet, payload, receivedAt);
      appendAudit_(spreadsheet, receivedAt, payload, "stored", "Result stored successfully");
      SpreadsheetApp.flush();
      return json_({ ok: true, duplicate: false, sessionId: payload.session.id, receivedAt: receivedAt });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    try {
      const spreadsheet = getSpreadsheet_();
      ensureSheets_(spreadsheet);
      appendAudit_(spreadsheet, receivedAt, payload, "rejected", error.message || String(error));
    } catch (_) {
      // The response still reports the original validation or setup error.
    }
    return json_({ ok: false, error: error.message || String(error), receivedAt: receivedAt });
  }
}

function validatePayload_(payload) {
  if (!payload || payload.event !== "result.submitted") throw new Error("Unsupported event");
  if (Number(payload.schemaVersion) !== 1) throw new Error("Unsupported schema version");
  const session = payload.session;
  const questionnaire = payload.questionnaire;
  if (!session || !questionnaire || !payload.result) throw new Error("Missing result data");
  if (!isSafeId_(session.id) || !isSafeId_(questionnaire.id)) throw new Error("Invalid identifier");
  if (session.questionnaireId !== questionnaire.id) throw new Error("Questionnaire mismatch");
  if (session.status !== "submitted") throw new Error("Only submitted sessions are accepted");
  if (QANDA_CONFIG.allowedSurveyIds.indexOf(questionnaire.id) === -1) throw new Error("Questionnaire is not allowed");
  if (!session.participant || !isSafeId_(session.participant.personId)) throw new Error("Invalid participant");
  if (!isFiniteNumber_(payload.result.score) || !isFiniteNumber_(payload.result.maxScore)) throw new Error("Invalid score");
  if (Number(payload.result.score) < 0 || Number(payload.result.score) > Number(payload.result.maxScore)) throw new Error("Score is out of range");
}

function validateParticipant_(spreadsheet, participant) {
  if (!QANDA_CONFIG.requireParticipantList) return;
  const sheet = spreadsheet.getSheetByName("Participants");
  const values = sheet.getDataRange().getValues();
  const match = values.slice(1).find(function (row) {
    return String(row[0]).trim() === String(participant.personId).trim() && String(row[3]).toLowerCase() !== "false";
  });
  if (!match) throw new Error("Participant is not enabled");
}

function appendResult_(spreadsheet, payload, receivedAt, digest) {
  const session = payload.session;
  const participant = session.participant;
  const result = payload.result;
  const proficiency = result.proficiency || {};
  spreadsheet.getSheetByName("Results").appendRow([
    safeCell_(session.id), safeCell_(payload.questionnaire.id), safeCell_(payload.questionnaire.title),
    safeCell_(participant.personId), safeCell_(participant.displayName), safeCell_(participant.group),
    safeCell_(session.status), safeCell_(session.startedAt), safeCell_(session.expiresAt),
    safeCell_(session.submittedAt), durationSeconds_(session), number_(result.score),
    number_(result.maxScore), number_(result.percentage), safeCell_(proficiency.label),
    safeCell_(proficiency.recommendation), Object.keys(payload.answers || {}).length,
    safeJson_(result.competencies || []), safeCell_(payload.source), receivedAt, digest
  ]);
}

function appendCompetencies_(spreadsheet, payload, receivedAt) {
  const rows = (payload.result.competencies || []).map(function (item) {
    return [
      safeCell_(payload.session.id), safeCell_(payload.questionnaire.id),
      safeCell_(payload.session.participant.personId), safeCell_(item.id), safeCell_(item.label),
      number_(item.score), number_(item.maxScore), number_(item.percentage), receivedAt
    ];
  });
  appendRows_(spreadsheet.getSheetByName("Competencies"), rows);
}

function appendAnswers_(spreadsheet, payload, receivedAt) {
  const rows = flattenResults_(payload.result.questionResults || []).map(function (item) {
    return [
      safeCell_(payload.session.id), safeCell_(payload.questionnaire.id),
      safeCell_(payload.session.participant.personId), safeCell_(item.id), safeCell_(item.title),
      safeCell_(item.type), safeCell_(item.competency), safeJson_(payload.answers && payload.answers[item.id]),
      number_(item.score), number_(item.maxScore), safeCell_(item.status), safeCell_(item.comment),
      safeJson_(item.ai || null), receivedAt
    ];
  });
  appendRows_(spreadsheet.getSheetByName("Answers"), rows);
}

function appendAudit_(spreadsheet, receivedAt, payload, outcome, detail) {
  const session = payload && payload.session ? payload.session : {};
  const questionnaire = payload && payload.questionnaire ? payload.questionnaire : {};
  const participant = session.participant || {};
  spreadsheet.getSheetByName("AuditLog").appendRow([
    receivedAt, safeCell_(payload && payload.event), safeCell_(session.id), safeCell_(questionnaire.id),
    safeCell_(participant.personId), safeCell_(outcome), safeCell_(detail)
  ]);
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(QANDA_CONFIG.spreadsheetProperty);
  if (!id) throw new Error("Run setup() before deploying the web app");
  return SpreadsheetApp.openById(id);
}

function ensureSheets_(spreadsheet) {
  Object.keys(SHEETS).forEach(function (name) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const headers = SHEETS[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.autoResizeColumns(1, headers.length);
    }
  });
}

function hasSession_(sheet, sessionId) {
  if (sheet.getLastRow() < 2) return false;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(sessionId)).matchEntireCell(true).findNext() !== null;
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function flattenResults_(items) {
  return items.reduce(function (all, item) {
    if (item.children && item.children.length) return all.concat(flattenResults_(item.children));
    all.push(item);
    return all;
  }, []);
}

function durationSeconds_(session) {
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.submittedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 1000)) : "";
}

function safeCell_(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text.slice(0, 45000);
}

function safeJson_(value) {
  if (value === undefined) return "";
  return safeCell_(JSON.stringify(value));
}

function number_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function isFiniteNumber_(value) {
  return Number.isFinite(Number(value));
}

function isSafeId_(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(value);
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (byte) { return (byte + 256).toString(16).slice(-2); })
    .join("");
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
