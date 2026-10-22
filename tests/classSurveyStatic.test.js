import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

function setup(published) {
  const survey = JSON.parse(fs.readFileSync(new URL("../data/questionnaires/first-class-profile.json", import.meta.url), "utf8"));
  const saved = new Map();
  const window = {location:{href:"https://example.com/QANDA/"},QANDA_CONFIG:{googleAppsScriptUrl:"https://example.com/cloud"},fetch:async input => {
    const url = new URL(input, "https://example.com/QANDA/");
    if (url.pathname === "/cloud") {
      if (url.searchParams.get("action") === "public.analytics") return Response.json(published ? {ok:true,data:{version:1,distributions:[],crossTabs:[]}} : {ok:false,error:"Not published"});
      return Response.json({ok:true,data:{questionnaires:[]}});
    }
    if (url.pathname.endsWith("index.json")) return Response.json({questionnaires:[{id:survey.id}]});
    return Response.json(survey);
  }};
  const context = vm.createContext({window,URL,Response,AbortSignal,crypto:webcrypto,structuredClone,console,localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)}});
  vm.runInContext(fs.readFileSync(new URL("../public/static-api.js",import.meta.url),"utf8"),context);
  const api = async (url,body) => window.fetch(`/api/${url}`,{method:body ? "POST" : "GET",body:body && JSON.stringify(body)});
  return {api,survey,saved};
}

test("student survey refuses to start before cloud publishing and report deployment", async () => {
  const {api,survey,saved} = setup(false);
  const response = await api("sessions/start",{questionnaireId:survey.id,displayName:"Test"});
  assert.equal(response.status,409);
  assert.equal(saved.has("static:sessions"),false);
});

test("published survey can be completed without scores or fake AI grading logs", async () => {
  const {api,survey} = setup(true);
  const started = await (await api("sessions/start",{questionnaireId:survey.id,displayName:"Test"})).json();
  assert.equal(started.session.questionnaireVersion,1);
  assert.equal(started.session.questionnaireSnapshot.id,survey.id);
  const answers = Object.fromEntries(survey.questions.map(q=>[q.id,q.type === "multiple" ? [q.options[0].value] : q.options[0].value]));
  const completed = await (await api(`sessions/${started.session.id}/submit`,{answers})).json();
  assert.equal(completed.session.result.mode,"survey");
  assert.equal(completed.session.result.percentage,null);
  assert.equal(completed.session.aiLogs.length,0);
});
