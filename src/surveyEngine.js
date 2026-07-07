const QUESTION_TYPES = new Set(["boolean", "single", "multiple", "short", "composite"]);

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
    if (question.type === "composite") stripAnswerKeys(question.questions);
  }
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
  return {
    score,
    maxScore,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
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
    score: fixed.score,
    maxScore,
    status: fixed.status,
    comment: fixed.comment
  };
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
