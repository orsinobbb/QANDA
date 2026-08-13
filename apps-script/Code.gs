const QANDA_CONFIG = Object.freeze({
  spreadsheetProperty: "QANDA_SPREADSHEET_ID",
  adminTokenHashProperty: "QANDA_ADMIN_TOKEN_SHA256",
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
    "answerCount", "competenciesJson", "source", "receivedAt", "payloadSha256",
    "questionnaireVersion"
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
  Participants: ["personId", "displayName", "group", "enabled"],
  QuestionBank: [
    "bankItemId", "questionId", "sourceQuestionnaireId", "parentQuestionId", "type",
    "competencyId", "title", "prompt", "optionsJson", "correctAnswerJson",
    "gradingMode", "rubric", "maxScore", "difficulty", "tagsJson", "status",
    "version", "updatedAt", "questionJson"
  ],
  QuestionnaireItems: [
    "questionnaireId", "questionnaireVersion", "questionId", "position", "parentQuestionId", "addedAt"
  ],
  QuestionnaireReleases: [
    "questionnaireId", "version", "status", "title", "description", "durationSeconds",
    "questionCount", "publishedAt", "publishedBy", "contentHash", "questionnaireJson"
  ]
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

function createAdminToken() {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty(QANDA_CONFIG.adminTokenHashProperty, sha256_(token));
  console.log("QANDA_ADMIN_TOKEN=" + token);
  return token;
}

function doGet(e) {
  const action = String(e && e.parameter && e.parameter.action || "");
  try {
    if (action === "public.questionnaires") {
      return json_({ ok: true, data: publicQuestionnaires_(getSpreadsheet_()) });
    }
    if (action === "public.questionnaire") {
      return json_({ ok: true, data: publicQuestionnaire_(getSpreadsheet_(), String(e.parameter.id || "")) });
    }
    return json_({ ok: true, service: "QANDA Google Sheets receiver", at: new Date().toISOString() });
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function doPost(e) {
  const receivedAt = new Date().toISOString();
  let payload = null;
  try {
    const raw = e && e.postData ? String(e.postData.contents || "") : "";
    if (!raw || raw.length > QANDA_CONFIG.maxBodyChars) throw new Error("Invalid payload size");
    payload = JSON.parse(raw);
    if (payload && /^admin\./.test(String(payload.event || ""))) {
      verifyAdminToken_(payload.adminToken);
      return json_(handleAdminRequest_(payload, receivedAt));
    }
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

function handleAdminRequest_(payload, receivedAt) {
  const spreadsheet = getSpreadsheet_();
  ensureSheets_(spreadsheet);
  let result;
  if (payload.event === "admin.results.list") {
    result = listResults_(spreadsheet, payload.filters || {});
  } else if (payload.event === "admin.results.detail") {
    result = readResultDetail_(spreadsheet, payload.sessionId);
  } else if (payload.event === "admin.question-bank.list") {
    result = listQuestionBank_(spreadsheet, payload.filters || {});
  } else if (payload.event === "admin.question-bank.import") {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error("Question bank is busy; retry later");
    try {
      result = importQuestionnaire_(spreadsheet, payload.questionnaire);
    } finally {
      lock.releaseLock();
    }
  } else if (payload.event === "admin.questionnaire.publish") {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error("Publishing is busy; retry later");
    try {
      result = publishQuestionnaire_(spreadsheet, payload.questionnaire, payload.actor || "questionnaire-admin");
    } finally {
      lock.releaseLock();
    }
  } else if (payload.event === "admin.questionnaire.close") {
    result = closeQuestionnaire_(spreadsheet, payload.questionnaireId, payload.actor || "questionnaire-admin");
  } else if (payload.event === "admin.dashboard") {
    result = dashboard_(spreadsheet, payload.filters || {});
  } else {
    throw new Error("Unsupported admin event");
  }
  appendAudit_(spreadsheet, receivedAt, payload, "admin", payload.event);
  return { ok: true, event: payload.event, data: result, receivedAt: receivedAt };
}

function verifyAdminToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty(QANDA_CONFIG.adminTokenHashProperty);
  if (!expected) throw new Error("Run createAdminToken() before using the management API");
  const actual = sha256_(String(token || ""));
  if (!secureEqual_(actual, expected)) throw new Error("Invalid admin token");
}

function listResults_(spreadsheet, filters) {
  const questionnaireId = String(filters.questionnaireId || "");
  const status = String(filters.status || "");
  const keyword = String(filters.keyword || "").trim().toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 200));
  const rows = sheetObjects_(spreadsheet.getSheetByName("Results"))
    .filter(function (row) { return !questionnaireId || String(row.questionnaireId) === questionnaireId; })
    .filter(function (row) { return !status || String(row.status) === status; })
    .filter(function (row) {
      if (!keyword) return true;
      return [row.sessionId, row.questionnaireTitle, row.personId, row.displayName, row.group, row.status]
        .join(" ").toLowerCase().indexOf(keyword) !== -1;
    })
    .sort(function (a, b) { return String(b.receivedAt).localeCompare(String(a.receivedAt)); })
    .slice(0, limit)
    .map(resultSummary_);
  return { results: rows, total: rows.length, source: "google-sheet" };
}

function readResultDetail_(spreadsheet, sessionId) {
  if (!isSafeId_(sessionId)) throw new Error("Invalid session id");
  const resultRow = sheetObjects_(spreadsheet.getSheetByName("Results")).find(function (row) {
    return String(row.sessionId) === String(sessionId);
  });
  if (!resultRow) throw new Error("Result not found");
  const competencies = sheetObjects_(spreadsheet.getSheetByName("Competencies")).filter(function (row) {
    return String(row.sessionId) === String(sessionId);
  });
  const answers = sheetObjects_(spreadsheet.getSheetByName("Answers")).filter(function (row) {
    return String(row.sessionId) === String(sessionId);
  });
  return { summary: resultSummary_(resultRow), competencies: competencies, answers: answers };
}

function resultSummary_(row) {
  return {
    id: String(row.sessionId || ""),
    questionnaireId: String(row.questionnaireId || ""),
    questionnaireTitle: String(row.questionnaireTitle || ""),
    participant: {
      personId: String(row.personId || ""),
      displayName: String(row.displayName || row.personId || ""),
      group: String(row.group || "")
    },
    status: String(row.status || ""),
    startedAt: dateValue_(row.startedAt),
    expiresAt: dateValue_(row.expiresAt),
    submittedAt: dateValue_(row.submittedAt),
    score: numberOrNull_(row.score),
    maxScore: numberOrNull_(row.maxScore),
    percentage: numberOrNull_(row.percentage),
    proficiencyLabel: String(row.proficiencyLabel || ""),
    recommendation: String(row.recommendation || ""),
    questionnaireVersion: Number(row.questionnaireVersion || 1),
    answerCount: Number(row.answerCount || 0),
    lastSyncAt: dateValue_(row.receivedAt)
  };
}

function publicQuestionnaires_(spreadsheet) {
  const latest = latestReleases_(spreadsheet);
  return {
    questionnaires: latest.map(function (row) {
      const questionnaire = parseJson_(row.questionnaireJson, {});
      questionnaire.lifecycle = Object.assign({}, questionnaire.lifecycle || {}, {
        status: String(row.status), version: Number(row.version || 1), publishedAt: dateValue_(row.publishedAt)
      });
      return questionnaire;
    }),
    source: "google-sheet"
  };
}

function publicQuestionnaire_(spreadsheet, questionnaireId) {
  if (!isSafeId_(questionnaireId)) throw new Error("Invalid questionnaire id");
  const row = latestReleases_(spreadsheet).find(function (item) {
    return String(item.questionnaireId) === questionnaireId && String(item.status) === "published";
  });
  if (!row) throw new Error("Published questionnaire not found");
  return { questionnaire: parseJson_(row.questionnaireJson, null), source: "google-sheet" };
}

function latestReleases_(spreadsheet) {
  const latest = {};
  sheetObjects_(spreadsheet.getSheetByName("QuestionnaireReleases")).forEach(function (row) {
    const id = String(row.questionnaireId || "");
    if (!latest[id] || Number(row.version) > Number(latest[id].version)) latest[id] = row;
  });
  return Object.keys(latest).map(function (id) { return latest[id]; });
}

function publishQuestionnaire_(spreadsheet, questionnaire, actor) {
  if (!questionnaire || !isSafeId_(questionnaire.id) || !String(questionnaire.title || "").trim()) {
    throw new Error("Invalid questionnaire");
  }
  if (!Array.isArray(questionnaire.questions) || !questionnaire.questions.length) throw new Error("Questionnaire needs questions");
  const releases = sheetObjects_(spreadsheet.getSheetByName("QuestionnaireReleases"))
    .filter(function (row) { return String(row.questionnaireId) === questionnaire.id; })
    .sort(function (a, b) { return Number(b.version) - Number(a.version); });
  const latest = releases[0] || null;
  const contentHash = questionnaireContentHash_(questionnaire);
  if (latest && String(latest.contentHash) === contentHash) {
    setSheetCell_(spreadsheet.getSheetByName("QuestionnaireReleases"), latest.__rowNumber, "status", "published");
    return { questionnaireId: questionnaire.id, version: Number(latest.version), publishedAt: dateValue_(latest.publishedAt), reused: true };
  }
  const version = latest ? Number(latest.version) + 1 : 1;
  const publishedAt = new Date().toISOString();
  const released = JSON.parse(JSON.stringify(questionnaire));
  released.lifecycle = Object.assign({}, released.lifecycle || {}, {
    status: "published", version: version, updatedAt: publishedAt, publishedAt: publishedAt
  });
  spreadsheet.getSheetByName("QuestionnaireReleases").appendRow([
    safeCell_(released.id), version, "published", safeCell_(released.title), safeCell_(released.description),
    number_(released.durationSeconds), flattenQuestionnaire_(released.questions).length, publishedAt,
    safeCell_(actor), contentHash, safeJson_(released)
  ]);
  importQuestionnaire_(spreadsheet, released);
  return { questionnaireId: released.id, version: version, publishedAt: publishedAt, reused: false };
}

function closeQuestionnaire_(spreadsheet, questionnaireId) {
  if (!isSafeId_(questionnaireId)) throw new Error("Invalid questionnaire id");
  const row = latestReleases_(spreadsheet).find(function (item) { return String(item.questionnaireId) === questionnaireId; });
  if (!row) throw new Error("Questionnaire release not found");
  setSheetCell_(spreadsheet.getSheetByName("QuestionnaireReleases"), row.__rowNumber, "status", "closed");
  return { questionnaireId: questionnaireId, version: Number(row.version), status: "closed" };
}

function questionnaireContentHash_(questionnaire) {
  const copy = JSON.parse(JSON.stringify(questionnaire));
  delete copy.lifecycle;
  return sha256_(JSON.stringify(copy));
}

function dashboard_(spreadsheet, filters) {
  const questionnaireId = String(filters.questionnaireId || "");
  const group = String(filters.group || "").trim().toLowerCase();
  const results = sheetObjects_(spreadsheet.getSheetByName("Results")).filter(function (row) {
    return (!questionnaireId || String(row.questionnaireId) === questionnaireId) &&
      (!group || String(row.group || "").toLowerCase().indexOf(group) !== -1);
  });
  const sessionIds = new Set(results.map(function (row) { return String(row.sessionId); }));
  const resultBySessionId = {};
  results.forEach(function (row) { resultBySessionId[String(row.sessionId)] = row; });
  const competencies = sheetObjects_(spreadsheet.getSheetByName("Competencies")).filter(function (row) {
    return sessionIds.has(String(row.sessionId));
  });
  const answers = sheetObjects_(spreadsheet.getSheetByName("Answers")).filter(function (row) {
    return sessionIds.has(String(row.sessionId));
  }).map(function (row) {
    const result = resultBySessionId[String(row.sessionId)] || {};
    row.questionnaireVersion = Number(result.questionnaireVersion || 1);
    return row;
  });
  const submitted = results.filter(function (row) { return String(row.status) === "submitted"; });
  const percentages = submitted.map(function (row) { return Number(row.percentage); }).filter(Number.isFinite);
  const uniqueParticipants = new Set(submitted.map(function (row) { return String(row.personId); }));
  return {
    summary: {
      submissions: submitted.length,
      participants: uniqueParticipants.size,
      averagePercentage: round1_(average_(percentages)),
      passRate: round1_(submitted.length ? submitted.filter(function (row) { return Number(row.percentage) >= 70; }).length * 100 / submitted.length : 0)
    },
    questionnaires: aggregateRows_(submitted, "questionnaireId", function (rows) {
      return { id: String(rows[0].questionnaireId), label: String(rows[0].questionnaireTitle), submissions: rows.length,
        averagePercentage: round1_(average_(rows.map(function (row) { return Number(row.percentage); }))),
        passRate: round1_(rows.filter(function (row) { return Number(row.percentage) >= 70; }).length * 100 / rows.length) };
    }),
    competencies: aggregateRows_(competencies, "competencyId", function (rows) {
      const score = sum_(rows, "score"); const maxScore = sum_(rows, "maxScore");
      return { id: String(rows[0].competencyId), label: String(rows[0].competencyLabel), attempts: rows.length,
        percentage: round1_(maxScore ? score * 100 / maxScore : 0) };
    }).sort(function (a, b) { return a.percentage - b.percentage; }),
    questions: aggregateRows_(answers, "questionnaireId|questionnaireVersion|questionId", function (rows) {
      const score = sum_(rows, "score"); const maxScore = sum_(rows, "maxScore");
      return { id: String(rows[0].questionId), questionnaireId: String(rows[0].questionnaireId),
        version: Number(rows[0].questionnaireVersion || 1), label: String(rows[0].questionTitle),
        attempts: rows.length, percentage: round1_(maxScore ? score * 100 / maxScore : 0) };
    }).sort(function (a, b) { return a.percentage - b.percentage; }).slice(0, 10),
    participants: aggregateRows_(submitted, "personId", function (rows) {
      return { id: String(rows[0].personId), label: String(rows[0].displayName || rows[0].personId), group: String(rows[0].group || ""),
        completed: new Set(rows.map(function (row) { return String(row.questionnaireId); })).size,
        averagePercentage: round1_(average_(rows.map(function (row) { return Number(row.percentage); }))),
        latestAt: rows.map(function (row) { return dateValue_(row.submittedAt); }).sort().pop() || "" };
    }).sort(function (a, b) { return a.averagePercentage - b.averagePercentage; }),
    filters: { questionnaireId: questionnaireId, group: group },
    generatedAt: new Date().toISOString()
  };
}

function aggregateRows_(rows, keySpec, mapper) {
  const groups = {};
  rows.forEach(function (row) {
    const key = keySpec.split("|").map(function (field) { return String(row[field]); }).join("|");
    (groups[key] || (groups[key] = [])).push(row);
  });
  return Object.keys(groups).map(function (key) { return mapper(groups[key]); });
}

function sum_(rows, field) { return rows.reduce(function (total, row) { return total + (Number(row[field]) || 0); }, 0); }
function average_(values) { const valid = values.filter(Number.isFinite); return valid.length ? valid.reduce(function (a, b) { return a + b; }, 0) / valid.length : 0; }
function round1_(value) { return Math.round(Number(value || 0) * 10) / 10; }

function listQuestionBank_(spreadsheet, filters) {
  const keyword = String(filters.keyword || "").trim().toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 200));
  const items = sheetObjects_(spreadsheet.getSheetByName("QuestionBank"))
    .filter(function (row) {
      if (!keyword) return true;
      return [row.questionId, row.title, row.prompt, row.competencyId, row.tagsJson]
        .join(" ").toLowerCase().indexOf(keyword) !== -1;
    })
    .slice(0, limit);
  return { items: items, total: items.length, source: "google-sheet" };
}

function importQuestionnaire_(spreadsheet, questionnaire) {
  if (!questionnaire || !isSafeId_(questionnaire.id)) throw new Error("Invalid questionnaire");
  const version = Number(questionnaire.lifecycle && questionnaire.lifecycle.version) || 1;
  const at = new Date().toISOString();
  const questions = flattenQuestionnaire_(questionnaire.questions || []);
  const bankSheet = spreadsheet.getSheetByName("QuestionBank");
  const itemSheet = spreadsheet.getSheetByName("QuestionnaireItems");
  const bankKeys = new Set(sheetObjects_(bankSheet).map(function (row) { return String(row.bankItemId); }));
  const itemKeys = new Set(sheetObjects_(itemSheet).map(function (row) {
    return [row.questionnaireId, row.questionnaireVersion, row.questionId].join(":");
  }));
  const bankRows = [];
  const itemRows = [];
  questions.forEach(function (entry, index) {
    const question = entry.question;
    const bankItemId = [questionnaire.id, question.id, version].join(":");
    if (!bankKeys.has(bankItemId)) {
      bankRows.push([
        safeCell_(bankItemId), safeCell_(question.id), safeCell_(questionnaire.id),
        safeCell_(entry.parentQuestionId), safeCell_(question.type), safeCell_(question.competency),
        safeCell_(question.title), safeCell_(question.prompt), safeJson_(question.options || []),
        safeJson_(question.correctAnswer), safeCell_(question.gradingMode || "fixed"),
        safeCell_(question.rubric), number_(question.maxScore), safeCell_(question.difficulty),
        safeJson_(question.tags || []), "active", version, at, safeJson_(question)
      ]);
    }
    const itemKey = [questionnaire.id, version, question.id].join(":");
    if (!itemKeys.has(itemKey)) {
      itemRows.push([safeCell_(questionnaire.id), version, safeCell_(question.id), index + 1, safeCell_(entry.parentQuestionId), at]);
    }
  });
  appendRows_(bankSheet, bankRows);
  appendRows_(itemSheet, itemRows);
  return { questionnaireId: questionnaire.id, version: version, importedQuestions: bankRows.length, linkedItems: itemRows.length };
}

function flattenQuestionnaire_(questions, parentQuestionId) {
  return questions.reduce(function (all, question) {
    all.push({ question: question, parentQuestionId: parentQuestionId || "" });
    if (question.questions && question.questions.length) {
      all = all.concat(flattenQuestionnaire_(question.questions, question.id));
    }
    return all;
  }, []);
}

function sheetObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function (row, rowIndex) { return { row: row, rowNumber: rowIndex + 2 }; })
    .filter(function (entry) { return entry.row.some(function (cell) { return cell !== ""; }); }).map(function (entry) {
    const row = entry.row;
    return headers.reduce(function (object, header, index) {
      object[header] = row[index];
      return object;
    }, { __rowNumber: entry.rowNumber });
  });
}

function setSheetCell_(sheet, rowNumber, header, value) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const column = headers.indexOf(header) + 1;
  if (!column) throw new Error("Missing sheet column: " + header);
  sheet.getRange(rowNumber, column).setValue(value);
}

function parseJson_(value, fallback) {
  try { return JSON.parse(String(value || "")); } catch (_) { return fallback; }
}

function dateValue_(value) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

function numberOrNull_(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function secureEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
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
  if (!isAllowedQuestionnaire_(questionnaire.id)) throw new Error("Questionnaire is not allowed");
  if (!session.participant || !isSafeId_(session.participant.personId)) throw new Error("Invalid participant");
  if (!isFiniteNumber_(payload.result.score) || !isFiniteNumber_(payload.result.maxScore)) throw new Error("Invalid score");
  if (Number(payload.result.score) < 0 || Number(payload.result.score) > Number(payload.result.maxScore)) throw new Error("Score is out of range");
}

function isAllowedQuestionnaire_(questionnaireId) {
  if (QANDA_CONFIG.allowedSurveyIds.indexOf(questionnaireId) !== -1) return true;
  try {
    return latestReleases_(getSpreadsheet_()).some(function (row) {
      return String(row.questionnaireId) === questionnaireId && String(row.status) === "published";
    });
  } catch (_) {
    return false;
  }
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
    safeJson_(result.competencies || []), safeCell_(payload.source), receivedAt, digest,
    number_(payload.questionnaire.version || 1)
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
    } else {
      const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      const missing = headers.filter(function (header) { return existing.indexOf(header) === -1; });
      if (missing.length) sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]).setFontWeight("bold");
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
