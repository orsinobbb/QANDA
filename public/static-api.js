(() => {
  const realFetch = window.fetch.bind(window);
  const sessionKey = "static:sessions";
  const surveyKey = "static:questionnaires";
  const staticState = {
    builtIn: null,
    surveys: null
  };

  window.__STATIC_API__ = {
    exportResults
  };

  window.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const parsed = new URL(url, window.location.href);
    if (!parsed.pathname.includes("/api/")) return realFetch(input, options);
    try {
      const data = await route(parsed, options);
      return jsonResponse(data);
    } catch (error) {
      return jsonResponse({ error: error.message || "Static API error" }, error.statusCode || 500);
    }
  };

  async function route(url, options) {
    const method = (options.method || "GET").toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    const apiPath = url.pathname.slice(url.pathname.indexOf("/api/"));
    const segments = apiPath.split("/").filter(Boolean);

    if (method === "GET" && apiPath === "/api/health") {
      return { ok: true, at: new Date().toISOString(), mode: "static-pages" };
    }

    if (method === "GET" && apiPath === "/api/questionnaires") {
      const surveys = await listSurveys();
      return {
        questionnaires: surveys.map((survey) => ({
          id: survey.id,
          title: survey.title,
          description: survey.description || "",
          durationSeconds: survey.durationSeconds,
          questionCount: countQuestions(survey.questions),
          rosterCount: Array.isArray(survey.accessRoster) ? survey.accessRoster.length : 0
        }))
      };
    }

    if (segments[1] === "questionnaires" && segments[2]) {
      if (method === "GET") return { questionnaire: await requireSurvey(segments[2]) };
    }

    if (method === "POST" && apiPath === "/api/questionnaires") {
      const survey = body.questionnaire || body;
      saveSurvey(survey);
      return { questionnaire: survey };
    }

    if (method === "POST" && apiPath === "/api/sessions/start") {
      const survey = await requireSurvey(body.questionnaireId);
      const participant = resolveParticipant(survey, body);
      const existing = getSessions().find(
        (session) =>
          session.questionnaireId === survey.id &&
          session.participant.personId === participant.personId &&
          session.status === "in_progress" &&
          !isExpired(session)
      );
      if (existing) return buildSessionResponse(existing, survey, "resumed");
      const session = createSession(survey, participant);
      saveSession(session);
      return buildSessionResponse(session, survey, "started");
    }

    if (segments[1] === "sessions" && segments[2]) {
      const session = requireSession(segments[2]);
      const survey = await requireSurvey(session.questionnaireId);

      if (method === "GET" && segments.length === 3) {
        expireIfNeeded(session);
        return buildSessionResponse(session, survey, "loaded");
      }

      if (method === "PUT" && segments[3] === "answers") {
        rejectWhenClosed(session);
        mergeAnswers(session, body.answers, body);
        saveSession(session);
        return buildSessionResponse(session, survey, "synced");
      }

      if (method === "POST" && segments[3] === "submit") {
        rejectWhenClosed(session);
        mergeAnswers(session, body.answers, { ...body, phase: "submit" });
        const assessments = gradeAiQuestions(survey, session.answers);
        session.result = gradeAnswers(survey, session.answers, assessments);
        session.status = "submitted";
        session.submittedAt = new Date().toISOString();
        session.aiLogs.push({
          at: new Date().toISOString(),
          provider: "static-fallback",
          model: "length-rubric",
          action: "grade"
        });
        saveSession(session);
        return buildSessionResponse(session, survey, "submitted");
      }
    }

    if (method === "GET" && apiPath === "/api/results") {
      return await searchResults(url);
    }

    if (segments[1] === "results" && segments[2] && method === "GET") {
      const session = requireSession(segments[2]);
      const survey = await requireSurvey(session.questionnaireId);
      return {
        summary: buildResultSummary(session, survey),
        session,
        questionnaire: survey
      };
    }

    if (method === "POST" && apiPath === "/api/ai/questionnaires") {
      const questionnaire = fallbackSurvey(body);
      return { provider: "static-fallback", model: "rule-template", questionnaire, validationErrors: [] };
    }

    const error = new Error("Static route not found");
    error.statusCode = 404;
    throw error;
  }

  async function loadBuiltInSurveys() {
    if (staticState.builtIn) return staticState.builtIn;
    const index = await realFetch("./data/questionnaires/index.json").then((response) => response.json());
    staticState.builtIn = await Promise.all(
      index.questionnaires.map((item) => realFetch(`./data/questionnaires/${item.id}.json`).then((response) => response.json()))
    );
    return staticState.builtIn;
  }

  async function listSurveys() {
    if (staticState.surveys) return staticState.surveys;
    const builtIn = await loadBuiltInSurveys();
    const saved = Object.values(readJson(surveyKey, {}));
    staticState.surveys = mergeById([...builtIn, ...saved]);
    return staticState.surveys;
  }

  async function requireSurvey(id) {
    const survey = (await listSurveys()).find((item) => item.id === id);
    if (!survey) throw httpError(404, "Questionnaire not found");
    return survey;
  }

  function saveSurvey(survey) {
    const saved = readJson(surveyKey, {});
    saved[survey.id] = survey;
    writeJson(surveyKey, saved);
    staticState.surveys = null;
  }

  function resolveParticipant(survey, body) {
    const roster = Array.isArray(survey.accessRoster) ? survey.accessRoster : [];
    if (!body.personId) throw httpError(400, "personId is required");
    if (!roster.length) {
      return { personId: body.personId, displayName: body.personId, group: "" };
    }
    const participant = roster.find((item) => item.personId === body.personId && item.serial === body.serial);
    if (!participant) throw httpError(403, "人員代號或序號不符合此問卷。");
    return participant;
  }

  function createSession(survey, participant) {
    const startedAt = new Date();
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      questionnaireId: survey.id,
      participant: {
        personId: participant.personId,
        displayName: participant.displayName || participant.personId,
        group: participant.group || ""
      },
      status: "in_progress",
      startedAt: startedAt.toISOString(),
      expiresAt: new Date(startedAt.getTime() + Number(survey.durationSeconds) * 1000).toISOString(),
      answers: {},
      result: null,
      memory: { clientRevision: 0, clientSavedAt: null, lastSyncAt: null, serverSnapshots: [] },
      aiLogs: []
    };
  }

  function buildSessionResponse(session, survey, event) {
    return {
      event,
      session: {
        ...session,
        remainingSeconds: remainingSeconds(session)
      },
      questionnaire: publicSurvey(survey)
    };
  }

  function publicSurvey(survey) {
    const clone = structuredClone(survey);
    delete clone.accessRoster;
    stripAnswerKeys(clone.questions || []);
    return clone;
  }

  function stripAnswerKeys(questions) {
    for (const question of questions) {
      delete question.correctAnswer;
      delete question.acceptedAnswers;
      delete question.matchMode;
      if (question.type === "composite") stripAnswerKeys(question.questions || []);
    }
  }

  function getSessions() {
    return readJson(sessionKey, []);
  }

  function saveSession(session) {
    const sessions = getSessions();
    const index = sessions.findIndex((item) => item.id === session.id);
    if (index >= 0) sessions[index] = session;
    else sessions.unshift(session);
    writeJson(sessionKey, sessions);
  }

  function requireSession(id) {
    const session = getSessions().find((item) => item.id === id);
    if (!session) throw httpError(404, "Session not found");
    return session;
  }

  function mergeAnswers(session, answers, meta = {}) {
    session.answers = { ...session.answers, ...(answers || {}) };
    session.memory.clientRevision = Number(meta.clientRevision || session.memory.clientRevision || 0);
    session.memory.clientSavedAt = meta.clientSavedAt || session.memory.clientSavedAt || null;
    session.memory.lastSyncAt = new Date().toISOString();
    session.memory.serverSnapshots.push({
      at: session.memory.lastSyncAt,
      phase: meta.phase || "autosave",
      answerCount: Object.keys(session.answers).length,
      clientRevision: session.memory.clientRevision
    });
    session.memory.serverSnapshots = session.memory.serverSnapshots.slice(-30);
  }

  function remainingSeconds(session) {
    if (session.status !== "in_progress") return 0;
    return Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
  }

  function isExpired(session) {
    return remainingSeconds(session) <= 0 && session.status !== "submitted";
  }

  function expireIfNeeded(session) {
    if (session.status === "in_progress" && isExpired(session)) {
      session.status = "expired";
      saveSession(session);
    }
  }

  function rejectWhenClosed(session) {
    expireIfNeeded(session);
    if (session.status === "submitted") throw httpError(409, "此作答已送出。");
    if (session.status === "expired") throw httpError(409, "作答時間已結束。");
  }

  function gradeAnswers(survey, answers, aiAssessments = {}) {
    const questionResults = [];
    let score = 0;
    let maxScore = 0;
    for (const question of survey.questions || []) {
      const result = gradeQuestion(question, answers, aiAssessments);
      questionResults.push(result);
      score += result.score;
      maxScore += result.maxScore;
    }
    return {
      score,
      maxScore,
      percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
      gradedAt: new Date().toISOString(),
      questionResults
    };
  }

  function gradeQuestion(question, answers, aiAssessments) {
    if (question.type === "composite") {
      const children = (question.questions || []).map((child) => gradeQuestion(child, answers, aiAssessments));
      const score = children.reduce((sum, child) => sum + child.score, 0);
      const maxScore = children.reduce((sum, child) => sum + child.maxScore, 0);
      return {
        id: question.id,
        title: question.title || question.prompt,
        type: question.type,
        score,
        maxScore,
        status: children.every((child) => child.status === "correct") ? "correct" : "partial",
        comment: "複合題依子題加總。",
        children
      };
    }
    const maxScore = Number(question.maxScore || 0);
    const value = answers?.[question.id];
    const ai = aiAssessments[question.id];
    if (ai) {
      const aiScore = Math.max(0, Math.min(maxScore, Math.round(Number(ai.score) || 0)));
      return {
        id: question.id,
        title: question.title || question.prompt,
        type: question.type,
        score: aiScore,
        maxScore,
        status: aiScore >= maxScore ? "correct" : aiScore > 0 ? "partial" : "incorrect",
        comment: ai.comment,
        ai
      };
    }
    const fixed = gradeFixed(question, value, maxScore);
    return {
      id: question.id,
      title: question.title || question.prompt,
      type: question.type,
      score: fixed.score,
      maxScore,
      status: fixed.status,
      comment: fixed.comment
    };
  }

  function gradeFixed(question, value, maxScore) {
    if (question.gradingMode === "ai") return { score: 0, status: "pending", comment: "此題設定為 AI 評分。" };
    if (question.type === "boolean" || question.type === "single") {
      const correct = answerChoiceValue(value) === question.correctAnswer;
      return { score: correct ? maxScore : 0, status: correct ? "correct" : "incorrect", comment: correct ? "答案正確。" : "答案不符合固定答案。" };
    }
    if (question.type === "multiple") {
      const expected = Array.isArray(question.correctAnswer) ? [...question.correctAnswer].sort() : [];
      const actual = answerChoiceValues(value).sort();
      const correct = expected.length === actual.length && expected.every((item, index) => item === actual[index]);
      return { score: correct ? maxScore : 0, status: correct ? "correct" : "incorrect", comment: correct ? "答案正確。" : "多選答案需完全符合。" };
    }
    if (question.type === "short") {
      const text = String(value || "").trim().toLowerCase();
      const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
      const matched = accepted.some((answer) => {
        const normalized = String(answer).trim().toLowerCase();
        return question.matchMode === "contains" ? text.includes(normalized) : text === normalized;
      });
      return { score: matched ? maxScore : 0, status: matched ? "correct" : "incorrect", comment: matched ? "簡答符合固定關鍵答案。" : "簡答未命中固定答案。" };
    }
    return { score: 0, status: "ungraded", comment: "此題型尚未評分。" };
  }

  function gradeAiQuestions(survey, answers) {
    const assessments = {};
    for (const question of flattenQuestions(survey.questions || [])) {
      if (question.gradingMode !== "ai") continue;
      const text = String(answers?.[question.id] || "").trim();
      assessments[question.id] = {
        score: text.length >= 24 ? Number(question.maxScore || 0) : text.length >= 8 ? Math.round(Number(question.maxScore || 0) * 0.55) : 0,
        comment: text ? "靜態版依回答完整度給分；正式 Node 版可接 AI provider。" : "未作答。"
      };
    }
    return assessments;
  }

  async function searchResults(url) {
    const surveys = await listSurveys();
    const surveyMap = new Map(surveys.map((survey) => [survey.id, survey]));
    const questionnaireId = url.searchParams.get("questionnaireId");
    const status = url.searchParams.get("status");
    const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();
    const results = getSessions()
      .map((session) => buildResultSummary(session, surveyMap.get(session.questionnaireId) || { id: session.questionnaireId, title: session.questionnaireId }))
      .filter((summary) => !questionnaireId || summary.questionnaireId === questionnaireId)
      .filter((summary) => !status || summary.status === status)
      .filter((summary) => {
        if (!keyword) return true;
        return [summary.id, summary.questionnaireTitle, summary.participant.personId, summary.participant.displayName, summary.participant.group, summary.status]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
    return { results, total: results.length };
  }

  function buildResultSummary(session, survey) {
    return {
      id: session.id,
      questionnaireId: survey.id,
      questionnaireTitle: survey.title,
      participant: session.participant,
      status: session.status,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      submittedAt: session.submittedAt || null,
      score: session.result?.score ?? null,
      maxScore: session.result?.maxScore ?? null,
      percentage: session.result?.percentage ?? null,
      answerCount: Object.keys(session.answers || {}).length,
      lastSyncAt: session.memory?.lastSyncAt || null
    };
  }

  async function exportResults() {
    const data = await searchResults(new URL(window.location.href));
    const headers = ["sessionId", "questionnaireId", "questionnaireTitle", "personId", "displayName", "group", "status", "score", "maxScore", "percentage", "startedAt", "submittedAt", "lastSyncAt"];
    const rows = data.results.map((row) => ({
      sessionId: row.id,
      questionnaireId: row.questionnaireId,
      questionnaireTitle: row.questionnaireTitle,
      personId: row.participant.personId,
      displayName: row.participant.displayName,
      group: row.participant.group,
      status: row.status,
      score: row.score,
      maxScore: row.maxScore,
      percentage: row.percentage,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      lastSyncAt: row.lastSyncAt
    }));
    const csv = `\ufeff${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "questionnaire-results.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function fallbackSurvey(body) {
    const title = body.title || "AI 生成問卷";
    return {
      id: `${slugify(title)}-${Date.now().toString(36)}`,
      title,
      description: `靜態版依「${body.prompt || "未提供主題"}」建立的草稿。`,
      durationSeconds: Number(body.durationMinutes || 15) * 60,
      accessRoster: [{ personId: "A001", displayName: "測試作答者", serial: "STAR-2026", group: "static" }],
      questions: [
        { id: "q1", type: "boolean", title: "核心判斷", prompt: "作答者能清楚辨識此主題的主要目標。", correctAnswer: true, maxScore: 5 },
        {
          id: "q2",
          type: "single",
          title: "流程選擇",
          prompt: "哪一項最適合作為優先工作？",
          options: [
            { value: "clarify", label: "釐清目標與判準" },
            { value: "other", label: "其它", allowText: true, textPlaceholder: "自行填寫" }
          ],
          correctAnswer: "clarify",
          maxScore: 10
        },
        { id: "q3", type: "short", title: "簡答分析", prompt: "請說明你的判斷方式。", gradingMode: "ai", rubric: "包含判準、證據或可追蹤結果。", maxScore: 20 }
      ]
    };
  }

  function flattenQuestions(questions) {
    return questions.flatMap((question) => (question.type === "composite" ? [question, ...flattenQuestions(question.questions || [])] : [question]));
  }

  function answerChoiceValue(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value.value;
    return value;
  }

  function answerChoiceValues(value) {
    return Array.isArray(value) ? value.map(answerChoiceValue) : [];
  }

  function countQuestions(questions = []) {
    return questions.reduce((sum, question) => sum + 1 + (question.type === "composite" ? countQuestions(question.questions || []) : 0), 0);
  }

  function mergeById(items) {
    return [...new Map(items.map((item) => [item.id, item])).values()];
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function slugify(value) {
    return (
      String(value || "survey")
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase() || `survey-${Date.now().toString(36)}`
    );
  }
})();

