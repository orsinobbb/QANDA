import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

function loadContext() {
  const context = vm.createContext({ console });
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
    getRange(startRow, startColumn, rowCount, columnCount) {
      return {
        setValues: (newRows) => {
          for (let index = 0; index < rowCount; index += 1) {
            this.values[startRow - 1 + index] = newRows[index].slice(0, columnCount);
          }
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
