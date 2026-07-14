const QUESTION_TYPES = new Set(["boolean", "single", "multiple", "short", "composite"]);
const LIFECYCLE_STATUSES = new Set(["draft", "review", "published", "closed", "archived"]);
const LIFECYCLE_TRANSITIONS = {
  draft: ["review"],
  review: ["draft", "published"],
  published: ["closed"],
  closed: ["published", "archived"],
  archived: ["closed"]
};

export function nowIso() {
  return new Date().toISOString();
}

export function makeSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateSurvey(survey) {
  const errors = [];
  if (!survey || typeof survey !== "object") errors.push("survey must be an object");
  if (!survey?.id || !/^[a-zA-Z0-9_-]+$/.test(survey.id)) errors.push("id must use letters, numbers, dash, or underscore");
  if (!survey?.title) errors.push("title is required");
  if (!Number.isFinite(Number(survey?.durationSeconds)) || Number(survey.durationSeconds) <= 0) {
    errors.push("durationSeconds must be a positive number");
  }
  if (!Array.isArray(survey?.questions) || survey.questions.length === 0) {
    errors.push("questions must be a non-empty array");
  } else {
    validateQuestions(survey.questions, errors, new Set());
  }
  if (survey?.lifecycle?.status && !LIFECYCLE_STATUSES.has(survey.lifecycle.status)) {
    errors.push("lifecycle.status must be draft, review, published, closed, or archived");
  }
  return errors;
}

function validateQuestions(questions, errors, seenIds) {
  for (const question of questions) {
    if (!question?.id) errors.push("question id is required");
    if (question?.id && seenIds.has(question.id)) errors.push(`duplicate question id: ${question.id}`);
    if (question?.id) seenIds.add(question.id);
    if (!QUESTION_TYPES.has(question?.type)) errors.push(`unsupported question type: ${question?.type ?? "missing"}`);
    if (!question?.prompt) errors.push(`question ${question?.id ?? "(missing id)"} prompt is required`);
    if (["single", "multiple"].includes(question?.type) && !Array.isArray(question.options)) {
      errors.push(`question ${question.id} options are required`);
    }
    if (question?.type === "composite") {
      if (!Array.isArray(question.questions) || question.questions.length === 0) {
        errors.push(`composite question ${question.id} needs child questions`);
      } else {
        validateQuestions(question.questions, errors, seenIds);
      }
    }
  }
}

export function publicSurvey(survey) {
  const clone = structuredClone(survey);
  delete clone.accessRoster;
  stripAnswerKeys(clone.questions);
  return clone;
}

function stripAnswerKeys(questions) {
  for (const question of questions) {
    delete question.correctAnswer;
    delete question.acceptedAnswers;
    delete question.matchMode;
    delete question.rubric;
    if (question.type === "composite") stripAnswerKeys(question.questions);
  }
}

export function surveyLifecycleStatus(survey) {
  return survey?.lifecycle?.status || "published";
}

export function isSurveyPublished(survey) {
  return surveyLifecycleStatus(survey) === "published";
}

export function prepareSurveyForSave(survey, existing = null, options = {}) {
  if (!survey || typeof survey !== "object") {
    const error = new Error("問卷內容必須是 JSON 物件。");
    error.statusCode = 422;
    throw error;
  }
  const at = options.at || nowIso();
  const actor = options.actor || "questionnaire-admin";
  const next = structuredClone(survey);
  const existingStatus = existing ? surveyLifecycleStatus(existing) : null;
  const requestedStatus = surveyLifecycleStatus(next);
  if (existing && requestedStatus !== existingStatus) {
    const error = new Error("請使用生命週期操作變更問卷狀態。");
    error.statusCode = 409;
    throw error;
  }

  const previousLifecycle = existing?.lifecycle || {};
  const lifecycle = next.lifecycle || {};
  next.lifecycle = {
    ...lifecycle,
    status: existingStatus || lifecycle.status || "draft",
    version: existing ? Number(previousLifecycle.version || 1) + 1 : Number(lifecycle.version || 1),
    owner: lifecycle.owner || previousLifecycle.owner || actor,
    createdAt: lifecycle.createdAt || previousLifecycle.createdAt || at,
    updatedAt: at,
    audit: Array.isArray(previousLifecycle.audit)
      ? [...previousLifecycle.audit]
      : Array.isArray(lifecycle.audit)
        ? [...lifecycle.audit]
        : []
  };
  next.lifecycle.audit.push({
    from: next.lifecycle.status,
    to: next.lifecycle.status,
    at,
    actor,
    note: existing ? `儲存第 ${next.lifecycle.version} 版內容` : "建立問卷草稿"
  });
  return next;
}

export function transitionSurveyLifecycle(survey, nextStatus, options = {}) {
  const currentStatus = surveyLifecycleStatus(survey);
  if (!LIFECYCLE_STATUSES.has(nextStatus)) {
    const error = new Error("不支援的問卷生命週期狀態。");
    error.statusCode = 422;
    throw error;
  }
  if (!(LIFECYCLE_TRANSITIONS[currentStatus] || []).includes(nextStatus)) {
    const error = new Error(`問卷無法由 ${currentStatus} 直接變更為 ${nextStatus}。`);
    error.statusCode = 409;
    throw error;
  }

  const at = options.at || nowIso();
  const updated = structuredClone(survey);
  const lifecycle = updated.lifecycle || {};
  lifecycle.status = nextStatus;
  lifecycle.version = Number(lifecycle.version || 1);
  lifecycle.createdAt = lifecycle.createdAt || at;
  lifecycle.updatedAt = at;
  lifecycle.audit = Array.isArray(lifecycle.audit) ? lifecycle.audit : [];
  lifecycle.audit.push({
    from: currentStatus,
    to: nextStatus,
    at,
    actor: options.actor || "questionnaire-admin",
    note: options.note || ""
  });
  if (nextStatus === "review") lifecycle.submittedForReviewAt = at;
  if (nextStatus === "published") lifecycle.publishedAt = at;
  if (nextStatus === "closed") lifecycle.closedAt = at;
  if (nextStatus === "archived") lifecycle.archivedAt = at;
  updated.lifecycle = lifecycle;
  return updated;
}

export function flattenQuestions(questions) {
  const flat = [];
  for (const question of questions) {
    if (question.type === "composite") {
      flat.push(question);
      flat.push(...flattenQuestions(question.questions || []));
    } else {
      flat.push(question);
    }
  }
  return flat;
}

export function createSession({ survey, participant }) {
  const startedAt = new Date();
  const durationMs = Number(survey.durationSeconds) * 1000;
  return {
    id: makeSessionId(),
    questionnaireId: survey.id,
    participant: {
      personId: participant.personId,
      displayName: participant.displayName || participant.personId,
      group: participant.group || ""
    },
    status: "in_progress",
    startedAt: startedAt.toISOString(),
    expiresAt: new Date(startedAt.getTime() + durationMs).toISOString(),
    answers: {},
    result: null,
    memory: {
      clientRevision: 0,
      clientSavedAt: null,
      lastSyncAt: null,
      serverSnapshots: []
    },
    aiLogs: []
  };
}

export function remainingSeconds(session, at = new Date()) {
  if (session.status !== "in_progress") return 0;
  return Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - at.getTime()) / 1000));
}

export function isExpired(session, at = new Date()) {
  return remainingSeconds(session, at) <= 0 && session.status !== "submitted";
}

export function mergeAnswers(session, incoming, meta = {}) {
  const safeIncoming = incoming && typeof incoming === "object" ? incoming : {};
  session.answers = { ...session.answers, ...safeIncoming };
  session.memory.clientRevision = Number(meta.clientRevision || session.memory.clientRevision || 0);
  session.memory.clientSavedAt = meta.clientSavedAt || session.memory.clientSavedAt || null;
  session.memory.lastSyncAt = nowIso();
  session.memory.serverSnapshots.push({
    at: session.memory.lastSyncAt,
    phase: meta.phase || "autosave",
    answerCount: Object.keys(session.answers).length,
    clientRevision: session.memory.clientRevision
  });
  session.memory.serverSnapshots = session.memory.serverSnapshots.slice(-30);
  return session;
}

export function gradeAnswers(survey, answers, aiAssessments = {}) {
  const questionResults = [];
  let score = 0;
  let maxScore = 0;
  for (const question of survey.questions) {
    const result = gradeQuestion(question, answers, aiAssessments);
    questionResults.push(result);
    score += result.score;
    maxScore += result.maxScore;
  }
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return {
    score,
    maxScore,
    percentage,
    proficiency: resolveProficiency(survey, percentage),
    competencies: aggregateCompetencies(survey, questionResults),
    gradedAt: nowIso(),
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
      competency: question.competency || null,
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
    const aiScore = clampScore(Number(ai.score), maxScore);
    return {
      id: question.id,
      title: question.title || question.prompt,
      type: question.type,
      competency: question.competency || null,
      score: aiScore,
      maxScore,
      status: aiScore >= maxScore ? "correct" : aiScore > 0 ? "partial" : "incorrect",
      comment: ai.comment || "AI 評分完成。",
      ai
    };
  }

  const fixed = gradeFixed(question, value, maxScore);
  return {
    id: question.id,
    title: question.title || question.prompt,
    type: question.type,
    competency: question.competency || null,
    score: fixed.score,
    maxScore,
    status: fixed.status,
    comment: fixed.comment
  };
}

function resolveProficiency(survey, percentage) {
  const rules = Array.isArray(survey.proficiencyRules) ? [...survey.proficiencyRules] : [];
  const matched = rules
    .sort((a, b) => Number(b.minPercentage || 0) - Number(a.minPercentage || 0))
    .find((rule) => percentage >= Number(rule.minPercentage || 0));
  if (matched) return structuredClone(matched);
  const passPercentage = Number(survey.passPercentage || 70);
  return percentage >= passPercentage
    ? { minPercentage: passPercentage, label: "已達標", recommendation: "可進入下一階段。" }
    : { minPercentage: 0, label: "尚未達標", recommendation: "請依各題回饋安排補強。" };
}

function aggregateCompetencies(survey, questionResults) {
  const definitions = new Map((survey.competencies || []).map((item) => [item.id, item.label]));
  const totals = new Map();
  for (const item of flattenResultItems(questionResults)) {
    if (!item.competency) continue;
    const total = totals.get(item.competency) || {
      id: item.competency,
      label: definitions.get(item.competency) || item.competency,
      score: 0,
      maxScore: 0
    };
    total.score += Number(item.score || 0);
    total.maxScore += Number(item.maxScore || 0);
    totals.set(item.competency, total);
  }
  return [...totals.values()].map((item) => ({
    ...item,
    percentage: item.maxScore > 0 ? Math.round((item.score / item.maxScore) * 100) : 0
  }));
}

function flattenResultItems(items) {
  return items.flatMap((item) => (item.children ? flattenResultItems(item.children) : [item]));
}

function gradeFixed(question, value, maxScore) {
  if (question.gradingMode === "ai") {
    return {
      score: 0,
      status: "pending",
      comment: "此題設定為 AI 評分，尚未取得 AI 評分結果。"
    };
  }

  if (question.type === "boolean" || question.type === "single") {
    const correct = answerChoiceValue(value) === question.correctAnswer;
    return {
      score: correct ? maxScore : 0,
      status: correct ? "correct" : "incorrect",
      comment: correct ? "答案正確。" : "答案不符合固定答案。"
    };
  }

  if (question.type === "multiple") {
    const expected = Array.isArray(question.correctAnswer) ? [...question.correctAnswer].sort() : [];
    const actual = answerChoiceValues(value).sort();
    const correct = expected.length === actual.length && expected.every((item, index) => item === actual[index]);
    return {
      score: correct ? maxScore : 0,
      status: correct ? "correct" : "incorrect",
      comment: correct ? "答案正確。" : "多選答案需完全符合。"
    };
  }

  if (question.type === "short") {
    const answerText = String(value || "").trim().toLowerCase();
    const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
    const matched = accepted.some((answer) => {
      const normalized = String(answer).trim().toLowerCase();
      return question.matchMode === "contains" ? answerText.includes(normalized) : answerText === normalized;
    });
    return {
      score: matched ? maxScore : 0,
      status: matched ? "correct" : "incorrect",
      comment: matched ? "簡答符合固定關鍵答案。" : "簡答未命中固定答案。"
    };
  }

  return {
    score: 0,
    status: "ungraded",
    comment: "此題型尚未評分。"
  };
}

function answerChoiceValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value.value;
  return value;
}

function answerChoiceValues(value) {
  if (!Array.isArray(value)) return [];
  return value.map(answerChoiceValue);
}

function clampScore(value, maxScore) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maxScore, Math.round(value)));
}

export function buildResultSummary(session, survey) {
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
