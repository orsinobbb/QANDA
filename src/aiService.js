import { gradeAnswers } from "./surveyEngine.js";

const defaultModel = process.env.AI_MODEL || "gpt-4.1-mini";
const apiUrl = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";

export async function generateQuestionnaireDraft({ prompt, title, durationMinutes = 15 }) {
  if (process.env.AI_API_KEY) {
    const generated = await callAiJson({
      system: "You create strict JSON questionnaires. Return only JSON, no markdown.",
      user: `Create a Traditional Chinese questionnaire JSON for this need: ${prompt}
Schema: id, title, description, durationSeconds, accessRoster, questions.
Question types: boolean, single, multiple, short, composite.
Include correctAnswer for fixed grading and gradingMode/rubric for AI grading when needed.
Use option objects with value and label. For an "other: ____" choice, add allowText: true and optional textPlaceholder.`
    });
    return {
      provider: "openai-compatible",
      model: defaultModel,
      questionnaire: normalizeGeneratedSurvey(generated, title, durationMinutes)
    };
  }

  return {
    provider: "local-fallback",
    model: "rule-template",
    questionnaire: buildFallbackSurvey({ prompt, title, durationMinutes })
  };
}

export async function gradeAiQuestions({ survey, answers }) {
  const aiQuestions = collectAiQuestions(survey.questions);
  if (!aiQuestions.length) return { assessments: {}, logs: [] };

  if (process.env.AI_API_KEY) {
    const payload = await callAiJson({
      system: "You grade questionnaire answers. Return only JSON.",
      user: `Grade these answers with concise Traditional Chinese comments.
Return shape: {"assessments":{"questionId":{"score":number,"comment":string}}}
Questions: ${JSON.stringify(aiQuestions)}
Answers: ${JSON.stringify(answers)}`
    });
    return {
      assessments: payload.assessments || {},
      logs: [
        {
          at: new Date().toISOString(),
          provider: "openai-compatible",
          model: defaultModel,
          action: "grade",
          questionIds: aiQuestions.map((question) => question.id)
        }
      ]
    };
  }

  const assessments = {};
  for (const question of aiQuestions) {
    const text = String(answers?.[question.id] || "").trim();
    const score = text.length >= 24 ? question.maxScore : text.length >= 8 ? Math.round(question.maxScore * 0.55) : 0;
    assessments[question.id] = {
      score,
      comment: text
        ? "本機 fallback 依回答完整度給分；正式環境可接 AI provider 取得語意評分。"
        : "未作答。"
    };
  }
  return {
    assessments,
    logs: [
      {
        at: new Date().toISOString(),
        provider: "local-fallback",
        model: "length-rubric",
        action: "grade",
        questionIds: aiQuestions.map((question) => question.id)
      }
    ]
  };
}

export async function previewGrade({ survey, answers }) {
  const { assessments, logs } = await gradeAiQuestions({ survey, answers });
  return {
    result: gradeAnswers(survey, answers, assessments),
    logs
  };
}

async function callAiJson({ system, user }) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.AI_API_KEY}`
    },
    body: JSON.stringify({
      model: defaultModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.2
    })
  });
  if (!response.ok) throw new Error(`AI provider error: ${response.status}`);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  return parseJsonFromText(text);
}

function parseJsonFromText(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  return JSON.parse(trimmed);
}

function normalizeGeneratedSurvey(generated, title, durationMinutes) {
  const survey = generated.questionnaire || generated;
  survey.id = survey.id || slugify(title || survey.title || "ai-survey");
  survey.title = survey.title || title || "AI 產生問卷";
  survey.durationSeconds = Number(survey.durationSeconds || durationMinutes * 60 || 900);
  survey.accessRoster = Array.isArray(survey.accessRoster) && survey.accessRoster.length
    ? survey.accessRoster
    : [
        {
          personId: "A001",
          displayName: "測試作答者",
          serial: "STAR-2026",
          group: "ai-draft"
        }
      ];
  return survey;
}

function buildFallbackSurvey({ prompt, title, durationMinutes }) {
  const surveyTitle = title || "AI 草稿問卷";
  return {
    id: `${slugify(surveyTitle)}-${Date.now().toString(36)}`,
    title: surveyTitle,
    description: `依「${prompt || "未提供主題"}」建立的本機草稿，可再由管理介面調整 JSON。`,
    durationSeconds: Number(durationMinutes || 15) * 60,
    accessRoster: [
      {
        personId: "A001",
        displayName: "測試作答者",
        serial: "STAR-2026",
        group: "ai-draft"
      }
    ],
    questions: [
      {
        id: "q1",
        type: "boolean",
        title: "核心判斷",
        prompt: "作答者能清楚辨識此主題的主要目標。",
        correctAnswer: true,
        maxScore: 5
      },
      {
        id: "q2",
        type: "single",
        title: "單選理解",
        prompt: "哪一個選項最能代表此主題的優先工作？",
        options: [
          { value: "clarify", label: "釐清目標與判準" },
          { value: "ignore", label: "略過限制條件" },
          { value: "delay", label: "等待所有細節完美" },
          { value: "other", label: "其它", allowText: true, textPlaceholder: "自行填寫" }
        ],
        correctAnswer: "clarify",
        maxScore: 10
      },
      {
        id: "q3",
        type: "multiple",
        title: "多選應用",
        prompt: "哪些資料適合被記錄以便後續追蹤？",
        options: [
          { value: "answer", label: "作答內容" },
          { value: "time", label: "提交時間" },
          { value: "reason", label: "評分理由" },
          { value: "noise", label: "無關暫存雜訊" }
        ],
        correctAnswer: ["answer", "time", "reason"],
        maxScore: 15
      },
      {
        id: "q4",
        type: "short",
        title: "簡答分析",
        prompt: "請說明你會如何判斷此主題的回答品質。",
        gradingMode: "ai",
        rubric: "回答需要包含判準、證據或可追蹤結果。",
        maxScore: 20
      }
    ]
  };
}

function collectAiQuestions(questions) {
  const collected = [];
  for (const question of questions || []) {
    if (question.type === "composite") collected.push(...collectAiQuestions(question.questions));
    if (question.gradingMode === "ai") {
      collected.push({
        id: question.id,
        prompt: question.prompt,
        rubric: question.rubric || "",
        maxScore: Number(question.maxScore || 0)
      });
    }
  }
  return collected;
}

function slugify(value) {
  const ascii = String(value || "survey")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return ascii || `survey-${Date.now().toString(36)}`;
}
