import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import test from "node:test";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

function loadContext() {
  const context = vm.createContext({
    console,
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_algorithm, text) => [...crypto.createHash("sha256").update(text, "utf8").digest()].map((value) => value > 127 ? value - 256 : value),
      getUuid: () => crypto.randomUUID()
    }
  });
  vm.runInContext(code, context);
  return context;
}

function sheet(headers, rows = []) {
  const values = [headers, ...rows];
  return {
    values,
    getDataRange() {
      return { getValues: () => this.values.map((row) => [...row]) };
    },
    getLastRow() {
      return this.values.length;
    },
    getLastColumn() {
      return Math.max(...this.values.map((row) => row.length));
    },
    appendRow(row) {
      this.values.push([...row]);
    },
    getRange(startRow, startColumn, rowCount, columnCount) {
      return {
        getValues: () => Array.from({ length: rowCount }, (_, rowIndex) =>
          Array.from({ length: columnCount }, (_, columnIndex) => this.values[startRow - 1 + rowIndex]?.[startColumn - 1 + columnIndex] ?? "")
        ),
        setValues: (newRows) => {
          for (let index = 0; index < rowCount; index += 1) {
            const target = this.values[startRow - 1 + index] || [];
            newRows[index].slice(0, columnCount).forEach((value, columnIndex) => {
              target[startColumn - 1 + columnIndex] = value;
            });
            this.values[startRow - 1 + index] = target;
          }
        },
        setValue: (value) => {
          const target = this.values[startRow - 1] || [];
          target[startColumn - 1] = value;
          this.values[startRow - 1] = target;
        }
      };
    }
  };
}

function spreadsheet(sheets) {
  return { getSheetByName: (name) => sheets[name] };
}

test("maps Google Sheet rows to management results", () => {
  const context = loadContext();
  const headers = [
    "sessionId", "questionnaireId", "questionnaireTitle", "personId", "displayName",
    "group", "status", "startedAt", "expiresAt", "submittedAt", "durationSeconds",
    "score", "maxScore", "percentage", "proficiencyLabel", "recommendation",
    "answerCount", "competenciesJson", "source", "receivedAt", "payloadSha256"
  ];
  const sheets = {
    Results: sheet(headers, [[
      "session-1", "ai-backend-foundation", "Foundation", "A001", "Student", "Class A",
      "submitted", "2026-08-13T01:00:00.000Z", "2026-08-13T01:20:00.000Z",
      "2026-08-13T01:10:00.000Z", 600, 82, 100, 82, "Ready", "Continue", 8,
      "[]", "test", "2026-08-13T01:10:01.000Z", "hash"
    ]])
  };
  context.__spreadsheet = spreadsheet(sheets);
  const result = vm.runInContext("listResults_(__spreadsheet, { keyword: 'student' })", context);
  assert.equal(result.total, 1);
  assert.equal(result.results[0].participant.personId, "A001");
  assert.equal(result.results[0].percentage, 82);
});

test("publishes immutable questionnaire versions and reuses identical content", () => {
  const context = loadContext();
  const releaseHeaders = [
    "questionnaireId", "version", "status", "title", "description", "durationSeconds",
    "questionCount", "publishedAt", "publishedBy", "contentHash", "questionnaireJson"
  ];
  const bankHeaders = [
    "bankItemId", "questionId", "sourceQuestionnaireId", "parentQuestionId", "type",
    "competencyId", "title", "prompt", "optionsJson", "correctAnswerJson", "gradingMode",
    "rubric", "maxScore", "difficulty", "tagsJson", "status", "version", "updatedAt", "questionJson"
  ];
  const sheets = {
    QuestionnaireReleases: sheet(releaseHeaders),
    QuestionBank: sheet(bankHeaders),
    QuestionnaireItems: sheet(["questionnaireId", "questionnaireVersion", "questionId", "position", "parentQuestionId", "addedAt"])
  };
  context.__spreadsheet = spreadsheet(sheets);
  context.__questionnaire = {
    id: "central-course", title: "Central course", durationSeconds: 600,
    questions: [{ id: "q1", type: "boolean", title: "One", prompt: "True?", correctAnswer: true, maxScore: 10 }]
  };
  const first = vm.runInContext("publishQuestionnaire_(__spreadsheet, __questionnaire, 'owner')", context);
  const repeated = vm.runInContext("publishQuestionnaire_(__spreadsheet, __questionnaire, 'owner')", context);
  vm.runInContext("__questionnaire.questions[0].prompt = 'Updated?'", context);
  const updated = vm.runInContext("publishQuestionnaire_(__spreadsheet, __questionnaire, 'owner')", context);
  assert.equal(first.version, 1);
  assert.equal(repeated.reused, true);
  assert.equal(updated.version, 2);
  assert.equal(sheets.QuestionnaireReleases.values.length, 3);
  assert.equal(JSON.parse(sheets.QuestionnaireReleases.values[2][10]).lifecycle.version, 2);
});

test("builds dashboard metrics without mixing question versions", () => {
  const context = loadContext();
  const resultHeaders = [
    "sessionId", "questionnaireId", "questionnaireTitle", "personId", "displayName",
    "group", "status", "startedAt", "expiresAt", "submittedAt", "durationSeconds",
    "score", "maxScore", "percentage", "proficiencyLabel", "recommendation",
    "answerCount", "competenciesJson", "source", "receivedAt", "payloadSha256",
    "questionnaireVersion"
  ];
  const results = [
    ["s1", "course", "Course", "A01", "Ada", "G1", "submitted", "", "", "2026-08-13T01:00:00Z", 600, 80, 100, 80, "", "", 1, "[]", "", "", "", 1],
    ["s2", "course", "Course", "A02", "Ben", "G1", "submitted", "", "", "2026-08-13T02:00:00Z", 600, 60, 100, 60, "", "", 1, "[]", "", "", "", 2]
  ];
  const sheets = {
    Results: sheet(resultHeaders, results),
    Competencies: sheet([
      "sessionId", "questionnaireId", "personId", "competencyId", "competencyLabel",
      "score", "maxScore", "percentage", "receivedAt"
    ], [["s1", "course", "A01", "api", "API", 8, 10, 80, ""], ["s2", "course", "A02", "api", "API", 6, 10, 60, ""]]),
    Answers: sheet([
      "sessionId", "questionnaireId", "personId", "questionId", "questionTitle",
      "questionType", "competencyId", "answerJson", "score", "maxScore", "status",
      "comment", "aiJson", "receivedAt"
    ], [["s1", "course", "A01", "q1", "Question", "single", "api", "", 8, 10, "", "", "", ""], ["s2", "course", "A02", "q1", "Question", "single", "api", "", 6, 10, "", "", "", ""]])
  };
  context.__spreadsheet = spreadsheet(sheets);
  const dashboard = vm.runInContext("dashboard_(__spreadsheet, {})", context);
  assert.equal(dashboard.summary.averagePercentage, 70);
  assert.equal(dashboard.summary.passRate, 50);
  assert.equal(dashboard.competencies[0].percentage, 70);
  assert.equal(dashboard.questions.length, 2);
  assert.deepEqual([...dashboard.questions].map((item) => item.version).sort(), [1, 2]);
});

test("imports questionnaire questions and composition without duplicates", () => {
  const context = loadContext();
  const bankHeaders = [
    "bankItemId", "questionId", "sourceQuestionnaireId", "parentQuestionId", "type",
    "competencyId", "title", "prompt", "optionsJson", "correctAnswerJson", "gradingMode",
    "rubric", "maxScore", "difficulty", "tagsJson", "status", "version", "updatedAt", "questionJson"
  ];
  const itemHeaders = ["questionnaireId", "questionnaireVersion", "questionId", "position", "parentQuestionId", "addedAt"];
  const sheets = {
    QuestionBank: sheet(bankHeaders),
    QuestionnaireItems: sheet(itemHeaders)
  };
  context.__spreadsheet = spreadsheet(sheets);
  context.__questionnaire = {
    id: "course-check",
    lifecycle: { version: 2 },
    questions: [
      { id: "q1", type: "single", title: "API", prompt: "Choose", correctAnswer: "a", maxScore: 10 },
      { id: "q2", type: "composite", title: "Case", questions: [
        { id: "q2a", type: "short", title: "Reason", acceptedAnswers: ["idempotency"], maxScore: 10 }
      ] }
    ]
  };
  const first = vm.runInContext("importQuestionnaire_(__spreadsheet, __questionnaire)", context);
  const second = vm.runInContext("importQuestionnaire_(__spreadsheet, __questionnaire)", context);
  assert.equal(first.importedQuestions, 3);
  assert.equal(first.linkedItems, 3);
  assert.equal(second.importedQuestions, 0);
  assert.equal(second.linkedItems, 0);
  assert.match(sheets.QuestionBank.values[3][18], /acceptedAnswers/);
});
