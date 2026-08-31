import test from "node:test";
import assert from "node:assert/strict";

import {
  acceptCollaborationCandidate,
  compareQuestionnaires,
  createCollaborationPackage,
  inspectCollaborationPackage,
  questionnaireFingerprint,
  validateCollaborationPackage
} from "../public/collaboration-package.js";

function survey(overrides = {}) {
  return {
    id: "course-check",
    title: "課程檢核",
    description: "確認基礎理解",
    durationSeconds: 600,
    passPercentage: 70,
    lifecycle: { status: "published", version: 3, audit: [{ actor: "teacher" }] },
    accessRoster: [{ personId: "S001", displayName: "學員" }],
    questions: [
      { id: "q1", type: "boolean", prompt: "API 可以驗證輸入。", correctAnswer: true, maxScore: 40 },
      {
        id: "q2",
        type: "single",
        prompt: "哪一項最重要？",
        options: [
          { value: "evidence", label: "驗證證據" },
          { value: "guess", label: "直接猜測" }
        ],
        correctAnswer: "evidence",
        maxScore: 60
      }
    ],
    ...overrides
  };
}

test("collaboration package removes operational and participant data", async () => {
  const source = survey();
  const packageData = await createCollaborationPackage({
    baseQuestionnaire: source,
    candidateQuestionnaire: source,
    brief: { audience: "初學者" }
  });

  assert.equal(packageData.format, "qanda-questionnaire/v1");
  assert.equal(packageData.base.version, 3);
  assert.equal(packageData.brief.totalScore, 100);
  assert.equal(packageData.questionnaire.accessRoster, undefined);
  assert.equal(packageData.questionnaire.lifecycle, undefined);
  assert.match(packageData.base.contentHash, /^(?:[a-f0-9]{64}|fnv1a-[a-f0-9]{8})$/);
});

test("fingerprint is stable across object key order", async () => {
  const left = survey();
  const right = { questions: left.questions, title: left.title, id: left.id, passPercentage: 70, durationSeconds: 600, description: left.description };
  assert.equal(await questionnaireFingerprint(left), await questionnaireFingerprint(right));
});

test("fixed answer package rejects short answer questions", async () => {
  const source = survey({
    questions: [{ id: "q1", type: "short", prompt: "請說明", gradingMode: "ai", rubric: "說明證據", maxScore: 100 }]
  });
  const packageData = await createCollaborationPackage({
    baseQuestionnaire: source,
    candidateQuestionnaire: source,
    rules: { fixedAnswerOnly: true }
  });
  const errors = validateCollaborationPackage(packageData);
  assert.ok(errors.some((error) => error.includes("short")));
});

test("comparison reports question and score changes", () => {
  const current = survey();
  const candidate = survey({
    title: "新版課程檢核",
    questions: [
      { id: "q1", type: "boolean", prompt: "API 必須驗證輸入。", correctAnswer: true, maxScore: 50 },
      { id: "q3", type: "boolean", prompt: "測試可重現。", correctAnswer: true, maxScore: 50 }
    ]
  });
  const comparison = compareQuestionnaires(current, candidate);
  assert.deepEqual(comparison.stats, { added: 1, removed: 1, changed: 1 });
  assert.ok(comparison.changes.some((change) => change.label === "修改標題"));
});

test("inspection blocks a proposal for another questionnaire", async () => {
  const current = survey();
  const other = survey({ id: "other-course" });
  const packageData = await createCollaborationPackage({ baseQuestionnaire: other, candidateQuestionnaire: other });
  const inspection = await inspectCollaborationPackage(packageData, current);
  assert.equal(inspection.canAccept, false);
  assert.ok(inspection.errors.some((error) => error.includes("不是目前")));
});

test("inspection blocks changing the questionnaire id", async () => {
  const current = survey();
  const packageData = await createCollaborationPackage({
    baseQuestionnaire: current,
    candidateQuestionnaire: survey({ id: "renamed-course" })
  });
  const inspection = await inspectCollaborationPackage(packageData, current);
  assert.equal(inspection.canAccept, false);
  assert.ok(inspection.errors.some((error) => error.includes("questionnaire.id")));
});

test("import rejects operational and sensitive questionnaire fields", async () => {
  const current = survey();
  const packageData = await createCollaborationPackage({
    baseQuestionnaire: current,
    candidateQuestionnaire: current
  });
  packageData.questionnaire.accessRoster = [{ personId: "injected" }];
  packageData.questionnaire.lifecycle = { status: "published", version: 999 };
  packageData.questionnaire.adminToken = "do-not-import";

  const inspection = await inspectCollaborationPackage(packageData, current);
  assert.equal(inspection.canAccept, false);
  assert.ok(inspection.errors.some((error) => error.includes("accessRoster")));
  assert.ok(inspection.errors.some((error) => error.includes("lifecycle")));
  assert.ok(inspection.errors.some((error) => error.includes("adminToken")));
});

test("accepting a proposal preserves roster and lifecycle", () => {
  const current = survey();
  const accepted = acceptCollaborationCandidate(current, {
    ...survey(),
    title: "AI 候選版本"
  });
  assert.equal(accepted.title, "AI 候選版本");
  assert.deepEqual(accepted.accessRoster, current.accessRoster);
  assert.deepEqual(accepted.lifecycle, current.lifecycle);
});

test("accepting a proposal strips candidate operational data", () => {
  const accepted = acceptCollaborationCandidate({}, {
    ...survey(),
    accessRoster: [{ personId: "injected" }],
    lifecycle: { status: "published", version: 999 },
    sessions: [{ id: "hidden-session" }]
  });
  assert.equal(accepted.accessRoster, undefined);
  assert.equal(accepted.lifecycle, undefined);
  assert.equal(accepted.sessions, undefined);
});
