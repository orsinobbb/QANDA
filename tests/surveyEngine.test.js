import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  gradeAnswers,
  isExpired,
  mergeAnswers,
  publicSurvey,
  remainingSeconds,
  validateSurvey
} from "../src/surveyEngine.js";

const survey = {
  id: "unit-test",
  title: "單元測試問卷",
  durationSeconds: 60,
  accessRoster: [
    {
      personId: "A001",
      displayName: "測試者",
      serial: "S-1"
    }
  ],
  questions: [
    {
      id: "q1",
      type: "boolean",
      prompt: "布林題",
      correctAnswer: true,
      maxScore: 5
    },
    {
      id: "q2",
      type: "single",
      prompt: "單選題",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" }
      ],
      correctAnswer: "b",
      maxScore: 10
    },
    {
      id: "q3",
      type: "multiple",
      prompt: "多選題",
      options: [
        { value: "x", label: "X" },
        { value: "y", label: "Y" },
        { value: "z", label: "Z" }
      ],
      correctAnswer: ["x", "z"],
      maxScore: 15
    },
    {
      id: "q4",
      type: "short",
      prompt: "簡答題",
      acceptedAnswers: ["流程"],
      matchMode: "contains",
      maxScore: 10
    },
    {
      id: "q5",
      type: "short",
      prompt: "AI 題",
      gradingMode: "ai",
      maxScore: 20
    }
  ]
};

test("validates survey schema", () => {
  assert.deepEqual(validateSurvey(survey), []);
  assert.match(validateSurvey({ ...survey, id: "bad id" }).join(","), /id must/);
});

test("public survey strips answer keys and roster", () => {
  const clean = publicSurvey(survey);
  assert.equal(clean.accessRoster, undefined);
  assert.equal(clean.questions[0].correctAnswer, undefined);
  assert.equal(clean.questions[3].acceptedAnswers, undefined);
});

test("creates timed session and merges staged memory", () => {
  const session = createSession({ survey, participant: survey.accessRoster[0] });
  assert.equal(session.status, "in_progress");
  assert.ok(remainingSeconds(session) <= 60);
  mergeAnswers(session, { q1: true }, { phase: "autosave", clientRevision: 2 });
  assert.equal(session.answers.q1, true);
  assert.equal(session.memory.serverSnapshots.length, 1);
  assert.equal(session.memory.serverSnapshots[0].phase, "autosave");
});

test("detects expired sessions", () => {
  const session = {
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    status: "in_progress"
  };
  assert.equal(isExpired(session), true);
  assert.equal(remainingSeconds({ ...session, status: "submitted", expiresAt: new Date(Date.now() + 60000).toISOString() }), 0);
});

test("grades fixed and AI-assisted answers", () => {
  const result = gradeAnswers(
    survey,
    {
      q1: true,
      q2: { value: "b", text: "補充說明" },
      q3: [{ value: "z", text: "其它寫法" }, "x"],
      q4: "這個流程可以追蹤",
      q5: "完整回答"
    },
    {
      q5: {
        score: 16,
        comment: "語意清楚。"
      }
    }
  );
  assert.equal(result.score, 56);
  assert.equal(result.maxScore, 60);
  assert.equal(result.percentage, 93);
  assert.equal(result.questionResults.at(-1).status, "partial");
});
