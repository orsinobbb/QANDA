import {
  acceptCollaborationCandidate,
  buildAiCollaborationPrompt,
  createCollaborationPackage,
  inspectCollaborationPackage
} from "./collaboration-package.js";

const state = {
  questionnaires: [],
  adminQuestionnaires: [],
  adminSurvey: null,
  questionnaire: null,
  session: null,
  answers: {},
  clientRevision: 0,
  syncTimer: null,
  tickTimer: null,
  localDraft: null,
  activeQuestionId: null,
  resultSource: "local",
  remoteResults: [],
  activeAdminSection: "design",
  hasUnpublishedDraft: false,
  collaborationProposal: null,
  newQuestionnaireIdTouched: false
};

const SHEET_ADMIN_TOKEN_KEY = "qanda:sheet-admin-token";
const ADMIN_MODE = new URLSearchParams(window.location.search).get("admin") === "1";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  productContext: $("#productContext"),
  roleContextLabel: $("#roleContextLabel"),
  leaveAdminLink: $("#leaveAdminLink"),
  preflightStage: $("#preflightStage"),
  adminGate: $("#adminGate"),
  adminGateToken: $("#adminGateToken"),
  adminGateButton: $("#adminGateButton"),
  adminGateMessage: $("#adminGateMessage"),
  adminWorkspace: $("#adminWorkspace"),
  adminNavigation: $("#adminNavigation"),
  adminDesignSection: $("#adminDesignSection"),
  adminPublishSection: $("#adminPublishSection"),
  adminResultsSection: $("#adminResultsSection"),
  sidebarLifecycleStatus: $("#sidebarLifecycleStatus"),
  sidebarLifecycleVersion: $("#sidebarLifecycleVersion"),
  goPublishButton: $("#goPublishButton"),
  activeStage: $("#activeStage"),
  previewTitle: $("#previewTitle"),
  previewDescription: $("#previewDescription"),
  previewDuration: $("#previewDuration"),
  previewQuestionCount: $("#previewQuestionCount"),
  directLinkHint: $("#directLinkHint"),
  healthStatus: $("#healthStatus"),
  questionnaireSelect: $("#questionnaireSelect"),
  adminQuestionnaireSelect: $("#adminQuestionnaireSelect"),
  newQuestionnaireButton: $("#newQuestionnaireButton"),
  resultQuestionnaireFilter: $("#resultQuestionnaireFilter"),
  displayNameInput: $("#displayNameInput"),
  groupInput: $("#groupInput"),
  startButton: $("#startButton"),
  accessMessage: $("#accessMessage"),
  sidebarParticipant: $("#sidebarParticipant"),
  sidebarParticipantId: $("#sidebarParticipantId"),
  sidebarProgressText: $("#sidebarProgressText"),
  progressFill: $("#progressFill"),
  questionNav: $("#questionNav"),
  sidebarSyncStatus: $("#sidebarSyncStatus"),
  sessionBar: $("#sessionBar"),
  sessionStep: $("#sessionStep"),
  sessionTitle: $("#sessionTitle"),
  sessionMeta: $("#sessionMeta"),
  timerLabel: $("#timerLabel"),
  timerDisplay: $("#timerDisplay"),
  questionForm: $("#questionForm"),
  answerActions: $("#answerActions"),
  syncStatus: $("#syncStatus"),
  progressStatus: $("#progressStatus"),
  submitButton: $("#submitButton"),
  syncButton: $("#syncButton"),
  resultPanel: $("#resultPanel"),
  memoryBanner: $("#memoryBanner"),
  restoreDraftButton: $("#restoreDraftButton"),
  submitDialog: $("#submitDialog"),
  submitSummary: $("#submitSummary"),
  submitReview: $("#submitReview"),
  cancelSubmitButton: $("#cancelSubmitButton"),
  confirmSubmitButton: $("#confirmSubmitButton"),
  jsonEditor: $("#jsonEditor"),
  jsonMessage: $("#jsonMessage"),
  reloadJsonButton: $("#reloadJsonButton"),
  syncQuestionBankButton: $("#syncQuestionBankButton"),
  publishCentralButton: $("#publishCentralButton"),
  closeCentralButton: $("#closeCentralButton"),
  saveJsonButton: $("#saveJsonButton"),
  publishResult: $("#publishResult"),
  publishResultTitle: $("#publishResultTitle"),
  publishResultLink: $("#publishResultLink"),
  copyPublishLinkButton: $("#copyPublishLinkButton"),
  openPublishLinkButton: $("#openPublishLinkButton"),
  lifecycleTitle: $("#lifecycleTitle"),
  lifecycleStatus: $("#lifecycleStatus"),
  lifecycleVersion: $("#lifecycleVersion"),
  lifecycleTrail: $("#lifecycleTrail"),
  lifecycleMeta: $("#lifecycleMeta"),
  lifecycleActions: $("#lifecycleActions"),
  lifecycleMessage: $("#lifecycleMessage"),
  shareLinkInput: $("#shareLinkInput"),
  copyShareLinkButton: $("#copyShareLinkButton"),
  openShareLinkButton: $("#openShareLinkButton"),
  aiTitleInput: $("#aiTitleInput"),
  aiDurationInput: $("#aiDurationInput"),
  aiPromptInput: $("#aiPromptInput"),
  generateButton: $("#generateButton"),
  aiMessage: $("#aiMessage"),
  collaborationPurposeInput: $("#collaborationPurposeInput"),
  collaborationAudienceInput: $("#collaborationAudienceInput"),
  collaborationDifficultyInput: $("#collaborationDifficultyInput"),
  fixedAnswerOnlyInput: $("#fixedAnswerOnlyInput"),
  exportCollaborationButton: $("#exportCollaborationButton"),
  copyCollaborationPromptButton: $("#copyCollaborationPromptButton"),
  chooseCollaborationFileButton: $("#chooseCollaborationFileButton"),
  collaborationFileInput: $("#collaborationFileInput"),
  collaborationJsonInput: $("#collaborationJsonInput"),
  reviewCollaborationButton: $("#reviewCollaborationButton"),
  collaborationMessage: $("#collaborationMessage"),
  proposalReview: $("#proposalReview"),
  proposalReviewTitle: $("#proposalReviewTitle"),
  proposalStats: $("#proposalStats"),
  proposalWarnings: $("#proposalWarnings"),
  proposalChanges: $("#proposalChanges"),
  discardProposalButton: $("#discardProposalButton"),
  acceptProposalButton: $("#acceptProposalButton"),
  newQuestionnaireDialog: $("#newQuestionnaireDialog"),
  newQuestionnaireForm: $("#newQuestionnaireForm"),
  newQuestionnaireTitleInput: $("#newQuestionnaireTitleInput"),
  newQuestionnaireIdInput: $("#newQuestionnaireIdInput"),
  newQuestionnairePurposeInput: $("#newQuestionnairePurposeInput"),
  newQuestionnaireAudienceInput: $("#newQuestionnaireAudienceInput"),
  newQuestionnaireDifficultyInput: $("#newQuestionnaireDifficultyInput"),
  newQuestionnaireDurationInput: $("#newQuestionnaireDurationInput"),
  newQuestionnairePassInput: $("#newQuestionnairePassInput"),
  newQuestionnaireMessage: $("#newQuestionnaireMessage"),
  cancelNewQuestionnaireButton: $("#cancelNewQuestionnaireButton"),
  resultStatusFilter: $("#resultStatusFilter"),
  resultKeywordInput: $("#resultKeywordInput"),
  searchResultsButton: $("#searchResultsButton"),
  exportButton: $("#exportButton"),
  disconnectSheetButton: $("#disconnectSheetButton"),
  resultSourceStatus: $("#resultSourceStatus"),
  resultsBody: $("#resultsBody"),
  resultDetail: $("#resultDetail"),
  dashboardQuestionnaireFilter: $("#dashboardQuestionnaireFilter"),
  dashboardGroupFilter: $("#dashboardGroupFilter"),
  refreshDashboardButton: $("#refreshDashboardButton"),
  dashboardEmpty: $("#dashboardEmpty"),
  dashboardContent: $("#dashboardContent"),
  dashboardKpis: $("#dashboardKpis"),
  dashboardInsight: $("#dashboardInsight"),
  dashboardUpdatedAt: $("#dashboardUpdatedAt"),
  dashboardQuestionnaires: $("#dashboardQuestionnaires"),
  dashboardCompetencies: $("#dashboardCompetencies"),
  dashboardQuestions: $("#dashboardQuestions"),
  dashboardParticipants: $("#dashboardParticipants")
};

init();

async function init() {
  configureAppMode();
  bindEvents();
  const savedToken = sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY) || "";
  elements.adminGateToken.value = savedToken;
  await checkHealth();
  if (ADMIN_MODE && savedToken) await unlockAdmin(savedToken);
  if (!ADMIN_MODE) await loadQuestionnaires();
}

function configureAppMode() {
  document.body.classList.toggle("admin-mode", ADMIN_MODE);
  elements.productContext.textContent = ADMIN_MODE ? "教師工作台" : "學員作答";
  elements.roleContextLabel.textContent = ADMIN_MODE ? "教師／管理者" : "學員";
  elements.leaveAdminLink.classList.toggle("hidden", !ADMIN_MODE);
  document.getElementById("classReportLink").href = `./report.html?survey=first-class-profile${ADMIN_MODE ? "&admin=1" : ""}`;
  document.title = ADMIN_MODE ? "QANDA｜問卷管理" : "QANDA｜學員作答";
  showView(ADMIN_MODE ? "admin" : "answer");
}

function bindEvents() {
  elements.questionnaireSelect.addEventListener("change", handleSurveySelection);
  elements.adminGateButton.addEventListener("click", () => unlockAdmin(elements.adminGateToken.value.trim()));
  elements.adminGateToken.addEventListener("keydown", (event) => {
    if (event.key === "Enter") unlockAdmin(elements.adminGateToken.value.trim());
  });
  elements.startButton.addEventListener("click", startSession);
  elements.questionForm.addEventListener("input", handleAnswerInput);
  elements.questionNav.addEventListener("click", handleQuestionNavigation);
  elements.syncButton.addEventListener("click", () => syncAnswers("manual"));
  elements.submitButton.addEventListener("click", openSubmitReview);
  elements.cancelSubmitButton.addEventListener("click", closeSubmitReview);
  elements.confirmSubmitButton.addEventListener("click", submitAnswers);
  elements.restoreDraftButton.addEventListener("click", restoreLocalDraft);
  elements.adminQuestionnaireSelect.addEventListener("change", handleAdminSurveySelection);
  elements.newQuestionnaireButton.addEventListener("click", openNewQuestionnaireDialog);
  elements.newQuestionnaireForm.addEventListener("submit", createNewQuestionnaire);
  elements.cancelNewQuestionnaireButton.addEventListener("click", () => elements.newQuestionnaireDialog.close());
  elements.newQuestionnaireTitleInput.addEventListener("input", suggestNewQuestionnaireId);
  elements.newQuestionnaireIdInput.addEventListener("input", () => {
    state.newQuestionnaireIdTouched = true;
  });
  elements.adminNavigation.addEventListener("click", handleAdminNavigation);
  elements.goPublishButton.addEventListener("click", () => showAdminSection("publish"));
  elements.jsonEditor.addEventListener("input", handleEditorChange);
  elements.reloadJsonButton.addEventListener("click", loadAdminSurvey);
  elements.saveJsonButton.addEventListener("click", saveAdminSurvey);
  elements.syncQuestionBankButton.addEventListener("click", syncQuestionBank);
  elements.publishCentralButton.addEventListener("click", publishCentralQuestionnaire);
  elements.copyPublishLinkButton.addEventListener("click", () => copyText(elements.publishResultLink.value, elements.jsonMessage));
  elements.openPublishLinkButton.addEventListener("click", () => window.open(elements.publishResultLink.value, "_blank", "noopener"));
  elements.closeCentralButton.addEventListener("click", closeCentralQuestionnaire);
  elements.copyShareLinkButton.addEventListener("click", copyShareLink);
  elements.openShareLinkButton.addEventListener("click", openShareLink);
  elements.generateButton.addEventListener("click", generateQuestionnaire);
  elements.exportCollaborationButton.addEventListener("click", exportCollaborationPackage);
  elements.copyCollaborationPromptButton.addEventListener("click", copyCollaborationPrompt);
  elements.chooseCollaborationFileButton.addEventListener("click", () => elements.collaborationFileInput.click());
  elements.collaborationFileInput.addEventListener("change", importCollaborationFile);
  elements.reviewCollaborationButton.addEventListener("click", reviewPastedCollaborationPackage);
  elements.discardProposalButton.addEventListener("click", discardCollaborationProposal);
  elements.acceptProposalButton.addEventListener("click", acceptCollaborationProposal);
  elements.searchResultsButton.addEventListener("click", loadResults);
  elements.exportButton.addEventListener("click", exportResults);
  elements.disconnectSheetButton.addEventListener("click", disconnectSheetAdmin);
  elements.refreshDashboardButton.addEventListener("click", loadDashboard);
}

async function unlockAdmin(token) {
  if (!token) {
    setMessage(elements.adminGateMessage, "請輸入管理權杖。", "error");
    return;
  }
  elements.adminGateButton.disabled = true;
  setMessage(elements.adminGateMessage, "正在驗證管理權限");
  sessionStorage.setItem(SHEET_ADMIN_TOKEN_KEY, token);
  try {
    const response = await sheetAdminApi("admin.dashboard", { filters: {} });
    elements.adminGate.classList.add("hidden");
    elements.adminWorkspace.classList.remove("hidden");
    await loadQuestionnaires();
    await Promise.all([loadAdminSurvey(), loadResults()]);
    renderDashboard(response.data);
  } catch (error) {
    sessionStorage.removeItem(SHEET_ADMIN_TOKEN_KEY);
    elements.adminWorkspace.classList.add("hidden");
    elements.adminGate.classList.remove("hidden");
    setMessage(elements.adminGateMessage, `無法進入：${error.message}`, "error");
  } finally {
    elements.adminGateButton.disabled = false;
  }
}

function showView(view) {
  $("#answerView").classList.toggle("active", view === "answer");
  $("#adminView").classList.toggle("active", view === "admin");
}

function handleAdminNavigation(event) {
  const button = event.target.closest("button[data-admin-section]");
  if (button) showAdminSection(button.dataset.adminSection);
}

function showAdminSection(section) {
  state.activeAdminSection = section;
  $$("[data-admin-section]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminSection === section);
  });
  $$("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.adminPanel === section);
  });
  if (section === "publish") renderPublishPreview();
  if (section === "results") {
    syncResultFiltersToCurrentSurvey();
    Promise.all([loadResults(), loadDashboard()]);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleAdminSurveySelection() {
  state.hasUnpublishedDraft = false;
  discardCollaborationProposal({ keepMessage: false });
  await loadAdminSurvey();
  syncResultFiltersToCurrentSurvey();
  if (state.activeAdminSection === "results") await Promise.all([loadResults(), loadDashboard()]);
}

function syncResultFiltersToCurrentSurvey() {
  const questionnaireId = elements.adminQuestionnaireSelect.value;
  if (!questionnaireId) return;
  elements.resultQuestionnaireFilter.value = questionnaireId;
  elements.dashboardQuestionnaireFilter.value = questionnaireId;
}

function handleEditorChange() {
  state.hasUnpublishedDraft = true;
  if (state.activeAdminSection === "publish") renderPublishPreview();
}

function openNewQuestionnaireDialog() {
  elements.newQuestionnaireForm.reset();
  elements.newQuestionnaireDifficultyInput.value = "foundation";
  elements.newQuestionnaireDurationInput.value = "15";
  elements.newQuestionnairePassInput.value = "70";
  elements.newQuestionnaireIdInput.value = defaultQuestionnaireId();
  state.newQuestionnaireIdTouched = false;
  setMessage(elements.newQuestionnaireMessage, "");
  elements.newQuestionnaireDialog.showModal();
  elements.newQuestionnaireTitleInput.focus();
}

function suggestNewQuestionnaireId() {
  if (state.newQuestionnaireIdTouched) return;
  elements.newQuestionnaireIdInput.value = slugifyQuestionnaireId(elements.newQuestionnaireTitleInput.value)
    || defaultQuestionnaireId();
}

async function createNewQuestionnaire(event) {
  event.preventDefault();
  const id = elements.newQuestionnaireIdInput.value.trim();
  const title = elements.newQuestionnaireTitleInput.value.trim();
  const purpose = elements.newQuestionnairePurposeInput.value.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    setMessage(elements.newQuestionnaireMessage, "題卷 ID 只能使用英文字母、數字、連字號或底線。", "error");
    return;
  }
  if (state.adminQuestionnaires.some((questionnaire) => questionnaire.id === id)) {
    setMessage(elements.newQuestionnaireMessage, "這個題卷 ID 已存在，請改用另一個 ID。", "error");
    return;
  }

  const submitButton = elements.newQuestionnaireForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage(elements.newQuestionnaireMessage, "正在建立草稿");
  try {
    const questionnaire = buildStarterQuestionnaire({
      id,
      title,
      purpose,
      audience: elements.newQuestionnaireAudienceInput.value.trim(),
      difficulty: elements.newQuestionnaireDifficultyInput.value,
      durationMinutes: Number(elements.newQuestionnaireDurationInput.value || 15),
      passPercentage: Number(elements.newQuestionnairePassInput.value || 70)
    });
    await api("/api/questionnaires", { method: "POST", body: { questionnaire } });
    await loadQuestionnaires(id);
    await loadAdminSurvey();
    showAdminSection("design");
    elements.newQuestionnaireDialog.close();
    setMessage(elements.jsonMessage, `已建立「${title}」草稿；請修改範例題或交給 AI 產生候選版本。`, "success");
  } catch (error) {
    setMessage(elements.newQuestionnaireMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
}

function buildStarterQuestionnaire({ id, title, purpose, audience, difficulty, durationMinutes, passPercentage }) {
  return {
    id,
    title,
    description: purpose,
    audience,
    assessmentLevel: difficulty,
    durationSeconds: Math.max(1, durationMinutes) * 60,
    passPercentage,
    competencies: [{ id: "core", label: "核心能力" }],
    proficiencyRules: [
      { minPercentage: 80, label: "能力穩固", recommendation: "可進入下一階段。" },
      { minPercentage: 60, label: "部分達成", recommendation: "依錯題補強後再次練習。" },
      { minPercentage: 0, label: "需要補強", recommendation: "回到基礎內容並由教師協助確認觀念。" }
    ],
    lifecycle: {
      status: "draft",
      version: 1,
      owner: "questionnaire-admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      audit: []
    },
    accessRoster: [],
    questions: [
      {
        id: "q1",
        type: "single",
        title: "待編輯題目",
        prompt: `關於「${purpose || title}」，下列哪一項最符合本題的正確判斷？`,
        competency: "core",
        options: [
          { value: "correct", label: "請改為正確選項" },
          { value: "distractor", label: "請改為干擾選項" }
        ],
        correctAnswer: "correct",
        maxScore: 100
      }
    ]
  };
}

function defaultQuestionnaireId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  return `survey-${stamp}`;
}

function slugifyQuestionnaireId(value) {
  const source = String(value || "").trim();
  if (!source) return "";

  const readable = source
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

  if (readable.length >= 4) return readable;

  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${readable || "survey"}-${(hash >>> 0).toString(36).slice(0, 6)}`;
}

async function checkHealth() {
  try {
    await api("/api/health");
    elements.healthStatus.textContent = "可連線";
  } catch {
    elements.healthStatus.textContent = "離線";
  }
}

async function loadQuestionnaires(preferredAdminId = "") {
  const previousSurveyId = elements.questionnaireSelect.value;
  const previousAdminId = preferredAdminId || elements.adminQuestionnaireSelect.value;
  const publicData = await api("/api/questionnaires");
  const adminData = ADMIN_MODE ? await api("/api/questionnaires?scope=admin") : { questionnaires: [] };
  state.questionnaires = publicData.questionnaires || [];
  state.adminQuestionnaires = adminData.questionnaires || [];
  fillSelect(elements.questionnaireSelect, state.questionnaires);
  fillSelect(elements.adminQuestionnaireSelect, state.adminQuestionnaires, true);
  fillSelect(elements.resultQuestionnaireFilter, [{ id: "", title: "全部問卷" }, ...state.adminQuestionnaires]);
  fillSelect(elements.dashboardQuestionnaireFilter, [{ id: "", title: "全部問卷" }, ...state.adminQuestionnaires]);

  const directSurveyId = new URLSearchParams(window.location.search).get("survey");
  const selectedSurveyId = [directSurveyId, previousSurveyId, state.questionnaires[0]?.id]
    .find((id) => id && state.questionnaires.some((item) => item.id === id));
  if (selectedSurveyId) elements.questionnaireSelect.value = selectedSurveyId;
  const selectedAdminId = [previousAdminId, directSurveyId, state.adminQuestionnaires[0]?.id]
    .find((id) => id && state.adminQuestionnaires.some((item) => item.id === id));
  if (selectedAdminId) elements.adminQuestionnaireSelect.value = selectedAdminId;
  const hasAssignedSurvey = Boolean(directSurveyId && directSurveyId === selectedSurveyId);
  elements.questionnaireSelect.disabled = hasAssignedSurvey;
  elements.directLinkHint.classList.toggle("hidden", !hasAssignedSurvey);
  renderSurveyPreview();
}

function fillSelect(select, items, includeLifecycle = false) {
  select.innerHTML = items.map((item) => {
    const lifecycle = lifecycleLabel(item.lifecycle?.status || "published");
    const draft = item.hasLocalDraft ? "／有草稿" : "";
    const suffix = includeLifecycle ? ` · ${lifecycle}${draft}` : "";
    return `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title + suffix)}</option>`;
  }).join("");
}

function handleSurveySelection() {
  const params = new URLSearchParams(window.location.search);
  params.set("survey", elements.questionnaireSelect.value);
  window.history.replaceState({}, "", `${window.location.pathname}?${params}${window.location.hash}`);
  elements.directLinkHint.classList.remove("hidden");
  renderSurveyPreview();
}

function renderSurveyPreview() {
  const survey = state.questionnaires.find((item) => item.id === elements.questionnaireSelect.value);
  if (!survey) return;
  elements.previewTitle.textContent = survey.title;
  elements.previewDescription.textContent = survey.description || "這份問卷將依序引導你完成作答，提交前可檢查所有答案。";
  elements.previewDuration.textContent = survey.mode === "survey" ? `約 ${survey.estimatedMinutes || 3} 分鐘` : `${Math.ceil(Number(survey.durationSeconds || 0) / 60)} 分鐘`;
  elements.previewQuestionCount.textContent = `${Number(survey.questionCount || 0)} 題`;
  document.getElementById("previewAnswerMode").textContent = survey.mode === "survey" ? "不計分調查" : "限時作答";
  document.getElementById("participantNameLabel").textContent = survey.mode === "survey" ? "暱稱" : "姓名";
  elements.displayNameInput.placeholder = survey.mode === "survey" ? "請填班內可辨識的暱稱" : "請輸入姓名";
}

async function startSession() {
  setMessage(elements.accessMessage, "準備問卷中");
  elements.startButton.disabled = true;
  elements.startButton.textContent = "準備中";
  try {
    const payload = {
      questionnaireId: elements.questionnaireSelect.value,
      displayName: elements.displayNameInput.value.trim(),
      group: elements.groupInput.value.trim()
    };
    const data = await api("/api/sessions/start", { method: "POST", body: payload });
    loadSessionData(data);
    setMessage(elements.accessMessage, data.event === "resumed" ? "已接續未完成作答。" : "問卷已啟動。", "success");
  } catch (error) {
    setMessage(elements.accessMessage, error.message, "error");
  } finally {
    elements.startButton.disabled = false;
    elements.startButton.textContent = "開始作答";
  }
}

function loadSessionData(data) {
  state.session = data.session;
  state.questionnaire = data.questionnaire;
  state.answers = { ...(data.session.answers || {}) };
  state.clientRevision = Number(data.session.memory?.clientRevision || 0);
  elements.preflightStage.classList.add("hidden");
  elements.activeStage.classList.remove("hidden");
  elements.sessionBar.classList.remove("hidden");
  elements.resultPanel.classList.toggle("hidden", !state.session.result);
  renderQuestions();
  renderSession();
  inspectLocalDraft();
  startTimer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSession() {
  elements.sessionTitle.textContent = state.questionnaire.title;
  const participant = state.session.participant;
  elements.sessionMeta.textContent = `${participant.displayName} · ${participant.personId} · ${statusLabel(state.session.status)}`;
  elements.sidebarParticipant.textContent = participant.displayName;
  elements.sidebarParticipantId.textContent = `${participant.personId}${participant.group ? ` · ${participant.group}` : ""}`;
  setSyncStatus(state.session.memory?.lastSyncAt
    ? `${window.__STATIC_API__ ? "此裝置已保存" : "後端已同步"} ${formatTime(state.session.memory.lastSyncAt)}`
    : "尚未同步");
  updateProgress();
  if (state.session.result) renderResult(state.session.result, state.session.aiLogs || []);
  const closed = state.session.status !== "in_progress";
  const submitted = state.session.status === "submitted";
  elements.sessionStep.textContent = submitted
    ? "步驟 3 / 3 · 已完成"
    : state.session.status === "expired"
      ? "作答已結束"
      : "步驟 2 / 3 · 作答中";
  elements.timerLabel.textContent = closed ? "作答狀態" : "剩餘時間";
  elements.questionForm.toggleAttribute("inert", closed);
  elements.submitButton.disabled = closed;
  elements.syncButton.disabled = closed;
  elements.questionForm.classList.toggle("hidden", submitted);
  elements.answerActions.classList.toggle("hidden", submitted);
  elements.activeStage.classList.toggle("completed", submitted);
  if (closed) stopTimer();
  renderTimerState();
}

function renderQuestions() {
  elements.questionForm.innerHTML = state.questionnaire.questions.map((question, index) => renderQuestion(question, `${index + 1}`, false)).join("");
  renderQuestionNavigation();
  hydrateInputs();
}

function renderQuestionNavigation() {
  const items = flattenQuestionMeta(state.questionnaire.questions);
  state.activeQuestionId = state.activeQuestionId || items[0]?.id || null;
  elements.questionNav.innerHTML = items
    .map(
      (item) => `
        <button type="button" data-target="${escapeHtml(item.id)}" class="${item.id === state.activeQuestionId ? "active" : ""}">
          <span class="nav-number">${escapeHtml(item.number)}</span>
          <span class="nav-title">${escapeHtml(item.title)}</span>
          <span class="nav-state" aria-hidden="true"></span>
        </button>`
    )
    .join("");
}

function flattenQuestionMeta(questions, prefix = "") {
  const items = [];
  questions.forEach((question, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    if (question.type === "composite") {
      items.push(...flattenQuestionMeta(question.questions || [], number));
    } else {
      items.push({ id: question.id, number, title: question.title || question.prompt });
    }
  });
  return items;
}

function handleQuestionNavigation(event) {
  const button = event.target.closest("button[data-target]");
  if (!button) return;
  const target = elements.questionForm.querySelector(`[data-question="${cssEscape(button.dataset.target)}"]`);
  if (!target) return;
  state.activeQuestionId = button.dataset.target;
  elements.questionNav.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderQuestion(question, number, nested) {
  const typeLabel = {
    boolean: "是非題",
    single: "單選題",
    multiple: "多選題",
    short: "簡答題",
    composite: "複合式"
  }[question.type] || question.type;
  const head = `
    <div class="question-head">
      <div class="question-meta">
        <small>${escapeHtml(number)} · ${escapeHtml(typeLabel)}${state.questionnaire.mode === "survey" ? (question.required ? " · 必填" : " · 可略過") : ` · ${Number(question.maxScore || childMaxScore(question))} 分`}</small>
        <span class="question-status" data-question-state="${escapeHtml(question.id)}">未作答</span>
      </div>
      <h2>${escapeHtml(question.title || question.prompt)}</h2>
      <p>${escapeHtml(question.prompt)}</p>
    </div>`;

  if (question.type === "composite") {
    return `
      <section class="question-card composite" data-question="${escapeHtml(question.id)}">
        ${head}
        <div class="child-questions">
          ${(question.questions || []).map((child, childIndex) => renderQuestion(child, `${number}.${childIndex + 1}`, true)).join("")}
        </div>
      </section>`;
  }

  return `
    <section class="${nested ? "sub-question" : "question-card"}" data-question="${escapeHtml(question.id)}">
      ${head}
      ${renderControl(question)}
    </section>`;
}

function renderControl(question) {
  if (question.type === "boolean") {
    return `
      <div class="boolean-row">
        <label class="option"><input type="radio" name="${escapeHtml(question.id)}" data-choice="true" data-qid="${escapeHtml(question.id)}" value="true" />是</label>
        <label class="option"><input type="radio" name="${escapeHtml(question.id)}" data-choice="true" data-qid="${escapeHtml(question.id)}" value="false" />否</label>
      </div>`;
  }
  if (question.type === "single") {
    return `<div class="options">${(question.options || [])
      .map((option) => renderChoiceOption(question, option, "radio"))
      .join("")}</div>`;
  }
  if (question.type === "multiple") {
    return `<div class="options">${(question.options || [])
      .map((option) => renderChoiceOption(question, option, "checkbox"))
      .join("")}</div>`;
  }
  if (question.type === "short") {
    return `<textarea data-qid="${escapeHtml(question.id)}" rows="5" placeholder="輸入答案"></textarea>`;
  }
  return "";
}

function renderChoiceOption(question, option, type) {
  const nameAttr = type === "radio" ? ` name="${escapeHtml(question.id)}"` : "";
  const textInput = option.allowText
    ? `<input class="option-text-input" data-qid="${escapeHtml(question.id)}" data-option-text="true" data-option-value="${escapeHtml(option.value)}" placeholder="${escapeHtml(option.textPlaceholder || "自行填寫")}" />`
    : "";
  return `
    <label class="option ${option.allowText ? "option-with-text" : ""}">
      <input type="${type}"${nameAttr} data-choice="true" data-qid="${escapeHtml(question.id)}" value="${escapeHtml(option.value)}" />
      <span class="option-content">
        <span>${escapeHtml(option.label)}</span>
        ${textInput}
      </span>
    </label>`;
}

function hydrateInputs() {
  for (const [id, value] of Object.entries(state.answers)) {
    const inputs = $$(`[data-qid="${cssEscape(id)}"]`);
    for (const input of inputs) {
      if (input.dataset.optionText === "true") input.value = choiceTextFor(value, input.dataset.optionValue);
      else if (input.type === "radio") input.checked = answerHasChoice(value, inputValue(input.value));
      else if (input.type === "checkbox") input.checked = answerHasChoice(value, inputValue(input.value));
      else input.value = value ?? "";
    }
  }
}

function handleAnswerInput(event) {
  const target = event.target;
  const id = target.dataset.qid;
  if (!id || state.session?.status !== "in_progress") return;
  if (target.dataset.optionText === "true") {
    const choice = choiceInputFor(id, target.dataset.optionValue);
    if (choice) choice.checked = true;
    state.answers[id] = collectChoiceAnswer(id);
  } else if (target.type === "checkbox") {
    state.answers[id] = collectChoiceAnswer(id);
  } else if (target.type === "radio") {
    state.answers[id] = collectChoiceAnswer(id);
  } else {
    state.answers[id] = target.value;
  }
  state.clientRevision += 1;
  saveLocalDraft();
  updateProgress();
  scheduleSync();
}

function collectChoiceAnswer(id) {
  const choices = $$(`input[data-choice="true"][data-qid="${cssEscape(id)}"]`);
  const checked = choices.filter((input) => input.checked);
  if (!checked.length) return undefined;
  if (choices.some((input) => input.type === "checkbox")) {
    return checked.map(choiceAnswerFromInput);
  }
  return choiceAnswerFromInput(checked[0]);
}

function choiceAnswerFromInput(input) {
  const value = inputValue(input.value);
  const textInput = optionTextInput(input.dataset.qid, input.value);
  if (!textInput) return value;
  return {
    value,
    text: textInput.value.trim()
  };
}

function optionTextInput(id, value) {
  return $(`input[data-option-text="true"][data-qid="${cssEscape(id)}"][data-option-value="${cssEscape(value)}"]`);
}

function choiceInputFor(id, value) {
  return $(`input[data-choice="true"][data-qid="${cssEscape(id)}"][value="${cssEscape(value)}"]`);
}

function choiceTextFor(answer, optionValue) {
  const values = Array.isArray(answer) ? answer : [answer];
  const found = values.find((item) => item && typeof item === "object" && String(item.value) === String(inputValue(optionValue)));
  return found?.text || "";
}

function answerHasChoice(answer, choiceValue) {
  const values = Array.isArray(answer) ? answer : [answer];
  return values.some((item) => {
    const value = item && typeof item === "object" ? item.value : item;
    return value === choiceValue;
  });
}

function inputValue(value) {
  return value === "true" ? true : value === "false" ? false : value;
}

function scheduleSync() {
  setSyncStatus("本機已保存，等待同步");
  window.clearTimeout(state.syncTimer);
  state.syncTimer = window.setTimeout(() => syncAnswers("autosave"), 700);
}

async function syncAnswers(phase = "autosave") {
  if (!state.session || state.session.status !== "in_progress") return;
  try {
    const data = await api(`/api/sessions/${state.session.id}/answers`, {
      method: "PUT",
      body: {
        answers: state.answers,
        phase,
        clientRevision: state.clientRevision,
        clientSavedAt: new Date().toISOString()
      }
    });
    state.session = data.session;
    clearLocalDraft();
    renderSession();
  } catch (error) {
    setSyncStatus(error.message);
    if (error.message.includes("結束") || error.message.includes("送出")) {
      state.session.status = "expired";
      renderSession();
    }
  }
}

function openSubmitReview() {
  if (!state.session || state.session.status !== "in_progress") return;
  const items = flattenQuestionMeta(state.questionnaire.questions);
  const unanswered = items.filter((item) => !isAnswered(state.answers[item.id]));
  const answeredCount = items.length - unanswered.length;
  if (state.questionnaire.mode === "survey") {
    const requiredMissing = state.questionnaire.questions.filter(q => q.required && !isAnswered(state.answers[q.id]));
    elements.submitSummary.textContent = requiredMissing.length ? `還有 ${requiredMissing.length} 題必填題未完成。` : "必填題已完成。縣市與年齡未填不影響送出。";
    elements.submitReview.innerHTML = requiredMissing.map(q => `<p>${escapeHtml(q.title)}</p>`).join("");
    elements.confirmSubmitButton.disabled = requiredMissing.length > 0;
    elements.confirmSubmitButton.textContent = "確認送出調查";
    elements.submitDialog.showModal();
    return;
  }
  elements.submitSummary.textContent = unanswered.length
    ? `已完成 ${answeredCount} 題，還有 ${unanswered.length} 題尚未作答。`
    : `全部 ${items.length} 題都已完成，可以提交。`;
  elements.submitReview.innerHTML = `
    <div class="review-row">
      <strong>已完成</strong>
      <span>${answeredCount} / ${items.length} 題</span>
    </div>
    <div class="review-row ${unanswered.length ? "warning" : ""}">
      <strong>尚未作答</strong>
      <span>${unanswered.length ? unanswered.map((item) => item.number).join("、") : "無"}</span>
    </div>`;
  elements.confirmSubmitButton.textContent = unanswered.length ? "仍要確認送出" : "確認送出";
  elements.confirmSubmitButton.disabled = false;
  elements.submitDialog.showModal();
}

function closeSubmitReview() {
  elements.submitDialog.close();
}

async function submitAnswers() {
  if (!state.session || state.session.status !== "in_progress") return;
  closeSubmitReview();
  elements.submitButton.disabled = true;
  elements.confirmSubmitButton.disabled = true;
  setSyncStatus("正在完成提交");
  try {
    const data = await api(`/api/sessions/${state.session.id}/submit`, {
      method: "POST",
      body: {
        answers: state.answers,
        clientRevision: state.clientRevision,
        clientSavedAt: new Date().toISOString()
      }
    });
    loadSessionData(data);
    clearLocalDraft();
    const sheetSync = await syncSubmittedResult(data);
    setSyncStatus(sheetSync);
    await loadResults();
  } catch (error) {
    setSyncStatus(error.message);
    elements.submitButton.disabled = false;
  } finally {
    elements.confirmSubmitButton.disabled = false;
  }
}

async function syncSubmittedResult(data) {
  const endpoint = String(window.QANDA_CONFIG?.googleAppsScriptUrl || "").trim();
  if (!endpoint) return "已正式提交；Google Sheet 尚未設定";
  const payload = {
    event: "result.submitted",
    schemaVersion: 1,
    source: window.location.origin,
    sentAt: new Date().toISOString(),
    session: Object.fromEntries(Object.entries(data.session).filter(([key]) => key !== "questionnaireSnapshot")),
    questionnaire: {
      id: data.questionnaire.id,
      title: data.questionnaire.title,
      version: Number(data.session.questionnaireVersion || data.questionnaire.lifecycle?.version || 1)
    },
    answers: data.session.answers || {},
    result: data.session.result,
    aiLogs: data.session.aiLogs || []
  };
  const request = {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow"
  };
  try {
    const response = await fetch(endpoint, request);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!result.ok) return `回答已保存在此裝置；雲端拒絕寫入：${result.error || "請聯絡老師"}`;
    return result.duplicate ? "已正式提交；Google Sheet 已有此結果" : "已正式提交並同步 Google Sheet";
  } catch (error) {
    try {
      await fetch(endpoint, { ...request, mode: "no-cors" });
      return "已正式提交；Google Sheet 同步已送出待確認";
    } catch (_) {
      return `已正式提交；Google Sheet 同步失敗：${error.message}`;
    }
  }
}

function renderResult(result, logs) {
  elements.resultPanel.classList.remove("hidden");
  if (result.mode === "survey") {
    const rows = state.questionnaire.questions.map(question => {
      const raw = state.answers[question.id];
      const values = Array.isArray(raw) ? raw : [raw];
      const labels = values.map(value => question.options?.find(option => option.value === value)?.label).filter(Boolean);
      return `<div class="review-row"><strong>${escapeHtml(question.title)}</strong><span>${escapeHtml(labels.join("、") || "未填答")}</span></div>`;
    });
    elements.resultPanel.innerHTML = `<div class="stage-label">調查已完成</div><h2>謝謝，你的回答讓這堂課更貼近大家。</h2><p>這份調查不計分。雲端保存狀態請見左側；班級報表不公開姓名或個別回答。</p><div class="result-list">${rows.join("")}</div><p><a class="button" href="./report.html?survey=${encodeURIComponent(state.questionnaire.id)}">查看班級統計</a></p>`;
    return;
  }
  const scoreText = `${result.score}/${result.maxScore}`;
  const outcome = result.proficiency
    ? { title: result.proficiency.label, next: result.proficiency.recommendation }
    : result.percentage >= 80
      ? { title: "已達成本次標準", next: "你可以查看各題回饋，確認哪些判斷已掌握、哪些仍值得複習。" }
      : result.percentage >= 60
        ? { title: "已完成，建議補強", next: "部分題目仍有改善空間，建議先查看各題回饋，再安排補強。" }
        : { title: "需要進一步補強", next: "建議依各題回饋重新確認關鍵內容，完成補強後再進行一次驗證。" };
  const leafResults = flattenResultItems(result.questionResults);
  const correctCount = leafResults.filter((item) => item.status === "correct").length;
  const competencyProfile = Array.isArray(result.competencies) && result.competencies.length
    ? `
      <section class="competency-profile">
        <h3>能力面向</h3>
        <div class="competency-list">
          ${result.competencies.map((item) => `
            <div class="competency-row">
              <div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.score)} / ${escapeHtml(item.maxScore)}</span></div>
              <div class="competency-track"><span style="width:${Math.max(0, Math.min(100, Number(item.percentage || 0)))}%"></span></div>
              <b>${escapeHtml(item.percentage)}%</b>
            </div>`).join("")}
        </div>
      </section>`
    : "";
  elements.resultPanel.innerHTML = `
    <div class="score-hero">
      <div class="score-ring" style="--score:${result.percentage}%"><span>${result.percentage}%</span></div>
      <div>
        <div class="stage-label">步驟 3 / 3 · 已完成</div>
        <h2 class="result-outcome">${escapeHtml(outcome.title)}</h2>
        <p class="result-next-step">${escapeHtml(outcome.next)}</p>
        <div class="result-metrics">
          <div><span>總分</span><strong>${escapeHtml(scoreText)}</strong></div>
          <div><span>掌握題目</span><strong>${correctCount} / ${leafResults.length}</strong></div>
          <div><span>完成時間</span><strong>${escapeHtml(formatTime(result.gradedAt))}</strong></div>
          ${logs.length ? `<div><span>AI 評分紀錄</span><strong>${logs.length} 筆</strong></div>` : ""}
        </div>
      </div>
    </div>
    ${competencyProfile}
    <h3 class="result-section-title">各題結果與回饋</h3>
    <div class="result-list">
      ${result.questionResults.map(renderResultItem).join("")}
    </div>`;
}

function flattenResultItems(items) {
  return items.flatMap((item) => item.children ? flattenResultItems(item.children) : [item]);
}

function renderResultItem(item) {
  const children = item.children ? `<div class="result-list">${item.children.map(renderResultItem).join("")}</div>` : "";
  return `
    <div class="result-item">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <div>${escapeHtml(item.comment || "")}</div>
        ${children}
      </div>
      <span class="status ${escapeHtml(item.status)}">${escapeHtml(item.score)} / ${escapeHtml(item.maxScore)}</span>
    </div>`;
}

function startTimer() {
  window.clearInterval(state.tickTimer);
  tick();
  if (state.session?.status === "in_progress") {
    state.tickTimer = window.setInterval(tick, 1000);
  }
}

function stopTimer() {
  window.clearInterval(state.tickTimer);
  state.tickTimer = null;
}

function tick() {
  if (!state.session) return;
  if (state.session.status !== "in_progress") {
    stopTimer();
    renderTimerState();
    return;
  }
  const remaining = Math.max(0, Math.ceil((new Date(state.session.expiresAt) - Date.now()) / 1000));
  elements.timerDisplay.textContent = formatDuration(remaining);
  elements.timerDisplay.classList.toggle("warning", remaining <= 60);
  if (remaining <= 0 && state.session.status === "in_progress") {
    state.session.status = "expired";
    renderSession();
    setSyncStatus("時間已結束，答案已停止接受");
    stopTimer();
  }
}

function renderTimerState() {
  if (!state.session) return;
  if (state.session.status === "submitted") {
    elements.timerDisplay.textContent = "已送出";
    elements.timerDisplay.classList.remove("warning");
    return;
  }
  if (state.session.status === "expired") {
    elements.timerDisplay.textContent = "00:00";
    elements.timerDisplay.classList.add("warning");
  }
}

function inspectLocalDraft() {
  state.localDraft = readLocalDraft();
  if (!state.localDraft) {
    elements.memoryBanner.classList.add("hidden");
    return;
  }
  const serverSync = state.session.memory?.lastSyncAt ? new Date(state.session.memory.lastSyncAt).getTime() : 0;
  const localSync = new Date(state.localDraft.updatedAt).getTime();
  const differs = JSON.stringify(state.localDraft.answers) !== JSON.stringify(state.answers);
  elements.memoryBanner.classList.toggle("hidden", !(differs && localSync > serverSync));
}

function restoreLocalDraft() {
  if (!state.localDraft) return;
  state.answers = { ...state.localDraft.answers };
  state.clientRevision = Math.max(state.clientRevision, Number(state.localDraft.clientRevision || 0)) + 1;
  hydrateInputs();
  updateProgress();
  elements.memoryBanner.classList.add("hidden");
  scheduleSync();
}

function saveLocalDraft() {
  if (!state.session) return;
  localStorage.setItem(
    draftKey(),
    JSON.stringify({
      answers: state.answers,
      clientRevision: state.clientRevision,
      updatedAt: new Date().toISOString()
    })
  );
}

function readLocalDraft() {
  if (!state.session) return null;
  try {
    return JSON.parse(localStorage.getItem(draftKey()) || "null");
  } catch {
    return null;
  }
}

function clearLocalDraft() {
  if (state.session) localStorage.removeItem(draftKey());
}

function draftKey() {
  return `draft:${state.session.questionnaireId}:${state.session.id}`;
}

async function loadAdminSurvey() {
  if (!elements.adminQuestionnaireSelect.value) return;
  try {
    const data = await api(`/api/questionnaires/${elements.adminQuestionnaireSelect.value}?scope=admin`);
    state.adminSurvey = data.questionnaire;
    const summary = currentAdminSurveySummary(data.questionnaire.id);
    state.hasUnpublishedDraft = Boolean(data.draft || summary?.hasLocalDraft);
    elements.jsonEditor.value = JSON.stringify(data.questionnaire, null, 2);
    populateCollaborationBrief(data.questionnaire);
    discardCollaborationProposal({ keepMessage: false });
    renderLifecycle(data.questionnaire);
    setMessage(
      elements.jsonMessage,
      state.hasUnpublishedDraft ? "已載入瀏覽器草稿；學員仍使用目前雲端版本。" : "已載入目前版本。",
      "success"
    );
  } catch (error) {
    setMessage(elements.jsonMessage, error.message, "error");
  }
}

async function saveAdminSurvey() {
  try {
    const questionnaire = JSON.parse(elements.jsonEditor.value);
    const data = await api("/api/questionnaires", { method: "POST", body: { questionnaire } });
    state.hasUnpublishedDraft = true;
    setMessage(elements.jsonMessage, `已儲存「${data.questionnaire.title}」草稿；學員版本尚未變更。`, "success");
    await loadQuestionnaires(data.questionnaire.id);
    state.adminSurvey = data.questionnaire;
    elements.jsonEditor.value = JSON.stringify(data.questionnaire, null, 2);
    populateCollaborationBrief(data.questionnaire);
    discardCollaborationProposal({ keepMessage: false });
    renderLifecycle(data.questionnaire);
  } catch (error) {
    setMessage(elements.jsonMessage, error.message, "error");
  }
}

function renderLifecycle(questionnaire) {
  const summary = currentAdminSurveySummary(questionnaire.id);
  const lifecycle = summary?.lifecycle || questionnaire.lifecycle || { status: "draft", version: 1, audit: [] };
  const status = lifecycle.status || "published";
  const hasPublishedRelease = summary?.hasPublishedRelease ?? ["published", "closed", "archived"].includes(status);
  const isPublished = status === "published";
  const stages = [
    { label: "內容準備", complete: true },
    { label: "建立版本", complete: isPublished && !state.hasUnpublishedDraft },
    { label: "交付連結", active: isPublished && !state.hasUnpublishedDraft },
    { label: "查看結果" }
  ];
  const displayStatus = state.hasUnpublishedDraft ? "待發布" : lifecycleLabel(status);
  const displayClass = state.hasUnpublishedDraft ? "review" : status;
  elements.lifecycleTitle.textContent = questionnaire.title;
  elements.lifecycleStatus.textContent = displayStatus;
  elements.lifecycleStatus.className = `status lifecycle-${displayClass}`;
  const versionLabel = hasPublishedRelease ? `雲端第 ${Number(lifecycle.version || 1)} 版` : "尚未發布";
  elements.lifecycleVersion.textContent = versionLabel;
  elements.sidebarLifecycleStatus.textContent = displayStatus;
  elements.sidebarLifecycleStatus.className = `status lifecycle-${displayClass}`;
  elements.sidebarLifecycleVersion.textContent = versionLabel;
  elements.lifecycleTrail.innerHTML = stages.map((stage, index) => `
    <li class="${stage.complete ? "complete" : ""} ${stage.active ? "active" : ""}">
      <span>${index + 1}</span>
      <strong>${escapeHtml(stage.label)}</strong>
    </li>`).join("");

  const shareUrl = buildShareUrl(questionnaire.id);
  elements.shareLinkInput.value = shareUrl;
  elements.copyShareLinkButton.disabled = !isPublished;
  elements.openShareLinkButton.disabled = !isPublished;
  elements.closeCentralButton.disabled = !isPublished;
  elements.publishCentralButton.disabled = false;
  elements.publishCentralButton.textContent = isPublished ? "發布更新版本" : "發布給學員";
  const questionCount = countSurveyQuestions(questionnaire.questions || []);
  const durationMinutes = Math.ceil(Number(questionnaire.durationSeconds || 0) / 60);
  elements.lifecycleMeta.innerHTML = `
    <span><small>題目</small><strong>${questionCount} 題</strong></span>
    <span><small>時間</small><strong>${durationMinutes} 分鐘</strong></span>
    <span><small>作答辨識</small><strong>姓名＋考卷</strong></span>
    <span><small>更新方式</small><strong>原連結建立新版</strong></span>`;
  const message = state.hasUnpublishedDraft
    ? "草稿尚未發布；學員仍會使用上一個中央版本。"
    : isPublished
      ? "目前版本已開放作答，可直接複製固定連結交付學員。"
      : "目前未開放新作答；確認內容後即可重新發布。";
  setMessage(elements.lifecycleMessage, message, isPublished && !state.hasUnpublishedDraft ? "success" : "");
}

function currentAdminSurveySummary(questionnaireId) {
  return state.adminQuestionnaires.find((item) => item.id === questionnaireId) || null;
}

function applyReleaseState(questionnaire) {
  const lifecycle = questionnaire.lifecycle || { status: "draft", version: 1 };
  const summary = {
    id: questionnaire.id,
    title: questionnaire.title,
    description: questionnaire.description || "",
    durationSeconds: questionnaire.durationSeconds,
    questionCount: countSurveyQuestions(questionnaire.questions || []),
    rosterCount: Array.isArray(questionnaire.accessRoster) ? questionnaire.accessRoster.length : 0,
    lifecycle,
    hasLocalDraft: false,
    hasPublishedRelease: true
  };
  const adminIndex = state.adminQuestionnaires.findIndex((item) => item.id === questionnaire.id);
  if (adminIndex >= 0) state.adminQuestionnaires[adminIndex] = summary;
  else state.adminQuestionnaires.push(summary);

  const publicIndex = state.questionnaires.findIndex((item) => item.id === questionnaire.id);
  if (lifecycle.status === "published") {
    if (publicIndex >= 0) state.questionnaires[publicIndex] = summary;
    else state.questionnaires.push(summary);
  } else if (publicIndex >= 0) {
    state.questionnaires.splice(publicIndex, 1);
  }

  fillSelect(elements.adminQuestionnaireSelect, state.adminQuestionnaires, true);
  elements.adminQuestionnaireSelect.value = questionnaire.id;
  fillSelect(elements.questionnaireSelect, state.questionnaires);
  window.__STATIC_API__?.clearSurveyDraft?.(questionnaire.id);
  window.__STATIC_API__?.updatePublishedSurvey?.(questionnaire);
}

function renderPublishPreview() {
  try {
    const questionnaire = JSON.parse(elements.jsonEditor.value);
    renderLifecycle(questionnaire);
  } catch (error) {
    elements.lifecycleTitle.textContent = "題卷內容需要修正";
    elements.lifecycleStatus.textContent = "格式錯誤";
    elements.lifecycleStatus.className = "status lifecycle-closed";
    elements.publishCentralButton.disabled = true;
    setMessage(elements.lifecycleMessage, `JSON 格式錯誤：${error.message}`, "error");
  }
}

function countSurveyQuestions(questions) {
  return questions.reduce((total, question) => {
    if (question.type === "composite") return total + countSurveyQuestions(question.questions || []);
    return total + 1;
  }, 0);
}

function buildShareUrl(questionnaireId) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("survey", questionnaireId);
  return url.toString();
}

function showPublishedLink(questionnaire, version) {
  const link = buildShareUrl(questionnaire.id);
  elements.publishResultTitle.textContent = `${questionnaire.title} · 第 ${version} 版`;
  elements.publishResultLink.value = link;
  elements.publishResult.classList.remove("hidden");
  elements.publishResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function copyText(value, messageElement) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = elements.publishResultLink;
    input.select();
    document.execCommand("copy");
  }
  setMessage(messageElement, "學員作答連結已複製。", "success");
}

async function copyShareLink() {
  if (!elements.shareLinkInput.value) return;
  try {
    await navigator.clipboard.writeText(elements.shareLinkInput.value);
  } catch {
    elements.shareLinkInput.select();
    document.execCommand("copy");
  }
  setMessage(elements.lifecycleMessage, "已複製獨立作答連結。", "success");
}

function openShareLink() {
  if (elements.shareLinkInput.value) window.open(elements.shareLinkInput.value, "_blank", "noopener");
}

function populateCollaborationBrief(questionnaire) {
  elements.collaborationPurposeInput.value = questionnaire.description || "";
  elements.collaborationAudienceInput.value = questionnaire.audience || questionnaire.courseReference || "";
  elements.collaborationDifficultyInput.value = ["foundation", "intermediate", "advanced"].includes(questionnaire.assessmentLevel)
    ? questionnaire.assessmentLevel
    : "foundation";
  elements.fixedAnswerOnlyInput.checked = !containsQuestionType(questionnaire.questions, "short");
  elements.aiTitleInput.value = questionnaire.title || "AI 生成問卷";
  elements.aiDurationInput.value = Math.max(1, Math.ceil(Number(questionnaire.durationSeconds || 900) / 60));
}

function collaborationBrief(questionnaire) {
  return {
    purpose: elements.collaborationPurposeInput.value.trim(),
    audience: elements.collaborationAudienceInput.value.trim(),
    difficulty: elements.collaborationDifficultyInput.value,
    durationMinutes: Math.max(1, Math.ceil(Number(questionnaire.durationSeconds || 900) / 60)),
    passPercentage: Number(questionnaire.passPercentage ?? 70)
  };
}

function collaborationRules() {
  const fixedAnswerOnly = elements.fixedAnswerOnlyInput.checked;
  return {
    fixedAnswerOnly,
    shortAnswerAllowed: !fixedAnswerOnly,
    allowedTypes: fixedAnswerOnly
      ? ["boolean", "single", "multiple", "composite"]
      : ["boolean", "single", "multiple", "short", "composite"],
    requireAnswerKey: true
  };
}

function readEditorQuestionnaire() {
  try {
    return JSON.parse(elements.jsonEditor.value);
  } catch (error) {
    throw new Error(`編輯器 JSON 格式錯誤：${error.message}`);
  }
}

async function buildCurrentCollaborationPackage() {
  const questionnaire = readEditorQuestionnaire();
  return createCollaborationPackage({
    baseQuestionnaire: questionnaire,
    candidateQuestionnaire: questionnaire,
    brief: collaborationBrief(questionnaire),
    rules: collaborationRules(),
    proposal: { authorType: "teacher", summary: ["以目前編輯器內容作為修改基準"] }
  });
}

async function exportCollaborationPackage() {
  try {
    const packageData = await buildCurrentCollaborationPackage();
    const json = JSON.stringify(packageData, null, 2);
    elements.collaborationJsonInput.value = json;
    downloadJson(`${packageData.questionnaire.id}-qanda-v1.json`, json);
    setMessage(elements.collaborationMessage, "協作包已匯出；內容不含學員名單、作答結果與發布稽核。", "success");
  } catch (error) {
    setMessage(elements.collaborationMessage, error.message, "error");
  }
}

async function copyCollaborationPrompt() {
  try {
    const packageData = await buildCurrentCollaborationPackage();
    const prompt = buildAiCollaborationPrompt(packageData);
    elements.collaborationJsonInput.value = JSON.stringify(packageData, null, 2);
    await writeClipboard(prompt);
    setMessage(elements.collaborationMessage, "已複製 AI 任務與完整協作包。", "success");
  } catch (error) {
    setMessage(elements.collaborationMessage, error.message, "error");
  }
}

async function importCollaborationFile() {
  const [file] = elements.collaborationFileInput.files || [];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    setMessage(elements.collaborationMessage, "協作包不可超過 2 MB。", "error");
    return;
  }
  try {
    elements.collaborationJsonInput.value = await file.text();
    await prepareCollaborationProposal(elements.collaborationJsonInput.value, file.name);
  } catch (error) {
    setMessage(elements.collaborationMessage, error.message, "error");
  } finally {
    elements.collaborationFileInput.value = "";
  }
}

async function reviewPastedCollaborationPackage() {
  if (!elements.collaborationJsonInput.value.trim()) {
    setMessage(elements.collaborationMessage, "請貼上協作包 JSON，或選擇檔案。", "error");
    return;
  }
  await prepareCollaborationProposal(elements.collaborationJsonInput.value, "貼上的協作包");
}

async function prepareCollaborationProposal(packageData, sourceLabel) {
  try {
    const currentQuestionnaire = readEditorQuestionnaire();
    const inspection = await inspectCollaborationPackage(packageData, currentQuestionnaire);
    state.collaborationProposal = { ...inspection, sourceLabel };
    renderCollaborationProposal();
    if (inspection.errors.length) {
      setMessage(elements.collaborationMessage, `驗證未通過：${inspection.errors[0]}`, "error");
    } else if (inspection.warnings.length) {
      setMessage(elements.collaborationMessage, "協作包可審核，但基準版本已有差異。", "error");
    } else {
      setMessage(elements.collaborationMessage, "驗證通過；請檢視差異後決定是否接受。", "success");
    }
  } catch (error) {
    state.collaborationProposal = null;
    elements.proposalReview.classList.add("hidden");
    setMessage(elements.collaborationMessage, error.message, "error");
  }
}

function renderCollaborationProposal() {
  const review = state.collaborationProposal;
  if (!review) {
    elements.proposalReview.classList.add("hidden");
    return;
  }

  const { comparison, package: packageData } = review;
  elements.proposalReviewTitle.textContent = `${review.sourceLabel} · ${review.candidate?.title || "未命名題卷"}`;
  elements.proposalStats.innerHTML = [
    ["新增", comparison.stats.added],
    ["修改", comparison.stats.changed],
    ["移除", comparison.stats.removed],
    ["總分", comparison.candidateScore]
  ].map(([label, value]) => `<span><small>${label}</small><strong>${value}</strong></span>`).join("");

  const notices = [];
  if (packageData?.proposal?.summary?.length) {
    notices.push(`<div><strong>提案摘要</strong><span>${packageData.proposal.summary.map(escapeHtml).join("；")}</span></div>`);
  }
  if (packageData?.proposal?.assumptions?.length) {
    notices.push(`<div><strong>待確認假設</strong><span>${packageData.proposal.assumptions.map(escapeHtml).join("；")}</span></div>`);
  }
  if (review.warnings.length) {
    notices.push(`<div><strong>版本提醒</strong><span>${review.warnings.map(escapeHtml).join("；")}</span></div>`);
  }
  if (review.errors.length) {
    notices.push(`<div class="proposal-error"><strong>不可接受</strong><span>${review.errors.map(escapeHtml).join("；")}</span></div>`);
  }
  elements.proposalWarnings.innerHTML = notices.join("");
  elements.proposalWarnings.classList.toggle("hidden", notices.length === 0);

  const changes = comparison.changes.length
    ? comparison.changes
    : [{ type: "unchanged", label: "沒有內容差異", detail: "候選版本與目前編輯器相同" }];
  elements.proposalChanges.innerHTML = changes.map((change) => `
    <li class="proposal-change-${escapeHtml(change.type)}">
      <strong>${escapeHtml(change.label)}</strong>
      <span>${escapeHtml(change.detail)}</span>
    </li>`).join("");
  elements.acceptProposalButton.disabled = !review.canAccept;
  elements.proposalReview.classList.remove("hidden");
  elements.proposalReview.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function acceptCollaborationProposal() {
  const review = state.collaborationProposal;
  if (!review?.canAccept) return;
  try {
    const currentQuestionnaire = readEditorQuestionnaire();
    const accepted = acceptCollaborationCandidate(currentQuestionnaire, review.candidate);
    elements.jsonEditor.value = JSON.stringify(accepted, null, 2);
    state.hasUnpublishedDraft = true;
    populateCollaborationBrief(accepted);
    renderLifecycle(accepted);
    state.collaborationProposal = null;
    elements.proposalReview.classList.add("hidden");
    setMessage(elements.collaborationMessage, "候選版本已帶入編輯器，尚未儲存或發布。", "success");
    setMessage(elements.jsonMessage, "已接受候選版本；請檢查 JSON 後儲存草稿。", "success");
    elements.jsonEditor.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    setMessage(elements.collaborationMessage, error.message, "error");
  }
}

function discardCollaborationProposal({ keepMessage = true } = {}) {
  state.collaborationProposal = null;
  elements.proposalReview.classList.add("hidden");
  elements.collaborationJsonInput.value = "";
  elements.collaborationFileInput.value = "";
  if (keepMessage) setMessage(elements.collaborationMessage, "候選版本已捨棄，編輯器內容未變更。", "success");
  else setMessage(elements.collaborationMessage, "");
}

async function generateQuestionnaire() {
  setMessage(elements.aiMessage, "正在產生候選版本");
  elements.generateButton.disabled = true;
  try {
    const currentQuestionnaire = readEditorQuestionnaire();
    const data = await api("/api/ai/questionnaires", {
      method: "POST",
      body: {
        title: elements.aiTitleInput.value.trim(),
        durationMinutes: Number(elements.aiDurationInput.value || 15),
        prompt: elements.aiPromptInput.value.trim(),
        fixedAnswerOnly: elements.fixedAnswerOnlyInput.checked
      }
    });
    const candidate = {
      ...data.questionnaire,
      id: currentQuestionnaire.id,
      passPercentage: data.questionnaire.passPercentage ?? currentQuestionnaire.passPercentage ?? 70,
      assessmentLevel: data.questionnaire.assessmentLevel ?? elements.collaborationDifficultyInput.value
    };
    const packageData = await createCollaborationPackage({
      baseQuestionnaire: currentQuestionnaire,
      candidateQuestionnaire: candidate,
      brief: collaborationBrief(candidate),
      rules: collaborationRules(),
      proposal: {
        authorType: "ai",
        model: data.model || data.provider,
        summary: ["依目前題卷與出卷需求產生候選版本"],
        assumptions: data.validationErrors || []
      }
    });
    elements.collaborationJsonInput.value = JSON.stringify(packageData, null, 2);
    await prepareCollaborationProposal(packageData, `內建 AI · ${data.provider}`);
    setMessage(elements.aiMessage, "AI 提案已產生；請在下方檢視差異。", "success");
  } catch (error) {
    setMessage(elements.aiMessage, error.message, "error");
  } finally {
    elements.generateButton.disabled = false;
  }
}

function containsQuestionType(questions = [], type) {
  return questions.some((question) => question.type === type
    || (question.type === "composite" && containsQuestionType(question.questions || [], type)));
}

function downloadJson(filename, json) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function writeClipboard(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

async function loadResults() {
  const filters = {
    questionnaireId: elements.resultQuestionnaireFilter.value,
    status: elements.resultStatusFilter.value,
    keyword: elements.resultKeywordInput.value.trim(),
    limit: 500
  };
  let data;
  const token = sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY);
  if (configuredSheetEndpoint() && token) {
    try {
      const response = await sheetAdminApi("admin.results.list", { filters });
      data = response.data;
      state.resultSource = "google-sheet";
      state.remoteResults = data.results || [];
      elements.resultSourceStatus.textContent = `Google Sheet 集中結果 · ${data.total} 筆`;
      elements.resultSourceStatus.className = "source-status connected";
    } catch (error) {
      state.resultSource = "google-sheet";
      state.remoteResults = [];
      data = { results: [] };
      elements.resultSourceStatus.textContent = `Google Sheet 連線失敗：${error.message}`;
      elements.resultSourceStatus.className = "source-status error";
    }
  } else {
    const params = new URLSearchParams();
    if (filters.questionnaireId) params.set("questionnaireId", filters.questionnaireId);
    if (filters.status) params.set("status", filters.status);
    if (filters.keyword) params.set("keyword", filters.keyword);
    data = await api(`/api/results?${params}`);
    state.resultSource = "local";
    state.remoteResults = [];
    elements.resultSourceStatus.textContent = configuredSheetEndpoint()
      ? "集中結果暫時無法讀取"
      : "集中資料服務尚未設定";
    elements.resultSourceStatus.className = "source-status";
  }
  elements.resultsBody.innerHTML = data.results.length
    ? data.results.map(renderResultRow).join("")
    : `<tr><td colspan="5">尚無結果</td></tr>`;
  elements.resultsBody.querySelectorAll("tr[data-session]").forEach((row) => {
    row.addEventListener("click", () => loadResultDetail(row.dataset.session));
  });
}

function renderResultRow(row) {
  const score = row.score === null ? "--" : `${row.score}/${row.maxScore} (${row.percentage}%)`;
  return `
    <tr data-session="${escapeHtml(row.id)}">
      <td>${escapeHtml(row.participant.displayName)}<br><small>${escapeHtml(row.participant.personId)} · ${escapeHtml(row.participant.group || "-")}</small></td>
      <td>${escapeHtml(row.questionnaireTitle)}</td>
      <td><span class="status ${escapeHtml(row.status)}">${escapeHtml(statusLabel(row.status))}</span></td>
      <td>${escapeHtml(score)}</td>
      <td>${escapeHtml(formatTime(row.submittedAt || row.startedAt))}</td>
    </tr>`;
}

async function loadResultDetail(sessionId) {
  const data = state.resultSource === "google-sheet"
    ? (await sheetAdminApi("admin.results.detail", { sessionId })).data
    : await api(`/api/results/${sessionId}`);
  const summary = data.summary;
  const competencyText = (data.competencies || []).map((item) => `${item.competencyLabel} ${item.percentage}%`).join(" · ");
  elements.resultDetail.innerHTML = `
    <strong>${escapeHtml(summary.participant.displayName)}</strong>
    · ${escapeHtml(summary.questionnaireTitle)}
    · ${escapeHtml(statusLabel(summary.status))}
    · 答案 ${escapeHtml(summary.answerCount)}
    · 同步 ${escapeHtml(summary.lastSyncAt ? formatTime(summary.lastSyncAt) : "--")}
    ${competencyText ? `<div class="result-detail-competencies">${escapeHtml(competencyText)}</div>` : ""}`;
}

function exportResults() {
  if (state.resultSource === "google-sheet") {
    exportRemoteResults();
    return;
  }
  if (window.__STATIC_API__?.exportResults) {
    window.__STATIC_API__.exportResults();
    return;
  }
  const params = new URLSearchParams();
  if (elements.resultQuestionnaireFilter.value) params.set("questionnaireId", elements.resultQuestionnaireFilter.value);
  if (elements.resultStatusFilter.value) params.set("status", elements.resultStatusFilter.value);
  if (elements.resultKeywordInput.value.trim()) params.set("keyword", elements.resultKeywordInput.value.trim());
  window.location.href = `/api/results/export.csv?${params}`;
}

async function disconnectSheetAdmin() {
  sessionStorage.removeItem(SHEET_ADMIN_TOKEN_KEY);
  elements.adminGateToken.value = "";
  elements.adminWorkspace.classList.add("hidden");
  elements.adminGate.classList.remove("hidden");
  setMessage(elements.adminGateMessage, "已中斷管理連線。", "success");
}

async function syncQuestionBank() {
  if (!state.adminSurvey) return;
  if (!sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY)) {
    setMessage(elements.jsonMessage, "管理登入已失效，請重新登入。", "error");
    return;
  }
  elements.syncQuestionBankButton.disabled = true;
  setMessage(elements.jsonMessage, "正在同步題庫");
  try {
    const response = await sheetAdminApi("admin.question-bank.import", { questionnaire: state.adminSurvey });
    const result = response.data;
    setMessage(elements.jsonMessage, `題庫同步完成：新增 ${result.importedQuestions} 題，建立 ${result.linkedItems} 筆組卷關係。`, "success");
  } catch (error) {
    setMessage(elements.jsonMessage, error.message, "error");
  } finally {
    elements.syncQuestionBankButton.disabled = false;
  }
}

async function publishCentralQuestionnaire() {
  if (!sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY)) {
    setMessage(elements.jsonMessage, "管理登入已失效，請重新登入。", "error");
    return;
  }
  let questionnaire;
  try {
    questionnaire = JSON.parse(elements.jsonEditor.value);
  } catch (error) {
    setMessage(elements.jsonMessage, `JSON 格式錯誤：${error.message}`, "error");
    return;
  }
  elements.publishCentralButton.disabled = true;
  setMessage(elements.jsonMessage, "正在建立中央發布版本");
  try {
    const response = await sheetAdminApi("admin.questionnaire.publish", {
      questionnaire,
      actor: "questionnaire-admin"
    });
    const release = response.data;
    const action = release.reused ? "內容未變更，維持" : "已建立";
    setMessage(elements.jsonMessage, `${action}第 ${release.version} 版。`, "success");
    const publishedAt = release.publishedAt || new Date().toISOString();
    state.hasUnpublishedDraft = false;
    state.adminSurvey = {
      ...questionnaire,
      lifecycle: {
        ...(questionnaire.lifecycle || {}),
        status: "published",
        version: release.version,
        publishedAt,
        updatedAt: publishedAt
      }
    };
    applyReleaseState(state.adminSurvey);
    elements.jsonEditor.value = JSON.stringify(state.adminSurvey, null, 2);
    renderLifecycle(state.adminSurvey);
    showPublishedLink(questionnaire, release.version);
  } catch (error) {
    setMessage(elements.jsonMessage, error.message, "error");
  } finally {
    elements.publishCentralButton.disabled = false;
  }
}

async function closeCentralQuestionnaire() {
  const questionnaireId = state.adminSurvey?.id;
  if (!questionnaireId || !sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY)) {
    setMessage(elements.jsonMessage, "請先載入問卷並確認管理登入。", "error");
    return;
  }
  if (!window.confirm(`確定停止「${state.adminSurvey.title}」的中央發布嗎？`)) return;
  elements.closeCentralButton.disabled = true;
  try {
    const response = await sheetAdminApi("admin.questionnaire.close", { questionnaireId });
    setMessage(elements.jsonMessage, `第 ${response.data.version} 版已停止接受新作答。`, "success");
    state.adminSurvey = {
      ...state.adminSurvey,
      lifecycle: {
        ...(state.adminSurvey.lifecycle || {}),
        status: "closed",
        version: response.data.version,
        updatedAt: new Date().toISOString()
      }
    };
    state.hasUnpublishedDraft = false;
    applyReleaseState(state.adminSurvey);
    elements.jsonEditor.value = JSON.stringify(state.adminSurvey, null, 2);
    renderLifecycle(state.adminSurvey);
  } catch (error) {
    setMessage(elements.jsonMessage, error.message, "error");
  } finally {
    elements.closeCentralButton.disabled = false;
  }
}

async function loadDashboard() {
  const token = sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY);
  if (!configuredSheetEndpoint() || !token) {
    elements.dashboardEmpty.textContent = "管理登入已失效，請重新登入。";
    elements.dashboardEmpty.classList.remove("hidden");
    elements.dashboardContent.classList.add("hidden");
    return;
  }
  elements.dashboardEmpty.textContent = "正在整理報表";
  elements.dashboardEmpty.classList.remove("hidden");
  elements.dashboardContent.classList.add("hidden");
  try {
    const response = await sheetAdminApi("admin.dashboard", {
      filters: {
        questionnaireId: elements.dashboardQuestionnaireFilter.value,
        group: elements.dashboardGroupFilter.value.trim()
      }
    });
    renderDashboard(response.data);
  } catch (error) {
    elements.dashboardEmpty.textContent = `報表讀取失敗：${error.message}`;
  }
}

function renderDashboard(data) {
  const summary = data.summary || {};
  const kpis = [
    ["完成份數", summary.submissions || 0, "neutral"],
    ["作答人數", summary.participants || 0, "neutral"],
    ["平均成績", `${summary.averagePercentage || 0}%`, scoreTone(summary.averagePercentage)],
    ["通過率", `${summary.passRate || 0}%`, scoreTone(summary.passRate)]
  ];
  elements.dashboardKpis.innerHTML = kpis.map(([label, value, tone]) => `<div class="kpi-${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><i></i></div>`).join("");
  elements.dashboardInsight.textContent = dashboardInsight(summary, data);
  elements.dashboardUpdatedAt.textContent = data.generatedAt ? `更新 ${formatTime(data.generatedAt)}` : "";
  elements.dashboardQuestionnaires.innerHTML = comparisonRows(data.questionnaires);
  elements.dashboardCompetencies.innerHTML = metricRows(data.competencies, "percentage", (item) => item.percentage < 60 ? "優先補強" : `${item.attempts} 次評量`);
  elements.dashboardQuestions.innerHTML = riskRows(data.questions);
  elements.dashboardParticipants.innerHTML = participantRows(data.participants);
  elements.dashboardEmpty.classList.add("hidden");
  elements.dashboardContent.classList.remove("hidden");
}

function scoreTone(value) {
  const score = Number(value || 0);
  if (score >= 70) return "good";
  if (score >= 60) return "watch";
  return "risk";
}

function dashboardInsight(summary, data) {
  if (!summary.submissions) return "尚無完成作答，發布連結後等待第一筆結果。";
  const weakest = [...(data.competencies || [])].sort((a, b) => a.percentage - b.percentage)[0];
  if (Number(summary.passRate) < 60) return `通過率偏低${weakest ? `，先補強「${weakest.label}」` : "，建議安排補救教學"}。`;
  if (weakest && Number(weakest.percentage) < 70) return `整體表現可用，但「${weakest.label}」仍低於達標線。`;
  return "整體已達標，可針對弱題進行精準複習。";
}

function comparisonRows(items = []) {
  if (!items.length) return '<div class="dashboard-no-data">尚無資料</div>';
  return items.map((item) => {
    const percentage = Math.max(0, Math.min(100, Number(item.averagePercentage || 0)));
    return `<div class="comparison-row">
      <div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(`${item.submissions} 份完成 · ${item.passRate}% 通過`)}</span></div>
      <div class="comparison-track"><i class="target-line"></i><b class="tone-${scoreTone(percentage)}" style="width:${percentage}%"></b></div>
      <strong>${escapeHtml(`${percentage}%`)}</strong>
    </div>`;
  }).join("");
}

function metricRows(items = [], percentageKey, detail) {
  if (!items.length) return '<div class="dashboard-no-data">尚無資料</div>';
  return items.map((item) => {
    const percentage = Math.max(0, Math.min(100, Number(item[percentageKey] || 0)));
    return `<div class="metric-row">
      <div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(detail(item))}</span></div>
      <div class="metric-track"><i style="width:${percentage}%"></i></div>
      <b>${escapeHtml(`${percentage}%`)}</b>
    </div>`;
  }).join("");
}

function rankRows(items = [], detail) {
  if (!items.length) return '<div class="dashboard-no-data">尚無資料</div>';
  return items.slice(0, 10).map((item, index) => `<div class="rank-row">
    <span>${index + 1}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(detail(item))}</small></div>
  </div>`).join("");
}

function riskRows(items = []) {
  if (!items.length) return '<div class="dashboard-no-data">尚無資料</div>';
  return items.slice(0, 10).map((item, index) => `<div class="risk-row">
    <span class="risk-score tone-${scoreTone(item.percentage)}">${escapeHtml(`${item.percentage}%`)}</span>
    <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(`第 ${item.version || 1} 版 · ${item.attempts} 人作答`)}</small></div>
    <b>${index < 3 && Number(item.percentage) < 70 ? "優先" : "追蹤"}</b>
  </div>`).join("");
}

function participantRows(items = []) {
  if (!items.length) return '<div class="dashboard-no-data">尚無資料</div>';
  return items.slice(0, 20).map((item) => {
    const completed = Math.min(3, Number(item.completed || 0));
    return `<div class="participant-row">
      <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.group || "未分組")}</small></div>
      <div class="completion-dots" aria-label="完成 ${completed} 份">${[1, 2, 3].map((step) => `<i class="${step <= completed ? "complete" : ""}"></i>`).join("")}</div>
      <span class="score-pill tone-${scoreTone(item.averagePercentage)}">${escapeHtml(`${item.averagePercentage}%`)}</span>
    </div>`;
  }).join("");
}

async function sheetAdminApi(event, payload = {}) {
  const endpoint = configuredSheetEndpoint();
  const adminToken = sessionStorage.getItem(SHEET_ADMIN_TOKEN_KEY) || "";
  if (!endpoint) throw new Error("Google Sheet 尚未設定");
  if (!adminToken) throw new Error("缺少管理權杖");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ event, adminToken, ...payload }),
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Google Sheet 管理查詢失敗");
  return data;
}

function configuredSheetEndpoint() {
  return String(window.QANDA_CONFIG?.googleAppsScriptUrl || "").trim();
}

function exportRemoteResults() {
  const headers = ["sessionId", "questionnaireId", "questionnaireTitle", "personId", "displayName", "group", "status", "score", "maxScore", "percentage", "startedAt", "submittedAt", "lastSyncAt"];
  const rows = state.remoteResults.map((row) => ({
    sessionId: row.id,
    questionnaireId: row.questionnaireId,
    questionnaireTitle: row.questionnaireTitle,
    personId: row.participant.personId,
    displayName: row.participant.displayName,
    group: row.participant.group,
    status: row.status,
    score: row.score,
    maxScore: row.maxScore,
    percentage: row.percentage,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    lastSyncAt: row.lastSyncAt
  }));
  const csv = `\ufeff${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")).join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "qanda-google-sheet-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function updateProgress() {
  if (!state.questionnaire) return;
  const items = flattenQuestionMeta(state.questionnaire.questions);
  const answered = items.filter((item) => isAnswered(state.answers[item.id])).length;
  const remaining = items.length - answered;
  const percentage = items.length ? Math.round((answered / items.length) * 100) : 0;
  elements.progressStatus.textContent = remaining ? `尚有 ${remaining} 題未完成` : "全部題目已完成";
  elements.sidebarProgressText.textContent = `${answered} / ${items.length}`;
  elements.progressFill.style.width = `${percentage}%`;
  elements.questionNav.querySelectorAll("button[data-target]").forEach((button) => {
    button.classList.toggle("answered", isAnswered(state.answers[button.dataset.target]));
  });
  updateQuestionVisualStates(state.questionnaire.questions);
}

function updateQuestionVisualStates(questions) {
  for (const question of questions) {
    const answered = question.type === "composite"
      ? (question.questions || []).every((child) => isQuestionAnswered(child))
      : isAnswered(state.answers[question.id]);
    const status = elements.questionForm.querySelector(`[data-question-state="${cssEscape(question.id)}"]`);
    if (status) {
      status.textContent = answered ? "已作答" : "未作答";
      status.classList.toggle("answered", answered);
    }
    if (question.type === "composite") updateQuestionVisualStates(question.questions || []);
  }
}

function isQuestionAnswered(question) {
  if (question.type === "composite") return (question.questions || []).every(isQuestionAnswered);
  return isAnswered(state.answers[question.id]);
}

function leafQuestionIds(questions) {
  return questions.flatMap((question) => (question.type === "composite" ? leafQuestionIds(question.questions || []) : [question.id]));
}

function isAnswered(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every(isAnswered);
  if (value && typeof value === "object") return value.value !== undefined && String(value.text || "").trim() !== "";
  return value !== undefined && value !== "";
}

function childMaxScore(question) {
  return (question.questions || []).reduce((sum, child) => sum + Number(child.maxScore || childMaxScore(child)), 0);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function setSyncStatus(text) {
  elements.syncStatus.textContent = text;
  elements.sidebarSyncStatus.textContent = text;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-Hant", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function lifecycleLabel(status) {
  return (
    {
      draft: "草稿",
      review: "審核中",
      published: "已發布",
      closed: "已關閉",
      archived: "已封存"
    }[status] || status
  );
}

function statusLabel(status) {
  return (
    {
      in_progress: "作答中",
      submitted: "已送出",
      expired: "已逾時",
      correct: "正確",
      partial: "部分",
      incorrect: "錯誤",
      pending: "待評"
    }[status] || status
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}
