import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createSession, gradeAnswers, validateSurvey } from "../src/surveyEngine.js";

const surveyPath = new URL("../data/questionnaires/first-class-profile.json", import.meta.url);
function survey() {
  assert.ok(fs.existsSync(surveyPath), "first class questionnaire exists");
  return JSON.parse(fs.readFileSync(surveyPath, "utf8"));
}
function core() {
  const file = new URL("../public/analytics-core.js", import.meta.url);
  assert.ok(fs.existsSync(file), "shared analytics implementation exists");
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return context.QandaAnalytics;
}
test("first class survey has eight choice questions and no answer keys", () => {
  const s = survey();
  assert.deepEqual(validateSurvey(s), []);
  assert.equal(s.questions.length, 8);
  assert.equal(s.mode, "survey");
  assert.ok(s.questions.every(q => ["single", "multiple"].includes(q.type) && !q.correctAnswer));
});
test("a survey records completion without evaluating student preferences", () => {
  const result = gradeAnswers({ mode: "survey", questions: [{id:"pace", type:"single", prompt:"Pace", options:[{value:"slow",label:"Slow"}]}] }, {pace:"slow"});
  assert.equal(result.mode, "survey");
  assert.equal(result.score, 0);
  assert.equal(result.percentage, null);
  assert.equal(result.questionResults[0].status, "recorded");
});

test("survey sessions preserve their questionnaire version and definition", () => {
  const definition = survey();
  definition.lifecycle.version = 7;
  const session = createSession({survey:definition,participant:{personId:"learner"}});
  definition.questions[0].title = "Changed after start";
  assert.equal(session.questionnaireVersion, 7);
  assert.notEqual(session.questionnaireSnapshot.questions[0].title, "Changed after start");
});
test("multi-select percentages use respondents, ignore invalid options and duplicate sessions", () => {
  const s = {id:"test", questions:[{id:"purpose",type:"multiple",title:"Purpose",options:[{value:"a",label:"A"},{value:"b",label:"B"}]}],analytics:{crossTabs:[]}};
  const data = core().aggregate(s, [
    {sessionId:"1",status:"submitted",answers:{purpose:["a","a","b","invalid"]},displayName:"SECRET"},
    {sessionId:"1",status:"submitted",answers:{purpose:["b"]}},
    {sessionId:"2",status:"submitted",answers:{purpose:["b"]}},
    {sessionId:"3",status:"in_progress",answers:{purpose:["a"]}}
  ]);
  assert.equal(data.total, 2);
  assert.equal(data.distributions[0].answered, 2);
  assert.equal(data.distributions[0].options[0].percentage, 50);
  assert.equal(data.distributions[0].options[1].percentage, 100);
  assert.ok(!JSON.stringify(data).includes("SECRET"));
});
test("cross tables use valid paired responses and expose row percentages", () => {
  const s = {id:"test",questions:["age","pace"].map(id=>({id,type:"single",title:id,options:[{value:"a",label:"A"},{value:"b",label:"B"}]})),analytics:{crossTabs:[{row:"age",column:"pace"}]}};
  const data = core().aggregate(s,[
    {sessionId:"1",status:"submitted",answers:{age:"a",pace:"a"}},
    {sessionId:"2",status:"submitted",answers:{age:"a",pace:"b"}},
    {sessionId:"3",status:"submitted",answers:{age:"b",pace:"invalid"}}
  ]);
  assert.equal(data.crossTabs[0].paired, 2);
  assert.equal(data.crossTabs[0].rows[0].cells[0].percentage, 50);
  assert.equal(data.crossTabs[0].rows[1].cells[0].percentage, null);
});
test("public aggregates withhold small classes, teacher aggregates do not", () => {
  const s = {id:"test",questions:[],analytics:{minimumPublicResponses:5,crossTabs:[]}};
  const rows = [{sessionId:"1",status:"submitted",answers:{}}];
  assert.equal(core().aggregate(s,rows,{public:true}).withheld, true);
  assert.equal(core().aggregate(s,rows).withheld, false);
});
