export const COLLABORATION_PACKAGE_FORMAT = "qanda-questionnaire/v1";

const SUPPORTED_TYPES = ["boolean", "single", "multiple", "short", "composite"];
const DEFAULT_FIXED_TYPES = ["boolean", "single", "multiple", "composite"];
const FORBIDDEN_QUESTIONNAIRE_FIELDS = [
  "accessRoster",
  "lifecycle",
  "sessions",
  "results",
  "participants",
  "adminToken",
  "token"
];
const QUESTION_FIELD_LABELS = {
  type: "題型",
  title: "題目標題",
  prompt: "題幹",
  competency: "能力標籤",
  options: "選項",
  correctAnswer: "標準答案",
  acceptedAnswers: "可接受答案",
  gradingMode: "評分方式",
  rubric: "評分規準",
  maxScore: "配分"
};

export function sanitizeQuestionnaireForCollaboration(questionnaire) {
  const clean = clone(questionnaire || {});
  for (const field of FORBIDDEN_QUESTIONNAIRE_FIELDS) delete clean[field];
  return clean;
}

export async function questionnaireFingerprint(questionnaire) {
  const source = stableStringify(sanitizeQuestionnaireForCollaboration(questionnaire));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function createCollaborationPackage({
  baseQuestionnaire = null,
  candidateQuestionnaire,
  operation,
  brief = {},
  rules = {},
  proposal = {}
}) {
  if (!candidateQuestionnaire || typeof candidateQuestionnaire !== "object") {
    throw new Error("缺少可匯出的問卷內容。");
  }

  const candidate = sanitizeQuestionnaireForCollaboration(candidateQuestionnaire);
  const base = baseQuestionnaire ? sanitizeQuestionnaireForCollaboration(baseQuestionnaire) : null;
  const resolvedOperation = operation || (base ? "revise" : "create");
  const hasShortAnswer = flattenQuestions(candidate.questions).some((question) => question.type === "short");
  const fixedAnswerOnly = rules.fixedAnswerOnly ?? !hasShortAnswer;
  const allowedTypes = uniqueStrings(
    rules.allowedTypes || (fixedAnswerOnly ? DEFAULT_FIXED_TYPES : SUPPORTED_TYPES)
  );

  return {
    format: COLLABORATION_PACKAGE_FORMAT,
    operation: resolvedOperation,
    exportedAt: new Date().toISOString(),
    base: base
      ? {
          questionnaireId: base.id,
          version: Number(baseQuestionnaire?.lifecycle?.version || 1),
          contentHash: await questionnaireFingerprint(base)
        }
      : { questionnaireId: null, version: 0, contentHash: null },
    brief: {
      purpose: String(brief.purpose ?? candidate.description ?? "").trim(),
      audience: String(brief.audience ?? candidate.audience ?? "").trim(),
      difficulty: String(brief.difficulty ?? candidate.assessmentLevel ?? "foundation").trim(),
      durationMinutes: Number(brief.durationMinutes ?? Math.ceil(Number(candidate.durationSeconds || 0) / 60)),
      totalScore: questionnaireTotalScore(candidate),
      passPercentage: Number(brief.passPercentage ?? candidate.passPercentage ?? 70)
    },
    rules: {
      allowedTypes,
      fixedAnswerOnly,
      shortAnswerAllowed: !fixedAnswerOnly && allowedTypes.includes("short"),
      requireAnswerKey: rules.requireAnswerKey !== false
    },
    questionnaire: candidate,
    proposal: {
      authorType: proposal.authorType === "ai" ? "ai" : "teacher",
      model: proposal.model || null,
      summary: uniqueStrings(proposal.summary || []),
      assumptions: uniqueStrings(proposal.assumptions || [])
    }
  };
}

export function parseCollaborationPackage(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`協作包不是有效 JSON：${error.message}`);
    }
  }
  return clone(value);
}

export async function inspectCollaborationPackage(value, currentQuestionnaire = null) {
  const packageData = parseCollaborationPackage(value);
  const errors = validateCollaborationPackage(packageData);
  const warnings = [];

  if (currentQuestionnaire && packageData?.questionnaire?.id !== currentQuestionnaire.id) {
    errors.push(`候選題卷為「${packageData?.questionnaire?.id || "未知問卷"}」，不是目前的「${currentQuestionnaire.id}」。`);
  }

  if (currentQuestionnaire && packageData?.operation === "revise") {
    if (packageData.base?.questionnaireId !== currentQuestionnaire.id) {
      errors.push(`提案屬於「${packageData.base?.questionnaireId || "未知問卷"}」，不是目前的「${currentQuestionnaire.id}」。`);
    } else if (packageData.base?.contentHash) {
      const currentHash = await questionnaireFingerprint(currentQuestionnaire);
      if (currentHash !== packageData.base.contentHash) {
        warnings.push("提案建立後，目前題卷已變更；接受前請逐項確認差異。");
      }
    }

    const currentVersion = Number(currentQuestionnaire.lifecycle?.version || 1);
    const baseVersion = Number(packageData.base?.version || 0);
    if (baseVersion && currentVersion !== baseVersion) {
      warnings.push(`提案基於第 ${baseVersion} 版，目前編輯器為第 ${currentVersion} 版。`);
    }
  }

  return {
    package: packageData,
    candidate: packageData?.questionnaire || null,
    comparison: packageData?.questionnaire
      ? compareQuestionnaires(currentQuestionnaire, packageData.questionnaire)
      : emptyComparison(),
    errors: uniqueStrings(errors),
    warnings: uniqueStrings(warnings),
    canAccept: errors.length === 0
  };
}

export function validateCollaborationPackage(packageData) {
  const errors = [];
  if (!packageData || typeof packageData !== "object" || Array.isArray(packageData)) {
    return ["協作包必須是 JSON 物件。"];
  }
  if (packageData.format !== COLLABORATION_PACKAGE_FORMAT) {
    errors.push(`format 必須是 ${COLLABORATION_PACKAGE_FORMAT}。`);
  }
  if (!["create", "revise"].includes(packageData.operation)) {
    errors.push("operation 必須是 create 或 revise。");
  }
  if (packageData.operation === "revise") {
    if (!packageData.base?.questionnaireId) errors.push("修改提案必須提供 base.questionnaireId。");
    if (!packageData.base?.contentHash) errors.push("修改提案必須提供 base.contentHash。");
    if (packageData.questionnaire?.id && packageData.base?.questionnaireId
      && packageData.questionnaire.id !== packageData.base.questionnaireId) {
      errors.push("修改提案不可變更 questionnaire.id。");
    }
  }

  const rules = packageData.rules || {};
  const allowedTypes = Array.isArray(rules.allowedTypes) && rules.allowedTypes.length
    ? rules.allowedTypes
    : SUPPORTED_TYPES;
  for (const type of allowedTypes) {
    if (!SUPPORTED_TYPES.includes(type)) errors.push(`rules.allowedTypes 含不支援題型：${type}。`);
  }
  if (rules.fixedAnswerOnly && allowedTypes.includes("short")) {
    errors.push("固定答案模式不可包含 short 題型。");
  }
  errors.push(...validateQuestionnaire(packageData.questionnaire, { ...rules, allowedTypes }));

  const expectedTotal = Number(packageData.brief?.totalScore);
  const actualTotal = questionnaireTotalScore(packageData.questionnaire);
  if (Number.isFinite(expectedTotal) && expectedTotal !== actualTotal) {
    errors.push(`brief.totalScore 為 ${expectedTotal}，但題目配分合計為 ${actualTotal}。`);
  }
  return uniqueStrings(errors);
}

export function validateQuestionnaire(questionnaire, rules = {}) {
  const errors = [];
  if (!questionnaire || typeof questionnaire !== "object" || Array.isArray(questionnaire)) {
    return ["questionnaire 必須是 JSON 物件。"];
  }
  if (!questionnaire.id || !/^[a-zA-Z0-9_-]+$/.test(questionnaire.id)) {
    errors.push("questionnaire.id 只能使用英文字母、數字、連字號或底線。");
  }
  if (!String(questionnaire.title || "").trim()) errors.push("questionnaire.title 不可空白。");
  for (const field of FORBIDDEN_QUESTIONNAIRE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(questionnaire, field)) {
      errors.push(`questionnaire 不可包含操作或敏感欄位：${field}。`);
    }
  }
  if (!Number.isFinite(Number(questionnaire.durationSeconds)) || Number(questionnaire.durationSeconds) <= 0) {
    errors.push("questionnaire.durationSeconds 必須大於 0。");
  }
  if (!Array.isArray(questionnaire.questions) || questionnaire.questions.length === 0) {
    errors.push("questionnaire.questions 至少需要一題。");
    return errors;
  }

  const allowedTypes = new Set(rules.allowedTypes || SUPPORTED_TYPES);
  const seenIds = new Set();
  validateQuestions(questionnaire.questions, errors, seenIds, allowedTypes, rules);
  return errors;
}

export function compareQuestionnaires(currentQuestionnaire, candidateQuestionnaire) {
  if (!currentQuestionnaire) {
    const added = flattenQuestions(candidateQuestionnaire?.questions);
    return {
      changes: [{ type: "created", label: "建立新題卷", detail: `${added.length} 題，總分 ${questionnaireTotalScore(candidateQuestionnaire)}` }],
      stats: { added: added.length, removed: 0, changed: 0 },
      currentScore: 0,
      candidateScore: questionnaireTotalScore(candidateQuestionnaire)
    };
  }

  const changes = [];
  const rootFields = [
    ["title", "標題"],
    ["description", "說明"],
    ["durationSeconds", "作答時間"],
    ["passPercentage", "及格門檻"],
    ["competencies", "能力標籤"],
    ["proficiencyRules", "程度判定規則"]
  ];
  for (const [field, label] of rootFields) {
    if (!sameValue(currentQuestionnaire[field], candidateQuestionnaire?.[field])) {
      changes.push({ type: "field", label: `修改${label}`, detail: field });
    }
  }

  const currentMap = questionMap(currentQuestionnaire.questions);
  const candidateMap = questionMap(candidateQuestionnaire?.questions);
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const [id, candidate] of candidateMap) {
    const current = currentMap.get(id);
    if (!current) {
      added += 1;
      changes.push({ type: "added", label: `新增題目 ${id}`, detail: candidate.question.prompt || candidate.question.title || "" });
      continue;
    }
    const fields = changedQuestionFields(current.question, candidate.question);
    if (fields.length) {
      changed += 1;
      changes.push({
        type: "changed",
        label: `修改題目 ${id}`,
        detail: fields.map((field) => QUESTION_FIELD_LABELS[field] || field).join("、")
      });
    }
  }
  for (const [id, current] of currentMap) {
    if (!candidateMap.has(id)) {
      removed += 1;
      changes.push({ type: "removed", label: `移除題目 ${id}`, detail: current.question.prompt || current.question.title || "" });
    }
  }

  const currentScore = questionnaireTotalScore(currentQuestionnaire);
  const candidateScore = questionnaireTotalScore(candidateQuestionnaire);
  if (currentScore !== candidateScore) {
    changes.push({ type: "score", label: "總分變更", detail: `${currentScore} → ${candidateScore}` });
  }

  return { changes, stats: { added, removed, changed }, currentScore, candidateScore };
}

export function acceptCollaborationCandidate(currentQuestionnaire, candidateQuestionnaire) {
  const accepted = sanitizeQuestionnaireForCollaboration(candidateQuestionnaire);
  if (Object.prototype.hasOwnProperty.call(currentQuestionnaire || {}, "accessRoster")) {
    accepted.accessRoster = clone(currentQuestionnaire.accessRoster);
  }
  if (Object.prototype.hasOwnProperty.call(currentQuestionnaire || {}, "lifecycle")) {
    accepted.lifecycle = clone(currentQuestionnaire.lifecycle);
  }
  return accepted;
}

export function questionnaireTotalScore(questionnaire) {
  return flattenQuestions(questionnaire?.questions)
    .filter((question) => question.type !== "composite")
    .reduce((total, question) => total + Number(question.maxScore || 0), 0);
}

export function buildAiCollaborationPrompt(packageData) {
  return [
    "你是 QANDA 題卷協作助手。請依 brief 與 rules 修改 questionnaire。",
    `只回傳完整的 ${COLLABORATION_PACKAGE_FORMAT} JSON，不要使用 Markdown，也不要改動 format、operation 與 base。`,
    "每題必須有唯一 id、明確配分與可驗證答案；不得加入名單、作答結果、權杖或發布狀態。",
    "在 proposal.summary 列出主要修改，在 proposal.assumptions 列出仍需教師確認的假設，authorType 設為 ai。",
    "",
    JSON.stringify(packageData, null, 2)
  ].join("\n");
}

function validateQuestions(questions, errors, seenIds, allowedTypes, rules) {
  for (const question of questions) {
    const id = String(question?.id || "").trim();
    if (!id) errors.push("每一題都必須有 id。");
    if (id && seenIds.has(id)) errors.push(`題目 id 重複：${id}。`);
    if (id) seenIds.add(id);
    if (!SUPPORTED_TYPES.includes(question?.type)) errors.push(`題目 ${id || "(未命名)"} 使用不支援題型。`);
    if (!allowedTypes.has(question?.type)) errors.push(`題目 ${id || "(未命名)"} 的 ${question?.type} 題型不在允許清單。`);
    if (!String(question?.prompt || "").trim()) errors.push(`題目 ${id || "(未命名)"} 缺少題幹。`);

    if (question?.type === "composite") {
      if (!Array.isArray(question.questions) || question.questions.length === 0) {
        errors.push(`複合題 ${id || "(未命名)"} 至少需要一個子題。`);
      } else {
        validateQuestions(question.questions, errors, seenIds, allowedTypes, rules);
      }
      continue;
    }

    const score = Number(question?.maxScore);
    if (!Number.isFinite(score) || score <= 0) errors.push(`題目 ${id || "(未命名)"} 的 maxScore 必須大於 0。`);
    if (["single", "multiple"].includes(question?.type)) validateChoiceQuestion(question, errors);
    if (rules.requireAnswerKey !== false) validateAnswerKey(question, errors, rules);
  }
}

function validateChoiceQuestion(question, errors) {
  if (!Array.isArray(question.options) || question.options.length < 2) {
    errors.push(`題目 ${question.id} 至少需要兩個選項。`);
    return;
  }
  const values = question.options.map((option) => String(option?.value ?? ""));
  if (values.some((value) => !value)) errors.push(`題目 ${question.id} 的選項 value 不可空白。`);
  if (new Set(values).size !== values.length) errors.push(`題目 ${question.id} 的選項 value 不可重複。`);
}

function validateAnswerKey(question, errors, rules) {
  if (question.type === "boolean" && typeof question.correctAnswer !== "boolean") {
    errors.push(`題目 ${question.id} 缺少布林標準答案。`);
  }
  if (question.type === "single") {
    const values = new Set((question.options || []).map((option) => String(option.value)));
    if (question.correctAnswer === undefined || !values.has(String(question.correctAnswer))) {
      errors.push(`題目 ${question.id} 的單選標準答案不在選項中。`);
    }
  }
  if (question.type === "multiple") {
    const values = new Set((question.options || []).map((option) => String(option.value)));
    if (!Array.isArray(question.correctAnswer) || question.correctAnswer.length === 0) {
      errors.push(`題目 ${question.id} 缺少多選標準答案。`);
    } else if (question.correctAnswer.some((answer) => !values.has(String(answer)))) {
      errors.push(`題目 ${question.id} 的多選標準答案不在選項中。`);
    }
  }
  if (question.type === "short") {
    if (rules.fixedAnswerOnly || rules.shortAnswerAllowed === false) {
      errors.push(`題目 ${question.id} 為簡答題，但目前規則只允許固定答案。`);
    } else if ((!Array.isArray(question.acceptedAnswers) || question.acceptedAnswers.length === 0)
      && !(question.gradingMode === "ai" && String(question.rubric || "").trim())) {
      errors.push(`題目 ${question.id} 必須提供 acceptedAnswers，或提供 AI 評分 rubric。`);
    }
  }
}

function flattenQuestions(questions = []) {
  const flat = [];
  for (const question of questions || []) {
    flat.push(question);
    if (question?.type === "composite") flat.push(...flattenQuestions(question.questions));
  }
  return flat;
}

function questionMap(questions = []) {
  const map = new Map();
  for (const question of flattenQuestions(questions)) {
    if (question?.id) map.set(question.id, { question });
  }
  return map;
}

function changedQuestionFields(current, candidate) {
  const ignored = new Set(["id", "questions"]);
  const fields = new Set([...Object.keys(current || {}), ...Object.keys(candidate || {})]);
  return [...fields].filter((field) => !ignored.has(field) && !sameValue(current?.[field], candidate?.[field]));
}

function emptyComparison() {
  return { changes: [], stats: { added: 0, removed: 0, changed: 0 }, currentScore: 0, candidateScore: 0 };
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || "").trim()).filter(Boolean))];
}

function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = sortValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
